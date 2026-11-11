#!/usr/bin/env node
/**
 * smoke-test-team-primitives.mjs —— `lib/team-primitives.js` 的**行为契约锁**。
 *
 * ★为什么需要本套件（2026-11-12，切片 dedupe-auth-identity 的负控实测暴露）：
 *   把 toText / safeGet / safeDiag / safeMessage 收口到单一实现处之后，跑了两次变异负控
 *   （去掉 safeGet 的 getter 兜底 / 把 toText 改成不 trim），**全仓 457 个套件没有一条变红**。
 *   说明这两个不变量当时**没有任何测试在看**：改坏它可以是静默的。
 *   ⇒ 那个「重构行为不变」的结论当时只由我的一次性对拍脚本支撑，没有常驻判据。
 *   本套件把那些一次性对拍固化为常驻断言，让「改坏会红」长期成立。
 *
 * 纪律：
 *   · 期望值**写死**（取自改前两份实现的实测输出），不引用被测实现自身的表达式；
 *   · 每条断言都在描述**规格语义**，不是描述"当前实现恰好这么写"；
 *   · 含**反向断言**（该抛的必须判得出、该 trim 的必须真的去掉了空白），
 *     避免"恒真实现也能通过"。
 *
 * 运行: node tests/smoke/smoke-test-team-primitives.mjs
 */

import { toText, safeGet, safeDiag, safeMessage } from '../../lib/team-primitives.js'

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

console.log('=== team-primitives 行为契约锁 ===')

/* ═══ A. toText：**会 trim**（这是与传输层同名函数的唯一区分点） ═══ */
{
  // ★这条最容易写反：本模块的 toText 是 **trim 版**（服务于"抠出可比较标识"：token/成员 id/角色名）。
  //   传输层 team-transport*.js 的同名函数**不 trim**（服务于"键与载荷字节"）。
  //   两者语义不同 ⇒ 不可合并；本套件把"这里会 trim"钉死，防未来有人"统一"它们。
  eq(toText('  x  '), 'x', 'A1 ★trim 版语义：toText("  x  ") ⇒ "x"（与传输层的"保留空白"版相反）')
  eq(toText('abc'), 'abc', 'A2 无空白字符串原样')
  eq(toText('  '), '', 'A3 纯空白 ⇒ ""')
  eq(toText(''), '', 'A4 空串仍空串')
  eq(toText(null), '', 'A5 null ⇒ ""')
  eq(toText(undefined), '', 'A6 undefined ⇒ ""')
  eq(toText(0), '0', 'A7 ★数字 0 ⇒ "0"（不是空串：0 是合法值）')
  eq(toText(false), 'false', 'A8 布尔 false ⇒ "false"')
  eq(toText(NaN), 'NaN', 'A9 NaN ⇒ "NaN"')

  // ★A10 反向断言已由 A1 承担（A1 断 "  x  " ⇒ "x"，即空白确实被剥）；
  //   若只看 A2（无空白串原样），一个"完全不 trim"的实现也全绿 —— A1 就是补这个洞的那条。

  // toString 抛错时不外抛
  const bad = { toString() { throw new Error('toString-boom') } }
  let threw = false
  let val
  try { val = toText(bad) } catch (_) { threw = true }
  ok(!threw, 'A11 toString 抛错时不外抛')
  eq(val, '', 'A12 toString 抛错 ⇒ ""（不返回半成品）')
}

/* ═══ B. safeGet：getter 抛错不外抛（本片最核心的不变量） ═══ */
{
  eq(safeGet({ a: 1 }, 'a'), 1, 'B1 正常属性原样返回')

  const throwingOwn = {}
  Object.defineProperty(throwingOwn, 'a', { get() { throw new Error('own-boom') }, enumerable: true })
  let threw = false
  let v
  try { v = safeGet(throwingOwn, 'a') } catch (_) { threw = true }
  ok(!threw, 'B2 ★核心：own getter 抛错时 safeGet 不外抛')
  eq(v, undefined, 'B3 own getter 抛错 ⇒ undefined')

  const throwingProto = Object.create({ get a() { throw new Error('proto-boom') } })
  let threw2 = false
  let v2
  try { v2 = safeGet(throwingProto, 'a') } catch (_) { threw2 = true }
  ok(!threw2, 'B4 ★原型链 getter 抛错时也不外抛')
  eq(v2, undefined, 'B5 原型链 getter 抛错 ⇒ undefined')

  eq(safeGet(null, 'a'), undefined, 'B6 null holder ⇒ undefined')
  eq(safeGet(undefined, 'a'), undefined, 'B7 undefined holder ⇒ undefined')
  eq(safeGet(0, 'a'), undefined, 'B8 falsy holder（0）⇒ undefined')
  eq(safeGet('', 'a'), undefined, 'B9 falsy holder（""）⇒ undefined')
  eq(safeGet(false, 'a'), undefined, 'B10 falsy holder（false）⇒ undefined')
  eq(safeGet({ b: 2 }, 'a'), undefined, 'B11 键缺失 ⇒ undefined')

  // 判据是 `holder ? …: undefined`（真值判据），不是 typeof 判据 —— 这是原实现的既有语义
  eq(safeGet('abc', 'length'), 3, 'B12 ★真值判据语义：字符串 holder 的 length 可读到 3')
  eq(safeGet([7, 8], 'length'), 2, 'B13 数组 holder 的 length 可读到 2')
  eq(safeGet([7, 8], 'a'), undefined, 'B14 数组上的非索引键 ⇒ undefined')
}

