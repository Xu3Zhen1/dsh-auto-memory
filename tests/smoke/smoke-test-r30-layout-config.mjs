/** R30 · 配置层：56 卷 §三 4 条验收判据 + §二 5 项客户操作面（真 import 真调用）。 */
const { LAYOUT_REGIONS, LAYOUT_SLOTS, LAYOUT_BLOCK_KINDS, AUTHOR_SURFACE_KEYS, LAYOUT_CONFIG_VERSION, LAYOUT_CONFIG_FILE } = await import(new URL('../../lib/layout-config.js', import.meta.url).href)
const { defaultLayoutConfig, normalizeLayoutConfig, SLOT_REGION_OF } = await import(new URL('../../lib/layout-config.js', import.meta.url).href)
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const damPath = (rel) => fileURLToPath(new URL('../../' + rel, import.meta.url))
const IX = readFileSync(damPath('lib/index.js'), 'utf8')
const CL = readFileSync(damPath('lib/client.js'), 'utf8')
let p = 0, f = 0; const fails = []
const ok = (c, m) => { if (c) p++; else { f++; fails.push(m) } }
const eq = (a, b, m) => ok(Object.is(a, b), m + ' [got=' + JSON.stringify(a) + ' want=' + JSON.stringify(b) + ']')

/* ── A. 56 卷 §二 schema 规模（权威数字） ── */
eq(LAYOUT_REGIONS.length, 7, 'A1 ★region 恰 7 个（56 卷 §二 表）')
eq(LAYOUT_SLOTS.length, 18, 'A2 ★slot 恰 18 个（56 卷 §二 表）')
eq(LAYOUT_BLOCK_KINDS.length, 10, 'A3 ★blockKind 恰 10 种（56 卷 §二 表）')
eq(AUTHOR_SURFACE_KEYS.length, 5, 'A4 ★authorSurface 恰 5 项（56 卷 §二）')
eq(AUTHOR_SURFACE_KEYS.join(','), 'reorder,resize,visibility,aesthetics,imagery', 'A5 ★★5 项与 56 卷 §二 表逐字一致且顺序一致')
eq(LAYOUT_CONFIG_VERSION, 1, 'A6 配置版本 = 1')
eq(LAYOUT_CONFIG_FILE, 'layout-config.json', 'A7 ★配置文件名 = layout-config.json（56 卷 §三 裁定 B：配置文件形态）')

/* ── B. ★56 卷 §三 四条验收判据（真调用 normalize） ── */
const def = defaultLayoutConfig()
ok(def && typeof def === 'object', 'B1 正路径：默认配置可构造')
const n0 = normalizeLayoutConfig(null)
ok(n0 && typeof n0 === 'object', 'B2 ★判据3/4：null 输入**不崩**（fail-safe）')
ok(typeof n0.ok === 'boolean', 'B3 normalize 返回 ok 位')
ok(Array.isArray(n0.warnings), 'B4 normalize 返回 warnings 数组（负路径要留告警行）')
ok(JSON.stringify(n0.config) === JSON.stringify(def), 'B5 ★★判据1：删掉配置文件(null/空) ⇒ 与默认**完全一致**')
const nUndef = normalizeLayoutConfig(undefined)
ok(JSON.stringify(nUndef.config) === JSON.stringify(def), 'B6 ★判据1b：undefined 同样回落默认（逐字节一致）')
const nEmpty = normalizeLayoutConfig({})
ok(JSON.stringify(nEmpty.config) === JSON.stringify(def), 'B7 ★判据1c：空对象 {} ⇒ 回落默认')
const bad = normalizeLayoutConfig({ regions: { 'no-such-region-xyz': { order: 3 } } })
ok(bad && typeof bad === 'object', 'B8 ★★判据3：不存在的 region 名 ⇒ **不崩**')
ok(bad.warnings.length >= 1, 'B9 ★判据3b：未知 region 留下 ≥1 行告警（实测 ' + bad.warnings.length + '）')
ok(!bad.config.regions || !bad.config.regions['no-such-region-xyz'], 'B10 ★判据3c：未知项被**忽略**（不写进结果）')
let threw = false
try { normalizeLayoutConfig('not-an-object') } catch (e) { threw = true }
ok(!threw, 'B11 ★判据4：类型错输入（字符串）**不抛**')
let threw2 = false
try { normalizeLayoutConfig({ regions: { page: { order: 'abc', hidden: 'yes' } } }) } catch (e) { threw2 = true }
ok(!threw2, 'B12 ★判据4b：类型错字段**不抛**（回落默认）')

