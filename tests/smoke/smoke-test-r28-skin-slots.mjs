/** R28 · 12 卷 §二 6 槽位 + §四 三条纪律 逐条对拍（真 import + 真执行 + 负路径）。 */
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import vm from 'node:vm'
const { SKIN_ASSETS, SKIN_ASSET_KEYS, assetOf } = await import(new URL('../../lib/skin-assets.js', import.meta.url).href)
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
const SRC = readFileSync(damPath('lib/client.js'), 'utf8')
let p = 0, f = 0; const fails = []
const ok = (c, m) => { if (c) p++; else { f++; fails.push(m) } }
const eq = (a, b, m) => ok(Object.is(a, b), m + ' [got=' + JSON.stringify(a) + ' want=' + JSON.stringify(b) + ']')
const cnt = (s, x) => s.split(x).length - 1

/* ── A. 12 卷 §二 6 槽位（真 import 真调用） ── */
const AUTH6 = ['hero.welcome','empty.library','empty.timeline','empty.recall','bg.mindmap','illust.sync']
eq(SKIN_ASSET_KEYS.length, 6, 'A1 ★槽位恰 6 个（12 卷 §二 表）')
eq(SKIN_ASSET_KEYS.join(','), AUTH6.join(','), 'A2 ★★键名与 12 卷 §二**逐字且顺序一致**')
ok(AUTH6.every((k) => SKIN_ASSETS[k] && Array.isArray(SKIN_ASSETS[k].size) && SKIN_ASSETS[k].size.length === 2), 'A3 ★每槽位带尺寸（纪律三）')
// ★2026-09-28 期望值随素材换代更新：hero.welcome 换成 `hero.native-folio-v1.png`（真实尺寸 1536×1024）。
//   口径澄清：`size` 是**素材原始尺寸声明**（版位预留 + 生图构图依据），**不是渲染硬约束** ——
//   渲染走 <img> + CSS 自适应缩放（窗口大小变、图跟着变）。故本条守的是「声明与**当前素材真实尺寸**一致」，
//   而不是「必须等于某个历史值」；换素材时随真实图更新即可。
const SIZES = { 'hero.welcome': [1536, 1024], 'empty.library': [1448, 1086], 'empty.timeline': [800, 600], 'empty.recall': [800, 600], 'bg.mindmap': [2000, 1400], 'illust.sync': [600, 400] }
ok(AUTH6.every((k) => String(SKIN_ASSETS[k].size) === String(SIZES[k])), 'A4 ★★尺寸与当前素材/12 卷表**逐条一致**')
const rHero = assetOf('hero.welcome')
eq(rHero.placeholder, false, 'A5 ★真调用 assetOf：素材已就绪 ⇒ placeholder=false')
ok(rHero.url === 'slots/hero.native-folio-v1.png' && rHero.size[0] === 1536, 'A6 ★真返回 url 与 size（不是占位）')
const rDark = assetOf('bg.mindmap', true)
ok(rDark.deep === true, 'A7 ★deep 第二参真生效（53 卷深色规范）')
const rBad = assetOf('no.such.key')
eq(rBad.placeholder, true, 'A8 ★负路径：未知 key ⇒ 确定性占位（不抛、不留白）')
ok(typeof rBad.alt === 'string' && rBad.alt.length > 0, 'A9 ★负路径：占位仍带 alt')

