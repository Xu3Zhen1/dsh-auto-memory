/**
 * R33 · 看板层「去重」真执行验收（70 卷 R11；用户点名项 · 根因 wb-sidecar.js:238）。
 *
 * CR-10：真 import → 真构造 → 真调用 → 断言返回值 + 负路径 + 可复算物理量。
 * 权威：43 卷环 3（同标题归并）/ 66 卷裁定（复合键含 kind）/ 46+48 卷（v4 看板形态）/ 70 卷 R11。
 */
import { readFileSync } from 'node:fs'
const { buildSectionCardsPre, dedupeCardsPre, laneOfEntryPre, buildKanbanPre, buildStatCardsPre, buildMemberListPre, buildRailPre, WB_RAIL_ITEMS_PRE_V1 } = await import(new URL('../../lib/wb-sidecar.js', import.meta.url).href)

let p = 0, f = 0; const fails = []
const ok = (c, m) => { if (c) p++; else { f++; fails.push(m) } }
const eq = (a, b, m) => ok(Object.is(a, b), m + ' [got=' + JSON.stringify(a) + ' want=' + JSON.stringify(b) + ']')
const WS = 'w-test'

/* ── ① 构造真实形态的输入：多篇文档、每篇四个**同名小节** ── */
// ★2026-09-28 守卫演进（R45 时间轴修复）：归并键加了**日期**维度 —— 矩阵的行=日期分组，
//   一张卡只能落一行；旧键（kind+section）会把 8 个不同日期的「已试方案与失败原因」并成
//   1 张卡，时间轴塌成一行（用户报「全是 handoff 文档、不是标题+时间轴」）。
//   本夹具原为**跨 8 天**（mtime 递增一天）⇒ 现应得 8 组/天×4 节 = 32 组（同日之内才归并）。
//   「同日归并」语义由 r11-kaban-dedup 套件继续锁定（两篇同日 ⇒ 归并成 1 组）。
const SECTIONS = ['这是什么', '后端线', '前端线', '已试方案与失败原因']
const DAY = 86400000
const docs = []
for (let d = 0; d < 8; d++) {
  let t = '# 文档' + d + '\n\n'
  SECTIONS.forEach((s, si) => { t += '## ' + s + '\n' + ('正文段落 ' + d + '-' + si + ' ').repeat(20) + '\n\n' })
  docs.push({ relPath: 'p/' + d + '.md', text: t, mtime: 1700000000000 + d * DAY })
}
const raw = buildSectionCardsPre(WS, docs)
eq(raw.length, 8 * 4, '1 ★真构造：8 篇 × 4 同名小节 = 32 张原始卡')
const uniqTitle = new Set(raw.map((c) => String(c.title || '').trim())).size
eq(uniqTitle, 4, '2 ★原始卡去重前唯一 title 仅 4 种（=重复率 ' + ((1 - 4 / 32) * 100).toFixed(2) + '%）')

/* ── ② 真调用：去重（跨天不并 ⇒ 32 组；同日才并） ── */
const dd = dedupeCardsPre(raw)
ok(Array.isArray(dd), '3 ★dedupeCardsPre 真调用返回数组（非 undefined）')
eq(dd.length, 32, '★4 去重后 = 32 组（跨 8 天 × 4 节各自成组；日期维度见头注 R45）')
const sum = dd.reduce((a, c) => a + (Number(c.count) || 0), 0)
eq(sum, 32, '★5 ★★不丢卡：Σcount = 32（守恒，可复算）')
ok(dd.every((c) => c.merged === (c.count > 1)), '6 merged 标志与组内张数一致（count>1 才 merged）')
ok(dd.every((c) => c.count === 1 || /（共 \d+ 条）$/.test(String(c.title || ''))), '★7 多张组标题带「（共 N 条）」（43 卷用户可见口径）')

/* ── ③ 复合键：归档卡与活跃卡**不得**并组（66 卷裁定） ── */
const mk = (kind, sec, id) => ({ id: 'mem_' + id.repeat(32).slice(0, 32), kind, section: sec, title: sec, source: 'p/x.md', mtime: 1700000000000 })
const mixed = dedupeCardsPre([mk('plan', '进度与下一步', 'a'), mk('archive', '进度与下一步', 'b'), mk('ledger', '进度与下一步', 'c')])
eq(mixed.length, 3, '★8 ★复合键含 kind：同名小节但 kind 不同 ⇒ **分 3 组**（不得并）')
const sameKind = dedupeCardsPre([mk('plan', '进度与下一步', 'a'), mk('plan', '进度与下一步', 'b')])
eq(sameKind.length, 1, '★9 同 kind 同名 ⇒ 并为 1 组')
eq(sameKind[0].count, 2, '10 并为 1 组后 count=2')

/* ── ④ 泳道归类**逐条不变**（关键不变量：只动展示标题，不动 section） ── */
const laneOfRaw = raw.map(laneOfEntryPre)
const ddExpanded = dd.reduce((a, c) => { for (let i = 0; i < c.count; i++) a.push(c); return a }, [])
const laneOfDd = ddExpanded.map((c) => laneOfEntryPre(Object.assign({}, c, { section: c.section })))
const laneSetRaw = {}; laneOfRaw.forEach((k) => { laneSetRaw[k] = (laneSetRaw[k] || 0) + 1 })
const laneSetDd = {}; laneOfDd.forEach((k) => { laneSetDd[k] = (laneSetDd[k] || 0) + 1 })
eq(JSON.stringify(laneSetDd), JSON.stringify(laneSetRaw), '★11 ★★泳道归类计数逐条不变（归并不改泳道）')

