/**
 * R36 · 看板层「全部成员」真执行验收（70 卷 R14 / 44 卷 L65 / 46 卷 L77 / 48 卷 L69 / 49 卷 L104）。
 *
 * CR-10：真 import → 真构造 → 真调用 → 断言返回值 + 负路径 + 可复算物理量。
 * 判据（70 卷 L95 逐字）：成员列表准确；单成员筛选生效。
 * 关键口径（49 卷 L104 逐字）：姓名/头像来自 team-attribution.json，**个人版不渲染**（不是「一个叫未知的成员」）。
 */
import { readFileSync } from 'node:fs'
const { buildMemberListPre, filterCardsPre } = await import(new URL('../../lib/wb-sidecar.js', import.meta.url).href)
import { fileURLToPath } from 'node:url'
const damPath = (rel) => fileURLToPath(new URL('../../' + rel, import.meta.url))

let p = 0, f = 0; const fails = []
const ok = (c, m) => { if (c) p++; else { f++; fails.push(m) } }
const eq = (a, b, m) => ok(Object.is(a, b), m + ' [got=' + JSON.stringify(a) + ' want=' + JSON.stringify(b) + ']')

/* ── ① 真构造：成员字段三种形态（string / {name} / 缺省） ── */
const mk = (i, extra) => Object.assign({ id: 'mem_' + String(i).padStart(32, '0'), mtime: 1700000000000 + i, source: 'p/' + (i % 3) + '.md' }, extra || {})
const cards = [
  mk(1, { member: '张伟' }), mk(2, { member: '张伟' }), mk(3, { member: '张伟' }),   // 3 张
  mk(4, { actor: '李娜' }), mk(5, { actor: '李娜' }),                                  // 2 张（actor 形态）
  mk(6, { author: { name: '王强' } }),                                                 // 1 张（{name} 对象形态）
  mk(7, {}), mk(8, {}),                                                                 // 2 张无归属
]
eq(cards.length, 8, '1 ★真构造 8 张卡（3 张伟 / 2 李娜 / 1 王强 / 2 无归属）')

/* ── ② 真调用：成员聚合 ── */
const r = buildMemberListPre(cards, {})
ok(r && Array.isArray(r.members), '★2 ★buildMemberListPre 真调用返回 members 数组')
eq(r.members.length, 3, '★3 ★成员去重后恰 **3 人**（张伟/李娜/王强）')
eq(r.total, 8, '★4 total = 8')
eq(r.assigned, 6, '★5 assigned = 6（3+2+1）')
eq(r.unassigned, 2, '★6 unassigned = 2（2 张无归属）')
eq(r.assigned + r.unassigned, r.total, '★★7 ★★**计数守恒**：assigned + unassigned === total（源码注释 L897 逐字）')
eq(r.hasActorData, true, '★8 hasActorData = true（有归属数据）')

/* ── ③ 成员明细与排序（count 降序，再 name 升序） ── */
// ★安全取值器（负路径纪律）：成员缺失时返回哨兵对象 ⇒ 断言计 FAIL 而**不是 TypeError 崩溃**。
//   （实证：去掉 actor/author 分支的变异会让 at('李娜') 为 undefined ⇒ 裸访问直接崩，
//     崩溃虽 exit=1，但不是「精确报红」，无法定位是哪些判据失守。）
const byName = {}; r.members.forEach((m) => { byName[m.name] = m })
const at = (n) => byName[n] || { id: null, name: '<absent:' + n + '>', count: -1, lastMtime: -1 }
eq(at('张伟').count, 3, '★9 张伟 count = 3')
eq(at('李娜').count, 2, '★10 李娜 count = 2（**actor 形态**也被识别）')
eq(at('王强').count, 1, '★11 王强 count = 1（**{name} 对象形态**也被识别）')
eq(at('张伟').id, '张伟', '★12 成员 id = name（源码 L916 逐字）')
// ★安全取值器：members 短了也不能崩（负路径纪律，同上）
const mn = (i) => r.members[i] || { name: '<absent@' + i + '>', count: -1, id: null, lastMtime: -1 }
eq(mn(0).name, '张伟', '★13 排序：count 降序 ⇒ 首位是张伟（3）')
eq(mn(1).name, '李娜', '★14 次位是李娜（2）')
eq(mn(2).name, '王强', '★15 末位是王强（1）')
eq(at('张伟').lastMtime, 1700000000000 + 3, '★16 lastMtime = 该成员最新卡 mtime')
// ★口径修正：张伟的卡 id 是 1/2/3（mtime = base+3），李娜是 4/5（mtime = base+5）
//   ⇒ **李娜的 lastMtime 更大**。我原写「张伟不小于李娜」是把方向写反了（又是想当然）。
ok(at('李娜').lastMtime > at('张伟').lastMtime, '★17 ★李娜（卡 id 4/5）lastMtime 更大 ⇒ lastMtime 取该成员**最新**卡') 
eq(at('李娜').lastMtime, 1700000000000 + 5, '★17b ★李娜 lastMtime = 其卡中最大 mtime（base+5，非首见）')
eq(at('王强').lastMtime, 1700000000000 + 6, '★17c ★王强 lastMtime = base+6')

