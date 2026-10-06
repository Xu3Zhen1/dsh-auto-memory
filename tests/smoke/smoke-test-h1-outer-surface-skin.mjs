import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

// ★2026-09-30（H1 · 用户实测三项残留）→ ★2026-10-01 重锚（H3-1 取代 H1 后本套件曾整段失效）
//  验收对象：「模块级浮层共用样式表」在**四种皮肤档**下究竟投放哪张表。
//  用户报的症状（经典档）：①新手引导/更新日志仍是新版外观 ②左下窗格蓝底非液态玻璃 ③设置区崩坏。
//  根因史：F 批按 flavor 一刀切（非 iter5 即停注）⇒ 经典档三面**零皮肤样式**（H1 修掉）；
//          H3-1 把两处抢节点的 effect 收敛为「单一出口 damSharedSurfaceCss()」，但该出口的
//          **classic 分支写成 return ''** ⇒ 同一个症状被静默推翻（2026-10-01 vm 真执行复现）。
//  本次重锚的两点：
//    ①定位锚从 `H1 · 外层三面按皮肤分派`（H3-1 已删除该注释）改为 **真执行单一出口函数本身**；
//    ②断言对象从「探针表达式」改为 **产品同源活代码**（从 client.js 按括号配平抽出函数体后 vm 执行）。
const source = readFileSync(new URL('../../lib/client.js', import.meta.url), 'utf8')

// ---- 从真实源码抽出被测活代码（与产品同源，不手写副本）----
function fnAt(startNeedle) {
  const i = source.indexOf(startNeedle)
  assert.ok(i >= 0, 'fn start not found: ' + startNeedle.slice(0, 60))
  const end = source.indexOf('\n    }', i)
  assert.ok(end >= 0, 'fn end not found: ' + startNeedle.slice(0, 60))
  return source.slice(i, end + 6)
}
/** 按花括号配平抽函数体（H3-1 段缩进是 6 空格，`\n    }` 那招不再适用）。 */
function grabBalanced(startNeedle) {
  const s = source.indexOf(startNeedle)
  assert.ok(s >= 0, 'fn not found: ' + startNeedle)
  const b = source.indexOf('{', s)
  let d = 0
  for (let k = b; k < source.length; k++) {
    if (source[k] === '{') d++
    else if (source[k] === '}') { d--; if (!d) return source.slice(s, k + 1) }
  }
  throw new Error('unbalanced: ' + startNeedle)
}
const KEY = 'dam-skin'
const STYLE_KEY = 'dam-skin-style'
function bootFlavor(store) {
  const local = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)) },
    removeItem: (k) => { store.delete(k) },
  }
  const code = [
    'var DAM_SKIN_KEY = ' + JSON.stringify(KEY),
    'var DAM_SKIN_STYLE_KEY = ' + JSON.stringify(STYLE_KEY),
    'var DAM_SKIN_VARIANT_IDS = ["legacy","instrument","editorial","water"]',
    fnAt('    function damSkinActive() {'),
    fnAt('    function damSkinStyleGet() {'),
    "    function damSkinLegacy() { return damSkinStyleGet() === 'legacy' }",
    fnAt('    function damSkinCssFlavor() {'),
    'return { damSkinCssFlavor: damSkinCssFlavor }',
  ].join('\n')
  const ctx = vm.createContext({ localStorage: local, String, JSON })
  return vm.runInContext('(function(){' + code + '})()', ctx)
}

// ---- 1) 单一出口唯一性：定义恰 1 处（H3-1 的「同源多写」纪律）----
const SHARED_FN = 'function damSharedSurfaceCss()'
assert.equal(source.split(SHARED_FN).length - 1, 1, 'damSharedSurfaceCss must be defined exactly once')
const sharedSrc = grabBalanced(SHARED_FN)