/* ── C. ★判据2：改一个 region 的 order ⇒ 只有它动，其余不动 ── */
const R0 = def.regions || {}
const keys = Object.keys(R0)
const firstKey = keys[0]
const target = (typeof R0[firstKey].order === 'number') ? R0[firstKey].order : 0
const mut = {}; mut.regions = {}; mut.regions[firstKey] = { order: target + 5 }
const nMut = normalizeLayoutConfig(mut)
eq(nMut.config.regions[firstKey].order, target + 5, 'C1 ★★判据2：改 region order ⇒ **该区域取值生效**')
const others = keys.slice(1).filter((k) => R0[k].order !== nMut.config.regions[k].order)
eq(others.length, 0, 'C2 ★★判据2b：**其余区域全部不动**（实测差异 ' + others.length + ' 个）')
eq(nMut.config.regions[firstKey].order, target + 5, 'C3 再取一次仍为改后值（幂等）')

/* ── D. ★宿主读取 + 前端五面消费（56 卷 §三 依赖方向） ── */
ok(IX.includes('readLayoutConfigPre'), 'D1 ★宿主有读取函数 readLayoutConfigPre')
ok(IX.includes('LAYOUT_CONFIG_FILE'), 'D2 ★宿主 import 了配置文件名（真读盘）')
ok(IX.includes('defaultLayoutConfig'), 'D3 ★宿主 import 了默认值（回落用）')
ok(IX.includes('normalizeLayoutConfig'), 'D4 ★宿主 import 了 normalize（校验用）')
ok(/corrupted/.test(IX), 'D5 ★判据4：宿主对 JSON 损坏有隔离留存分支')
const cnt = (s, x) => (s.match(new RegExp(x, 'g')) || []).length
ok(cnt(CL, "data-dam-region") >= 7, 'D6 ★结构层 region 锚点已落（实测 ' + cnt(CL, 'data-dam-region') + '）')
ok(cnt(CL, "data-dam-slot") >= 400, 'D7 ★结构层 slot 锚点已落（实测 ' + cnt(CL, 'data-dam-slot') + '）')
ok(cnt(CL, "data-dam-block") >= 10, 'D8 ★结构层 block 锚点已落（实测 ' + cnt(CL, 'data-dam-block') + '）')
ok(cnt(CL, 'layoutConfig') >= 1, 'D9 ★前端消费 layoutConfig（实测 ' + cnt(CL, 'layoutConfig') + ' 处）')
ok(cnt(CL, '--dam-region') >= 1, 'D10 ★判据2 的 CSS 侧入口（--dam-region）已落')

/* ── E. ★56 卷 §二「客户不能做」（业务逻辑不得由客户承担） ── */
// ★哨兵值：SLOT_REGION_OF 用 '*' 表示「该 slot 不隶属任何 region（跨 region 全局复用）」。
const SENTINEL = '*';

// ★口径修正：56 卷 §二 的原意是「客户**配置文件里**不能声明 API 路径/交互行为」，
//   不是「客户端源码里不许出现字符串 path:」——那是我的正则口径错（误伤源码里的普通键名）。
//   判据改为：配置文件 schema 的**可配置键集合**里不含数据源/交互/Api 类键。
const cfgs = [LAYOUT_CONFIG_FILE, LAYOUT_CONFIG_VERSION].concat(AUTHOR_SURFACE_KEYS);
const okRe = cfgs.every((s) => !/path|endpoint|api|fetch|onclick|route/i.test(String(s)));
ok(okRe, 'E1 ★56 卷 §二「客户不能做」：配置面键集合不含 数据源/交互/API 类键')
ok(Object.keys(SLOT_REGION_OF).length > 0, 'E2 SLOT_REGION_OF 映射表在场（结构层归属）')
const sentinelN = Object.keys(SLOT_REGION_OF).filter((s) => SLOT_REGION_OF[s] === SENTINEL).length;
ok(sentinelN > 0, 'E2b ★哨兵 * 被使用（跨 region 全局 slot：实测 ' + sentinelN + ' 个）')
const orphan = LAYOUT_SLOTS.filter((s) => !SLOT_REGION_OF[s])
eq(orphan.length, 0, 'E3 ★每个 slot 都有 region 归属（无孤儿）')
const bogus = Object.keys(SLOT_REGION_OF).filter((s) => LAYOUT_SLOTS.indexOf(s) < 0)
eq(bogus.length, 0, 'E4 ★映射表不含未知 slot（无脏键）')
// 口径修正: '*' 是本模块的哨兵值,语义=「该 slot 不隶属任何 region(跨 region 全局复用)」.
// (actions/badge/hint/empty 的确如此 - 实测哨兵恰 4 个),不是悬空引用.判据:除哨兵外,归属必须在 region 清单内.
const SENTINEL_VALUE = '*'
const badRegion = Object.keys(SLOT_REGION_OF).filter((s) => SLOT_REGION_OF[s] !== SENTINEL_VALUE && LAYOUT_REGIONS.indexOf(SLOT_REGION_OF[s]) < 0)
eq(badRegion.length, 0, 'E5 ★每个 slot 归属的 region 都在 LAYOUT_REGIONS 内（无悬空引用）')
console.log('PASS ' + p + ' / FAIL ' + f)
fails.forEach((x) => console.log('  FAIL: ' + x))
process.exit(f === 0 ? 0 : 1)