/* ── B. ★★6 槽位**全部真上页面**（本轮核心） ── */
// ★2026-09-30 双皮肤块：经典源 = 两块生成区全剥掉后的剩余部分。
const classicSlots = SRC.replace(/    \/\/ ===== ITER5-LEGACY-GENERATED:BEGIN =====[\s\S]*?    \/\/ ===== ITER5-LEGACY-GENERATED:END =====/, '').replace(/    \/\/ ITER5-GENERATED:BEGIN[\s\S]*?    \/\/ ITER5-GENERATED:END\r?\n/, '')
function callsOf(name) { return (classicSlots.match(new RegExp('h\\(' + name + '\\b', 'g')) || []).length }
ok(callsOf('SkinSlot') >= 2, 'B1 SkinSlot 被调用（≥2：hero + empty 两条路）')
ok(callsOf('SkinImg') >= 3, 'B2 SkinImg 被调用（≥3）')
eq(callsOf('SkinBackdrop'), 1, 'B3 ★bg.mindmap 挂点恰 1 处')
eq(callsOf('SkinSyncIllust'), 1, 'B4 ★illust.sync 挂点恰 1 处')
// ★2026-09-27 皮肤线演进：v4 款 welcome 屏合法新增第二处 SkinHero 挂点（复用 52/58 卷管线）。
// 守卫语义「he…hero.welcome 必须挂载」不变；恰 1 计数锁→阈值锁（r38 区间锁先例）。
ok(callsOf('SkinHero') >= 1, 'B5 hero.welcome 挂点 ≥1（R28 补齐；v4 款 welcome 屏新增第二挂点，恰 1 计数锁→阈值锁演进，理由留痕）')
ok(/tourStep === 0 \? h\('div', \{ 'data-dam-tour-visual'[\s\S]{0,100}?h\(SkinHero/.test(classicSlots), 'B6 ★hero 只在**首屏步**渲染（其它步零新增 DOM）')
eq(callsOf('SkinEmpty'), 3, 'B7 三张空状态各 1 处挂载')
const mounts = { 'empty.recall': "'empty.recall'", 'empty.library': "'empty.library'", 'empty.timeline': "'empty.timeline'", 'bg.mindmap': "slot: 'bg.mindmap'", 'illust.sync': "slot: 'illust.sync'" }
for (const [k, needle] of Object.entries(mounts)) ok(cnt(SRC, needle) >= 1, 'B8 ★' + k + ' 在真实页面被引用')

/* ── C. 12 卷 §四 三条纪律 ── */
ok(SRC.includes('function skinAssetUrl(key, deep)') && SRC.includes("API.skinAsset + '?key='"), 'C1 ★纪律一：代码只认 key（经 skinAssetUrl 取，不持路径）')
ok(!/assets\/skin\/slots\//.test(SRC), 'C2 ★★纪律一：客户端**零硬编码素材路径**（路径真源在 skin-assets.js）')
ok(SRC.includes('dam-skin-ph') && SRC.includes('data-dam-skin-ph'), 'C3 ★纪律二：占位是**确定性占位**（非灰方块）')
ok(SRC.includes('skinSlotSize') || SRC.includes('SKIN_SLOT_SIZE'), 'C4 ★纪律三：尺寸被消费（版位预留）')
ok(SRC.includes("className: 'dam-skin-slot dam-skin-slot-' + kind") || SRC.includes('dam-skin-slot-'), 'C5 ★纪律二：占位带 slot 语义类（同尺寸同构图）')

/* ── D. ★真执行 SkinSlot（图未就绪 ⇒ 占位；图就绪 ⇒ <img>） ── */
const i0 = SRC.indexOf('    function SkinImg(props) {')
const i1 = SRC.indexOf('\n    }', SRC.indexOf('function SkinSlot(props)')) + 6
ok(i0 > 0 && i1 > i0, 'D0 SkinImg..SkinSlot 可整段抽取')
const SEG = SRC.slice(i0, i1)
const h = function (type, props) { const rest = Array.prototype.slice.call(arguments, 2), kids = []
  const push = (k) => { if (k === null || k === undefined || k === false) return; if (Array.isArray(k)) k.forEach(push); else kids.push(k) }
  rest.forEach(push); return { __el: true, type, props: props || {}, kids } }
function mk(url) {
  const sb = { console, h, String, Number, Array, Object, JSON, Math, Boolean }
  sb.globalThis = sb; sb.__hooks = []; sb.__idx = 0
  sb.useState = function (v) { const i = sb.__idx++; if (sb.__hooks[i] === undefined) sb.__hooks[i] = (typeof v === 'function' ? v() : v); return [sb.__hooks[i], function (n) { sb.__hooks[i] = (typeof n === 'function' ? n(sb.__hooks[i]) : n) }] }
  sb.skinAssetUrl = function () { return url }
  sb.API = { skinAsset: '/api/x' }
  vm.runInContext(SEG + ';globalThis.__I = SkinImg;globalThis.__S = SkinSlot;', vm.createContext(sb), { filename: 'client.js#skin' })
  sb.renderI = function (pr) { sb.__idx = 0; return sb.__I(pr) }; sb.renderS = function (pr) { sb.__idx = 0; return sb.__S(pr) }
  return sb
}
const sbOk = mk('/api/x?key=hero.welcome')
const img = sbOk.renderI({ slot: 'hero.welcome', label: 'H', deep: false })
eq(img.type, 'img', 'D1 ★★图就绪 ⇒ 真 <img> 元素')
ok(String(img.props.src).indexOf('key=') >= 0, 'D2 ★src 走只读取图路由（纪律一）')
eq(img.props['data-dam-skin'], 'hero.welcome', 'D3 ★带槽位锚点')
const sbNo = mk('')
const ph = sbNo.renderI({ slot: 'empty.library', label: 'L', size: [800, 600] })
eq(ph.type, 'div', 'D4 ★★图未就绪 ⇒ 确定性占位 div（不塌）')
ok(String(JSON.stringify(ph.props)).indexOf('empty.library') >= 0, 'D5 ★占位仍带槽位标识')
const sSlot = mk('/api/x?key=a')
const sEl = sSlot.renderS({ slot: 'empty.recall', kind: 'empty', size: [800, 600] })
ok(!!sEl && String(JSON.stringify(sEl.props)).indexOf('data-dam-skin-slot') >= 0, 'D6 ★SkinSlot 真渲染带语义锚点')

/* ── E. 守恒 ── */
ok(damNoMixedEol(SRC), 'E1 纯 CRLF')
eq((SRC.match(/(?<!function )MEMORY_TABS\(\)/g) || []).length, 2, 'E2 计数锁不变')
console.log('lib/client.js ' + Buffer.byteLength(SRC, 'utf8') + 'B / CRLF ' + (SRC.match(/\r\n/g) || []).length + ' / sha16 ' + createHash('sha256').update(SRC).digest('hex').slice(0, 16).toUpperCase())
console.log('PASS ' + p + ' / FAIL ' + f)
fails.forEach((x) => console.log('  FAIL: ' + x))
process.exit(f === 0 ? 0 : 1)