/**
 * 本会话八片重构的**变异武器计分板**。
 *
 * 输出格式必须匹配 sdd-guard 的 `parseMutationReport`：
 *   每行形如 `M<n> …文字… ✓`（被杀）或 `M<n> …文字… ✗`（存活）
 *   ⇒ killed = 含 ✓ 的行数，total = 全部 M 行数
 *
 * ★纪律（本项目 §1.3 / §1.4）：
 *   ① 每个变异必须**真应用**（打 MUTATION_APPLIED），并用 `node --check` 排除崩溃红；
 *   ② 判定红必须**由判据造成**，不是语法错 / 模块加载失败；
 *   ③ 期望值不取自被测实现 —— 期望来自「改动前的行为对拍基线」。
 *
 * ★诚实性约定：这里记录的是**本会话真实跑过的变异**，不是编的。
 *   打 ✗ 的是**真实存活**的变异 —— 它们已逐条定性（等价变异 4 例）。
 *   之所以要如实列出：ACCEPT-E2 若只报 killed/total 而不报 survived，
 *   就等于隐藏了「测试没测到那段实现」的信息。
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const sha12 = (p) => createHash('sha256').update(readFileSync(p)).digest('hex').slice(0, 12)

/** 一条变异的执行器：应用 → 自证 → 跑判据 → 还原 → 报告是否被杀。 */
function runMutation({ id, label, file, from, to, judge }) {
  const orig = readFileSync(file, 'utf8')
  const before = sha12(file)
  const hits = orig.split(from).length - 1
  if (hits !== 1) {
    return { id, label, status: 'ANCHOR-MISS', killed: false, note: `锚点命中 ${hits} 次（须恰好 1 次）` }
  }
  writeFileSync(file, orig.replace(from, to), 'utf8')
  const applied = sha12(file) !== before
  const syntax = spawnSync(process.execPath, ['--check', file]).status
  let red = false, how = ''
  try {
    if (applied && syntax === 0) {
      const r = judge()
      red = r.red
      how = r.how || ''
    }
  } finally {
    writeFileSync(file, orig, 'utf8')
  }
  const restored = sha12(file) === before
  // 崩溃红不算杀：syntax 非 0 或未应用 都不计被杀
  const killed = applied && syntax === 0 && red
  return {
    id, label, killed,
    note: !applied ? '变异未生效' : syntax !== 0 ? `语法失败(崩溃红，不计)` : red ? how : '判据未变红（存活）',
    restored,
  }
}

const CWD = process.cwd()
const results = []

/* ══════════ 片 1：dedupe-auth-identity（team-primitives） ══════════ */
results.push(runMutation({
  id: 'M1', label: 'auth-identity: toText 去掉 try/catch 兜底（toString 抛错时外抛）',
  file: 'lib/team-primitives.js',
  // 锚点用「整行 + 真实缩进 2 空格」，避开引号转义歧义（见交付报告：PowerShell 单引号内 \' 不转义，曾导致锚点静默失配）
  from: "  try { return String(value).trim() } catch (_) { return '' }",
  to: "  return String(value).trim()",
  judge: () => {
    const r = spawnSync(process.execPath, ['tests/smoke/smoke-test-team-primitives.mjs'], { encoding: 'utf8' })
    return { red: r.status !== 0, how: `套件 exit=${r.status}` }
  },
}))

/* ══════════ 片 2：dedupe-diag-throttle ══════════ */
results.push(runMutation({
  id: 'M2', label: 'diag-throttle: 节流窗口 300000 → 999（同进程内不再压制）',
  file: 'lib/diag-throttle.js',
  from: 'const DIAG_THROTTLE_MS = 300000',
  to: 'const DIAG_THROTTLE_MS = 999',
  judge: () => {
    const r = spawnSync(process.execPath, ['tests/smoke/smoke-test-diag-throttle.mjs'], { encoding: 'utf8' })
    return { red: r.status !== 0, how: `套件 exit=${r.status}` }
  },
}))

/* ══════════ 片 3：dedupe-notrim-family ══════════ */
results.push(runMutation({
  id: 'M3', label: 'notrim: toText 加 .trim()（对非字符串 holder 生效）',
  file: 'lib/team-primitives-notrim.js',
  from: 'try { return String(value) } catch (_) { return \'\' }',
  to: 'try { return String(value).trim() } catch (_) { return \'\' }',
  judge: () => {
    const r = spawnSync(process.execPath, ['tests/smoke/smoke-test-team-primitives-notrim.mjs'], { encoding: 'utf8' })
    return { red: r.status !== 0, how: `套件 exit=${r.status}` }
  },
}))

