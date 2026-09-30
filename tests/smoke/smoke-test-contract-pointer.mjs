#!/usr/bin/env node
/**
 * [contract-pointer] 改动 B 验收 · 契约指针进 navParts（报告 §3）。
 *
 * 缺陷/缺口：继任者拿不到「上一份交接契约」的路径 ⇒ 契约里那批「继承死路 / 不变量 /
 * 已验证账」无处可查（§7 实测三份契约三种数字 13/15/16，且条数必须运行时解析、不得写死）。
 *
 * 设计要点（逐条对应报告 §3）：
 *   · 进 **nav** 而非 bulk —— `assembleCarryPre` 的丢弃**由尺寸决定、不由层序决定**，
 *     bulk 里最大的段最先死，指针能否幸存不可依赖。
 *   · 放在 `if (pack)` **之外** —— 契约存在性与转写包无关。
 *   · **nav 自检** —— 指针自己不得成为挤掉 bulk 的那一段（nav 无上限，实测可 >18000）。
 *   · 只给路径**不复述**；探测失败一律跳过（守 I4：绝不阻塞接续）。
 *
 * ★本套件用真代码：`contractPointerLinePre`（判决，纯函数）+ `assembleCarryPre`（组装行为）。
 */
import { contractPointerLinePre } from '../../lib/handoff-anchor.js'
import { assembleCarryPre } from '../../lib/index.js'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const SRC = readFileSync(path.join(ROOT, 'lib', 'index.js'), 'utf8')

let pass = 0, fail = 0
const fails = []
const ok = (c, m) => { if (c) pass++; else { fail++; fails.push(m) } }

const GOOD = 'sha256:' + 'a'.repeat(64)
const contractJson = (digest) => JSON.stringify({ lineage: { prefixDigest: digest } })
const CP = '/ws/.dsh/handover/handover.json'
const lineOf = (o) => contractPointerLinePre(Object.assign({ path: CP, navTextLength: 0, budget: 18000 }, o))
const NAV = '【第3层 · 完整转写与检索(按需)】\n- 完整对话转写已写入: D:/x/transcript/abc.md'

