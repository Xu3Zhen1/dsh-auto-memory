/**
 * ★2026-11-17 接续计数快照「同源」修复：armed.metrics 与规则判据必须用同一取法。
 *
 * 缺陷现场（真机接续 #19 那一刻，2026-11-17 12:49）：
 *   判据（rulesMet）用的是累计口径：steps=2129 / tokens=11.2e8 ⇒ 四条件全满足 ⇒ 接续发生
 *   同一次 arm 写进 armed.metrics 的却是：steps=3 / tokens=717397（窗口值）
 *   ⇒ 面板/端点快照显示「规则远未满足」，而接续真的发生了。**判定没错，留痕错**。
 *
 * 根因不是某处算错，而是**两处各自维护同一组计数**：
 *   ：6185 rulesMet 读 rtR.totalSteps / rtR.cumUsageTokens
 *   ：6286 armed.metrics 读 rtA.lastStep / wl.tokens
 * 同名（steps / tokens）不同量纲（轮内步号 / 上下文窗口 vs 累计量）。
 *
 * 判据四层（缺任一层都可能假绿）：
 *   A 行为层：真跑 autoContinueMetricsPre —— 累计量优先，旧 runtime 才回落。
 *   B 接线层：rulesMet 与 armed.metrics **两处都必须走该函数**（同源由构造保证）。
 *   C 回落层：无累计字段时与改动前逐字段相同（兼容旧 runtime，不是悄悄改语义）。
 *   D 负控：① 把一步改回 lastStep ⇒ A 必红；② 把 metrics 段改回旧写法 ⇒ B 必红。
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', '..')
const SRC = readFileSync(path.join(ROOT, 'lib', 'index.js'), 'utf8').replace(/\r\n/g, '\n')

let pass = 0, fail = 0
const t = (n, c, x) => { if (c) { pass++; console.log('  ok - ' + n) } else { fail++; console.log('  FAIL - ' + n + (x === undefined ? '' : '  <<< ' + String(x).slice(0, 240))) } }

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
const FN_HEAD = 'export function autoContinueMetricsPre(wl, rt) {'
function loadFn(src) {
  const body = extract(src, FN_HEAD)
  return new Function('return (function autoContinueMetricsPre(wl, rt) ' + body.slice(body.indexOf('{')) + ')')()
}

// 真机那一刻的输入（来自 /auto-continue-state 与 diag 的同一帧）
const WL = { ratio: 0.717397, tokens: 717397, window: 1000000 }
const RT = { totalSteps: 2129, lastStep: 3, cumUsageTokens: 1120000000, lastTurn: 135, compactCount: 1 }

console.log('[A] 行为：快照必须取累计量，不是轮内步号/窗口 token')
{
  const f = loadFn(SRC)
  const m = f(WL, RT)
  t('★steps = 累计 2129（不是 lastStep 3）', m.steps === 2129, m.steps)
  t('★tokens = 累计 11.2e8（不是窗口 717397）', m.tokens === 1120000000, m.tokens)
  t('turns = 135（与 lastTurn 一致）', m.turns === 135, m.turns)
  t('compactions = 1（与 compactCount 一致）', m.compactions === 1, m.compactions)
  t('ratio 沿用 wl.ratio', m.ratio === 0.717397, m.ratio)
  // 反向断言：这组快照必须让「全部满足」为真，否则 B 段同源的意义就没了
  t('★该帧四条件按快照求值全部满足（证明 2129/11.2e8 是判定侧口径）',
    m.steps >= 1600 && m.turns >= 20 && m.tokens >= 800000000 && m.ratio >= 0.7,
    JSON.stringify(m))
}

console.log('')
console.log('[C] 回落：旧 runtime 无累计字段时，逐字段与改动前一致')
{
  const f = loadFn(SRC)
  const legacy = f(WL, { lastStep: 3, lastTurn: 135, compactCount: 1 })
  t('无 totalSteps ⇒ steps 回落 lastStep=3', legacy.steps === 3, legacy.steps)
  t('无 cumUsageTokens ⇒ tokens 回落 wl.tokens=717397', legacy.tokens === 717397, legacy.tokens)
  const empty = f(WL, null)
  t('rt 缺失不抛错（arm 不得因统计失败而失败）', empty && empty.steps === 0 && empty.tokens === 717397, JSON.stringify(empty))
  const zero = f(WL, { totalSteps: 0, lastStep: 0, cumUsageTokens: 0, lastTurn: 0, compactCount: 0 })
  t('累计字段为 0 视同「取不到」（不会把 0 当有效累计）', zero.steps === 0, JSON.stringify(zero))
}

console.log('')
console.log('[B] 接线：rulesMet 与 armed.metrics 必须走同一取法')
{
  const atRules = SRC.indexOf('rulesMet = autoContinueRulesMetPre(')
  t('找到 rulesMet 调用点', atRules > 0)
  const rulesRange = SRC.slice(atRules, atRules + 400)
  // ★2026-11-26：取法上移到 `const metNow = autoContinueMetricsPre(wl, rtR)`，rulesMet 传 metNow。
  //   判据随之改为「上游那行调 autoContinueMetricsPre 且 rulesMet 用的是同一个变量」——比断言内联调用更强：
  //   它同时钉住「确实调了」与「传的就是它算出来的那份」。
  const metLine = 'const metNow = autoContinueMetricsPre(wl, rtR)'
  t('★上游确实调 autoContinueMetricsPre 产出 metNow', SRC.includes(metLine), metLine)
  t('★rulesMet 的 metrics 实参就是 metNow（同一份）', /autoContinueRulesMetPre\([^)]*metNow/.test(rulesRange), rulesRange.slice(0, 220))
  t('★rulesMet 处不再内联五个计数字段', !/steps:\s*rtR/.test(rulesRange) && !/tokens:\s*rtR/.test(rulesRange), rulesRange.slice(0, 260))

  const atMetrics = SRC.indexOf('metrics: (function () {')
  t('找到 armed.metrics 赋值点', atMetrics > 0)
  const metroRange = SRC.slice(atMetrics, atMetrics + 420)
  t('★armed.metrics 走 autoContinueMetricsPre(...)', /autoContinueMetricsPre\(/.test(metroRange), metroRange.slice(0, 220))
  t('★armed.metrics 不再读 lastStep', !/rtA\.lastStep/.test(metroRange), metroRange.slice(0, 240))
  t('★armed.metrics 不再读 wl.tokens 作为 tokens 来源', !/tokens:\s*Number\(wl\.tokens\)/.test(metroRange), metroRange.slice(0, 240))
  t('取不到 runtime 时仍回落 null（不让 arm 失败）', /catch \(eMA\) \{ return null \}/.test(metroRange), metroRange.slice(-160))

  // 同源判据：两处引用的函数名必须同名 —— 改任一处取法都会让这里失配
  const nameAt = (s) => { const m = /(autoContinue[A-Za-z]*Metrics[A-Za-z]*Pre)\(/.exec(s); return m ? m[1] : '' }
  // ★2026-11-26：rulesMet 侧现在传变量名而非调用，故同源判据改为「两边都能追溯到这个取法函数」：
  //   ① metrics 侧直接调用它；② 判据侧用的是它产出的那个变量（metNow）。两者缺一即红。
  t('★两处引用同一个取法（metrics 侧调用它 + 判据侧用它的产物 metNow）',
    nameAt(metroRange) === 'autoContinueMetricsPre' && /metNow/.test(rulesRange),
    nameAt(metroRange) + ' / metNow=' + /metNow/.test(rulesRange))
}

console.log('')
console.log('[D] 负控自证（两条都必须真红）')
{
  // D1：把函数里的 steps 取法改回 lastStep ⇒ A 层判据必红
  const ANCHOR_STEPS = 'const steps = r && Number(r.totalSteps) > 0 ? Number(r.totalSteps) : (r && Number(r.lastStep) > 0 ? Number(r.lastStep) : 0)'
  t('D1 变异锚点存在', SRC.includes(ANCHOR_STEPS))
  const mut1 = SRC.replace(ANCHOR_STEPS, 'const steps = Number(r && r.lastStep) || 0')
  t('D1 变异真应用', mut1 !== SRC)
  const m1 = loadFn(mut1)(WL, RT)
  t('★D1 变异体给出 steps=3 ⇒ A 层判据（要求 2129）必然不成立', m1.steps === 3 && !(m1.steps === 2129), m1.steps)

  // D2：把 armed.metrics 段改回旧写法 ⇒ B 层同源判据必红
  const ANCHOR_METRO = /metrics: \(function \(\) \{\n\s*try \{ return autoContinueMetricsPre\(wl, this\.runtimeFor\(agent\)\) \} catch \(eMA\) \{ return null \}\n\s*\}\)\.call\(this\),/
  t('D2 变异锚点存在', ANCHOR_METRO.test(SRC))
  const OLD = [
    'metrics: (function () {',
    '          try {',
    '            const rtA = this.runtimeFor(agent)',
    '            return {',
    '              ratio: Number(wl.ratio) || 0,',
    '              tokens: Number(wl.tokens) || 0,',
    '              turns: Number(rtA && rtA.lastTurn) || 0,',
    '              steps: Number(rtA && rtA.lastStep) || 0,',
    '              compactions: Number(rtA && rtA.compactCount) || 0,',
    '            }',
    '          } catch (eMA) { return null }',
    '        }).call(this),',
  ].join('\n')
  const mut2 = SRC.replace(ANCHOR_METRO, OLD)
  t('D2 变异真应用', mut2 !== SRC)
  const im = mut2.indexOf('metrics: (function () {')
  const mutRange = mut2.slice(im, im + 420)
  const rulesRange2 = mut2.slice(mut2.indexOf('rulesMet = autoContinueRulesMetPre('), mut2.indexOf('rulesMet = autoContinueRulesMetPre(') + 400)
  const name2 = (s) => { const m = /(autoContinue[A-Za-z]*Metrics[A-Za-z]*Pre)\(/.exec(s); return m ? m[1] : '' }
  t('★D2 变异后 B 的同源判据不成立（一侧不再走该函数）', name2(mutRange) === '' || name2(mutRange) !== name2(rulesRange2), name2(mutRange))
  t('★D2 变异后「不读 lastStep」判据不成立', /rtA\.lastStep/.test(mutRange))

  // D3：两条变异体都必须语法可编译（防「因崩溃而红」冒充「因判据而红」）
  const tmpDir = path.join(ROOT, '.dsh-smoke-tmp')
  mkdirSync(tmpDir, { recursive: true })
  for (const nm of ['D1', 'D2']) {
    const mut = nm === 'D1' ? mut1 : mut2
    const f2 = path.join(tmpDir, 'autocont-metrics-' + nm + '.mjs')
    writeFileSync(f2, mut)
    const r2 = spawnSync(process.execPath, ['--check', f2], { encoding: 'utf8' })
    t('★' + nm + ' 变异体语法可编译（MUTATION applied 且 node --check 通过）', r2.status === 0, (r2.stderr || '').slice(0, 200))
    try { rmSync(f2, { force: true }) } catch (_) {}
  }
}

console.log('')
console.log('[autocont-metrics-samesource] PASS ' + pass + ' / FAIL ' + fail)
process.exit(fail ? 1 : 0)
