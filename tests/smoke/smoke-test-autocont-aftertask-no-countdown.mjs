/**
 * ★2026-11-17 用户报障「多条件下倒计时仍旧出现，倒计时结束后过一会又会倒计时」。
 *
 * 缺陷链（两条，都在 tickAutoContinue/armAutoContinue 上）：
 *   ① pre-step 侧 arm 带 awaitIdle ⇒ 旧代码 `afterTask = afterTaskWanted && canJudgeTurn && !opts.awaitIdle`
 *      把 afterTask **强制退回倒计时模式**（expiresAt = now + 35s）⇒ 配了「任务结束后接续」仍弹
 *      「20 秒后自动接续(视为挂机)」。
 *   ② 倒计时到期时源回合仍活跃 ⇒ tick 走 awaitIdle 的 defer 分支，每次把 expiresAt **挪后 20 秒**；
 *      前端每 3s 按 (expiresAt - now)/1000 重算 ⇒ 倒计时归零后**又从头开始**，最多 5 轮。
 *      这就是「倒计时结束后过一会又倒计时」。
 *
 * 顺带修出的第三个缺陷（更严重，属沉默失效）：
 *   ③ afterTask 兜底分支里写 `'... still ' + turnStatus`，而 `turnStatus` 在同一 try 块**后面**才 const 声明
 *      ⇒ 进入兜底必抛 ReferenceError，被 tickAutoContinue 的 catch 吞掉 ⇒ 兜底 30 分钟路径**从未执行**。
 *
 * 判据分层（缺任一层都可能假绿）：
 *   A 语义层：开了「任务结束后接续」且能判回合 ⇒ **无论哪个入口 arm，都必须是 afterTask，且无倒计时**。
 *   B 能力门：判不了回合状态（无 agentSvc）⇒ 仍退回倒计时（不许把「判不了」当成「等下去」）。
 *   C 用户关闭：autoContinueAfterTask=false ⇒ 仍按倒计时（旧行为逐字节保留）。
 *   D 兜底可达：afterTask 且回合 running 且兜底到期 ⇒ **必须真执行一次**（旧代码这里必抛 TDZ 错）。
 *   E 负控：把 ①②③ 各自改回旧写法 ⇒ 对应判据必红；变异体必须 node --check 通过（防「因崩溃而红」）。
 *
 * 纯 Node、零依赖、不联网。
 */
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'

const ROOT = path.resolve(import.meta.dirname, '..', '..')
let pass = 0, fail = 0
const ok = (cond, name) => { if (cond) { pass++; console.log('  ok - ' + name) } else { fail++; console.error('  FAIL - ' + name) } }
const eq = (a, b, name) => { const ja = JSON.stringify(a), jb = JSON.stringify(b); ok(ja === jb, name + (ja === jb ? '' : ' got=' + ja + ' want=' + jb)) }

const SRC = readFileSync(path.join(ROOT, 'lib', 'index.js'), 'utf8').replace(/\r\n/g, '\n')
const tmps = []
const mkroot = (t) => { const d = mkdtempSync(path.join(tmpdir(), 'dam-at-' + t + '-')); tmps.push(d); return d }
let seq = 0
async function loadEngine(mutations = []) {
  const shim = path.join(ROOT, 'tests', 'lib', 'audit-engine.mjs')
  if (!mutations.length) { delete process.env.DAM_AUDIT_ENGINE_SOURCE; return await import(pathToFileURL(shim).href + '?v=' + (++seq)) }
  let src = SRC
  for (const [from, to] of mutations) {
    const hits = src.split(from).length - 1
    assert.equal(hits, 1, 'mutation anchor must hit exactly once: ' + JSON.stringify(String(from).slice(0, 70)) + ' hits=' + hits)
    src = src.replace(from, to)
  }
  assert.notEqual(src, SRC, 'mutation must change the source')
  const dir = mkroot('mut')
  const f = path.join(dir, 'idx-' + (++seq) + '.mjs')
  writeFileSync(f, src, 'utf8')
  // 变异体必须语法可编译（防「因崩溃而红」冒充「因判据而红」）
  const chk = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' })
  assert.equal(chk.status, 0, 'mutant must be syntactically valid: ' + (chk.stderr || '').slice(0, 300))
  process.env.DAM_AUDIT_ENGINE_SOURCE = f
  const m = await import(pathToFileURL(shim).href + '?v=' + (++seq))
  delete process.env.DAM_AUDIT_ENGINE_SOURCE
  return m
}
function isolate(tag) {
  const root = mkroot(tag), home = path.join(root, 'home')
  mkdirSync(home, { recursive: true })
  const saved = {}
  for (const k of ['HOME', 'USERPROFILE', 'DSH_HOME']) { saved[k] = process.env[k]; process.env[k] = home }
  return { root, home, restore: () => { for (const k of Object.keys(saved)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k] } } }
}
function mkEngine (mod, home, cfgExtra = {}) {
  const eng = new mod.MemoryEngine()
  eng.config = Object.assign({}, eng.config, {
    autoContinueEnabled: true, autoContinueThreshold: 0.75, autoContinueCooldownMinutes: 1,
    autoContinueConfirmSeconds: 35, autoContinueAfterTask: true, autoContinueAfterTaskMaxWaitSeconds: 1800,
    autoContinueRules: [],
  }, cfgExtra)
  eng.state.ws = home
  const agent = { session: { id: 'src-1', header: { id: 'src-1', cwd: home } } }
  return { eng, agent }
}
const WL = { ratio: 0.8, hard: false, hardReason: '', tokens: 800000, window: 1000000, source: 'auto', modelKnown: true }
const GUARD_MS = 1800 * 1000

