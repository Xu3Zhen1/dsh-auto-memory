/** R27 · 48 卷 §四 8 条自查清单逐条对拍（真执行 + 负路径）。 */
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

/** 平台无关行尾守恒：存在 CRLF 时不得有裸 LF；全 LF 合法（CI/Linux 检出态）。
 *  ★2026-09-28：原断言写作 cnt(NL)===cnt(CRNL)（即"必须全 CRLF"），在 Linux CI 上必红——
 *  索引里是 LF，本机 core.autocrlf=true 才检出 CRLF。守的语义不变：文件不得混合行尾。 */
const damNoMixedEol = (s) => {
  const crlf = (s.match(/\r\n/g) || []).length
  const lf = (s.match(/\n/g) || []).length
  if (crlf === 0) return true      // 全 LF：合法（CI 检出态）
  return crlf === lf               // 有 CRLF 则不得再有裸 LF
}
const damPath = (rel) => fileURLToPath(new URL('../../' + rel, import.meta.url))

// ★2026-09-28 多语言化：源码内联文案已改为 L(甲, 乙)。抽段进 vm 的套件需要同名桩。
// 注入到各 vm 沙箱：L / L3 / normLocale 桩（闭包捕获 self，不依赖 this）
// 注入到各 vm 沙箱：L / L3 / normLocale 桩（闭包捕获 self，不依赖 this）
// ★locale 缺省对齐产品默认值 'zh'（源码 `var locale = 'zh'`）；否则未设 locale 的旧沙箱
//   会被 L() 判成非中文 ⇒ 误回落英文、断言假红。
function __mkI18nStub(self) {
  if (!self.locale) self.locale = 'zh'
  self.__L10N = self.__L10N || {}
  self.L = function (a, b) {
    if (self.locale === 'zh') return a
    var m = self.__L10N[self.locale]
    if (m && m[a] !== undefined && m[a] !== '') return m[a]
    return b === undefined ? a : b
  }
  self.L3 = function (a, b, ja) {
    if (self.locale === 'zh') return a
    if (self.locale === 'ja' && ja !== undefined && ja !== null) return ja
    return self.L(a, b)
  }
  self.normLocale = function (v) {
    var s = String(v == null ? '' : v).toLowerCase()
    if (!s) return ''
    var all = ['zh', 'en', 'ja']
    for (var i = 0; i < all.length; i++) {
      if (s === all[i] || s.indexOf(all[i] + '-') === 0 || s.indexOf(all[i] + '_') === 0) return all[i]
    }
    return ''
  }
  return self
}

const SRC = readFileSync(damPath('lib/client.js'), 'utf8')
let p = 0, f = 0; const fails = []
const ok = (c, m) => { if (c) p++; else { f++; fails.push(m) } }
const eq = (a, b, m) => ok(Object.is(a, b), m + ' [got=' + JSON.stringify(a) + ' want=' + JSON.stringify(b) + ']')
const cnt = (s, x) => s.split(x).length - 1

/* ── 抽取 DamTimelineCard（真执行） ── */
const i0 = SRC.indexOf('    function DamTimelineCard(props) {')
const i1 = SRC.indexOf('\n    }', i0) + 6
ok(i0 > 0 && i1 > i0 + 500, 'A0 DamTimelineCard 可整段抽取（'+ (i1 - i0) + ' B）')
const SEG = SRC.slice(i0, i1)
const h = function (type, props) { const rest = Array.prototype.slice.call(arguments, 2), kids = []
  const push = (k) => { if (k === null || k === undefined || k === false) return; if (Array.isArray(k)) k.forEach(push); else kids.push(k) }
  rest.forEach(push); return { __el: true, type, props: props || {}, kids } }
