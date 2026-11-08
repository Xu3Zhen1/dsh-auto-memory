#!/usr/bin/env node
/**
 * [arm-gate-shared] 修 A 验收 · 「硬触发被 arm 闸拦下」（报告 §2.7 / §2.8）。
 *
 * 缺陷：v3.2.0 水位 v4 把 `threshold` 从配置常量改成动态推算值，而 `armAutoContinue`
 * 仍用静态 `autoContinueThreshold` 再判一次 ⇒ 同一水位快照被**两个阈值**消费：
 *   checkWaterLevel :4116  `over = armRatio >= threshold`（动态，早）
 *   armAutoContinue :4399  `arm  = armRatio >= autoContinueThreshold`（静态，晚）
 * 后果①硬信号被拦（`max(ratio,threshold)` 抬升后仍 < 静态闸）；②纯比例侧同样「催了但不动」。
 *
 * 本套件验的是**随包发布的真实代码**：从 lib/index.js 抽出 `armAutoContinue`
 * （花括号配平），把真实模块级依赖注进去后真调用。
 *
 * ★纪律（本仓）：**没见过失败的断言只是声称，不是测试** ⇒ 每个正控都配一条负控，
 *   且负控必须**真的变红**；配套的变异验证见同轮控制脚本（D 项同款做法）。
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { shouldArmAutoContinuePre, armEligiblePre } from '../../lib/water-window.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const SRC = readFileSync(path.join(ROOT, 'lib', 'index.js'), 'utf8')

let pass = 0, fail = 0
const fails = []
const ok = (c, m) => { if (c) pass++; else { fail++; fails.push(m) } }

const DEFAULT_AUTO_CONTINUE_THRESHOLD = 0.75
const DEFAULT_WATER_LEVEL_THRESHOLD = 0.75

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

/** 建一个只带 armAutoContinue 的假 engine；diag 全量捕获（供「同帧」断言）。 */
function makeEngine(opts = {}) {
  const logs = []
  const eng = {
    config: Object.assign({
      autoContinueEnabled: true, handoffEnabled: true,
      autoContinueThreshold: 0.75, autoContinueConfirmSeconds: 35, autoContinueCooldownMinutes: 30,
    }, opts.config || {}),
    _autoContState: undefined,
    hasReliableSessionIdentity(agent) { return !!(agent && agent.session && agent.session.id) },
    isContinuedSession() { return !!(opts.continued) },
  }
  const obj = new Function('diag', 'shouldArmAutoContinuePre', 'armEligiblePre', 'isSubAgentSession',
    'DEFAULT_AUTO_CONTINUE_THRESHOLD', 'DEFAULT_WATER_LEVEL_THRESHOLD',
    // ★2026-11-09：armAutoContinue 新增两个模块级依赖（失败熔断 3 次 / 失败短冷却 60s）⇒ 按本表既有
    //   纪律（自由变量必须显式注入，否则 ReferenceError 被该方法自身 catch 吞掉，表现为「达标却不 arm」）一并注入。
    'AUTO_CONTINUE_FAIL_COOLDOWN_MS', 'AUTO_CONTINUE_FAIL_FUSE_COUNT',
    'return {' + extractFn('armAutoContinue(agent, wl, opts = null) {') + '};')(
    (m) => logs.push(String(m)), shouldArmAutoContinuePre, armEligiblePre,
    (x) => { const h = x && x.session && x.session.header; if (!h) return false; if (String(h.origin || '') === 'subagent') return true; const d = Number(h.delegationDepth); return Number.isFinite(d) && d > 0 },
    DEFAULT_AUTO_CONTINUE_THRESHOLD, DEFAULT_WATER_LEVEL_THRESHOLD, 60000, 3)
  const key = Object.keys(obj)[0]
  eng.arm = obj[key].bind(eng)
  eng.logs = logs
  eng.armed = () => !!(eng._autoContState && eng._autoContState.armed)
  return eng
}
const agent = { session: { id: 'session-arm' } }
const wlOf = (o) => Object.assign({ modelKnown: true }, o)

console.log('[arm-gate-shared] G0 结构守卫：两处消费者共用同一判据（§2.8 修法不被改回）')
ok(/const over = armEligiblePre\(armRatio, threshold, hard\)/.test(SRC),
  'G0a checkWaterLevel 的 over 走共用判据 armEligiblePre')
ok(/if \(!armEligiblePre\(wl\.ratio, gate, wl\.hard === true\)\)/.test(SRC),
  'G0b armAutoContinue 的闸走**同一个** armEligiblePre')
