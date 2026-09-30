#!/usr/bin/env node
/**
 * [ritual-quiet] 改动 C 验收 · 仪式结束判据改「回合已静默」（报告 §4）。
 *
 * 缺陷：`hostRefreshRitual` 的 `done` 判据原文是
 *   `evs.length > baseCount && evs.some(seq>baseSeq && (type==='assistant/message' || type==='tool/call'))`
 * —— **不含任何静默/双采样项** ⇒ **旧回合自己的产出也满足判据**：把「旧回合还在写」误判成
 * 「仪式跑完了」，材料只刷了一半却记 `updated`。这是一类**静默成功**：失败可见，而「被判成功」不可见。
 *
 * 本机 diag 的 7 次 `ritual processed ... after Ns`：延迟 10/43/10/40/23/23/28s，
 * 事件增量 32 / 30 / 234 / 6340 / 2507 / 1081 / 3370 —— **相差 200 倍**，旧判据无法区分。
 *
 * 新判据 = ①两次采样间事件数**不再增长**（回合已静默）**且** ②基线之上出现过 `tool/call`。
 * ②防止「本来就空闲的会话」被判成功。
 *
 * ★负控（本套件的核心）：让旧会话在仪式期间**持续运行**（每轮 poll 都在增长），
 *   断言**不**判 `updated`。若它仍判 ⇒ 采样间隔 2500ms 不足，须调大 `_ritualQuietSamples`。
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const SRC = readFileSync(path.join(ROOT, 'lib', 'index.js'), 'utf8')

let pass = 0, fail = 0
const fails = []
const ok = (c, m) => { if (c) pass++; else { fail++; fails.push(m) } }

function extractFn(header) {
  const start = SRC.indexOf(header)
  if (start < 0) throw new Error('not found: ' + header)
  let depth = 0, end = -1
  for (let i = start + header.length - 1; i < SRC.length; i++) {
    if (SRC[i] === '{') depth++
    else if (SRC[i] === '}') { depth--; if (depth === 0) { end = i; break } }
  }
  if (end < 0) throw new Error('unbalanced: ' + header)
  return SRC.slice(start, end + 1)
}

/**
 * @param {object} o
 * @param {number[][]} o.eventCounts 每次 inspect 返回的事件总数序列（最后一次之后重复最后一个）。
 * @param {string[]}   o.eventTypes  基线之上出现的事件类型（每有增长就按序追加）。
 */
function makeRitual(o) {
  const logs = []
  let inspectCalls = 0
  let stampCalls = 0
  const base = Array.isArray(o.baseEvents) ? o.baseEvents : []
  const countsAt = typeof o.eventCountsAt === 'function'
    ? o.eventCountsAt
    : ((i) => o.eventCounts[Math.min(i, o.eventCounts.length - 1)])
  const types = o.eventTypes || ['tool/call']
  const eng = {
    config: { autoContinueRefreshRitual: true, autoContinueRefreshTimeoutSeconds: 15 },
    _ritualPollMs: o.pollMs || 5,
    _ritualQuietSamples: o.quietSamples,          // undefined ⇒ 用源码默认
    _ctxRef: { get: () => null },
    _sessionController: undefined,
    // ★指纹计数器必须独立于 inspect：降级路径（无 inspect）下 inspectCalls 永不前进，
    //   用它索引会让指纹恒为同一个值 ⇒ 假红（本轮第三版踩到）。
    handoffMaterialStamp: async () => {
      if (!o.stampSeq) return 'stamp-const'
      return o.stampSeq[Math.min(stampCalls++, o.stampSeq.length - 1)]
    },
    refreshRitualPrompt: () => 'ritual-prompt',
  }
  // ★必须把**基线那次 inspect**与**轮询的 inspect**分开计数：
  //   前者返回 base、后者按 counts 走。混在一起会让「基线」直接吃掉第一个样本，
  //   夹具就永远等不到「增长→静默」的形态（本轮第一版正是这么假红的）。
  const evsFor = (n) => {
    const want = Math.max(base.length, countsAt(n))
    const extra = want - base.length
    const out = base.slice()
    for (let i = 0; i < extra; i++) out.push({ seq: 1000 + i, type: types[Math.min(i, types.length - 1)] })
    return out
  }
  eng._sessionController = {
    prompt: async () => ({ accepted: true }),
    inspect: async () => {
      const n = inspectCalls++
      return { events: n === 0 ? base : evsFor(n - 1) }
    },
  }
  const obj = new Function('diag', 'randomUUID', 'AbortSignal',
    'return {' + extractFn('async hostRefreshRitual(oldSid) {') + '};')(
    (m) => logs.push(String(m)),
    () => 'req-' + inspectCalls,
    { timeout: () => undefined })
  const key = Object.keys(obj)[0]
  eng.ritual = obj[key].bind(eng)
  eng.logs = logs
  return eng
}

