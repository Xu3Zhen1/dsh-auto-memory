/**
 * ★2026-11-11 量纲错配修复：接续规则里的 steps 必须用「累计步数」，不是「本回合步数」。
 *
 * 缺陷现场（用户报障 + diag 铁证）：
 *   DSH 状态栏：89 轮 · 1657 步 · 880M tok · 水位 77%
 *   diag 实测：turns=89 ✓  steps=3 ✗  tokens=766449 ✗
 * rt.lastStep 是「本回合内第几步」（跨回合重置，实测 1→9 循环）⇒ steps>=1600 永不满足。
 * 修法：runtime 新增 totalSteps（新 step 值才累加），规则求值优先用它，旧 runtime 回落 lastStep。
 *
 * 四层判据（缺任一层都可能假绿）：
 *   A 行为层：真跑 autoContinueRulesMetPre，steps=1657 配 >=1600 必须 met。
 *   B 接线层：rulesMet 里 steps 必须读 totalSteps（防改回 lastStep 而 A 仍绿）。
 *   C 去重层：累加必须「新值才 +1」（防同一 step 重复触发刷虚高）。
 *   D 负控：把 B 变异回 lastStep ⇒ B 必红（自证鉴别力）。
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', '..')
const SRC = readFileSync(path.join(ROOT, 'lib', 'index.js'), 'utf8').replace(/\r\n/g, '\n')

let pass = 0, fail = 0
const t = (n, c, x) => { if (c) { pass++; console.log('  ok - ' + n) } else { fail++; console.log('  FAIL - ' + n + (x === undefined ? '' : '  <<< ' + String(x).slice(0, 220))) } }

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

// ---- A：真跑被测实现（源码抽取，不依赖宿主） ----
const HEAD = 'export function autoContinueRulesMetPre(rules, combine, metrics) {'
const fnSrc = extract(SRC, HEAD)
const fn = new Function('return (function autoContinueRulesMetPre(rules, combine, metrics) ' + fnSrc.slice(fnSrc.indexOf('{')) + ')')()
const rulesMet = fn

console.log('[A] 行为：累计步数 1657 应满足 steps>=1600（旧实现给 lastStep=3 ⇒ 不满足）')
{
  const met = rulesMet([{ k: 'steps', op: '>=', v: 1600 }], 'all', { steps: 1657 })
  t('1657 >= 1600 ⇒ met（累计口径）', met && met.met === true, met)
  const notMet = rulesMet([{ k: 'steps', op: '>=', v: 1600 }], 'all', { steps: 3 })
  t('3 >= 1600 ⇒ 不 met（不是恒真）', notMet && notMet.met === false, notMet)
}

console.log('')
console.log('[B] 接线：rulesMet 构造 metrics 时 steps 必须用 totalSteps')
{
  const at = SRC.indexOf('rulesMet = autoContinueRulesMetPre(')
  t('找到 rulesMet 调用点', at > 0)
  const block = SRC.slice(at, at + 700)
  t('★steps 读取 totalSteps', block.includes('rtR.totalSteps'), block.slice(0, 200))
  t('★旧写法 steps: rtR && rtR.lastStep, 已不存在', !block.includes('steps: rtR && rtR.lastStep,'), block.slice(0, 200))
  t('保留 lastStep 回落（兼容旧 runtime）', block.includes('lastStep'))
}

console.log('')
console.log('[C] 去重：累加必须「新 step 值才 +1」')
{
  t('存在 totalSteps 累加', SRC.includes('rtS.totalSteps'))
  t('★累加前有 new-value 判定', SRC.includes('if (sS !== rtS.lastStep)'), SRC.slice(Math.max(0, SRC.indexOf('rtS.totalSteps') - 260), SRC.indexOf('rtS.totalSteps') + 60))
  t('runtime 字段默认 totalSteps: 0', SRC.includes('totalSteps: 0,'))
}

console.log('')
console.log('[D] 负控自证：把 steps 改回 lastStep ⇒ B 必红')
{
  const OLD = 'steps: rtR && (Number(rtR.totalSteps) > 0 ? Number(rtR.totalSteps) : rtR.lastStep),'
  t('变异锚点存在', SRC.includes(OLD))
  const mutated = SRC.replace(OLD, 'steps: rtR && rtR.lastStep,')
  t('变异真应用（源码确实变了）', mutated !== SRC)
  const mAt = mutated.indexOf('rulesMet = autoContinueRulesMetPre(')
  const mBlock = mutated.slice(mAt, mAt + 700)
  t('★变异后 B 的判据必然不成立（证明有鉴别力）', !mBlock.includes('rtR.totalSteps') && mBlock.includes('steps: rtR && rtR.lastStep,'), mBlock.slice(0, 200))
}

console.log('')
console.log('[autocont-steps-dimension] PASS ' + pass + ' / FAIL ' + fail)
process.exit(fail ? 1 : 0)