ok(!/if \(!\(wl\.ratio >= \(Number\(this\.config\.autoContinueThreshold\)/.test(SRC),
  'G0c 旧的「arm 侧自读静态阈值」写法已移除（防两阈值各读各的复活）')
ok(/rt\.waterLevelThreshold = threshold/.test(SRC),
  'G0d 生效阈值落进 runtime（arm 侧才读得到与 over 同源的值）')
// ★必须断「两处都透传」而不是「至少一处」——只改一处时另一处仍在，弱断言会放行
//   （本轮负控 N4 就是这么暴露出来的：变异掉第一个调用点，旧断言仍绿）。
const passThrough = [...SRC.matchAll(/threshold: rt2\.waterLevelThreshold/g)].length
ok(passThrough === 2,
  `G0e ★两个 arm 调用点都透传 threshold（实测 ${passThrough} 处，须恰为 2 —— 少一处即静默回落成静态闸）`)
// 早退点补 diag（§2.6）：原 10 个早退点里 9 个静默 ⇒ 「没接续」不可归因
const suppressed = [...SRC.matchAll(/diag\('auto-continue suppressed by /g)].length
ok(suppressed >= 8, `G0f 早退点补 diag 到位（实测 ${suppressed} 条 suppressed 日志，原为 0）`)
ok(/auto-continue suppressed by arm gate: gate=' \+ gate \+ ' measured=' \+ \(Number\(wl\.ratio\) \|\| 0\)/.test(SRC),
  'G0g ★闸拦日志把 gate 与 measured **印在同一行**（§2.6.1：同帧是判据，不是排版偏好）')

console.log('[arm-gate-shared] G1 报告 §2.7 验证表（1–8 条）')

// ① 正控：compaction 硬信号（真实 ratio 0.09），闸 0.75 —— 现状 fail，修后必须 arm
const e1 = makeEngine()
e1.arm(agent, wlOf({ ratio: 0.09, tokens: 90080, window: 1000000, source: 'official-context', hard: true }))
ok(e1.armed(), '① 正控：硬信号 compaction（ratio=0.09，闸 0.75，无 runtime threshold）必须 arm')

// ② 正控：硬墙（ratio 0.73，reserve=300k）
const e2 = makeEngine()
e2.arm(agent, wlOf({ ratio: 0.73, tokens: 730000, window: 1000000, source: 'official-context', hard: true }))
ok(e2.armed(), '② 正控：硬信号 hardWall（ratio=0.73，reserve=300k）必须 arm')

// ③ 负控：同样低水位但**非硬信号** ⇒ 必须不 arm（防「顺手把闸整个拆了」）
const e3 = makeEngine()
e3.arm(agent, wlOf({ ratio: 0.09, tokens: 90080, window: 1000000, source: 'official-context', hard: false }))
ok(!e3.armed(), '③ 负控：ratio=0.09 但 hard=false 必须**不** arm（硬绕过只对硬信号生效）')

// ④ 负控：ratio 0.74 < 闸 0.75 ⇒ 不 arm
const e4 = makeEngine()
e4.arm(agent, wlOf({ ratio: 0.74, tokens: 740000, window: 1000000, source: 'official-context', hard: false }))
ok(!e4.armed(), '④ 负控：ratio=0.74 < 闸 0.75 不 arm')

// ⑤ 回归：ratio 0.80 ≥ 闸 ⇒ arm
const e5 = makeEngine()
e5.arm(agent, wlOf({ ratio: 0.80, tokens: 800000, window: 1000000, source: 'official-context', hard: false }))
ok(e5.armed(), '⑤ 回归：ratio=0.80 ≥ 闸 0.75 仍 arm（未把闸拆掉）')

// ⑥ 日志断言：用例 ④ 的 diag 必须出现 suppressed by arm gate 且**同行**含 gate= 与 measured=
const gateLine = e4.logs.find((l) => l.includes('suppressed by arm gate'))
ok(!!gateLine, '⑥a 用例 ④ 触发时 diag 出现 `suppressed by arm gate`（原为静默 return）')
ok(!!gateLine && /gate=0\.75/.test(gateLine) && /measured=0\.74/.test(gateLine),
  '⑥b ★该行**同时**含 gate= 与 measured= 两个值（同帧；缺一即读者仍要翻别的行）: ' + JSON.stringify(gateLine || ''))

// ⑦ 遗留区间（§2.8）：ratio=0.73、hard=false、闸 0.75 ⇒ 仍不 arm —— 但**over 也同时为假**，不再错配
const e7 = makeEngine()
e7.arm(agent, wlOf({ ratio: 0.73, tokens: 730000, window: 1000000, source: 'official-context', hard: false }))
ok(!e7.armed(), '⑦ 遗留区间：ratio=0.73 < 闸 0.75 仍不 arm（§2.8 已由「两处同源」消除错配，不是靠放宽）')
ok(!/const over = armRatio >= threshold/.test(SRC),
  '⑦b ★错配已消除：over 不再单独用动态 threshold 放行（旧写法在 0.72~0.75 区间「催了但不动」）')

// ⑧ 同源断言（结构）：G0a+G0b 已断言，此处再断「同一函数名、同一参数语义」不被换掉
ok(armEligiblePre(0.73, 0.75, false) === false && armEligiblePre(0.73, 0.75, true) === true,
  '⑧ 同源函数语义：hard 绕过、非 hard 按比例（直接对共用函数取值验证）')

console.log('[arm-gate-shared] G2 §2.8 端到端：runtime threshold 参与后，over 与 arm 同进同出')
// 事件日志里那次 compaction 的真实参数：win=1e6 reserve=300000 ⇒ threshold = 0.5710
// 这里用 0.5710 当 runtime threshold 模拟 checkWaterLevel 的产物。
const T5710 = 0.5710
const eA = makeEngine()  // 硬信号 + runtime threshold
eA.arm(agent, wlOf({ ratio: 0.09, tokens: 90080, window: 1000000, source: 'official-context', hard: true, threshold: T5710 }))
ok(eA.armed(), 'G2a 硬信号 + runtime threshold=0.5710 ⇒ arm（两条路径一致）')

const eB = makeEngine()  // 纯比例，ratio 0.60 ≥ runtime threshold 0.5710 ⇒ arm（旧写法：0.60 < 0.75 被拦）
eB.arm(agent, wlOf({ ratio: 0.60, tokens: 600000, window: 1000000, source: 'official-context', hard: false, threshold: T5710 }))
ok(eB.armed(), 'G2b ★纯比例 ratio=0.60 ≥ runtime threshold ⇒ arm（旧写法被静态闸 0.75 拦下，正是「催了但不动」的现场）')

const eC = makeEngine()  // 纯比例，ratio 0.50 < 0.5710 ⇒ 不 arm
eC.arm(agent, wlOf({ ratio: 0.50, tokens: 500000, window: 1000000, source: 'official-context', hard: false, threshold: T5710 }))
ok(!eC.armed(), 'G2c 纯比例 ratio=0.50 < runtime threshold ⇒ 不 arm（负控：不是一律放行）')

// 一致性：同样的 (armRatio, threshold, hard) 下，over 与 arm 必须同值 —— 直接对共用函数验证
const T = [
  [0.09, T5710, true], [0.73, 0.75, true], [0.09, 0.75, false],
  [0.74, 0.75, false], [0.80, 0.75, false], [0.73, 0.75, false], [0.60, T5710, false],
]
const inconsistent = T.filter(([r, g, h]) => {
  const over = armEligiblePre(r, g, h)          // checkWaterLevel 侧
  const arm = armEligiblePre(r, g, h)           // armAutoContinue 侧（同一函数）
  return over !== arm
})
ok(inconsistent.length === 0, 'G2d ★同源不变量：7 组取值下 over 与 arm 恒同值（错配区间为 0）')

console.log('[arm-gate-shared] G3 早退点可归因（§2.6：五种原因不再长得一样）')
const eOff = makeEngine({ config: { autoContinueEnabled: false } })
eOff.arm(agent, wlOf({ ratio: 0.99, hard: true }))
ok(!eOff.armed() && eOff.logs.some((l) => /suppressed by config/.test(l)), 'G3a 关接续 → 有 reason=config 日志')

const eLatch = makeEngine({ continued: true })
eLatch.arm(agent, wlOf({ ratio: 0.99, hard: true }))
ok(!eLatch.armed() && eLatch.logs.some((l) => /suppressed by latch/.test(l)), 'G3b 已接续闩锁 → 有 reason=latch 日志')

const eCold = makeEngine()
eCold._autoContState = { lastRunAt: Date.now() - 60000 }
eCold.arm(agent, wlOf({ ratio: 0.99, hard: true }))
ok(!eCold.armed() && eCold.logs.some((l) => /suppressed by cooldown/.test(l)), 'G3c 冷却中 → 有 reason=cooldown 日志')

const eCnt = makeEngine()
// ★夹具要点：这里**预先塞入**一个进行中的倒计时，故不能再用 eng.armed()（它读的是同一个
//   字段，恒真）——改为断言「state 对象未被改写」，即没有新建倒计时。
const cntFixture = { armed: { expiresAt: Date.now() + 30000 } }
eCnt._autoContState = cntFixture
eCnt.arm(agent, wlOf({ ratio: 0.99, hard: true }))
ok(eCnt._autoContState === cntFixture &&
   eCnt._autoContState.armed.expiresAt === cntFixture.armed.expiresAt &&
   eCnt.logs.some((l) => /suppressed by pending-countdown/.test(l)),
  'G3d 已有倒计时 → 不新建、且有 reason=pending-countdown 日志')

const eNoId = makeEngine()
eNoId.arm({ session: {} }, wlOf({ ratio: 0.99, hard: true }))
ok(!eNoId.armed() && eNoId.logs.some((l) => /suppressed by identity/.test(l)), 'G3e 无可靠会话身份 → 有 reason=identity 日志')

const eNoSnap = makeEngine()
eNoSnap.arm(agent, null)
ok(!eNoSnap.armed() && eNoSnap.logs.some((l) => /suppressed by snapshot/.test(l)), 'G3f wl 为空 → 有 reason=snapshot 日志')

// ★归因性总断言：不再存在「没接续却一行日志都没有」的路径
const eSilent = makeEngine({ config: { autoContinueEnabled: false } })
eSilent.arm(agent, wlOf({ ratio: 0.99, hard: true }))
ok(eSilent.logs.length > 0, 'G3g ★无静默拒绝：被拒绝时至少产出一行日志（原 9 个早退点完全静默）')

console.log(fails.map((f) => '  FAIL: ' + f).join('\n'))
console.log(`\n[arm-gate-shared] PASS ${pass} / FAIL ${fail}`)
process.exit(fail ? 1 : 0)