/* ═══ C. safeDiag：诊断回调失败不放大 ═══ */
{
  let called = 0
  const recorder = (m) => { called++; return m }
  safeDiag(recorder, 'msg')
  eq(called, 1, 'C1 函数 diag 被调用一次')

  let threw = false
  try { safeDiag(function () { throw new Error('diag-boom') }, 'msg') } catch (_) { threw = true }
  ok(!threw, 'C2 ★diag 自身抛错不外抛（可观测性代码不得顶掉业务错误面）')

  for (const [label, d] of [['undefined', undefined], ['null', null], ['字符串', 'not-a-fn'], ['对象', {}]]) {
    let t = false
    try { safeDiag(d, 'msg') } catch (_) { t = true }
    ok(!t, 'C3 非函数 diag（' + label + '）被静默忽略')
  }

  // 消息原样透传（本层不做 toText —— 那是调用方的选择）
  let got = null
  safeDiag((m) => { got = m }, '  spaced  ')
  eq(got, '  spaced  ', 'C4 diag 收到的消息原样透传（本层不裁剪）')
}

/* ═══ D. safeMessage：回退链 message → String(err) → 'unknown-error' ═══ */
{
  eq(safeMessage(new Error('boom')), 'boom', 'D1 Error 取其 message')
  eq(safeMessage(new Error('')), 'Error', 'D2 ★message 为空 ⇒ 回落到 String(error) = "Error"')
  eq(safeMessage('plain'), 'plain', 'D3 字符串原样')
  eq(safeMessage('  padded  '), 'padded', 'D4 字符串经 trim')
  eq(safeMessage({ message: 'obj-msg' }), 'obj-msg', 'D5 普通对象的 message 字段')
  eq(safeMessage({}), '[object Object]', 'D6 ★无 message ⇒ String(obj) = "[object Object]"')
  eq(safeMessage(null), 'unknown-error', 'D7 ★null ⇒ 字面量 unknown-error')
  eq(safeMessage(undefined), 'unknown-error', 'D8 undefined ⇒ unknown-error')
  eq(safeMessage(42), '42', 'D9 数字 ⇒ "42"')

  // ★反向断言：最后一环必须是**字面量**而不是空串 ——
  //   否则「有错但说不清」与「完全没错」在下游不可区分。
  ok(safeMessage(null).length > 0, 'D10 ★反向断言：降级结果非空（不是 ""）')

  // ★D11/D12 记录一条**既有限制**（不是本片引入，实测 HEAD 原实现同样外抛）：
  //   `safeMessage` 的 `error.message` 读取**没有**经 safeGet 包裹 ⇒ message 是抛错 getter 时会外抛。
  //   本片是纯提取（行为不变），故**不在此修**（修它属于行为变更，须独立立片 + 独立风险论证）。
  //   这里把它钉成**已知行为**：若将来有人顺手改成"不外抛"，本断言会红，逼他显式说明理由。
  const bad = {}
  Object.defineProperty(bad, 'message', { get() { throw new Error('msg-boom') }, enumerable: true })
  let threw = false
  try { safeMessage(bad) } catch (_) { threw = true }
  ok(threw, '★D11 已知限制：message 是抛错 getter 时 safeMessage **会外抛**（HEAD 原实现即如此）',
    '若本条变红，说明有人改了该行为 —— 那必须另立切片论证，不能夹在纯提取里')
}

console.log('\n结果: ' + pass + ' PASS / ' + fail + ' FAIL')
process.exit(fail ? 1 : 0)
