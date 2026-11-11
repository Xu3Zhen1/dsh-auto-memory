#!/usr/bin/env node
/**
 * smoke-test-team-primitives-notrim.mjs —— 「**不 trim**」家族原语的契约锁。
 *
 * ★为什么必须单独一套（不能并进 smoke-test-team-primitives.mjs）：
 *   本仓现在有**两份**同名 `toText`/`safeGet`，语义**故意不同**：
 *     · `lib/team-primitives.js`        —— trim 版 + truthiness 版 safeGet（标识抠取）
 *     · `lib/team-primitives-notrim.js` —— 不 trim 版 + 只挡 null/undefined 版 safeGet（键/载荷）
 *   若只有一份套件，未来有人"顺手统一"两份实现时不会有任何红。
 *   本套件的作用就是**把差异钉死**：谁想合并，必须先让这里变红。
 *
 * 纪律：期望值写死为规格值，不引用被测实现自身的表达式；
 *       差异断言是**双向**的（既断言 notrim 版不 trim，也断言 trim 版确实 trim）。
 *
 * 运行: node tests/smoke/smoke-test-team-primitives-notrim.mjs
 */

import { toText, safeGet } from '../../lib/team-primitives-notrim.js'
import { toText as toTextTrim, safeGet as safeGetTruthy } from '../../lib/team-primitives.js'

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

console.log('=== team-primitives-notrim 契约锁 ===')

/* ═══ A. toText：**保留**前后空白 ═══ */
{
  eq(toText('  x  '), '  x  ', 'A1 ★不 trim：toText("  x  ") 原样保留空白')
  eq(toText('  '), '  ', 'A2 ★纯空白串原样保留（trim 版此处得 ""）')
  eq(toText('\n\t'), '\n\t', 'A3 换行/制表原样保留')
  eq(toText('abc'), 'abc', 'A4 无空白字符串原样')
  eq(toText(''), '', 'A5 空串仍空串')
  eq(toText(null), '', 'A6 null ⇒ ""')
  eq(toText(undefined), '', 'A7 undefined ⇒ ""')
  eq(toText(0), '0', 'A8 数字 0 ⇒ "0"')
  eq(toText(false), 'false', 'A9 false ⇒ "false"')
  eq(toText(NaN), 'NaN', 'A10 NaN ⇒ "NaN"')

  // ★★ A13 缺口补丁（负控实测暴露）：字符串走 `typeof value === 'string'` 的**提前返回**，
  //   所以只测字符串时，"给 String(value) 加 .trim()" 这类变异是**等价变异**、永远不会红。
  //   必须补一条「非字符串输入，但 toString 产出带空白」的用例，才能覆盖 String() 分支。
  eq(toText({ toString() { return '  x  ' } }), '  x  ', 'A13 ★★非字符串路径也**不 trim**（覆盖 String() 分支，防 trim 变异逃逸）')
  eq(toText({ toString() { return '  ' } }), '  ', 'A14 ★非字符串路径的纯空白同样保留')

  const bad = { toString() { throw new Error('toString-boom') } }
  let threw = false, v
  try { v = toText(bad) } catch (_) { threw = true }
  ok(!threw, 'A11 toString 抛错时不外抛')
  eq(v, '', 'A12 toString 抛错 ⇒ ""')
}

/* ═══ B. safeGet：**只挡 null/undefined**，不挡其它 falsy ═══ */
{
  eq(safeGet({ a: 1 }, 'a'), 1, 'B1 正常属性原样')
  eq(safeGet(null, 'a'), undefined, 'B2 null ⇒ undefined')
  eq(safeGet(undefined, 'a'), undefined, 'B3 undefined ⇒ undefined')
  eq(safeGet({ b: 2 }, 'a'), undefined, 'B4 键缺失 ⇒ undefined')

  // ★★ 本模块与 truthiness 版的**核心差异**（这三条就是不可合并的证据）
  eq(safeGet('', 'length'), 0, 'B5 ★★空串 holder 的 length ⇒ 0（truthiness 版会得 undefined）')
  eq(typeof safeGet(0, 'toString'), 'function', 'B6 ★★数字 holder 的 toString ⇒ 原生函数（truthiness 版得 undefined）')
  eq(typeof safeGet(false, 'toString'), 'function', 'B7 ★★false holder 的 toString ⇒ 函数（truthiness 版得 undefined）')

  const throwingOwn = {}
  Object.defineProperty(throwingOwn, 'a', { get() { throw new Error('boom') }, enumerable: true })
  let threw = false, v
  try { v = safeGet(throwingOwn, 'a') } catch (_) { threw = true }
  ok(!threw, 'B8 getter 抛错时不外抛')
  eq(v, undefined, 'B9 getter 抛错 ⇒ undefined')
}

/* ═══ C. ★双向差异锁：两份实现必须保持不同 ═══ */
{
  // C 组的意义：如果有人把两个模块"统一"，下面必然有一半变红。
  // 这不是在测"实现细节"，而是在测**规格**：两个模块服务于两类不同的调用面。
  const cases = [
    ['  x  ', 'trim 差异'],
    ['  ', '纯空白差异'],
    ['\n\t', '控制符差异'],
  ]
  for (const [input, why] of cases) {
    const a = toText(input)
    const b = toTextTrim(input)
    ok(a !== b, 'C ★差异锁 toText(' + JSON.stringify(input) + ') 两版必须不同（' + why + '）', { notrim: a, trim: b })
  }

  const g1 = safeGet('', 'length')
  const g2 = safeGetTruthy('', 'length')
  ok(g1 !== g2, 'C ★差异锁 safeGet("", "length")：notrim 版得 ' + String(g1) + '，trim 版得 ' + String(g2), { g1, g2 })

  // 反向：在两版**应当一致**的输入上必须一致（防"为了不同而不同"）
  eq(safeGet({ a: 1 }, 'a'), safeGetTruthy({ a: 1 }, 'a'), 'C 一致项：普通对象读属性两版相同')
  eq(safeGet(null, 'a'), safeGetTruthy(null, 'a'), 'C 一致项：null holder 两版都得 undefined')
  eq(toText('abc'), toTextTrim('abc'), 'C 一致项：无空白字符串两版相同')
}

console.log('\n结果: ' + pass + ' PASS / ' + fail + ' FAIL')
process.exit(fail ? 1 : 0)
