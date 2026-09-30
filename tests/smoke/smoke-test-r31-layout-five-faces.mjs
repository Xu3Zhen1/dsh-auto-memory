/** R31 · 配置层「前端五面消费」逐面真执行（56 卷 §二 客户 5 件事）。 */
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
const { normalizeLayoutConfig } = await import(new URL('../../lib/layout-config.js', import.meta.url).href)
import { fileURLToPath } from 'node:url'
const damPath = (rel) => fileURLToPath(new URL('../../' + rel, import.meta.url))
const SRC = readFileSync(damPath('lib/client.js'), 'utf8')
let p = 0, f = 0; const fails = []
const ok = (c, m) => { if (c) p++; else { f++; fails.push(m) } }
const eq = (a, b, m) => ok(Object.is(a, b), m + ' [got=' + JSON.stringify(a) + ' want=' + JSON.stringify(b) + ']')
const cnt = (s, x) => (s.match(new RegExp(x, 'g')) || []).length

/* ── 0. 五面消费函数**逐个存在且被真调用**（不是死函数） ── */
const FIVE = {
  '① 区域顺序+显隐': 'applyLayoutRegionsPre',
  '② 区域尺寸': 'applyLayoutRegionSizesPre',
  '③ 外观 token': 'applyLayoutTokensPre',
  '④ 插槽 order+显隐': 'applyLayoutSlotsPre',
  '⑤ 块外观+背景图': 'applyLayoutBlocksPre'
}
for (const [face, fn] of Object.entries(FIVE)) {
  eq(cnt(SRC, 'function ' + fn), 1, '0 ★' + face + ' → ' + fn + ' **恰 1 处定义**')
  // ★不用 RegExp 拼函数名（名里无括号，但拼串易踩非法正则）：改用**纯字面量 includes 计数**
  const calls = SRC.split('\n').filter((l) => l.indexOf(fn + '(') >= 0 && l.indexOf('function ' + fn) < 0).length;
  ok(calls >= 1, '0b ★' + face + ' 有**真实调用点**（非死函数，实测 ' + calls + ' 处）')
}
eq(cnt(SRC, 'function applyLayout\\w*'), 5, '0c ★applyLayout* 家族**恰 5 个**（与五面一一对应）')

/* ── 抽取纯函数（无 DOM 依赖）做真执行 ── */
function seg(startAnchor, endAnchor) {
  const i = SRC.indexOf(startAnchor);
  const j = SRC.indexOf(endAnchor, i);
  if (i < 0 || j < 0) throw new Error('段定位失败: ' + startAnchor);
  return SRC.slice(i, j);
}
const base = SRC.slice(0, SRC.indexOf('function applyLayoutRegionsPre(cfg) {'));
// ★段边界只用**块自身正面锚点**：plan 函数的终点 = 紧随其后的 apply 函数（同一配对，物理相邻）
const segPlan = seg('    function layoutRegionPlanPre(cfg) {', '    function applyLayoutRegionsPre(cfg) {');
const segSize = seg('    function layoutRegionSizePlanPre(cfg) {', '    function applyLayoutRegionSizesPre(cfg) {');
const sb = { console, String, Number, Array, Object, JSON, Math, Boolean, isFinite };
sb.globalThis = sb;
// ★依赖闭包：抽取段引用的模块级常量定义在段**之外** ⇒ 必须一并注入，
//   否则 vm 内 ReferenceError 会被函数自带的 try/catch **静默吞掉**，表现成「plan 恒空」（本轮踩到的假红根因）。
const SEG_CONSTS = [
  "var LAYOUT_REGION_SEL = '[data-dam-region]'",
  "var LAYOUT_TOKEN_PREFIXES = ['--dam-', '--skin-']",
  "var LAYOUT_SIZE_KEYS = ['w', 'h', 'min']",
  "var LAYOUT_SLOT_SEL = '[data-dam-slot]'",
  "var LAYOUT_BLOCK_SEL = '[data-dam-block]'",
].join('\n') + '\n';
vm.runInContext(SEG_CONSTS + segPlan + '\n' + segSize + '\n;globalThis.__P = layoutRegionPlanPre; globalThis.__S = layoutRegionSizePlanPre;', vm.createContext(sb), { filename: 'client.js#layout' });
const P = sb.__P, SZ = sb.__S;
ok(typeof P === 'function' && typeof SZ === 'function', '1 ★两个 plan 纯函数真抽取且是真函数')