console.log('[A] 语义层：开了「任务结束后接续」⇒ pre-step 入口也必须是 afterTask，且无倒计时')
{
  const iso = isolate('A')
  try {
    const mod = await loadEngine()
    // pre-step 入口：awaitIdle: true（这就是产线 checkWaterLevelAtStep 的调用形态）
    const { eng, agent } = mkEngine(mod, iso.home)
    eng._agentSvc = { get: () => ({ status: 'idle' }) }
    const t0 = Date.now()
    eng.armAutoContinue(agent, WL, { awaitIdle: true })
    const a = eng._autoContState.armed
    ok(!!a, 'pre-step + awaitIdle 仍能 arm（不许因本次改动而不 arm）')
    eq(a.afterTask, true, '★pre-step 入口 afterTask=true（旧实现被 awaitIdle 强制退回 false）')
    const left = a.expiresAt - t0
    ok(left > GUARD_MS - 60000, '★expiresAt 是兜底上限（≈30 分钟），不是 35 秒倒计时；实测 ' + Math.round(left / 1000) + 's')
    eq(a.settleMs, 2000, 'afterTask 带 2s 沉降窗口')
    // 状态投影：前端据 afterTask 决定不画倒计时
    const view = eng.autoContinueState('src-1')
    eq(view.armed.afterTask, true, '★状态投影透出 afterTask=true（前端据此隐藏倒计时）')

    // turn-stopping 入口（不传 awaitIdle）—— 行为不得被本次改动影响
    const { eng: e2, agent: a2 } = mkEngine(mod, iso.home)
    e2._agentSvc = { get: () => ({ status: 'idle' }) }
    e2.armAutoContinue(a2, WL)
    eq(e2._autoContState.armed.afterTask, true, 'turn-stopping 入口仍 afterTask=true（既有行为不变）')
  } finally { iso.restore() }
}

console.log('')
console.log('[B] 能力门：判不了回合状态 ⇒ 仍退回倒计时（不许把「判不了」当成「等下去」）')
{
  const iso = isolate('B')
  try {
    const mod = await loadEngine()
    const { eng, agent } = mkEngine(mod, iso.home)
    // 不给 _agentSvc ⇒ _sourceTurnStatusPre 恒 'unknown'
    const t0 = Date.now()
    eng.armAutoContinue(agent, WL, { awaitIdle: true })
    const a = eng._autoContState.armed
    eq(a.afterTask, false, '★无 agentSvc ⇒ afterTask=false（能力门保留）')
    const left = a.expiresAt - t0
    ok(left <= 40000, '★退回 35 秒倒计时（实测 ' + Math.round(left / 1000) + 's），而不是等 30 分钟')
  } finally { iso.restore() }
}

console.log('')
console.log('[C] 用户关闭「任务结束后接续」⇒ 仍按倒计时（旧行为逐字节保留）')
{
  const iso = isolate('C')
  try {
    const mod = await loadEngine()
    const { eng, agent } = mkEngine(mod, iso.home, { autoContinueAfterTask: false })
    eng._agentSvc = { get: () => ({ status: 'idle' }) }
    const t0 = Date.now()
    eng.armAutoContinue(agent, WL, { awaitIdle: true })
    const a = eng._autoContState.armed
    eq(a.afterTask, false, '★配置 autoContinueAfterTask=false ⇒ afterTask=false')
    ok(a.expiresAt - t0 <= 40000, '★走 35 秒倒计时（实测 ' + Math.round((a.expiresAt - t0) / 1000) + 's）')
  } finally { iso.restore() }
}