/* ── ⑤ 幂等 + 确定性（可复算） ── */
eq(JSON.stringify(dedupeCardsPre(raw)), JSON.stringify(dd), '★12 同输入同输出（确定性）')
eq(dedupeCardsPre(dd).length, dd.length, '★13 对已去重结果再去重 ⇒ 组数不变（幂等）')

/* ── ⑥ 负路径：畸形输入一律可渲染、绝不抛、绝不丢卡 ── */
const NEG = [null, undefined, 0, '', 'x', [], {}, NaN, [null], [undefined], [{}, {}], [{ title: null }], [{ section: 123 }]]
let negThrew = 0, negNonArray = 0
NEG.forEach((x) => { try { const r = dedupeCardsPre(x); if (!Array.isArray(r)) negNonArray++ } catch (e) { negThrew++ } })
eq(negThrew, 0, '★14 ★负路径：' + NEG.length + ' 种畸形输入**零抛错**')
eq(negNonArray, 0, '★15 ★负路径：一律返回数组（不返回非数组）')
ok(dedupeCardsPre(null).length === 0 && dedupeCardsPre(undefined).length === 0, '★16 ★null/undefined ⇒ 空数组（不是崩溃）')
ok(dedupeCardsPre({ a: 1 }).length === 0, '★17 ★非数组 ⇒ 空数组（fail-safe）')
eq(dedupeCardsPre(Array(3).fill(null)).length, 0, '★18 ★数组内全 null ⇒ 空数组（跳过无效项）')

/* ── ⑦ opts 边界 ── */
eq(dedupeCardsPre(raw, { by: 'title' }).length, 32, '19 by:title 也按日期归并（与 by:section 同结果：本例标题=节名；R45 起含日期维度）')
eq(dedupeCardsPre(raw, { maxSources: 1 })[0].sources.length, 1, '★20 maxSources=1 ⇒ sources 截到 1 条')
ok(dedupeCardsPre(raw, { maxSources: 0 })[0].sources.length <= 8, '★21 maxSources=0 ⇒ 回落默认 8（不无限增长）')
ok(dedupeCardsPre(raw, 'not-an-object').length === 32, '★22 opts 非对象 ⇒ 安全回落')

/* ── ⑧ 大样本：复算「去重率」判据口径 ── */
const big = []
for (let d = 0; d < 200; d++) big.push({ id: 'mem_' + String(d).padStart(32, '0'), kind: 'ledger', section: '已试方案与失败原因', title: '已试方案与失败原因', source: 'p/' + d + '.md', mtime: 1700000000000 + d })
const bigD = dedupeCardsPre(big)
eq(big.length, 200, '23 大样本：原始 200 卡')
eq(bigD.length, 1, '★24 大样本：去重后 **1 组**')
eq(bigD[0].count, 200, '★25 ★不丢卡：count=200（守恒）')
eq(bigD[0].sources.length, 8, '★26 sources 受 maxSources 上限保护（=8，防卡体膨胀）')
const rate = (1 - bigD.length / big.length) * 100
ok(Math.abs(rate - 99.5) < 1e-9, '★27 ★可复算去重率 = ' + rate.toFixed(1) + '%（判据口径：1 - 组数/卡数）')

/* ── ⑨ 消费链：去重卡真的进了看板/统计/成员/左栏 ── */
const idx = { entries: [], byTag: {}, byCue: {}, versions: {} }
docs.forEach((d) => { idx.entries.push({ id: 'mem_' + String(idx.entries.length).padStart(32, '0'), kind: 'ledger', section: '已试方案与失败原因', title: '已试方案与失败原因', source: d.relPath, mtime: d.mtime, preview: 'x'.repeat(120), body: 'y'.repeat(200) }) })
const kb = buildKanbanPre(idx, {});
ok(kb && Array.isArray(kb.lanes), '★28 ★看板真调用 buildKanbanPre 返回 lanes 数组')
const kbCards = kb.lanes.reduce((a, l) => a + (Array.isArray(l.cards) ? l.cards.length : 0), 0)
ok(kbCards >= 1, '★29 ★看板真的吃到了卡（lane 内 cards 数 = ' + kbCards + '）')
const st = buildStatCardsPre(raw, {});
ok(st && typeof st === 'object', '★30 ★统计卡真调用返回对象')
const ml = buildMemberListPre(raw, {});
ok(Array.isArray(ml) || (ml && typeof ml === 'object'), '★31 ★成员列表真调用返回可用值')
const rail = buildRailPre({});
ok(rail && typeof rail === 'object', '★32 ★左栏真调用返回对象')
eq(WB_RAIL_ITEMS_PRE_V1.length, 8, '★33 ★★左栏恰 8 项（48 卷 L54-L57 / R15）')

console.log('PASS ' + p + ' / FAIL ' + f)
fails.forEach((x) => console.log('  FAIL: ' + x))
process.exit(f === 0 ? 0 : 1)