/* ── 1. 零视觉变化（62 卷 §二 纪律 1；最关键负路径） ── */
ok(Array.isArray(P(null)) && P(null).length === 0, '★1 无 cfg ⇒ plan 空数组（零视觉变化）')
ok(Array.isArray(P({ ok: false })) && P({ ok: false }).length === 0, '★2 ok:false ⇒ plan 空（不应用半成品）')
// ★负路径补强（R31 反向验证发现）：ok:false 必须**即使携带合法 regions 也**返回空 ——
//   否则「配置有告警时仍应用半成品」会静默发生（原断言只测了空对象，覆盖不到）。
// ★poison 必须**同时带 order 与尺寸键**（w/h/min）：只带 order 时尺寸面天然为空，
//   变异后仍返回空 ⇒ 负路径恒绿、失守（本轮实测踩到）。
const poison = { ok: false, config: { regions: { page: { order: 9, w: '99px', h: '99px', min: '99px' } } } };
ok(P(poison).length === 0, '★2b ★★ok:false + 合法 regions ⇒ **仍为空**（不应用半成品）')
ok(SZ(poison).length === 0, '★2c ★★ok:false + 合法尺寸 ⇒ 尺寸面也为空')
const nrm = normalizeLayoutConfig(null)
ok(nrm.ok === true, '3 空配置 normalize.ok=true（删配置=默认，不算错）')
ok(P(nrm).length === 0, '★4 **删掉配置文件 ⇒ plan 空 ⇒ 一个 DOM 都不动**（56 卷 §三 判据①）')
ok(SZ(nrm).length === 0, '★5 同上：尺寸面也零写入')
const empty = normalizeLayoutConfig({})
ok(P(empty).length === 0 && SZ(empty).length === 0, '★6 空对象 {} ⇒ 两面都零写入')

/* ── 2. 面① 区域顺序 + 显隐（56 卷 §二 客户第 1、3 件事） ── */
const c1 = normalizeLayoutConfig({ regions: { page: { order: 3 }, 'page-nav': { hidden: true } } })
const p1 = P(c1)
const byName = {}; p1.forEach((x) => { byName[x.name] = x });
eq(byName.page.order, 3, '★7 改 order ⇒ plan 里该 region order=3')
eq(byName['page-nav'].hidden, true, '★8 hidden:true ⇒ plan 里 hidden=true')
ok(p1.every((x) => x.name !== 'no-such'), '9 未知 region 不进 plan（已在 normalize 层忽略）')
eq(P(c1).map((x) => x.name).join(','), p1.map((x) => x.name).join(','), '★10 同输入同输出（可复算）')

/* ── 3. 面② 区域尺寸（客户第 2 件事，28 卷 §3.6 resize） ── */
const c2 = normalizeLayoutConfig({ regions: { page: { w: '320px', h: '50vh', min: '200px' } } })
const s2 = SZ(c2)
eq(s2.length, 1, '★11 只有被配置的 region 进尺寸 plan')
eq(s2[0].name, 'page', '12 名字正确')
eq(JSON.stringify(s2[0].sizes), JSON.stringify({ w: '320px', h: '50vh', min: '200px' }), '★13 w/h/min 三元组逐字透传')
const c2b = normalizeLayoutConfig({ regions: { page: { w: '320px' } } })
eq(Object.keys(SZ(c2b)[0].sizes).length, 1, '★14 只配 w ⇒ 只写 w（不补空值）')

