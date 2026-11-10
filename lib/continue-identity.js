/** continue-identity.js —— D1：接续「待续身份」桥（不依赖 agent 出现时刻）。
 *
 * 背景（见 docs / 草案 §2）：
 *   hostAutoContinue 只有 sc.prompt 之后才拿得到新会话 agent（index.js 同处注释已写明），
 *   而新会话首回合注入发生在 prompt 之后、rt.projectTag 写入之前。
 *   没有这张表时，首屏 [身份] 会回落工作区根，handoff/projects 副本也选不到。
 *
 * 设计：
 *   - create 后 / prompt 前写 pending 一条（projectTag + 源会话 + contSeq + at）；
 *   - whoiamIdentityFor 在 rt.projectTag 为空时按 session.id 查表并懒回填 rt（唯一回填点）；
 *   - 回填成功 / 续接收尾 / 超时（TTL 10 分钟）/ 失败清理 四路删除。
 * 纪律：写失败绝不阻断接续；读失败一律 fail-soft（返回空表或 null），不抛。
 */
import fs from 'node:fs'
import path from 'node:path'
import { resolveDshHomePre } from './dsh-home.js'
import { readStateJson, writeStateJson } from './continuation-state.js'

export const CONTINUE_IDENTITY_FILE = 'continue-identity-pending.json'
export const CONTINUE_IDENTITY_TTL_MS = 10 * 60 * 1000

const emptyState = () => ({ version: 1, bySession: {} })
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v)

/** 待续身份表的绝对路径（overrideDir 供测试注入）。 */
export function continueIdentityFilePre(overrideDir) {
  const dir = overrideDir || path.join(resolveDshHomePre(), 'memory')
  return path.join(dir, CONTINUE_IDENTITY_FILE)
}

/** 解析并清洗状态：无效条目静默丢弃（这是短生命周期缓存，不是权威账本）。 */
export function parseContinueIdentityStatePre(v) {
  if (!isObj(v) || v.version !== 1 || !isObj(v.bySession)) throw new Error('invalid continue-identity state')
  const out = { version: 1, bySession: {} }
  for (const [sid, rec] of Object.entries(v.bySession)) {
    if (!isObj(rec)) continue
    const projectTag = typeof rec.projectTag === 'string' ? rec.projectTag.trim() : ''
    const at = Number(rec.at) || 0
    if (!sid || !projectTag || !at) continue
    out.bySession[sid] = {
      projectTag,
      sourceSessionId: typeof rec.sourceSessionId === 'string' ? rec.sourceSessionId : '',
      contSeq: Number(rec.contSeq) || 0,
      at,
    }
  }
  return out
}

/** 丢弃过期条目（TTL）。 */
export function pruneContinueIdentityPre(state, now) {
  const base = parseContinueIdentityStatePre(state)
  const out = { version: 1, bySession: {} }
  for (const [sid, rec] of Object.entries(base.bySession)) {
    if (now - rec.at < CONTINUE_IDENTITY_TTL_MS) out.bySession[sid] = rec
  }
  return out
}

function readPruned(file) {
  const raw = readStateJson(file, emptyState(), parseContinueIdentityStatePre)
  return pruneContinueIdentityPre(raw, Date.now())
}

/** 读表（损坏/不可读 ⇒ 空表；绝不抛）。 */
export function loadContinueIdentityPre(file) {
  try { return readPruned(file) } catch (e) { return emptyState() }
}

/** 写表（先清洗再原子写；损坏输入 ⇒ 抛给调用方，由引擎侧 fail-soft）。 */
export function saveContinueIdentityPre(file, state) {
  const clean = pruneContinueIdentityPre(state, Date.now())
  writeStateJson(file, clean)
  return clean
}

/** 写入/覆盖一条待续身份。 */
export function putContinueIdentityPre(file, rec) {
  const sid = String((rec && rec.sessionId) || '')
  const projectTag = String((rec && rec.projectTag) || '').trim()
  if (!sid || !projectTag) throw new Error('putContinueIdentityPre: sessionId/projectTag required')
  const st = loadContinueIdentityPre(file)
  st.bySession[sid] = {
    projectTag,
    sourceSessionId: String((rec && rec.sourceSessionId) || ''),
    contSeq: Number(rec && rec.contSeq) || 0,
    at: Number(rec && rec.at) || Date.now(),
  }
  saveContinueIdentityPre(file, st)
  return st.bySession[sid]
}

/** 按会话 id 查（过期即删并返回 null）。 */
export function lookupContinueIdentityPre(file, sessionId, now) {
  const sid = String(sessionId || '')
  if (!sid) return null
  const at = Number.isFinite(now) ? Number(now) : Date.now()
  let st = emptyState()
  // ★读**未剪枝**的原表：命中过期项时要能就地删除并回写（若先剪枝，盘上陈旧项会永远留着）。
  try { st = parseContinueIdentityStatePre(readStateJson(file, emptyState(), parseContinueIdentityStatePre)) } catch (e) { return null }
  const rec = st.bySession[sid]
  if (!rec) return null
  if (at - rec.at >= CONTINUE_IDENTITY_TTL_MS) {
    try { delete st.bySession[sid]; saveContinueIdentityPre(file, st) } catch (e) {}
    return null
  }
  return { projectTag: rec.projectTag, sourceSessionId: rec.sourceSessionId, contSeq: rec.contSeq, at: rec.at }
}