/* ── ④ 同 count 时按 name 升序（确定性，不依赖插入序） ── */
const tie = buildMemberListPre([mk(1, { member: 'B' }), mk(2, { member: 'A' }), mk(3, { member: 'C' })], {})
eq(tie.members.map((m) => m.name).join(','), 'A,B,C', '★18 ★同 count ⇒ name 升序（u0000级确定性，与插入序无关）')
const tie2 = buildMemberListPre([mk(1, { member: 'C' }), mk(2, { member: 'B' }), mk(3, { member: 'A' })], {})
eq(tie2.members.map((m) => m.name).join(','), 'A,B,C', '★19 反转插入序 ⇒ 输出**完全一致**（真确定性）')

/* ── ⑤ ★单成员筛选（70 卷判据「单成员筛选生效」） ── */
const fz = filterCardsPre(cards, { actor: '张伟' })
ok(Array.isArray(fz.cards), '★20 ★filterCardsPre 真调用返回 cards 数组')
eq(fz.matched, 3, '★21 ★筛选「张伟」⇒ matched = 3（与聚合 count 一致）')
eq(fz.dropped, 5, '★22 dropped = 5')
eq(fz.matched + fz.dropped, fz.total, '★★23 ★★**筛选前后计数守恒** matched + dropped === total（源码注释 L935）')
eq(fz.actor, '张伟', '★24 回显 actor')
ok(fz.cards.every((c) => c.member === '张伟'), '★25 ★筛选结果**每一条**都属于该成员（无漏网）')
const fzL = filterCardsPre(cards, { actor: '李娜' })
eq(fzL.matched, 2, '★26 ★筛选「李娜」（actor 形态）⇒ 2 张')
const fzW = filterCardsPre(cards, { actor: '王强' })
eq(fzW.matched, 1, '★27 ★筛选「王强」（{name} 对象形态）⇒ 1 张')
/* 与聚合**交叉验证**：每个成员筛出的张数 === 聚合里的 count */
let cross = true
r.members.forEach((m) => { if (filterCardsPre(cards, { actor: m.name }).matched !== m.count) cross = false })
ok(cross, '★★28 ★★**交叉验证**：每个人筛选出的张数 === 聚合 count（两函数同口径）')

/* ── ⑥ ★「全部成员」= 不筛选（44 卷 L65 下拉语义） ── */
eq(filterCardsPre(cards, {}).matched, 8, '★29 actor 缺省 ⇒ **不筛选**（返回全量 8）')
eq(filterCardsPre(cards, { actor: '' }).matched, 8, '★30 actor 空串 ⇒ 全量')
eq(filterCardsPre(cards, { actor: '   ' }).matched, 8, '★31 ★actor 纯空白 ⇒ trim 后为空 ⇒ 全量')
eq(filterCardsPre(cards, { actor: null }).matched, 8, '★32 actor=null ⇒ 全量')
eq(filterCardsPre(cards, { actor: undefined }).matched, 8, '★33 actor=undefined ⇒ 全量')
ok(filterCardsPre(cards, {}).actor === '', '★34 「全部成员」时 actor 归一为**空串**（回显不显示伪成员名）')

