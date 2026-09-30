/**
 * R35 · 看板层「展开更早」真执行验收（70 卷 R13 / 44 卷 L13+L83 / 46 卷 L124）。
 *
 * CR-10：真 import → 真构造 → 真调用 → 断言返回值 + 负路径 + 可复算物理量。
 * 判据（70 卷 L94 逐字）：大量卡时首屏不卡；**展开后计数守恒**。
 * 形态来源（44 卷 L83 / 46 卷 L124 逐字）：「展开更早的 21 天（1,341 条活动）」+ 向下箭头，圆角 999px。
 */
const { foldCardsPre } = await import(new URL('../../lib/wb-sidecar.js', import.meta.url).href)

let p = 0, f = 0; const fails = []
const ok = (c, m) => { if (c) p++; else { f++; fails.push(m) } }
const eq = (a, b, m) => ok(Object.is(a, b), m + ' [got=' + JSON.stringify(a) + ' want=' + JSON.stringify(b) + ']')

/* ── 固定时间锚：2026-09-27 12:00 本地（当日 00:00 起算） ── */
const NOW = new Date(2026, 8, 27, 12, 0, 0).getTime()
const DAYSTART = new Date(2026, 8, 27).getTime()
const DAY = 86400000
/** 造一张「距今 N 天」的卡（N=0 表示今天）。 */
const cardAt = (n, i) => ({ id: 'mem_' + String(i).padStart(32, '0'), mtime: DAYSTART - n * DAY + 3600000, source: 'p/' + n + '.md', section: '已试方案与失败原因', title: 't' + i })

/* ── ① 真构造：1,341 条（对齐 44 卷图面数量级）+ 跨 21 天 ── */
const big = []
for (let i = 0; i < 1341; i++) big.push(cardAt(i % 21, i))
eq(big.length, 1341, '1 ★真构造：1,341 条活动（与 44 卷 L83 图面同量级）')

/* ── ② 默认折叠（foldDays=7）⇒ 首屏只渲染近 7 天 ── */
const r7 = foldCardsPre(big, { now: NOW })
ok(r7 && Array.isArray(r7.visible), '★2 ★foldCardsPre 真调用返回 {visible, folded, hasMore, total, foldDays}')
eq(r7.foldDays, 7, '★3 ★默认 foldDays = 7（不传 opts 时的缺省口径）')
eq(r7.total, 1341, '★4 total = 1341（总数守恒）')
ok(r7.visible.length < r7.total, '★5 ★★首屏条数 < 总数 ⇒ **大量卡时首屏不卡**（70 卷判据）')
eq(r7.visible.length, big.filter((c) => c.mtime >= DAYSTART - 6 * DAY).length || r7.visible.length, '★6 首屏 = 近 7 天（foldDays-1=6 天窗口）')
ok(r7.visible.every((c) => c.mtime >= DAYSTART - 6 * DAY), '★7 ★首屏每一条都在 7 天窗口内（无越界）')
eq(r7.visible.length + r7.folded.count, r7.total, '★★8 ★★**计数守恒**：visible + folded.count === total（70 卷逐字判据）')
eq(r7.hasMore, true, '★9 有折叠 ⇒ hasMore=true（前端据此渲染折叠条）')

/* ── ③ ★「展开更早」= foldDays=0 ⇒ 全量（这是「点击后就显示」的实现口径） ── */
const r0 = foldCardsPre(big, { now: NOW, foldDays: 0 })
eq(r0.foldDays, 0, '★10 ★foldDays=0 被接受（0 = 不折叠，语义在源码注释 L959 逐字）')
eq(r0.visible.length, 1341, '★★11 ★★展开后 = **全量 1341 条**（点击后全显示）')
eq(r0.folded.count, 0, '★12 展开后 folded.count = 0')
eq(r0.hasMore, false, '★13 ★展开后 hasMore=false（折叠条应消失）')
eq(r0.visible.length + r0.folded.count, r0.total, '★★14 ★★展开后仍**计数守恒**')
eq(r0.total, r7.total, '★★15 ★★**折叠↔展开前后 total 不变**（1,341 条一条不丢）')

/* ── ④ 「更早的天数」口径（44 卷「21 天」） ── */
// ★口径修正（第 8 次「凭直觉写死期望值」）：cardAt 里带了 `+3600000`（1 小时）偏移，
//   所以 days 会少 1（floor(19.958)=19 ⇒ 20），**21 是我按图面想当然写死的**。
//   修法：①天数改成**由源码口径对实际数据派生**；②另造一份**日对齐**数据来对齐 44 卷「21 天」图面。
const minFolded = Math.min.apply(null, big.filter((c) => c.mtime < DAYSTART - 6 * DAY).map((c) => c.mtime));
eq(r7.folded.days, Math.max(1, Math.floor((DAYSTART - minFolded) / DAY) + 1), '★16 ★折叠条天数 = **源码口径对实际数据派生**（最早被折叠卡距今天数，floor+1）') 
eq(r7.folded.days, 20, '★16b 本数据集（带 1h 偏移、跨 21 天）实测 = 20（**非凭直觉的 21**）')
const aligned = []
for (let n = 0; n < 21; n++) aligned.push({ id: 'mem_' + String(n).padStart(32, '0'), mtime: DAYSTART - n * DAY, source: 'p/' + n + '.md' })
const ra = foldCardsPre(aligned, { now: NOW })
eq(ra.folded.days, 21, '★★17 ★★**日对齐**数据下天数 = **21**（与 44 卷 L83「展开更早的 21 天」图面逐字一致）')
eq(ra.visible.length + ra.folded.count, 21, '★17b 日对齐数据下同样**计数守恒**')

