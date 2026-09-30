// tests/smoke/smoke-test-archive-hub-scope.mjs
// CR-10：真 import → 真构造 → 真调用 → 断言返回值；带**负路径**；断言对象是行为而非源码字符串。
//
// 背景（2026-09-29）：归档/删除链路因 `this.ctx` 全文件零写入点而从未生效（reg 恒 null）。
//   修复 = 改用引擎真实持有的 `_ctxRef`，并按用户硬约束把作用域收窄到**记忆中枢工作区**。
// 本套件守两件事：
//   ① 取上下文：_ctxRef 有值时能取到服务；无值时返回 null（且不抛）。
//   ② 作用域：只回收记忆中枢目录；**负路径** = 其他工作区的会话绝不出现在 rows/childIds/删除目标里。
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { readFileSync } from 'node:fs'

let pass = 0, fail = 0
const check = (name, ok, detail) => {
  if (ok) { pass++; console.log('  PASS  ' + name + (detail ? '  [' + detail + ']' : '')) }
  else { fail++; console.log('  FAIL  ' + name + '  [' + (detail || '') + ']') }
}

const src = readFileSync('lib/index.js', 'utf8')

// ── 从源码抽取方法体（仓库既有 new Function 抽取范式）──
function extractMethod(name) {
  const key = '  ' + name + '('
  let i = src.indexOf(key)
  if (i < 0) { const k2 = '  async ' + name + '('; i = src.indexOf(k2); if (i < 0) return null }
  const j = src.indexOf('{', i)
  let depth = 0, end = -1
  for (let k = j; k < src.length; k++) {
    const ch = src[k]
    if (ch === '{') depth++
    else if (ch === '}') { depth--; if (depth === 0) { end = k; break } }
  }
  return src.slice(i, end + 1)
}
function extractFn(name) {
  const key = 'function ' + name + '('
  const i = src.indexOf(key)
  if (i < 0) return null
  const j = src.indexOf('{', i)
  let depth = 0, end = -1
  for (let k = j; k < src.length; k++) {
    const ch = src[k]
    if (ch === '{') depth++
    else if (ch === '}') { depth--; if (depth === 0) { end = k; break } }
  }
  return src.slice(i, end + 1)
}

// ── 夹具：真实磁盘布局 <root>/<projectKey>/<segment>/session*.jsonl.zstd ──
const root = mkdtempSync(path.join(tmpdir(), 'sa-hub-'))
const HUB_PROJ = '--C-Users-JH~0020Z-.dsh-aik_auto_memory_use--'
const OTHER_PROJ = '--D-dsh-auto-memory--'
const HUB_SID = 'aaaaaaaa-1111-4111-8111-111111111111'
const OTHER_SID = 'bbbbbbbb-2222-4222-8222-222222222222'
// ★夹具必须用**规范 id 形态**（session-<uuid>）建目录 —— indexSessionDirs 正是这样建键的；
//   用裸 uuid 建目录会让 byId 键与 workbench.json 里的 id 不同形（首版即因此假红）。
function mkSession(proj, sid, ageMs) {
  const seg = String(sid).startsWith('session-') ? String(sid) : 'session-' + String(sid)
  const dir = path.join(root, proj, seg)
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, 'session.v4.jsonl.zstd'), Buffer.from([1, 2, 3]))
  return dir
}
const hubDir = mkSession(HUB_PROJ, HUB_SID, 0)
const otherDir = mkSession(OTHER_PROJ, OTHER_SID, 0)

// ── 组装被测对象：只注入真实方法体需要的自由变量 ──
const diagLines = []
const diagThrottled = (k, m) => { diagLines.push(m) }
const diag = (m) => { diagLines.push(m) }
const pathMod = path
const { indexSessionDirs, autoArchiveCandidates, autoDeleteSeedCandidates, planDelete, resolveAutoConfig } = await import('../../lib/session-archive.js')
// ★夹具正确性：注入**真实** existsSync/readFileSync。
//   首版这里写成 `readFileSync(p) !== undefined`（读不存在的文件会抛 ⇒ 恒 false），
//   且 `_hubProjectDirs` 并不需要 readFileSync ⇒ 属夹具自造缺陷，非产线问题。
const fsx = await import('node:fs')
const realExists = fsx.existsSync
const realRead = fsx.readFileSync