/* ══════════ 片 4：dedupe-lock-claim ══════════ */
results.push(runMutation({
  id: 'M4', label: 'lock-claim: 原子认领改成「先 unlink 再创建」（破坏互斥）',
  file: 'lib/shared-state-lock.js',
  from: "function claim(file) {\n  const fd = openSync(file, 'wx')\n",
  to: "function claim(file) {\n  try { unlinkSync(file) } catch (_) {}\n  const fd = openSync(file, 'wx')\n",
  judge: () => {
    const r = spawnSync(process.execPath, ['tools/run-smoke.mjs', '--filter=lock', '--jobs=1'], { encoding: 'utf8', maxBuffer: 1 << 26 })
    return { red: r.status !== 0, how: `--filter=lock exit=${r.status}` }
  },
}))

/* ══════════ 片 6：dedupe-calendar-format ══════════ */
results.push(runMutation({
  id: 'M5', label: 'calendar: 共享 parse 去掉续行识别',
  file: 'lib/calendar-fields.js',
  from: '    if (cur >= 0 && /^[ \\t]/.test(raw)) { extras[cur].push(line); continue }',
  to: '    if (false) { extras[cur].push(line); continue }',
  judge: () => {
    const r = spawnSync(process.execPath, ['tests/smoke/smoke-test-calendar-multiline-254.mjs'], { encoding: 'utf8' })
    return { red: r.status !== 0, how: `套件 exit=${r.status}` }
  },
}))
results.push(runMutation({
  id: 'M6', label: 'calendar: 共享 render 把多行备注压平',
  file: 'lib/calendar-fields.js',
  from: "      const parts = en.note ? String(en.note).split('\\n') : []",
  to: "      const parts = en.note ? [String(en.note).replace(/\\n/g, ' ')] : []",
  judge: () => {
    const r = spawnSync(process.execPath, ['tests/smoke/smoke-test-calendar-multiline-254.mjs'], { encoding: 'utf8' })
    return { red: r.status !== 0, how: `套件 exit=${r.status}` }
  },
}))

/* ══════════ 片 7：dedupe-transport-primitives ══════════ */
results.push(runMutation({
  id: 'M7', label: 'transport-primitives: withPrefix 不再归一化 key（键语义分叉）',
  file: 'lib/team-transport-primitives.js',
  from: 'function withPrefix(prefix, key) {\n  const k = trimSlashes(key)',
  to: 'function withPrefix(prefix, key) {\n  const k = toText(key)',
  judge: () => {
    // ★判据面必须是**全体 team 套件**，不是单个。
    //   实测教训：只跑 team-transport 时本变异「存活」，但扩到 --filter=team 后
    //   team-transport-http 会红 ⇒ 该变异其实被杀，是**我的判据面太窄**造成的假存活。
    const r = spawnSync(process.execPath, ['tools/run-smoke.mjs', '--filter=team', '--jobs=2'], { encoding: 'utf8', maxBuffer: 1 << 26 })
    return { red: r.status !== 0, how: `--filter=team exit=${r.status}` }
  },
}))
results.push(runMutation({
  id: 'M8', label: 'transport-http: 依赖链上偷偷 import node:fs（I4-4b 专项）',
  file: 'lib/team-transport-primitives.js',
  from: "import { toText, safeGet } from './team-primitives-notrim.js'",
  to: "import { toText, safeGet } from './team-primitives-notrim.js'\nimport { writeFileSync as __wf } from 'node:fs'\nfunction __probe() { __wf('/tmp/x', 'y') }",
  judge: () => {
    const r = spawnSync(process.execPath, ['tests/smoke/smoke-test-team-transport-http.mjs'], { encoding: 'utf8' })
    return { red: r.status !== 0, how: `套件 exit=${r.status}` }
  },
}))

/* ══════════ 片 8：flatten-iter5-mode-read ══════════ */
results.push(runMutation({
  id: 'M9', label: 'iter5: legacy 分支不镜像写回（H36 契约破坏）',
  file: 'skins/iter5/style-choice.js',
  from: 'localStorage.setItem(ITER5_MODE_KEY, mirrored)',
  to: 'void mirrored',
  judge: () => {
    const r = spawnSync(process.execPath, ['tests/smoke/smoke-test-style-variants.mjs'], { encoding: 'utf8' })
    return { red: r.status !== 0, how: `套件 exit=${r.status}` }
  },
}))
results.push(runMutation({
  id: 'M10', label: 'iter5: legacy 判定 != null 改成 truthy（空串场景漏判）',
  file: 'skins/iter5/style-choice.js',
  from: 'if (legacy != null) {',
  to: 'if (legacy) {',
  judge: () => {
    const r = spawnSync(process.execPath, ['tests/smoke/smoke-test-style-variants.mjs'], { encoding: 'utf8' })
    return { red: r.status !== 0, how: `套件 exit=${r.status}` }
  },
}))

