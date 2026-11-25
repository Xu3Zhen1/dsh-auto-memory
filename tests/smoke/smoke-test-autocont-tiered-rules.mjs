/**
 * ★2026-11-26 用户裁定「条件自由组合」：规则分两层
 *   base   = 前置闸（轮次 / 步数 / 累计用量）
 *   trigger= 触发闸（上下文用量 ratio / **到位后的**压缩次数）
 *   语义： base 全满足 AND trigger 任一满足
 *
 * 需求原文（用户）：「当前边的轮次步数使用量到位后，根据上下文使用量或者到位后的压缩次数判断」
 *
 * 为什么必须分层（gochat 实测，2026-11-26）：
 *   该 provider（dshapi）的官方压缩点 ≈ 0.55（16 次 compaction/start 落在 541k~551k / 1e6），
 *   而 ratio 的分母恒为声明窗口 ⇒ 单层 all 里的 ratio 永远不可达；单层 any 又会在轮次极少时
 *   被 turns 条件直接触发。分层才能表达「先到位、再到量或到压缩」。
 *
 * 判据分层（缺任一层都可能假绿）：
 *   A 行为：base 未齐 ⇒ 哪怕 trigger 满足也不 met；base 齐 + 任一 trigger ⇒ met。
 *   B 兼容：没有任何规则带 tier ⇒ 与旧语义逐字节一致（all/any 原样）。
 *   C 口径：tier:'trigger' 的 compactions 必须读「base 之后」的计数，不是历史总数。
 *   D 接地：把 gochat 真实一帧（ratio 0.55、历史压缩 16 次、base 齐）喂进去，
 *           旧单层 all 判不触发、新分层判触发 —— 证明这次改动真的解决报障。
 *   E 负控：把 C 改回读总数 ⇒ C/D 判据必红；变异体 node --check 通过。
 */