console.log('[ritual-quiet] R0 结构守卫')
ok(!/\(ev\.type === 'assistant\/message' \|\| ev\.type === 'tool\/call'\)/.test(SRC),
  'R0a 旧判据（出现 assistant/message 或 tool/call 即判完成）已移除')
ok(/quietStreak >= quietSamplesNeeded/.test(SRC), 'R0b 新判据含「连续静默采样」项')
ok(/const sawToolCall = evs\.some\(\(ev\) => Number\(ev && ev\.seq\) > baseSeq && ev\.type === 'tool\/call'\)/.test(SRC),
  'R0c 新判据含「基线之上出现过 tool/call」项（防空闲会话被判成功）')
ok(/if \(quiet && sawToolCall\)/.test(SRC) && /if \(quiet && !sawToolCall\)/.test(SRC),
  'R0d 两项是**与**关系，且「静默但无 tool/call」有独立日志（不静默空转）')
ok(/_ritualQuietSamples/.test(SRC), 'R0e N 可配置（_ritualQuietSamples），默认值写在源码里')

console.log('[ritual-quiet] R1 报告 §4 验证表')
// ① 正控：先增长、后静默，且期间出现过 tool/call ⇒ 判 updated
const e1 = makeRitual({ baseEvents: [{ seq: 1, type: 'user/message' }], eventCounts: [3, 3, 3, 3, 3], eventTypes: ['tool/call'] })
const r1 = await e1.ritual('s-old')
ok(r1.ok === true && r1.waited === 'updated', '① 正控：增长后静默 + tool/call ⇒ waited=updated（实测 ' + JSON.stringify(r1) + '）')

// ② ★负控：旧会话在仪式期间**持续运行**（每次采样都比上次多）⇒ 必须**不**判 updated
//    ★用**无界增长**而不是固定列表：列表走完会停在末值 ⇒ 变成「跑完就静默」，那是真结束，
//      判 updated 并不错，夹具会假绿。旧回合的特征正是**直到超时都没停过**。
const e2 = makeRitual({
  baseEvents: [{ seq: 1, type: 'user/message' }],
  eventCountsAt: (i) => 3 + i * 50,
  eventTypes: ['assistant/message', 'tool/call'],
})
const r2 = await e2.ritual('s-old')
ok(r2.ok === false && r2.waited !== 'updated',
  '② ★负控：旧回合持续产出时必须**不**判 updated（旧判据会在第一次增长时就判成功）；实测 ' + JSON.stringify(r2))
ok(r2.reason === 'timeout' || r2.waited === undefined, '②b 负控落在 timeout（等满 15s 而非提前判成功）')

// ③ 三态可区分：stamp-fallback 不被抹平为 updated
const e3 = makeRitual({ eventCounts: [0], stampSeq: ['a', 'b'] })
e3._sessionController.inspect = undefined            // 无 inspect ⇒ 降级路径
const r3 = await e3.ritual('s-old')
ok(r3.ok === true && r3.waited === 'stamp-fallback', '③ 旧 host 无 inspect ⇒ waited=stamp-fallback（不被抹平为 updated）')

// ④ timeout 态可区分：一直没有 tool/call（只是安静）⇒ 不判 updated
const e4 = makeRitual({ baseEvents: [{ seq: 1, type: 'user/message' }], eventCounts: [2, 2, 2, 2], eventTypes: ['assistant/message'] })
const r4 = await e4.ritual('s-old')
ok(r4.ok === false && r4.reason === 'timeout',
  '④ ★只有 assistant/message、从未出现 tool/call ⇒ 不判 updated（防「安静的空会话」被判成功）；实测 ' + JSON.stringify(r4))

// ⑤ 负控：旧判据的现场形态 —— 首个增长就带 assistant/message，若新判据未生效会立即 updated
const e5 = makeRitual({
  baseEvents: [{ seq: 1, type: 'user/message' }],
  eventCounts: [2, 40, 40, 40, 40],                    // 第 1 次就涨到 40，之后才静默
  eventTypes: ['assistant/message'],
})
const r5 = await e5.ritual('s-old')
ok(r5.ok === false, '⑤ ★旧判据现场形态：首轮即出现 assistant/message 且仍在增长 ⇒ 不判成功（实测 ' + JSON.stringify(r5) + '）')

// ⑥ 静默窗不足时**不**提前判成功：把 N 调大，增长-静默-增长 的场景必须等满
const e6 = makeRitual({
  baseEvents: [{ seq: 1, type: 'user/message' }],
  eventCounts: [5, 5, 5, 30, 30, 30, 30, 30],
  eventTypes: ['tool/call'],
  quietSamples: 3,
})
const r6 = await e6.ritual('s-old')
ok(r6.ok === true && r6.waited === 'updated', '⑥ N=3 时，短暂静默后再度增长不会被误判（最终仍能正常判成功）；实测 ' + JSON.stringify(r6))

console.log(fails.map((f) => '  FAIL: ' + f).join('\n'))
console.log(`\n[ritual-quiet] PASS ${pass} / FAIL ${fail}`)
process.exit(fail ? 1 : 0)