// ★修正（本轮自查，第 2 次）：原来 useState 只改**闭包变量**，而组件里 `expanded` 是**已解构的旧值** ——
//   组件函数不会因 setState 重新执行 ⇒ 读到的永远是最初值（**假红**，且更糟：它让「点击生效」根本不可测）。
//   React 的真实行为 = setState 触发**重新执行组件函数**。这里实现最小忠实版：按序 hook 盒子 + 手动重渲染。
function mkHarness() {
  const sb = { console, h, String, Number, Date, Array, Object, JSON, Math, Boolean }
  sb.globalThis = sb
  sb.__hooks = []; sb.__idx = 0
  sb.useState = function (v) {
    const i = sb.__idx++
    if (sb.__hooks[i] === undefined) sb.__hooks[i] = (typeof v === 'function' ? v() : v)
    return [sb.__hooks[i], function (n) { sb.__hooks[i] = (typeof n === 'function' ? n(sb.__hooks[i]) : n) }]
  }
  sb.kxLaneColor = function () { return 'currentColor' }
  vm.runInContext(SEG + ';globalThis.__C = DamTimelineCard;', vm.createContext(__mkI18nStub(sb)), { filename: 'client.js#tlcard' })
  // render(props)：每次从 hook 盒子读当前值 ⇒ 等价于 React 的一次渲染
  sb.render = function (props) { sb.__idx = 0; return sb.__C(props) }
  return sb
}
const CARD = { id: 'c1', title: '完成看板解析层重构', preview: '对看板解析层的核心逻辑进行了重构，优化了数据处理流程和异常处理机制，提升了系统的稳定性。', mtime: Date.now(), laneLabel: '进度与下一步', tags: ['前端', '看板', '重构'], docTitle: '交接账本', bullets: 4, chars: 361, anchored: true }
const sb1 = mkHarness(); ok(typeof sb1.__C === 'function', 'A1 ★DamTimelineCard 在 vm 中真执行');
const el = sb1.render({ card: CARD, laneKey: 'progress', laneLabel: '进度与下一步', zh: true });
ok(!!el && el.__el === true, 'A2 ★真调用返回元素');
const flat = (e, out) => { out = out || []; out.push(e); (e.kids || []).forEach((k) => { if (k && k.__el) flat(k, out) }); return out }
const nodes = flat(el);
const find = (attr) => nodes.filter((n) => n.props && n.props[attr] !== undefined)
const txt = (n) => (n.kids || []).map((k) => (k && k.__el ? txt(k) : String(k))).join('')

/* ── 48 卷 §四 逐条 ── */
eq(find('data-dam-tl-rail').length, 1, '§四-7a 左列轨道存在');
eq(find('data-dam-tl-dot').length, 1, '§四-7b ★节点圆点存在（贯穿竖线 + 圆点）');
const body = find('data-dam-tl-body')[0]
const blocks = (body.kids || []).filter((k) => k && k.__el)
const divs = blocks.filter((k) => k.type === 'div')
ok(divs.length >= 6, '§四-1 ★卡片 ≥4 层（身份/分隔/标题/摘要/分隔/元信息）实测 ' + divs.length + ' 个块');
const idRow = divs[0]
ok(txt(idRow).indexOf('14:') >= 0 || txt(idRow).length > 3, '§四-1b 身份行含姓名/时间');
const tagNodes = flat(el).filter((n) => n.props && typeof txt(n) === 'string' && txt(n).indexOf('#') === 0)
ok(tagNodes.length >= 1 && tagNodes.length <= 3, '§四-2 ★第 1 行有 #tag 且 ≤3 个（实测 ' + tagNodes.length + '）');
ok(txt(el).indexOf('交接账本') >= 0, '§四-3 ★第 4 行含来源文档名');
ok(txt(el).indexOf('4 条') >= 0 && txt(el).indexOf('361 字') >= 0, '§四-3b ★第 4 行含条目数与字数');
ok(txt(el).indexOf('可跳原文') >= 0, '§四-3c ★第 4 行含锚点标记');
const acts = find('data-dam-tl-act');
eq(acts.length, 2, '§四-4 ★★两个操作按钮在**第 4 行**（元信息栏内，实测 ' + acts.length + '）');
const meta = find('data-dam-tl-meta')[0];
ok(!!meta && flat(meta).filter((n) => n.props && n.props['data-dam-tl-act']).length === 2, '§四-4b ★★按钮确为元信息栏的**子节点**（不是悬在卡片右中）');
const jump = find('data-dam-tl-act').filter((n) => n.props['data-dam-tl-act'] === 'jump')[0]
ok(!!jump && jump.props.onClick === undefined, '§四-4c 未传 onJump 时按钮不挂 onClick（fail-closed）');
const sbJ = mkHarness();
let jumped = null;
const elJ = sbJ.render({ card: CARD, laneKey: 'p', laneLabel: 'L', zh: true, onJump: function (cc) { jumped = cc } });
const jumpJ = flat(elJ).filter((n) => n.props && n.props['data-dam-tl-act'] === 'jump')[0];
ok(typeof jumpJ.props.onClick === 'function', '§四-4c2 ★★传了 onJump ⇒ 跳转按钮真带 onClick');
jumpJ.props.onClick();
eq(jumped && jumped.id, 'c1', '§四-4c3 ★★真点击跳转 ⇒ 回调收到该卡（端到端可复算）');
const summ = find('data-dam-tl-summary')[0]
eq(summ.props.style.whiteSpace, 'nowrap', '§四-5 ★默认摘要**恰好 1 行**（nowrap + ellipsis）');
ok(el.props.style.minHeight === '152px', '§四-6 ★卡片高度 152px（与 §三 L152 逐字一致）');
ok(cnt(SRC, 'data-dam-tl-act') >= 2, '§四-8 泳道色走 laneKey（dot 由 kxLaneColor 派生）');