/* ── ⑦ ★个人版（无 member/actor/author）⇒ 空列表，不是「未知成员」 ── */
const plain = [mk(1, {}), mk(2, {}), mk(3, {})]
const rp = buildMemberListPre(plain, {})
eq(rp.members.length, 0, '★★35 ★★个人版：成员列表 **长度为 0**（49 卷 L104「个人版不渲染」）')
eq(rp.assigned, 0, '★36 assigned = 0')
eq(rp.unassigned, 3, '★37 unassigned = 3（全部无归属）')
eq(rp.hasActorData, false, '★38 ★hasActorData = false ⇒ 前端据此**不渲染**成员下拉')
eq(rp.assigned + rp.unassigned, rp.total, '★39 个人版下计数仍守恒')

/* ── ⑧ 负路径：畸形输入零抛错 ── */
const NEG = [null, undefined, 0, '', 'x', [], {}, NaN, [null], [undefined], [{}, {}], [{ member: 123 }], [{ member: '  ' }]]
let threw = 0, badShape = 0
NEG.forEach((x) => {
  try {
    const a = buildMemberListPre(x, {}); const b = filterCardsPre(x, {})
    if (!a || !Array.isArray(a.members) || typeof a.assigned !== 'number' || !b || !Array.isArray(b.cards)) badShape++
  } catch (e) { threw++ }
})
eq(threw, 0, '★40 ★负路径：' + NEG.length + ' 种畸形输入**零抛错**（两个函数各跑一遍）')
eq(badShape, 0, '★41 ★负路径：一律返回完整结构（members 数组 + assigned 数）')
eq(buildMemberListPre(null, {}).members.length, 0, '★42 null ⇒ 空成员列表（不崩）')
eq(buildMemberListPre({ a: 1 }, {}).members.length, 0, '★43 非数组 ⇒ 空列表（fail-safe）')
eq(buildMemberListPre([{ member: 123 }], {}).members.length, 0, '★44 ★member 非字符串且非 {name} ⇒ **不计入**（不产生「123」伪成员）')
eq(buildMemberListPre([{ member: '  ' }], {}).members.length, 0, '★45 ★member 纯空白 ⇒ trim 后为空 ⇒ 不计入')
eq(filterCardsPre(null, { actor: 'x' }).cards.length, 0, '★46 非数组 + 有 actor ⇒ 空数组（不崩）')

/* ── ⑨ opts 边界 + 幂等 ── */
eq(buildMemberListPre(cards, { limit: 2 }).members.length, 2, '★47 limit=2 ⇒ 只返回前 2 人')
eq(buildMemberListPre(cards, { limit: 2 }).total, 8, '★48 limit 不影响 total（只截展示）')
ok(buildMemberListPre(cards, { limit: 0 }).members.length === 3, '★49 limit=0 ⇒ 不限（全 3 人）')
eq(buildMemberListPre(cards, { limit: -5 }).members.length, 3, '★50 limit 负数 ⇒ 不限')
ok(buildMemberListPre(cards, 'bad').members.length === 3, '★51 opts 非对象 ⇒ 安全回落')
eq(JSON.stringify(buildMemberListPre(cards, {})), JSON.stringify(r), '★52 同输入同输出（确定性）')
eq(JSON.stringify(filterCardsPre(cards, { actor: '张伟' })), JSON.stringify(fz), '★53 筛选同输入同输出')

/* ── ⑩ ★「全部成员」下拉的 UI 挂点（48 卷 L69 / 46 卷 L77 逐字「全部成员 ▾」） ── */
const CL = readFileSync(damPath('lib/client.js'), 'utf8')
const hasAllMembers = CL.indexOf('全部成员') >= 0
ok(hasAllMembers, '★54 ★前端存在「全部成员」下拉文案（48 卷 L69 / 46 卷 L77 逐字）')
const hasFilterAnchor = CL.indexOf('data-dam-filter') >= 0 || CL.indexOf('data-dam-team-member-filter') >= 0
ok(hasFilterAnchor, '★55 ★存在成员筛选锚点（fe02 屏2 data-dam-team-member-filter / data-dam-filter）')
const hasSelect = /h\('select'/.test(CL) || CL.indexOf('全部成员') >= 0
ok(hasSelect, '★56 ★成员下拉有渲染出口（select 或文案挂点）')

console.log('PASS ' + p + ' / FAIL ' + f)
fails.forEach((x) => console.log('  FAIL: ' + x))
process.exit(f === 0 ? 0 : 1)