const harness = new Function(
  'diag', 'diagThrottled', 'path', 'indexSessionDirs', 'autoArchiveCandidates',
  'autoDeleteSeedCandidates', 'planDelete', 'resolveAutoConfig', 'existsSync', 'readFileSync',
  'WB_FILE', 'ROOT', 'config', 'Set', 'console',
  [
    'class Engine {',
    '  constructor() { this.config = config; this._ctxRef = undefined; this._liveSessionIds = [] }',
    '  _workbenchFile() { return WB_FILE }',
    extractMethod('_engineCtx'),
    extractMethod('_hubProjectDirs'),
    extractMethod('workbenchSessionIds'),
    '}',
    'return Engine;',
  ].join('\n')
)(diag, diagThrottled, pathMod, indexSessionDirs, autoArchiveCandidates, autoDeleteSeedCandidates, planDelete, resolveAutoConfig, realExists, realRead,
  path.join(root, 'memory', 'workbench.json'), root,
  { sessionArchiveEnabled: true, autoArchiveEnabled: true, autoArchiveDays: 2, autoDeleteEnabled: true, autoDeleteDays: 7, autoArchiveCheckMin: 60 },
  Set, console)

// ── ① _engineCtx：有 _ctxRef ⇒ 取得到；无 ⇒ null 且留痕（负路径）──
{
  const e = new harness()
  diagLines.length = 0
  check('①a 无 _ctxRef 时返回 null（fail-soft，不抛）', e._engineCtx() === null)
  check('①b 无 _ctxRef 时留下诊断（不再零日志静默）', diagLines.some((l) => /ctx missing/.test(l)), 'diag=' + diagLines.length)
  const svc = { kind: 'fake-registry' }
  e._ctxRef = { get: (k) => (k === 'workspaceRegistry' ? svc : undefined) }
  check('①c _ctxRef 有值时取到服务（正路径）', e._engineCtx() === e._ctxRef)
  check('①d 经 _engineCtx 能拿到 workspaceRegistry', e._engineCtx().get('workspaceRegistry') === svc)
}

// ── ② _hubProjectDirs：只解析出中枢目录，且负路径不含其他工作区 ──
{
  mkdirSync(path.dirname(path.join(root, 'memory', 'workbench.json')), { recursive: true })
  writeFileSync(path.join(root, 'memory', 'workbench.json'), JSON.stringify({ version: 2, sessionId: HUB_SID, current: { sessionId: HUB_SID } }))
  const e = new harness()
  const idx = indexSessionDirs(root)
  const dirs = e._hubProjectDirs(idx)
  check('②a 解析出且仅解析出 1 个中枢目录', dirs.size === 1, 'size=' + dirs.size)
  check('②b 该目录 = 工作台会话所在项目目录', dirs.has(path.join(root, HUB_PROJ)), [...dirs].map((d) => path.basename(d)).join(','))
  check('②c 【负路径】不含其他工作区目录', !dirs.has(path.join(root, OTHER_PROJ)))
}

// ── ③ indexSessionDirs 索引两类目录都存在（证明夹具有效，避免空集合恒真）──
{
  const idx = indexSessionDirs(root)
  check('③a 夹具含 >=2 个会话目录（非空前提）', idx.byId.size === 2, 'byId=' + idx.byId.size)
  check('③b 中枢会话可索引', idx.byId.has('session-' + HUB_SID) || idx.byId.has(HUB_SID), [...idx.byId.keys()].join(','))
  check('③c 其他工作区会话可索引', idx.byId.has('session-' + OTHER_SID) || idx.byId.has(OTHER_SID))
}

// ── ④ 作用域守卫在源码中的接线（守卫，非功能证据）──
{
  const guards = (src.match(/hubDirs\.has\(path\.dirname/g) || []).length
  check('④a hubDirs 作用域守卫 >=3 处（childIds/rows/删除）', guards >= 3, 'guards=' + guards)
  const codeForm = (src.match(/this\.ctx\s*(?:&&|\.get)/g) || []).length
  check('④b 【负路径】旧写法 code-form 已归零', codeForm === 0, 'left=' + codeForm)
  check('④c 中枢解析失败 ⇒ fail-closed 返回 hub-unresolved', /reason: 'hub-unresolved'/.test(src))
  check('④d 删除目标仍复验中枢归属（纵深防御）', /return d !== undefined && hubDirs\.has\(path\.dirname/.test(src))
}

rmSync(root, { recursive: true, force: true })
console.log('')
console.log('PASS ' + pass + ' / FAIL ' + fail)
process.exit(fail === 0 ? 0 : 1)