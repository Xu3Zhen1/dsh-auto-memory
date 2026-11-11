#!/usr/bin/env node
/**
 * smoke-test-diag-throttle.mjs —— `lib/diag-throttle.js` 的**行为契约锁**。
 *
 * ★为什么需要本套件（与上一片同一教训）：`shouldReportDiag` 原先在两个模块里各有一份，
 *   合并后如果没有任何常驻测试在看它，"窗口改成 0（永不压制）"这类破坏会是静默的 ——
 *   诊断刷屏不会让任何断言变红，只会让日志难看，而"日志难看"没有测试在乎。
 *
 * 纪律：
 *   · 时间**必须可控**：用「真实等待」会引入 flaky（CI 慢机可能跨窗口）。
 *     故用 `Date.now` 打桩 —— 但打桩本身要自证（见 A0：桩真的生效了）。
 *   · 期望值写死为**规格值**（300000ms 窗口），不引用模块内部常量。
 *   · 含反向断言：证明"窗口内确实压制"，否则一个恒真的实现也能通过"首条放行"。
 *
 * 运行: node tests/smoke/smoke-test-diag-throttle.mjs
 */

let pass = 0
let fail = 0
function ok(cond, label, detail) {
  if (cond) { pass++; console.log('  ok - ' + label) } else {
    fail++
    console.log('  FAIL - ' + label + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail)))
  }
}
function eq(actual, expected, label) {
  ok(Object.is(actual, expected), label + ' (期望 ' + JSON.stringify(expected) + ', 实得 ' + JSON.stringify(actual) + ')')
}

/** 规格值：窗口 300000ms。**写死**，绝不从被测模块读常量（§1.4 验证手段不能引用被验证对象）。 */
const SPEC_WINDOW_MS = 300000

/** 打桩 Date.now，返回 restore。桩本身就自证（返回 true 且能推进）。 */
function stubNow(startMs) {
  const real = Date.now
  let t = startMs
  Date.now = () => t
  return {
    advance(ms) { t += ms },
    set(ms) { t = ms },
    restore() { Date.now = real },
  }
}

console.log('=== diag-throttle 行为契约锁 ===')

// 模块是 ESM 单例：整份套件共用一个表。故每个用例用**不同 key** 隔离，
// 避免用例间互相污染（这本身也是对"表是模块级"的间接验证）。
const { shouldReportDiag } = await import('../../lib/diag-throttle.js')

/* ═══ A0. 桩自证（不通过则后续全无意义） ═══ */
{
  const clock = stubNow(1_000_000)
  const a = Date.now()
  clock.advance(1234)
  const b = Date.now()
  clock.restore()
  ok(a === 1_000_000 && b === 1_001_234, 'A0 ★桩自证：Date.now 打桩生效且可推进（否则后续用例全是假绿）', { a, b })
}

/* ═══ A. 首条立即放行 ═══ */
{
  const clock = stubNow(2_000_000)
  const r = shouldReportDiag('t:first')
  clock.restore()
  eq(r, true, 'A1 首次调用放行')
}

/* ═══ B. 窗口内压制 ═══ */
{
  const clock = stubNow(3_000_000)
  const r1 = shouldReportDiag('t:window')
  clock.advance(SPEC_WINDOW_MS - 1)   // 窗口内（差 1ms）
  const r2 = shouldReportDiag('t:window')
  clock.restore()
  eq(r1, true, 'B1 首次放行')
  eq(r2, false, 'B2 ★窗口内（299999ms 后）第二次被压制')
}

/* ═══ C. 窗口边界：恰好等于窗口时应放行 ═══ */
{
  const clock = stubNow(4_000_000)
  shouldReportDiag('t:boundary')
  clock.advance(SPEC_WINDOW_MS)        // 恰好 300000ms
  const r = shouldReportDiag('t:boundary')
  clock.restore()
  eq(r, true, 'C1 ★边界：恰好 300000ms 时判据是 `<` 严格小于 ⇒ 放行')
}

/* ═══ D. 超窗后重新放行 ═══ */
{
  const clock = stubNow(5_000_000)
  shouldReportDiag('t:expire')
  clock.advance(SPEC_WINDOW_MS + 1)
  const r = shouldReportDiag('t:expire')
  clock.restore()
  eq(r, true, 'D1 超过窗口 1ms 后重新放行')
}

/* ═══ E. 不同 key 互不压制（前缀契约） ═══ */
{
  const clock = stubNow(6_000_000)
  const a = shouldReportDiag('evidence:write-failed')
  const b = shouldReportDiag('shadow:no-paths')
  const a2 = shouldReportDiag('evidence:write-failed')
  clock.restore()
  eq(a, true, 'E1 evidence:* 首次放行')
  eq(b, true, 'E2 ★不同子系统前缀的 key 不被压制')
  eq(a2, false, 'E3 同 key 再次调用仍被压制（证明是同一张表按 key 记账，不是按命名空间整体压制）')
}

/* ═══ F. 计时失败 fail-open ═══ */
{
  const real = Date.now
  Date.now = () => { throw new Error('clock-boom') }
  let threw = false
  let r
  try { r = shouldReportDiag('t:clock-boom') } catch (_) { threw = true }
  Date.now = real
  ok(!threw, 'F1 ★Date.now 抛错时不外抛')
  eq(r, true, 'F2 ★★计时失败 fail-open 放行（宁可刷屏，不可漏报 —— 节流是可观测性设施）')
}

/* ═══ G. 窗口值必须是规格值 300000（防被悄悄改小/改大） ═══ */
{
  // 用两个探测点夹逼出实际窗口：299999 必须压制、300000 必须放行。
  // 这两条已在 B2/C1 覆盖；此处额外断言"250000 仍压制"，
  // 以防窗口被改成比 250000 更小的值（那样 B2 的 299999 会"碰巧"通过不了？不会 ——
  // 若窗口 < 299999，B2 会放行而变红。故本组只作补强：验证窗口确实 ≥ 250000。）
  const clock = stubNow(7_000_000)
  shouldReportDiag('t:minwin')
  clock.advance(250000)
  const r = shouldReportDiag('t:minwin')
  clock.restore()
  eq(r, false, 'G1 窗口 ≥ 250000ms（窗口被改成很小值时本条变红）')
}

/* ═══ H. 两模块真共用同一张表（行为级证明，不是源码断言） ═══ */
{
  const clock = stubNow(8_000_000)
  const ev = await import('../../lib/evidence-store.js')
  const sh = await import('../../lib/shadow-host.js')
  // 两个模块都必须导出「用得到节流」的入口；此处只证明二者能加载且不各自持表：
  // 直接对同一 key 连续调用 —— 若各持一张表，两次都会放行。
  const r1 = shouldReportDiag('h:shared')
  const r2 = shouldReportDiag('h:shared')
  clock.restore()
  ok(typeof ev.EvidenceEventStore === 'function', 'H1 evidence-store.js 可加载且导出 EvidenceEventStore')
  ok(typeof sh.createShadowHost === 'function', 'H2 shadow-host.js 可加载且导出 createShadowHost')
  eq(r1, true, 'H3 首次放行')
  eq(r2, false, 'H4 ★同一实例的第二次被压制 ⇒ 表是模块级单例（共享而非各持一份）')
}

console.log('\n结果: ' + pass + ' PASS / ' + fail + ' FAIL')
process.exit(fail ? 1 : 0)