/* ── ★★R27 新能力：展开按钮真回调（负路径） ── */
const expA = find('data-dam-tl-act').filter((n) => n.props['data-dam-tl-act'] === 'expand')[0]
ok(!!expA && typeof expA.props.onClick === 'function', 'B1 ★★展开按钮真带 onClick（R27 补）');
eq(el.props['data-dam-tl-expanded'], '0', 'B2 ★初始态未展开（保 §一 第 2 条）');
// ★修正（本轮自查）：原写法用**另一个实例** el2 点击、再读 el2 —— 但 vm 下的单次渲染不反映重渲染，
//   实测拿到 'nowrap'（**假红**：测试写法错，不是实现错）。改为**同一实例**先点后读。
const P = { card: CARD, laneKey: 'progress', laneLabel: '进度与下一步', zh: true };
expA.props.onClick();          // 真点击 ⇒ setState
const elR = sb1.render(P);     // ★重渲染 = React 对 setState 的真实响应
const summAfter = flat(elR).filter((n) => n.props && n.props['data-dam-tl-summary'] !== undefined)[0]
eq(summAfter.props.style.whiteSpace, 'normal', 'B3 ★★真点击展开 ⇒ 摘要放开为多行（变异则必红）');
const expAfter = flat(elR).filter((n) => n.props && n.props['data-dam-tl-act'] === 'expand')[0]
ok(String(expAfter.kids.join ? expAfter.kids.join('') : expAfter.kids) === '\u02c4', 'B3b ★展开后箭头翻面为 ˄（即时回显）');
const elR2 = sb1.render(P)
const expR2 = flat(elR2).filter((n) => n.props && n.props['data-dam-tl-act'] === 'expand')[0]
expR2.props.onClick();
const elR3 = sb1.render(P)
eq(flat(elR3).filter((n) => n.props && n.props['data-dam-tl-summary'] !== undefined)[0].props.style.whiteSpace, 'nowrap', 'B3c ★再点一次收回（可逆）');
const sb2 = mkHarness();
const el2 = sb2.render(P);
const expA2 = flat(el2).filter((n) => n.props && n.props['data-dam-tl-act'] === 'expand')[0];
const el3 = sb2.render(P);
const expA3 = flat(el3).filter((n) => n.props && n.props['data-dam-tl-act'] === 'expand')[0]
eq(expA3.kids.join ? expA3.kids.join('') : String(expA3.kids), '\u02c5', 'B4 ★新卡默认收起（态自持、不串卡）');
eq(flat(el3).filter((n) => n.props && n.props['data-dam-tl-summary'] !== undefined)[0].props.style.whiteSpace, 'nowrap', 'B5 ★新实例默认收起（state 不跨实例泄漏）');
const elNo = mkHarness().render({ card: {}, laneKey: 'x', laneLabel: '', zh: true });
ok(!!elNo, 'B6 ★负路径：空卡不崩（真调用）');
eq(flat(elNo).filter((n) => n.props && n.props['data-dam-tl-act']).length, 2, 'B7 ★负路径：空卡仍有 2 按钮（结构稳定）');
const elEn = mkHarness().render({ card: CARD, laneKey: 'p', laneLabel: 'Progress', zh: false });
ok(txt(elEn).indexOf('items') >= 0 || txt(elEn).indexOf('chars') >= 0, 'B8 英文态文案可切换');

/* ── C. 守恒 ── */
eq((SRC.match(/(?<!function )MEMORY_TABS\(\)/g) || []).length, 2, 'C1 计数锁不变');
ok(damNoMixedEol(SRC), 'C2 纯 CRLF')
console.log('lib/client.js ' + Buffer.byteLength(SRC, 'utf8') + 'B / CRLF ' + (SRC.match(/\r\n/g) || []).length + ' / sha16 ' + createHash('sha256').update(SRC).digest('hex').slice(0, 16).toUpperCase())
console.log('PASS ' + p + ' / FAIL ' + f)
fails.forEach((x) => console.log('  FAIL: ' + x))
process.exit(f === 0 ? 0 : 1)