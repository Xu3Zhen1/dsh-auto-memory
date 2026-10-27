// 负控测试：plan-card-conflict 的冲突文件必须给出「当前卡片 revision」，
// 且用它重试必须成功；用「整篇文档 revision」重试必须失败。
//
// 修复前（red）：conflict 里没有 currentCardRevision，报错文案也不区分量纲。
// 修复后（green）：三个断言全过。
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { planCardsPre, planRevisionPre, preparePlanPre } from '../../lib/plan-store.js'

const root = await mkdtemp(path.join(os.tmpdir(), 'dam-plan-dimension-'))
try {
  const file = path.join(root, 'handoff', 'PLAN.md')
  await mkdir(path.dirname(file), { recursive: true })
  const PLAN = [
    'type:goal',
    '## 目标',
    '<!-- memory:mem_17a7397dbfbe99dfe1c83cdb945d3dd1 -->',
    '- 目标正文 A',
    '',
    'type:progress',
    '## 进度与下一步',
    '<!-- memory:mem_3a98cb9d6ca01e35c9184053dc5a480b -->',
    '- 进度正文 B',
    '',
  ].join('\n')
  await writeFile(file, PLAN, 'utf8')

  const card = planCardsPre(PLAN).find(c => c.id === 'mem_3a98cb9d6ca01e35c9184053dc5a480b')
  const docRev = planRevisionPre(PLAN)
  assert.notEqual(docRev, card.revision, '前提：文档 revision 与卡片 revision 必须不同量纲')

  // 用「文档 revision」当 expectedCardRevision → 必须冲突（负控，锁住问题本身）
  const bad = await preparePlanPre(file, PLAN, card.text.replace('进度正文 B', 'B2'), {
    cardId: card.id, expectedCardRevision: docRev,
  })
  assert.equal(bad.ok, false, '用文档 revision 当 expectedCardRevision 必须被拒')
  assert.ok(bad.conflictPath, '冲突必须落盘')

  const payload = JSON.parse(await readFile(bad.conflictPath, 'utf8'))

  // ① 冲突文件必须带「当前卡片 revision」，且等于该卡真实 revision
  assert.ok('currentCardRevision' in payload,
    '冲突文件缺 currentCardRevision：报错文案叫调用方「用当前 revision 重试」，但文件里没有这个值')
  assert.equal(payload.currentCardRevision, card.revision,
    'currentCardRevision 必须是该卡正文的 sha256')

  // ② 用 currentCardRevision 重试必须成功（这才是「可执行的重试值」）
  const retry = await preparePlanPre(file, PLAN, card.text.replace('进度正文 B', 'B3'), {
    cardId: card.id, expectedCardRevision: payload.currentCardRevision,
  })
  assert.equal(retry.ok, true, '按冲突文件给出的 currentCardRevision 重试必须成功：' + retry.error)

  // ③ 报错文案必须区分量纲（旧文案只说 "read the current card and retry with its revision"）
  //    断言必须落在「区分量纲」本身，否则 "plan-card-conflict" 里的 card 就能让 /card.*sha256/ 恒真。
  assert.match(payload.reason, /sha256/,
    '文案必须点明 expectedCardRevision 是 sha256')
  assert.match(payload.reason, /whole PLAN\.md|整篇/,
    '文案必须点明 expectedCardRevision 不是整篇 PLAN.md 的 revision（区分量纲）')
  assert.doesNotMatch(payload.reason, /^plan-card-conflict: read the current card and retry with its revision$/,
    '旧文案（不区分量纲、且指向不可执行的 currentRevision）不得保留')

  // ④ 负控：currentRevision 仍然是整篇文档 revision（不要把这个字段改坏）
  assert.equal(payload.currentRevision, docRev, 'currentRevision 必须保持为整篇文档 revision')

  // ⑤ 字段顺序：可执行元数据必须排在「大文本块」之前。
  //    真实生产冲突副本曾把 currentRevision 排到全文 99.5% 处（50,824 / 51,084 字符），
  //    调用方分页读到尾部才看得见——与「文案指向不可执行的值」同族：信息存在但读不到。
  const raw = await readFile(bad.conflictPath, 'utf8')
  const atCurrent = raw.indexOf('"current":')
  const atProposed = raw.indexOf('"proposed":')
  const atCurrentRev = raw.indexOf('"currentRevision":')
  const atCardRev = raw.indexOf('"currentCardRevision":')
  assert.ok(atCurrentRev >= 0 && atCardRev >= 0 && atCurrent >= 0 && atProposed >= 0, '四个字段都必须存在')
  assert.ok(atCurrentRev < atCurrent, `currentRevision 必须排在 current 之前（实际 ${atCurrentRev} vs ${atCurrent}）`)
  assert.ok(atCardRev < atCurrent, `currentCardRevision 必须排在 current 之前（实际 ${atCardRev} vs ${atCurrent}）`)
  assert.ok(atCurrentRev < atProposed && atCardRev < atProposed, '两个 revision 都必须排在 proposed 之前')
  // 前 1KB 内必须能拿到可用值：这是「分页读第一页就能重试」的可检验判据
  assert.ok(atCardRev < 1024, `currentCardRevision 必须落在文件前 1KB（实际偏移 ${atCardRev}）`)

  // ⑥ 既有消费者不受影响：persisted.current / persisted.proposed 语义不变
  assert.equal(payload.current, PLAN, 'persisted.current 必须仍是整篇文档原文')
  assert.equal(payload.proposed, card.text.replace('进度正文 B', 'B2'),
    'persisted.proposed 必须仍是那次冲突提交的单卡全文（逐字节）')

  console.log('PASS plan-conflict-dimension: 冲突文件给出可执行的当前卡片 revision；文档级 revision 重试必败；文案区分量纲')
} finally {
  await rm(root, { recursive: true, force: true })
}