console.log('')
console.log('[D] 兜底可达：afterTask + 源回合 running + 兜底到期 ⇒ 必须真执行一次（旧代码在这里抛 TDZ 错被吞）')
{
  const iso = isolate('D')
  try {
    const mod = await loadEngine()
    const { eng, agent } = mkEngine(mod, iso.home)
    eng._agentSvc = { get: () => ({ status: 'running' }) }
    eng.hostAutoContinueCalls = 0
    eng.hostAutoContinue = async function () { this.hostAutoContinueCalls++ }
    eng.armAutoContinue(agent, WL, { awaitIdle: true })
    eng._autoContState.armed.expiresAt = Date.now() - 1 // 兜底到期
    await eng.tickAutoContinue()
    eq(eng.hostAutoContinueCalls, 1, '★★兜底路径真执行（旧实现因 turnStatus TDZ 抛错被 catch 吞掉 ⇒ 恒 0）')
    // 反向：未到期时必须继续等，不许提前打断
    const { eng: e2, agent: a2 } = mkEngine(mod, iso.home)
    e2._agentSvc = { get: () => ({ status: 'running' }) }
    e2.hostAutoContinueCalls = 0
    e2.hostAutoContinue = async function () { this.hostAutoContinueCalls++ }
    e2.armAutoContinue(a2, WL, { awaitIdle: true })
    await e2.tickAutoContinue()
    eq(e2.hostAutoContinueCalls, 0, '★未到期 + 回合 running ⇒ 继续等，不打断')
  } finally { iso.restore() }
}

console.log('')
console.log('[E] 负控：三条旧写法各自改回 ⇒ 对应判据必红')
{
  // E1：把 afterTask 改回「带 !opts.awaitIdle」⇒ A 段判据必红
  const M1 = [
    'const afterTask = afterTaskWanted && canJudgeTurn\n',
    'const afterTask = afterTaskWanted && canJudgeTurn && !(opts && opts.awaitIdle)\n',
  ]
  ok(SRC.includes(M1[0]), 'E1 变异锚点存在（afterTask 判定行）')
  const iso = isolate('E1')
  try {
    const mod = await loadEngine([[M1[0], M1[1]]])
    const { eng, agent } = mkEngine(mod, iso.home)
    eng._agentSvc = { get: () => ({ status: 'idle' }) }
    eng.armAutoContinue(agent, WL, { awaitIdle: true })
    const a = eng._autoContState.armed
    eq(a.afterTask, false, '★E1 变异体：pre-step 入口退回倒计时（A 段判据此时必然不成立 ⇒ 有鉴别力）')
    ok(a.expiresAt - Date.now() <= 40000, '★E1 变异体：expiresAt 变回 35 秒（倒计时复现，正是用户报障）')
  } finally { iso.restore() }

  // E2：把 turnNow 改回 turnStatus ⇒ D 段判据必红（TDZ）
  const M2 = ["' + turnNow + ' past guard deadline", "' + turnStatus + ' past guard deadline"]
  ok(SRC.includes(M2[0]), 'E2 变异锚点存在（兜底 diag 里的 turnNow）')
  const iso2 = isolate('E2')
  try {
    const mod = await loadEngine([[M2[0], M2[1]]])
    const { eng, agent } = mkEngine(mod, iso2.home)
    eng._agentSvc = { get: () => ({ status: 'running' }) }
    eng.hostAutoContinueCalls = 0
    eng.hostAutoContinue = async function () { this.hostAutoContinueCalls++ }
    eng.armAutoContinue(agent, WL, { awaitIdle: true })
    eng._autoContState.armed.expiresAt = Date.now() - 1
    await eng.tickAutoContinue()
    eq(eng.hostAutoContinueCalls, 0, '★E2 变异体：兜底路径静默失效（TDZ 抛错被吞 ⇒ D 段判据必然不成立）')
  } finally { iso2.restore() }
}

for (const d of tmps) { try { rmSync(d, { recursive: true, force: true }) } catch (_) {} }
console.log('')
console.log('[autocont-aftertask-no-countdown] PASS ' + pass + ' / FAIL ' + fail)
process.exit(fail ? 1 : 0)
