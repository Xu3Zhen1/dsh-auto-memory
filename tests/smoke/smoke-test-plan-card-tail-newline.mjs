// 单卡编辑「尾部换行」判据(2026-11-03)
//
// 背景(真机报障): 另一会话更新白板 `## 当前状态` 卡,
// `memory_note(kind=plan, cardId=...)` **连续 4 次**被
//   `plan-card-format: retain the final line ending before the next card`
// 拒绝, 只能把正确状态写进交接账本、放弃更新白板卡。
//
// 根因: 非最后一张卡时 splice 是 `current.slice(0,start)+incoming+current.slice(end)`,
//   若 incoming 不带尾部换行, 下一张卡的 `##` 会粘到最后一行 => 必须补分隔换行。
//   旧实现**直接拒绝**, 且文案没说"要补 \n"; 而修复方式唯一且无损。
// => 改为自动补回, 并用 `tailRepaired` 外显(不静默)。
//
// 判据(成对, 拒绝型/放行型都要有):
//   T1 非末卡 + 无尾部换行 => 通过, 且 tailRepaired === '\n\n'(补回原文尾部序列)
//   T2 同上**结构未被破坏**: 仍能切出同样张数、下一卡标题完整、无粘行
//   T3 非末卡 + 已带换行  => 通过, tailRepaired 为 undefined(不该无谓改写)
//   T4 末卡 + 无尾部换行  => 通过, tailRepaired undefined(末卡不需要分隔)
//   T5 原文尾部是单个 \n 时 => 补回单个 \n(按原文, 不硬编码 '\n\n')
//   M1 变异: 去掉自动补回(恢复成拒绝) => T1/T2 必红
import assert from 'node:assert/strict'
import { planCardsPre, preparePlanPre } from '../../lib/plan-store.js'

const NL = '\n'
const A = '<!-- memory:mem_' + 'a'.repeat(32) + ' -->'
const B = '<!-- memory:mem_' + 'b'.repeat(32) + ' -->'
const C = '<!-- memory:mem_' + 'c'.repeat(32) + ' -->'

function plan(tailB) {
  return ['## 甲卡', A, '- 甲内容', '', '## 当前状态', B, '- 旧状态 baf41dd' + tailB, '## 丙卡', C, '- 丙内容', ''].join(NL)
}

let pass = 0, fail = 0
const ok = (c, m, got) => { if (c) { pass++; console.log('  ok   - ' + m) } else { fail++; console.log('  FAIL - ' + m + (got !== undefined ? '  =>  ' + JSON.stringify(got).slice(0, 90) : '')) } }

// ★期望值必须从**构造的输入文本**算出，不能硬编码：`plan(tailB)` 用 join 拼行，
//   每行之间还会再插一个 NL，所以「原文尾部换行数」= tailB 的换行数 + 1（列表末项后无额外 NL）。
//   第一版硬编码 '\n\n' ⇒ 实际为 '\n\n\n' 假红（是我构造错，不是实现错）。
for (const [label, tailB] of [['T1/T2 双换行', NL + NL], ['T5 单换行', NL]]) {
  const src = plan(tailB)
  const cards = planCardsPre(src)
  const target = cards.find((c) => /当前状态/.test(c.title))
  const wantTail = (target.text.match(/\n+$/) || [NL])[0]
  const stripped = target.text.replace(/\n+$/, '')
  const r = await preparePlanPre('/nonexistent', src, stripped, { cardId: target.id, expectedCardRevision: target.revision })
  console.log('[' + label + '] 非末卡 + 无尾部换行')
  ok(r.ok === true, label + '-1 通过(不再拒绝)', r.error)
  ok(r.tailRepaired === wantTail, label + '-2 补回原文尾部序列(' + JSON.stringify(wantTail) + ')', r.tailRepaired)
  const again = planCardsPre(r.text)
  ok(again.length === cards.length, label + '-3 卡片张数不变(结构未破坏)', again.length)
  ok(/^## 丙卡$/m.test(r.text), label + '-4 下一卡标题仍独立成行')
  ok(!/baf41dd## /.test(r.text), label + '-5 无粘行', /baf41dd.{0,8}/.exec(r.text)?.[0])
}

{
  const src = plan(NL + NL)
  const cards = planCardsPre(src)
  const t = cards.find((c) => /当前状态/.test(c.title))
  console.log('[T3] 非末卡 + 已带换行')
  const r = await preparePlanPre('/nonexistent', src, t.text, { cardId: t.id, expectedCardRevision: t.revision })
  ok(r.ok === true, 'T3-1 通过', r.error)
  ok(r.tailRepaired === undefined, 'T3-2 未做无谓改写', r.tailRepaired)
}

{
  const src = plan(NL + NL)
  const cards = planCardsPre(src)
  const last = cards[cards.length - 1]
  const stripped = last.text.replace(/\n+$/, '')
  console.log('[T4] 末卡 + 无尾部换行')
  const r = await preparePlanPre('/nonexistent', src, stripped, { cardId: last.id, expectedCardRevision: last.revision })
  ok(r.ok === true, 'T4-1 通过', r.error)
  ok(r.tailRepaired === undefined, 'T4-2 末卡不补(不需要分隔)', r.tailRepaired)
}

console.log('\n[plan-card-tail-newline] pass=' + pass + ' fail=' + fail)
process.exit(fail === 0 ? 0 : 1)