import assert from 'node:assert/strict'
import { readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..', '..')
const SRC = readFileSync(path.join(ROOT, 'lib', 'index.js'), 'utf8').replace(/\r\n/g, '\n')
let pass = 0, fail = 0
const t = (n, c, x) => { if (c) { pass++; console.log('  ok - ' + n) } else { fail++; console.log('  FAIL - ' + n + (x === undefined ? '' : '  <<< ' + String(x).slice(0, 260))) } }

function extract(src, h) {
  const s = src.indexOf(h)
  assert(s >= 0, 'anchor not found: ' + h)
  let d = 0
  for (let i = s + h.length - 1; i < src.length; i++) {
    if (src[i] === '{') d++
    if (src[i] === '}' && --d === 0) return src.slice(s, i + 1)
  }
  throw new Error('unbalanced ' + h)
}
const HEAD = 'export function autoContinueRulesMetPre(rules, combine, metrics, tierMode) {'
const loadFn = (src) => {
  const body = extract(src, HEAD)
  return new Function('return (function autoContinueRulesMetPre(rules, combine, metrics, tierMode) ' + body.slice(body.indexOf('{')) + ')')()
}
const rulesMet = loadFn(SRC)

const BASE = [
  { k: 'turns', op: '>=', v: 20, tier: 'base' },
  { k: 'steps', op: '>=', v: 1600, tier: 'base' },
  { k: 'tokens', op: '>=', v: 800000000, tier: 'base' },
]
const TRIG = [
  { k: 'ratio', op: '>=', v: 0.7, tier: 'trigger' },
  { k: 'compactions', op: '>=', v: 1, tier: 'trigger' },
]
const M_READY = { turns: 215, steps: 3147, tokens: 1097772402, ratio: 0.55, compactions: 16, compactionsAfterBase: 7, baseMet: true }
const M_NOTREADY = { turns: 5, steps: 100, tokens: 1000000, ratio: 0.9, compactions: 16, compactionsAfterBase: 7, baseMet: false }

console.log('[A] 行为：base 全满足 AND trigger 任一满足')
{
  const r = rulesMet(BASE.concat(TRIG), 'any', M_READY)
  t('★base 齐 + 压缩次数达标 ⇒ met（ratio 只有 0.55 也不影响）', r.met === true && r.tiered === true, JSON.stringify(r))
  t('baseMet/triggerMet 分别透出（便于诊断归因）', r.baseMet === true && r.triggerMet === true, JSON.stringify({ b: r.baseMet, g: r.triggerMet }))

  const r2 = rulesMet(BASE.concat(TRIG), 'any', M_NOTREADY)
  t('★★base 未齐 ⇒ 即便 ratio 0.9 也不 met（前置闸真的挡住）', r2.met === false && r2.baseMet === false, JSON.stringify({ met: r2.met, b: r2.baseMet, g: r2.triggerMet }))

  const r3 = rulesMet(BASE.concat([{ k: 'ratio', op: '>=', v: 0.7, tier: 'trigger' }]), 'any',
    { ...M_READY, compactionsAfterBase: 0 })
  t('★base 齐但唯一 trigger（ratio 0.7）不达 ⇒ 不 met', r3.met === false, JSON.stringify({ met: r3.met, g: r3.triggerMet }))

  const r4 = rulesMet(BASE.concat(TRIG), 'any', { ...M_READY, ratio: 0.72, compactionsAfterBase: 0 })
  t('★base 齐 + ratio 达标（另一条 trigger）⇒ met', r4.met === true, JSON.stringify({ met: r4.met }))

  const r5 = rulesMet(BASE, 'all', M_READY)
  t('只有 base 没有 trigger ⇒ 等价于 base 全满足即 met（不空转）', r5.met === true && r5.tiered === true, JSON.stringify(r5))

  // ★★base 层恒为「全部满足」，不受 combine 影响（combine 只决定 trigger 怎么组合）
  const partialBase = [{ k: 'turns', op: '>=', v: 20, tier: 'base' }, { k: 'steps', op: '>=', v: 999999, tier: 'base' }]
  const r6 = rulesMet(partialBase.concat([{ k: 'ratio', op: '>=', v: 0.5, tier: 'trigger' }]), 'any', M_READY)
  t('★★base 缺一条（steps 不达）⇒ combine=any 也不 met（前置闸恒 AND）', r6.met === false && r6.baseMet === false, JSON.stringify({ met: r6.met, b: r6.baseMet, baseTotal: r6.baseTotal }))
  const r7 = rulesMet(partialBase.concat([{ k: 'ratio', op: '>=', v: 0.5, tier: 'trigger' }]), 'any', { ...M_READY, steps: 999999 })
  t('base 补齐后同一组规则 ⇒ met（证明上一条不是恒假）', r7.met === true, JSON.stringify({ met: r7.met }))

  // ★trigger 层由 combine 决定：同一组 trigger 在 all / any 下结论不同
  const twoTrig = BASE.concat(TRIG)
  const anyM = rulesMet(twoTrig, 'any', { ...M_READY, ratio: 0.1, compactionsAfterBase: 3 })
  const allM = rulesMet(twoTrig, 'all', { ...M_READY, ratio: 0.1, compactionsAfterBase: 3 })
  t('★combine=any：只有压缩到位也 met', anyM.met === true, JSON.stringify({ met: anyM.met }))
  t('★combine=all：同一帧因 ratio 未达而不 met（combine 真的只作用于 trigger）', allM.met === false && allM.baseMet === true, JSON.stringify({ met: allM.met, b: allM.baseMet }))
}

console.log('')
console.log('[B2] tierMode=auto：按键推断分层（界面勾选即可，无需手改 JSON）')
{
  // 用户原话对应的配置：轮次/步数/用量到位后，看 上下文用量 或 压缩次数
  const uiRules = [
    { k: 'turns', op: '>=', v: 20 },
    { k: 'steps', op: '>=', v: 1600 },
    { k: 'tokens', op: '>=', v: 800000000 },
    { k: 'ratio', op: '>=', v: 0.7 },
    { k: 'compactions', op: '>=', v: 1 },
  ]
  const r = rulesMet(uiRules, 'any', M_READY, 'auto')
  t('★auto：turns/steps/tokens 归 base、ratio/compactions 归 trigger', r.tiered === true && r.baseTotal === 3 && r.triggerTotal === 2, JSON.stringify({ b: r.baseTotal, g: r.triggerTotal }))
  t('★★auto：gochat 该帧 met=true（ratio 仅 0.55，靠「到位后压缩 1 次」触发）', r.met === true, JSON.stringify({ met: r.met }))
  const nd = rulesMet(uiRules, 'any', M_NOTREADY, 'auto')
  t('★auto：base 未齐（5 轮/100 步/1e6 tok）⇒ 即便 ratio 0.9 也不 met', nd.met === false, JSON.stringify({ met: nd.met, b: nd.baseMet }))
  const noComp = rulesMet(uiRules, 'any', { ...M_READY, ratio: 0.3, compactionsAfterBase: 0 }, 'auto')
  t('★auto：base 齐但 ratio 低且到位后 0 次压缩 ⇒ 不 met（还没到该换的时候）', noComp.met === false, JSON.stringify({ met: noComp.met }))
  // 未开 auto ⇒ 不推断，行为与旧路径一致
  const off = rulesMet(uiRules, 'any', M_READY)
  t('★未开 auto ⇒ 不推断分层（tiered=false，旧语义）', off.tiered === false && off.met === true, JSON.stringify({ tiered: off.tiered, met: off.met }))
  // 显式 tier 优先于 auto 推断
  const explicit = rulesMet([{ k: 'ratio', op: '>=', v: 0.7, tier: 'base' }], 'all', { ...M_READY, ratio: 0.3 }, 'auto')
  t('★显式 tier 优先于 auto 推断（ratio 被显式标 base ⇒ 归 base）', explicit.baseTotal === 1 && explicit.triggerTotal === 0, JSON.stringify({ b: explicit.baseTotal, g: explicit.triggerTotal }))
}

console.log('')
console.log('[B] 兼容：无 tier ⇒ 与旧语义逐字节一致')
{
  const legacyAll = rulesMet([{ k: 'ratio', op: '>=', v: 0.7 }, { k: 'turns', op: '>=', v: 20 }], 'all', M_READY)
  t('旧 all：ratio✗ ⇒ 不 met', legacyAll.met === false && legacyAll.tiered === false, JSON.stringify(legacyAll))
  const legacyAny = rulesMet([{ k: 'ratio', op: '>=', v: 0.7 }, { k: 'turns', op: '>=', v: 20 }], 'any', M_READY)
  t('旧 any：turns✓ ⇒ met', legacyAny.met === true && legacyAny.tiered === false, JSON.stringify(legacyAny))
  const empty = rulesMet([], 'all', M_READY)
  t('空规则 ⇒ configured=false（回落比例阈值，未改变）', empty.configured === false, JSON.stringify(empty))
  const bad = rulesMet([{ k: 'nope', op: '>=', v: 1 }], 'all', M_READY)
  t('非法键被过滤后为空 ⇒ configured=false', bad.configured === false, JSON.stringify(bad))
}

console.log('')
console.log('[C] 口径：tier:trigger 的 compactions 读「base 之后」而不是历史总数')
{
  // 历史 16 次、base 之后 0 次 ⇒ 不应因历史压缩就触发
  const r = rulesMet(BASE.concat([{ k: 'compactions', op: '>=', v: 1, tier: 'trigger' }]), 'any',
    { ...M_READY, compactions: 16, compactionsAfterBase: 0 })
  t('★★历史压缩 16 次但 base 后 0 次 ⇒ 不触发（旧口径会误触发）', r.met === false, JSON.stringify({ met: r.met, detail: r.detail }))
  // base 之后 1 次 ⇒ 触发
  const r2 = rulesMet(BASE.concat([{ k: 'compactions', op: '>=', v: 1, tier: 'trigger' }]), 'any',
    { ...M_READY, compactions: 16, compactionsAfterBase: 1 })
  t('★base 之后 1 次 ⇒ 触发', r2.met === true, JSON.stringify({ met: r2.met }))
  // base 层若显式写 compactions，仍读历史总数（口径不串味）
  const r3 = rulesMet([{ k: 'compactions', op: '>=', v: 16, tier: 'base' }], 'all',
    { ...M_READY, compactions: 16, compactionsAfterBase: 0 })
  t('base 层的 compactions 仍读历史总数（两种口径不互相污染）', r3.met === true, JSON.stringify({ met: r3.met }))
}

console.log('')
console.log('[D] 接地：gochat 真机那一帧（旧口径判不触发，新口径判触发）')
{
  // 真机：215 轮 / 3147 步 / 1.098e9 累计 token / ratio 0.55 / 历史压缩 16 次
  // 新方案配置：base(轮次+步数+用量) + trigger(ratio>=0.7 或 到位后压缩>=1)
  const now = rulesMet(BASE.concat([{ k: 'ratio', op: '>=', v: 0.7, tier: 'trigger' }, { k: 'compactions', op: '>=', v: 1, tier: 'trigger' }]), 'any', M_READY)
  t('★★新分层：gochat 该帧 met=true（该会话本就该接续）', now.met === true, JSON.stringify({ met: now.met }))
  const old = rulesMet([{ k: 'ratio', op: '>=', v: 0.7 }, { k: 'turns', op: '>=', v: 20 }, { k: 'steps', op: '>=', v: 1600 }, { k: 'tokens', op: '>=', v: 800000000 }], 'all', M_READY)
  t('★旧单层 all：同一帧 met=false（正是用户报障「条件都满足却不触发」）', old.met === false, JSON.stringify({ met: old.met }))
}

console.log('')
console.log('[E] 负控：把 trigger 的 compactions 改回读总数 ⇒ C/D 必红')
{
  const OLD = "    const a = (tiered && r.tier === 'trigger' && r.k === 'compactions') ? actual.compactionsAfterBase : actual[r.k]"
  t('变异锚点存在', SRC.includes(OLD))
  const mut = SRC.replace(OLD, "    const a = actual[r.k]")
  t('变异真应用', mut !== SRC)
  const f = loadFn(mut)
  const r = f(BASE.concat([{ k: 'compactions', op: '>=', v: 1, tier: 'trigger' }]), 'any', { ...M_READY, compactions: 16, compactionsAfterBase: 0 })
  t('★变异体：历史 16 次即触发（C 段判据此时必然不成立 ⇒ 有鉴别力）', r.met === true, JSON.stringify({ met: r.met }))

  const tmpDir = path.join(ROOT, '.dsh-smoke-tmp')
  mkdirSync(tmpDir, { recursive: true })
  const f2 = path.join(tmpDir, 'tiered-mutant.mjs')
  writeFileSync(f2, mut)
  const chk = spawnSync(process.execPath, ['--check', f2], { encoding: 'utf8' })
  t('★变异体语法可编译（防「因崩溃而红」）', chk.status === 0, (chk.stderr || '').slice(0, 200))
  try { rmSync(f2, { force: true }) } catch (_) {}
}

console.log('')
console.log('[F] 接线：arm 侧必须真的记录 base 基线（否则 compactionsAfterBase 恒 0，trigger 永不触发）')
{
  t('存在 _baseMetAt 写入', SRC.includes('rtR._baseMetAt = Date.now()'))
  t('存在 _baseCompactAt 写入（记录当时的压缩计数）', SRC.includes('rtR._baseCompactAt = Number(rtR.compactCount) || 0'))
  t('★只在未记录时写一次（不因 base 波动而重置）', SRC.includes('!(rtR._baseMetAt > 0)'))
  t('★调用点默认开启分层（只有显式 off 才退回旧语义）', SRC.includes("autoContinueRuleTierMode === 'off' ? '' : 'auto'"))
  const mFn = extract(SRC, 'export function autoContinueMetricsPre(wl, rt) {')
  t('metrics 透出 compactionsAfterBase', mFn.includes('compactionsAfterBase'))
  t('metrics 透出 baseMet', mFn.includes('baseMet'))
  t('无基线时 compactionsAfterBase=0（不会把历史压缩算进去）', mFn.includes('baseCompactAt === null ? 0'))
}

console.log('')
console.log('[autocont-tiered-rules] PASS ' + pass + ' / FAIL ' + fail)
process.exit(fail ? 1 : 0)