/** 删除一条（不存在返回 false）。 */
export function removeContinueIdentityPre(file, sessionId) {
  const sid = String(sessionId || '')
  if (!sid) return false
  let st = emptyState()
  try { st = readPruned(file) } catch (e) { return false }
  if (!st.bySession[sid]) return false
  delete st.bySession[sid]
  try { saveContinueIdentityPre(file, st) } catch (e) { return false }
  return true
}

/** 清过期（返回清理条数；异常返回 0）。 */
export function cleanupContinueIdentityPre(file, now) {
  const at = Number.isFinite(now) ? Number(now) : Date.now()
  let st = emptyState()
  // ★读**未剪枝**的原表：先剪枝会让 before 计数失真（过期项已被丢掉 ⇒ removed 恒 0）。
  try { st = parseContinueIdentityStatePre(readStateJson(file, emptyState(), parseContinueIdentityStatePre)) } catch (e) { return 0 }
  const before = Object.keys(st.bySession).length
  const clean = pruneContinueIdentityPre(st, at)
  const removed = before - Object.keys(clean.bySession).length
  if (removed > 0) { try { writeStateJson(file, clean) } catch (e) { return 0 } }
  return removed
}

/** ★B 步修复 1（信息有源）：从「已完成接续」记录**反查**新会话的 projectTag。
 *
 * 问题（实测，见 repro/repro-continue-project-offset.mjs）：
 *   运行期把 tag 传给新会话的**唯一**通道是 pending 表（TTL 10 分钟）；
 *   而 `finishContinuedSource` 写下的 done 记录里**已经有** `{to, projectTag}`，却没有任何人读 ⇒
 *   超过 TTL 或官家重启后，新会话的归属必然为空 ⇒ 静默回落工作区根。
 *
 * 口径：扫 `auto-continue-done.d/*.json`，按 `rec.to === sessionId` 命中；若命中记录本身无 tag，
 *   则沿 `rec.from`（源会话）**向上回溯**最多 depth 层（支持「连续多次接续」）。
 * 失败态度：**全程 fail-soft** —— 目录不存在/读坏/超时一律返回 null，绝不抛（身份不得阻断任何主流程）。
 * 性能：目录最多扫 maxFiles 个（按 mtime 降序取最新），命中即停；不入热路径（仅 rt/pending 都为空时才走）。
 */
export function recoverProjectTagForSessionPre(file, sessionId, opts) {
  const sid = String(sessionId || '')
  if (!sid) return null
  const maxDepth = Number((opts && opts.maxDepth)) > 0 ? Math.min(Number(opts.maxDepth), 8) : 4
  const maxFiles = Number((opts && opts.maxFiles)) > 0 ? Math.min(Number(opts.maxFiles), 500) : 200
  const doneDir = path.join(path.dirname(file), 'auto-continue-done.d')
  let names = []
  try { names = fs.readdirSync(doneDir).filter((n) => n.endsWith('.json')) } catch (e) { return null }
  if (!names.length) return null
  // 只读最近的一批：接续记录按写入时间增长，命中通常在最新若干条内。
  let picked = names
  try {
    picked = names.map((n) => {
      const p = path.join(doneDir, n)
      let m = 0
      try { m = fs.statSync(p).mtimeMs } catch (e) { m = 0 }
      return { n, p, m }
    }).sort((a, b) => b.m - a.m).slice(0, maxFiles)
  } catch (e) { return null }

  const byTarget = new Map()   // to -> record
  for (const it of picked) {
    let rec = null
    try {
      const raw = fs.readFileSync(it.p)
      rec = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw))
    } catch (e) { continue }
    if (!rec || typeof rec !== 'object') continue
    if (typeof rec.to !== 'string' || !rec.to) continue
    // ★2026-11-10 修（真机验证抓到的缺陷）：同一 `to` 可能有多条记录（重试/重复接续），
    //   `picked` 已按 mtime **从新到旧**排序 ⇒ 这里若无条件 set，会拿**更旧**的那条覆盖**更新**的。
    //   后果：较新的记录带 tag、较旧的没有 ⇒ 命中 null，静默丢失归属。
    //   修法：先到先得（第一个即最新），已存在则跳过。
    if (!byTarget.has(rec.to)) byTarget.set(rec.to, rec)
  }
  if (!byTarget.size) return null

  // 按 to 命中，并沿 from 向上回溯（连续接续时，最早那环才带 tag）。
  let at = sid
  for (let depth = 0; depth < maxDepth; depth++) {
    const rec = byTarget.get(at)
    if (!rec) return null
    const tag = typeof rec.projectTag === 'string' ? rec.projectTag.trim() : ''
    if (tag) return { projectTag: tag, from: String(rec.from || ''), to: String(rec.to || ''), hops: depth + 1, via: 'done-record' }
    // 本条无 tag：可能是「本该带却没带」（留痕），也可能是连续接续的中间环 ⇒ 继续向上找。
    const up = String(rec.from || '')
    if (!up || up === at) return null
    at = up
  }
  return null
}