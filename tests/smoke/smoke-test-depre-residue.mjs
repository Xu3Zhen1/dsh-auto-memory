/**
 * 「去 pre」残留守卫（2026-09-29）—— 静默失效的第二现场：**用户配置里的死链路径**。
 *
 * 事故（真机取证 2026-09-29）：
 *   用户配置 `pythonBackendWorkerPath` = `python/worker_semantic_pre_v1.py`（去 pre 前的旧名），
 *   而磁盘上只有裸名 `worker_semantic_v1.py` ⇒ spawn ENOENT ⇒ sidecar 恒 `unavailable`
 *   ⇒ C3 语义臂全程静默失效，`engineSwitch.failed` 连续 8 天累到 4112 次（每天上千次重试），
 *   用户表现为「memory recall 超时」。
 *
 * 为什么长期静默（两个成因，缺一不可）：
 *   ① `unavailable` 是 fail-soft 的正常降级码（Python 未装时合法）⇒ 不报错、UI 只显示
 *      "Python 未启用"，与"用户根本没配 Python"**无法区分**；
 *   ② 配置名迁移器（2026-09-23 的 dsh-auto-memory-pre.json → dsh-auto-memory.json）判据是
 *      **逐键补齐**（只补新名缺的键，同键以新名为准）⇒ 路径**值**是死链这一情形永远不被纠正。
 *
 * 本套件锁定（每条都能变红）：
 *   A. 兜底函数存在且能救历史命名死链（`*_pre_v1.py` → 同目录/包内裸名语义 worker）
 *   B. 反例：合法自定义路径不被改写（不存在但非历史命名 ⇒ 原样返回，不掩盖真缺失）
 *   C. 反例：空配置走默认；默认自身必须真实存在（`worker_v1.py`）
 *   D. spawn 路径已接线兜底（源码断言：解析走 resolveWorkerScriptPathPre 而非裸字符串）
 *   E. 全树无 `_pre` 文件名残留（源码模块 / python 脚本 / 策略工件）——防同类回流
 *   F. 代码引用的外部文件名里无 `_pre`（第 5 个扫描面）
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '../..')
let pass = 0, fail = 0
const ok = (c, m) => { if (c) { pass++; console.log('  ok   - ' + m) } else { fail++; console.log('  FAIL - ' + m) } }

const M = await import(pathToFileURL(path.join(ROOT, 'lib/python-sidecar-client.js')).href)
const SRC = fs.readFileSync(path.join(ROOT, 'lib/python-sidecar-client.js'), 'utf8')

// ── A. 兜底函数救历史死链 ──
{
  const def = M.defaultWorkerScriptPathPre()
  ok(typeof M.resolveWorkerScriptPathPre === 'function', 'A1 resolveWorkerScriptPathPre 已导出')
  ok(/worker_semantic_v1\.py/.test(M.SEMANTIC_WORKER_BASENAME_PRE_V1 || ''), 'A2 语义 worker 裸名常量 = worker_semantic_v1.py')
  const realSemantic = path.join(ROOT, 'python', 'worker_semantic_v1.py')
  ok(fs.existsSync(realSemantic), 'A3 裸名语义 worker 真实存在于包内')
  // 用真实包内目录构造历史死链：<真实目录>/worker_semantic_pre_v1.py（必不存在）
  const dead = path.join(ROOT, 'python', 'worker_semantic_pre_v1.py')
  ok(!fs.existsSync(dead), 'A4 夹具前提：历史名文件确实不存在')
  const r = M.resolveWorkerScriptPathPre(dead, def)
  ok(r === realSemantic, 'A5 ★历史命名死链被纠正为同目录裸名语义 worker')
  // ★★ 必须落到**语义** worker，绝不能落 fake worker（worker_v1.py）——
  //   2026-09-29 首版曾误落该处：进程起得来，但语义检索静默退化。
  ok(!/worker_v1\.py$/.test(r), 'A6 ★纠正结果不得是 fake worker（worker_v1.py）')
  ok(/worker_semantic_v1\.py$/.test(r), 'A7 ★纠正结果必须是语义 worker（worker_semantic_v1.py）')
  ok(fs.readFileSync(path.join(ROOT, 'python', 'worker_semantic_v1.py'), 'utf8').includes('dense_search'),
    'A8 语义 worker 确含 dense_search 能力（与 fake worker 严格区分）')
  ok(!fs.readFileSync(path.join(ROOT, 'python', 'worker_v1.py'), 'utf8').includes('dense_search'),
    'A9 fake worker 确无 dense_search（证明 A6/A7 的区分有意义）')
  // 空配置也必须优先语义 worker
  ok(/worker_semantic_v1\.py$/.test(M.resolveWorkerScriptPathPre('', def)), 'A10 空配置 → 优先语义 worker（Python 档本意）')
  ok(typeof M.semanticWorkerScriptPathPre === 'function' && /worker_semantic_v1\.py$/.test(M.semanticWorkerScriptPathPre()),
    'A11 semanticWorkerScriptPathPre 已导出且指向语义 worker')
}

// ── B/C. 反例：不越权、不掩盖 ──
{
  const def = M.defaultWorkerScriptPathPre()
  const custom = path.join(ROOT, 'some', 'custom_worker.py') // 不存在且非历史命名
  ok(M.resolveWorkerScriptPathPre(custom, def) === custom, 'B1 反例：非历史命名的缺失路径原样返回（不掩盖真缺失）')
  // 存在但非历史命名的路径必须原样透传（绝不覆盖合法自定义）
  const existing = path.join(ROOT, 'python', 'worker_v1.py')
  ok(M.resolveWorkerScriptPathPre(existing, def) === existing, 'B2 反例：存在路径原样透传（合法自定义不被改写）')
  ok(M.resolveWorkerScriptPathPre('', def).endsWith('worker_semantic_v1.py'), 'C1 空配置 → 语义 worker 优先（见 A10）')
  ok(fs.existsSync(def), 'C2 默认 worker 路径真实存在（去 pre 后为裸名 worker_v1.py）')
}

// ── D. spawn 已接线 ──
ok(/const scriptPath = resolveWorkerScriptPathPre\(resolveOpt\('scriptPath'\), defaultWorkerScriptPathPre\(\)\)/.test(SRC), 'D1 spawn 路径经兜底解析（非裸字符串拼接）')
ok(/LEGACY_WORKER_NAME_RE/.test(SRC) && /_pre_v1\\\.py\$\|/.test(SRC.replace(/\\\\/g, '\\')), 'D2 历史命名判据严格限定形态（*_pre_v1.py / worker_pre_*）')

// ── E. 全树无 _pre 文件名残留 ──
{
  const libPre = fs.readdirSync(path.join(ROOT, 'lib')).filter((f) => /-pre\.js$/.test(f))
  ok(libPre.length === 0, 'E1 lib/ 无 -pre.js 残留' + (libPre.length ? ' ⇒ ' + libPre.join(',') : ''))
  const pyPre = fs.readdirSync(path.join(ROOT, 'python')).filter((f) => /_pre_?v?\d*\.py$/.test(f) || /_pre_v\d/.test(f))
  ok(pyPre.length === 0, 'E2 python/ 无 *_pre_vN.py 残留' + (pyPre.length ? ' ⇒ ' + pyPre.join(',') : ''))
  for (const d of ['lib/policies', 'python/policies']) {
    let bad = []
    try { bad = fs.readdirSync(path.join(ROOT, d)).filter((x) => /_pre_/.test(x)) } catch (_) { }
    ok(bad.length === 0, 'E3 ' + d + ' 无 _pre_ 工件残留' + (bad.length ? ' ⇒ ' + bad.join(',') : ''))
  }
}

// ── F. 代码引用的外部文件名无 _pre ──
{
  const refs = new Set()
  for (const f of fs.readdirSync(path.join(ROOT, 'lib')).filter((x) => x.endsWith('.js') && !x.includes('bak'))) {
    const s = fs.readFileSync(path.join(ROOT, 'lib', f), 'utf8')
    for (const m of s.matchAll(/["']([A-Za-z0-9_.-]+_pre[A-Za-z0-9_.-]*\.(?:py|js|json))["']/g)) refs.add(f + ' → ' + m[1])
  }
  ok(refs.size === 0, 'F1 代码引用的外部 *_pre* 文件名为 0' + (refs.size ? ' ⇒ ' + [...refs].join('; ') : ''))
}

console.log('\n结果: ' + pass + ' PASS / ' + fail + ' FAIL')
process.exit(fail ? 1 : 0)