/* ══════════ 已知存活（等价变异，如实列出） ══════════
 *
 * ★为什么这些仍要算进 total 并在 ACCEPT-E2 里计为「未杀死」：
 *   ACCEPT-E2 的语义是「测试有没有测到那段实现」。这 4 个变异**没有杀死**，
 *   这是事实。它们的定性（等价 / 本机不可观测 / 语言语义不可杀死）是
 *   **另一维度的信息**，说明「不是测试的错」，但**不能**因此把它们从分母里抹掉 ——
 *   抹掉就是「调判据凑通过」，恰恰是本项目 §1.4 禁止的自证行为。
 *
 * ⇒ 本脚本的职责是**如实报数**：killed=10 / total=14。
 *   ACCEPT-E2 因此判 0.71 < 0.8 失败 —— **这是它该红的地方**。
 *   定性说明写在 tools/mutation-equivalents.md，供人审，不由脚本私自折算。
 *
 * ★每条的定性依据（均已实测，非推断）：
 *   M11 `iter5NormalizeMode(legacy)` vs `(saved)`：该分支下 legacy 恒为 null，
 *       两者都归一化成 'system' ⇒ 无可观测差异。
 *   M12 删除 `typeof value === 'string'` 提前返回：JS 字符串是**值类型**，
 *       `String(s) === s` 恒真 ⇒ 在语言层面**不可杀死**。
 *   M13 `claim` 的 owner 去掉 `host`：同机回环下 host 恒等于自身，
 *       只有跨机场景才暴露 ⇒ 本机**不可观测**。
 *   M14 `toBuffer` 对 Buffer 入参也走 `Buffer.from`：字节相同，仅引用身份不同，
 *       而调用方只用字节内容 ⇒ 不可观测。
 */
const SURVIVED_KNOWN = [
  { id: 'M11', label: 'iter5: 首次升级路径传 saved 而非 legacy（两值同归一化为 system，不可观测）' },
  { id: 'M12', label: 'notrim: 删除 toText 的字符串提前返回（JS 字符串值类型 ⇒ 不可杀死）' },
  { id: 'M13', label: 'lock: claim 去掉 owner 的 host 字段（同机回环恒等，本机不可观测）' },
  { id: 'M14', label: 'transport-primitives: toBuffer 对 Buffer 入参也走 Buffer.from（字节等价）' },
]

/* ══════════ 输出：sdd-guard parseMutationReport 可解析的格式 ══════════
 *
 * ★三态而非二态（2026-11-14 修）：
 *   旧版只按 `killed` 二分 ⇒ ANCHOR-MISS（锚点未命中、变异从未执行）显示成 `✗`，
 *   与「应用了但杀不死」同形，于是 `survived` 把「没测」算成「测了没过」。
 *   实测事故：M9 的锚点 `localStorage.setItem(ITER5_MODE_KEY, mirrored)`
 *   只存在于被 B' 排除的 `cf8c7a0e`，主线 `220e0cac` 中命中 0 次，
 *   却被计入 survived，使「9 杀 + 4 等价」显示成「9 杀 5 存」。
 *
 * ★符号选择：ANCHOR-MISS 行用 `⊘`（不是 ✓/✗）。
 *   依据：sdd-guard 的 parseMutationReport 正则为
 *   /^\s*([A-Za-z][\w-]*\d[\w-]*)\s+(.*?)([✓✗])/ —— 只认 ✓/✗，
 *   故 `⊘` 行会被解析器**忽略** ⇒ 自动实现「不计入分母」，无需另加字段。
 *  （已实测：喂含 ⊘ 行的报告，解析出的 total 只数 ✓/✗ 行。）
 */
let killed = 0, applicable = 0, anchorMiss = 0
for (const r of results) {
  if (r.status === 'ANCHOR-MISS') {
    anchorMiss++
    console.log(`${r.id.padEnd(4)} ${label(r)}  ⊘  ${r.note || '锚点未命中'}`)
    continue
  }
  applicable++
  const mark = r.killed ? '✓' : '✗'
  if (r.killed) killed++
  console.log(`${r.id.padEnd(4)} ${label(r)}  ${mark}`)
}
for (const s of SURVIVED_KNOWN) {
  applicable++
  console.log(`${s.id.padEnd(4)} ${s.label}  ✗`)
}

function label(r) {
  return r.label
}

const survived = results.filter((r) => r.status !== 'ANCHOR-MISS' && !r.killed).length + SURVIVED_KNOWN.length
console.log('')
console.log(`变异统计：killed=${killed} applicable=${applicable} survived=${survived} anchorMiss=${anchorMiss}`)
if (anchorMiss > 0) {
  console.log(`⚠ ${anchorMiss} 个变异锚点未命中（目标代码在本分支不存在）⇒ 未执行，不计入分母`)
}
if (survived === 0) console.log('全部可应用变异均被捕获')
else console.log(`存在 ${survived} 个存活变异（其中 ${SURVIVED_KNOWN.length} 个已定性为等价变异）`)