/* ── 4. 面⑤ 块外观 + 背景图（客户第 4 件事） ── */
// ★口径修正：「card」不在 LAYOUT_BLOCK_KINDS 的 10 类里（badge/list/timeline/chart/stat/actions/form/prose/media/empty）
//   ⇒ 用真实 kind（badge / media）。
const c5 = normalizeLayoutConfig({ blocks: { badge: { style: 'flat' }, media: { bg: 'url(a.png)' } } })
ok(cnt(JSON.stringify(c5.config.blocks), 'flat') >= 1, '★15 block style 被 normalize 接受')
ok(cnt(JSON.stringify(c5.config.blocks), 'a.png') >= 1, '★16 block bg 被 normalize 接受')
const c5bad = normalizeLayoutConfig({ blocks: { 'no-such-kind': { style: 'x' } } })
// ★口径修正：默认配置**本就含全部 10 类 kind**（各为空对象）⇒「忽略」的判据是 **未知键不出现**，
//   不是「结果为空」——后者是我的断言写错了（会把对的实现判成错的）。
ok(!('no-such-kind' in c5bad.config.blocks), '★17 未知 blockKind ⇒ 忽略（不写进结果）')
eq(Object.keys(c5bad.config.blocks).length, 10, '★17b 未知 blockKind 不影响既有 10 类')
ok(c5bad.warnings.length >= 1, '18 未知 blockKind 留告警')

/* ── 5. 面③ token（客户第 4 件事的 CSS 侧） ── */
const c3 = normalizeLayoutConfig({ tokens: { '--dam-accent': '#f00', '--skin-x': '1px' } })
eq(Object.keys(c3.config.tokens).length, 2, '★19 合法前缀 token 接受')
const c3bad = normalizeLayoutConfig({ tokens: { 'bad-prefix': '#f00' } })
eq(Object.keys(c3bad.config.tokens).length, 0, '★20 非法前缀 token ⇒ 忽略')
ok(c3bad.warnings.length >= 1, '21 非法前缀留告警')

/* ── 6. 面④ 插槽 order + 显隐（客户第 1、3 件事的 slot 侧） ── */
const c4 = normalizeLayoutConfig({ slots: { list: { order: 2, hidden: false }, board: { hidden: true } } })
eq(c4.config.slots.board.hidden, true, '★22 slot hidden 生效')
eq(c4.config.slots.list.order, 2, '★23 slot order 生效')
const c4bad = normalizeLayoutConfig({ slots: { 'no-such-slot': { order: 1 } } })
ok(!('no-such-slot' in c4bad.config.slots), '★24 未知 slot ⇒ 忽略（不写进结果）')
eq(Object.keys(c4bad.config.slots).length, 18, '★24b 未知 slot 不影响既有 18 个')

/* ── 7. hidden 便捷数组（等价写法） ── */
const c7 = normalizeLayoutConfig({ hidden: ['page', 'list', 'not-a-thing'] })
eq(c7.config.regions.page.hidden, true, '★25 hidden 数组里的 region 生效')
eq(c7.config.slots.list.hidden, true, '★26 hidden 数组里的 slot 生效')
ok(c7.warnings.some((w) => /not-a-thing/.test(w)), '★27 数组中非法的项留告警')

/* ── 8. 幂等 + 单调（可复算物理量） ── */
ok(JSON.stringify(P(c1)) === JSON.stringify(P(c1)), '★28 面① plan 幂等')
ok(JSON.stringify(SZ(c2)) === JSON.stringify(SZ(c2)), '★29 面② plan 幂等')
ok(JSON.stringify(P(c1)) === JSON.stringify(P(normalizeLayoutConfig({ regions: { page: { order: 3 }, 'page-nav': { hidden: true } } }))), '★30 同语义输入 ⇒ 同输出（跨构造幂等）')
console.log('PASS ' + p + ' / FAIL ' + f)
fails.forEach((x) => console.log('  FAIL: ' + x))
process.exit(f === 0 ? 0 : 1)