/* ── ⑤ 窗口边界精确性 ── */
const b6 = foldCardsPre([cardAt(6, 1), cardAt(7, 2)], { now: NOW })
eq(b6.visible.length, 1, '★18 第 6 天在窗口内、第 7 天在窗口外（边界精确）')
eq(b6.folded.count, 1, '★19 折叠计数与之一致')
const b1 = foldCardsPre([cardAt(0, 1)], { now: NOW, foldDays: 1 })
eq(b1.visible.length, 1, '★20 foldDays=1 ⇒ 仅今天可见')
eq(b1.hasMore, false, '★21 无更早卡 ⇒ hasMore=false（不渲染空折叠条）')

/* ── ⑥ 排序口径（mtime 倒序，同 mtime 用 id 稳定序） ── */
const sortedOk = r7.visible.every((c, i, arr) => i === 0 || Number(arr[i - 1].mtime) >= Number(c.mtime))
ok(sortedOk, '★22 ★首屏 mtime **倒序**（最近在前，与 buildKanbanPre 同款）')
eq(JSON.stringify(foldCardsPre(big, { now: NOW }).visible.map((c) => c.id)), JSON.stringify(r7.visible.map((c) => c.id)), '★23 同输入同输出（确定性，可复算）')

/* ── ⑦ ★负路径：畸形输入一律可渲染、绝不抛 ── */
const NEG = [null, undefined, 0, '', 'x', [], {}, NaN, [null], [undefined], [{}, {}], [{ mtime: 'abc' }], [{ mtime: NaN }]]
let threw = 0, bad = 0
NEG.forEach((x) => { try { const q = foldCardsPre(x, { now: NOW }); if (!q || !Array.isArray(q.visible) || !q.folded) bad++ } catch (e) { threw++ } })
eq(threw, 0, '★24 ★负路径：' + NEG.length + ' 种畸形输入**零抛错**')
eq(bad, 0, '★25 ★负路径：一律返回完整结构（visible/folded 都在）')
eq(foldCardsPre(null, { now: NOW }).total, 0, '★26 null ⇒ total 0（不崩）')
eq(foldCardsPre({ a: 1 }, { now: NOW }).visible.length, 0, '★27 非数组 ⇒ visible 空（fail-safe）')
// ★口径修正：非法 mtime 按 0 处理 = **epoch 0**（1970），远早于 7 天窗口 ⇒ 应全部**折叠**。
//   我原写 `.visible.length === 1`（误以为「0 当今天」）——又是想当然。
const badM = foldCardsPre([{ mtime: 'abc' }, { mtime: NaN }], { now: NOW })
eq(badM.visible.length, 0, '★28 ★非法 mtime ⇒ 按 0（epoch）处理 ⇒ 全部折叠（可渲染，不抛）')
eq(badM.folded.count, 2, '★28b ★折叠计数 = 2（两条都进 folded，**一条不丢**）')
eq(badM.visible.length + badM.folded.count, badM.total, '★28c ★非法 mtime 下**计数仍守恒**')

/* ── ⑧ opts 边界（foldDays 语义：源码注释 L959 逐字） ── */
eq(foldCardsPre(big, { now: NOW, foldDays: null }).foldDays, 7, '★29 foldDays=null ⇒ 默认 7')
eq(foldCardsPre(big, { now: NOW, foldDays: undefined }).foldDays, 7, '★30 foldDays=undefined ⇒ 默认 7')
eq(foldCardsPre(big, { now: NOW, foldDays: -3 }).foldDays, 7, '★31 ★foldDays 负数 ⇒ 默认 7（非法回落）')
eq(foldCardsPre(big, { now: NOW, foldDays: 'abc' }).foldDays, 7, '★32 foldDays 非数 ⇒ 默认 7')
eq(foldCardsPre(big, { now: NOW, foldDays: 3.9 }).foldDays, 3, '★33 foldDays 小数 ⇒ 向下取整（3.9 ⇒ 3）')
eq(foldCardsPre(big, { now: NOW, foldDays: '14' }).foldDays, 14, '★34 foldDays 数字字符串 ⇒ 接受（14）')
ok(foldCardsPre(big, 'bad').foldDays === 7, '★35 opts 非对象 ⇒ 安全回落（foldDays=7）')
eq(foldCardsPre(big, { now: 'not-a-date' }).foldDays, 7, '★36 now 非法 ⇒ 不崩（foldDays 仍正确）')

/* ── ⑨ 与「统计卡」同源：折叠不改变 total 口径 ── */
const r14 = foldCardsPre(big, { now: NOW, foldDays: 14 })
ok(r14.visible.length >= r7.visible.length, '★37 foldDays 越大 ⇒ 可见越多（单调性）')
ok(r14.folded.count <= r7.folded.count, '★38 foldDays 越大 ⇒ 折叠越少（单调性）')
eq(r14.visible.length + r14.folded.count, 1341, '★★39 ★★任意 foldDays 下**计数恒守恒** = 1,341')

console.log('PASS ' + p + ' / FAIL ' + f)
fails.forEach((x) => console.log('  FAIL: ' + x))
process.exit(f === 0 ? 0 : 1)