// ---- 2) 真执行：三档必须都拿到**非空**的表 ----
function pickShared(flavorValue) {
  const code = [
    'var ITER5_CSS = "VARIANTSHEET"',
    'var LEGACY_ITER5_CSS = "LEGACYSHEET"',
    'var damSkinCssFlavor = function () { return ' + JSON.stringify(flavorValue) + ' }',
    sharedSrc,
    'return damSharedSurfaceCss()',
  ].join('\n')
  return vm.runInContext('(function(){' + code + '})()', vm.createContext({}))
}
assert.equal(pickShared('iter5'), 'VARIANTSHEET', 'iter5 flavor must get the variant sheet')
assert.equal(pickShared('legacy'), 'LEGACYSHEET', 'legacy flavor must get the frozen 3.2.5 sheet (NOT empty)')
assert.equal(pickShared('classic'), 'LEGACYSHEET', 'classic flavor must get the frozen 3.2.5 sheet (NOT empty)')
console.log('PASS shared-sheet dispatch: iter5→variant, legacy/classic→frozen (never empty)')

// ---- 3) 负路径（变异必红）：把 classic 分支改回 `return ''`，本套件必须失败 ----
//   这条断言证明上面那三行**不是恒真守卫**：真删掉修复，下面的 pickShared('classic') 立刻变空。
const mutated = sharedSrc.replace(
  "if (damSurfaceFlavor === 'classic') return LEGACY_ITER5_CSS",
  "if (damSurfaceFlavor === 'classic') return ''",
)
assert.notEqual(mutated, sharedSrc, 'MUTATION CHECK: classic branch must exist verbatim in source (anchor hit)')
function pickMutated(flavorValue) {
  const code = [
    'var ITER5_CSS = "VARIANTSHEET"',
    'var LEGACY_ITER5_CSS = "LEGACYSHEET"',
    'var damSkinCssFlavor = function () { return ' + JSON.stringify(flavorValue) + ' }',
    mutated,
    'return damSharedSurfaceCss()',
  ].join('\n')
  return vm.runInContext('(function(){' + code + '})()', vm.createContext({}))
}
assert.equal(pickMutated('classic'), '', 'MUTATION CHECK: classic must yield EMPTY when the fix is reverted (the 2026-10-01 defect)')
assert.notEqual(pickShared('classic'), '', 'classic must NOT be empty (fix in place)')
console.log('PASS mutation check: reverting the classic branch yields empty; the shipped form does not')

// ---- 3b) 旧「停注」形态在活代码中的残留数：0（已全部改造）----
const STOP_OLD = "if (damFlavor !== 'iter5') return function () {}"
assert.equal(source.split(STOP_OLD).length - 1, 0, 'F6 stop-injection must be fully replaced')
console.log('PASS negative path: F6 stop-injection 残留 0 处')

// ---- 4) 冻结块锚（该表即 3.2.5 原表）----
//   H3-1 之后冻结块注释已改写，锚改为**冻结表变量本身**（比注释锚更稳）。
assert.ok(/var LEGACY_ITER5_CSS = /.test(source), 'frozen 3.2.5 sheet variable missing')
console.log('PASS frozen block keeps its own 3.2.5 sheet (LEGACY_ITER5_CSS declared)')

// ---- 5) 四档全矩阵（与用户「确保开关·显示同步」对齐）----
const matrix = [
  ['新款（出厂默认·未选过）', new Map(), 'legacy', 'LEGACYSHEET'],
  ['仪器', new Map([[KEY, 'v4'], [STYLE_KEY, 'instrument']]), 'iter5', 'VARIANTSHEET'],
  ['编辑', new Map([[KEY, 'v4'], [STYLE_KEY, 'editorial']]), 'iter5', 'VARIANTSHEET'],
  ['活水', new Map([[KEY, 'v4'], [STYLE_KEY, 'water']]), 'iter5', 'VARIANTSHEET'],
  ['新款（经典·3.2.5 基线）', new Map([[KEY, 'v4'], [STYLE_KEY, 'legacy']]), 'legacy', 'LEGACYSHEET'],
  ['经典（宿主原生）', new Map([[KEY, 'classic']]), 'classic', 'LEGACYSHEET'],
]
for (const [label, store, wantFlavor, wantSheet] of matrix) {
  const f = bootFlavor(store).damSkinCssFlavor()
  assert.equal(f, wantFlavor, label + ': flavor must be ' + wantFlavor + ', got ' + f)
  assert.equal(pickShared(f), wantSheet, label + ': shared sheet must be ' + wantSheet)
  console.log('  ok - ' + label + ' → flavor=' + f + ' sheet=' + wantSheet)
}
console.log('PASS 6/6 skin × shared-sheet matrix (no combination yields an empty stylesheet)')

console.log('== H1/H3-1 outer-surface skin dispatch: all assertions passed ==')