console.log('[contract-pointer] C0 结构守卫：接缝位置（§3 双向复核结论）')
// navParts.push 全仓原仅 ×1（在 if (pack) 内）⇒ 新指针必须加在 if (pack) 之外
const navPushes = [...SRC.matchAll(/navParts\.push\(/g)].length
ok(navPushes === 2, `C0a navParts.push 现为 2 处（原 1 处在 if(pack) 内 + 新指针在 if(pack) 外）；实测 ${navPushes}`)
// ★用**括号配平**判定位置，而不是靠正则跨行猜 —— 正则版在换行/空行变化时会假红。
//   判据：契约的 push 必须落在 `if (pack) { ... }` 这一段**之外**。
function blockOf(src, header) {
  const s = src.indexOf(header)
  if (s < 0) return null
  let depth = 0
  for (let i = s + header.length - 1; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') { depth--; if (depth === 0) return [s, i] }
  }
  return null
}
const packBlock = blockOf(SRC, 'if (pack) {')
const cpPushAt = SRC.indexOf('navParts.push(cp.line)')
ok(!!packBlock, 'C0b-0 找到 `if (pack) {` 块')
ok(!!packBlock && cpPushAt > packBlock[1],
  'C0b ★契约指针的 push 在 `if (pack)` 块**之外**（契约存在性与转写包无关）')
ok(/if \(cp\.ok\) navParts\.push\(cp\.line\)/.test(SRC), 'C0c 指针确进 navParts（不是 bulkParts）')
ok(!/bulkParts\.push\([^)]*contract/i.test(SRC), 'C0d 指针**未**进 bulkParts（进 bulk 会被尺寸淘汰，不可依赖）')
ok(/contractPointerLinePre\(\{/.test(SRC) && /budget: 18000/.test(SRC), 'C0e 判决走共用纯函数并传同一预算 18000')

console.log('[contract-pointer] C1 报告 §3 验证表（1–5 条）')
// ① 契约存在 → 输出指针行
const r1 = lineOf({ raw: contractJson(GOOD) })
ok(r1.ok && r1.line.includes(CP), '① 契约存在 ⇒ 输出含路径的指针行')
ok(r1.ok && /交接契约/.test(r1.line), '①b 未超比例时带说明文字（便于模型知道这是干什么的）')
ok(r1.ok && !/prefixDigest|sha256:/.test(r1.line), '①c ★只给路径**不复述内容**（不把 digest 抄进 carry）')

// ② 预算超限 ⇒ 指针仍在（nav 不截断的非退化断言，用真 assembleCarryPre）
const bigBulk = (n, tag) => '【' + tag + '】\n' + 'x'.repeat(n)
const r2 = assembleCarryPre({
  head: ['指令区'],
  nav: [NAV, r1.line],
  bulk: [bigBulk(3000, '第0层 · 白板 PLAN.md'), bigBulk(8000, '第1层 · 交接账本'), bigBulk(14000, '第2层 · 近期线程')],
  budget: 18000,
})
ok(r2.truncated === true, '② 前置：该场景确已溢出（否则本条是空断言）')
ok(r2.text.includes(CP), '②b ★bulk 溢出时契约指针**仍在场**（nav 永不截断；进 bulk 则会被尺寸淘汰）')

// ③ nav 自检：nav 被构造得超比例 ⇒ 降级为只留路径
const r3 = lineOf({ raw: contractJson(GOOD), navTextLength: 4000 })   // 4000 > 18000×0.2=3600
ok(r3.ok && r3.degraded === true, '③ nav 占比超 0.2 ⇒ 标记降级')
ok(r3.line === CP, '③b ★降级后**只剩路径**（砍掉说明文字，避免指针自己挤掉 bulk）')
const r3b = lineOf({ raw: contractJson(GOOD), navTextLength: 1000 })
ok(r3b.ok && r3b.degraded === false && r3b.line.length > CP.length, '③c 负控：未超比例时**不**降级（防「一律降级」的假门）')
// ③d 边界：恰好等于阈值时不降级（> 才是超）
const r3d = lineOf({ raw: contractJson(GOOD), navTextLength: 3600 })
ok(r3d.ok && r3d.degraded === false, '③d 边界：nav 恰为 3600（= 18000×0.2）不降级（判据是严格大于）')

// ④ 负控 A：契约缺失 ⇒ 该行消失，且 carry 其余部分**逐字节不变**
const r4 = lineOf({ raw: '', path: CP })
ok(r4.ok === false && r4.line === '', '④a 契约读不到 ⇒ 不输出该行')
const base = assembleCarryPre({ head: ['指令区'], nav: [NAV], bulk: [bigBulk(100, '第0层 · 白板')], budget: 18000 })
const withMiss = assembleCarryPre({ head: ['指令区'], nav: [NAV, r4.line].filter(Boolean), bulk: [bigBulk(100, '第0层 · 白板')], budget: 18000 })
ok(base.text === withMiss.text, '④b ★负控 A：契约缺失时 carry 其余部分**逐字节不变**（过滤空行后与原样一致）')

// ⑤ 负控 B：prefixDigest 为 PENDING 形状 ⇒ 该行消失
const shapes = ['PENDING', '', 'sha256:ABCDEF', 'sha256:' + 'a'.repeat(63), 'sha256:' + 'A'.repeat(64), 'sha256:' + 'a'.repeat(65), null, undefined]
const badShapes = shapes.filter((d) => {
  const r = lineOf({ raw: contractJson(d) })
  return r.ok !== false || r.line !== ''
})
ok(badShapes.length === 0, '⑤ ★负控 B：PENDING / 空 / 大小写不符 / 长度 63·64·65 全部不输出（判据与宿主 seededDigest() 同源，不得更宽）：' + JSON.stringify(badShapes))
ok(lineOf({ raw: contractJson(GOOD) }).ok === true, '⑤b 正控：合法 64 位小写 hex ⇒ 输出（证明上面不是一律拒绝）')

// ⑤c JSON 损坏 ⇒ fail-soft，不抛（守 I4）
let threw = false
let rBad = null
try { rBad = lineOf({ raw: '{not json' }) } catch (e) { threw = true }
ok(!threw && rBad && rBad.ok === false && rBad.reason === 'unparsable', '⑤c JSON 损坏 ⇒ 不抛异常且不输出（fail-soft，绝不阻塞接续）')

// ⑤d lineage 缺失 / 类型异常 ⇒ 不输出、不抛
const odd = [{}, { lineage: {} }, { lineage: { prefixDigest: 123 } }, { lineage: null }, []]
const oddBad = odd.filter((o) => { const r = lineOf({ raw: JSON.stringify(o) }); return r.ok !== false })
ok(oddBad.length === 0, '⑤d 缺 lineage / digest 非字符串 ⇒ 一律不输出（且不抛）：' + JSON.stringify(oddBad))

console.log(fails.map((f) => '  FAIL: ' + f).join('\n'))
console.log(`\n[contract-pointer] PASS ${pass} / FAIL ${fail}`)
process.exit(fail ? 1 : 0)
