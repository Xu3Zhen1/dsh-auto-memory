// G 批 · 发射闸单钥匙化 —— 真执行验收（不是源码字符串断言）。
//
// 用户裁定原话：「另一把闸也要做好联动，用户确定要开自动唤回就一定能开，Python 和 js 都要」。
//
// 实测根因（三处读数、两把钥匙）：
//   · activationEmitMode  —— JS 判定臂(context-host:495) + Python fv2 车道(worker:1261) 都读它，**有 UI 写入面**；
//   · activationPolicy.mode —— Python **v1 通道**(worker:956) 单独读它，而它在用户面**零写入点**
//     （设置页 / 新手向导 / semantic-emit 端点三处全只写前者）。
//   ⇒ 用户把「记忆唤起」开成 active 时，v1 通道恒 shadow：判定照跑、shadow 行照写，
//     但 activation_request 帧永不发出。「两把钥匙，其中一把没人转」。
//
// ★2026-09-30 H 批改判（用户裁定：v1 车道正式退休、仅调参实验、不可接入正式用户线）：
//   本套件记录的是 G 批「单钥匙化」的**过渡**语义；其中 T1/T2 已按 H 批改判为「v1 任何钥匙都不再发帧」。
//   v1 退休的完整守卫（含 shadow 行照写 / fv2 不连坐）见 smoke-test-h1-v1-lane-retired.mjs。
//
// 本测试真起 Python worker（hash-pre-v1 确定性 provider，零联网零模型），真调 context_push，
// 断言 onActivation 回调的实际收帧数 —— 这是功能证据，不是静态守卫。
import { mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
process.on('uncaughtException', (e) => { console.error('[G1] FATAL:', (e && (e.stack || e.message)) || e); process.exit(1) })
process.on('unhandledRejection', (r) => { console.error('[G1] REJ:', r); process.exit(1) })

let pass = 0, fail = 0
const ok = (c, n) => { if (c) { pass++; console.log('  ok - ' + n) } else { fail++; console.error('  FAIL - ' + n) } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const sha256Hex = (s) => createHash('sha256').update(Buffer.from(s)).digest('hex')
const hex32 = (s) => sha256Hex(s).slice(0, 32)

const CLIENT = await import('../../lib/python-sidecar-client.js')
const SYNC = await import('../../lib/index-sync.js')
const INBOX = await import('../../lib/activation-inbox.js')
const HERE = path.dirname(fileURLToPath(import.meta.url))
const SEM_WORKER = path.join(HERE, '..', '..', 'python', 'worker_semantic_v1.py')
const PYEXE = existsSync(path.join(HERE, '..', '..', 'python', 'bench', '.venv', 'Scripts', 'python.exe'))
  ? path.join(HERE, '..', '..', 'python', 'bench', '.venv', 'Scripts', 'python.exe')
  : 'python'

function mkEmbConfig(home, extra) {
  const p = path.join(home, 'emb-g1.json')
  const cfg = { provider: 'hash-pre-v1', dimension: 64 }
  Object.assign(cfg, extra || {})
  writeFileSync(p, JSON.stringify(cfg), 'utf8')
  return p
}
function mkClient(home, cfgPath) {
  process.env.DSH_M7_EMBEDDING_CONFIG = cfgPath
  return CLIENT.createPythonSidecarClientPre({
    command: PYEXE, scriptPath: () => SEM_WORKER, dshHome: home, requestTimeoutMs: 20000,
  })
}
const GOLD = '语义激活双钥匙测试黄金记录：workerEpoch 语义激活双钥匙测试 breaker 熔断语义激活'
function records() {
  const wsr = 'wsr_' + hex32('g1ws')
  const mk = (i) => ({
    memoryId: 'mem_' + hex32('g1:m:' + i), anchorId: 'anc_' + hex32('g1a' + i).slice(0, 12),
    scope: 'Workspace', workspaceRef: wsr, sourceRef: 'workspace:MEMORY.md',
    sourceEpoch: 'e-g1', sourceVersion: 1, fileDigest: sha256Hex('g1f' + i),
    recordDigest: sha256Hex('g1r' + i), heading: null, text: i === 0 ? GOLD : ('无关条目 ' + i),
    chunkId: 'chk_pre_' + hex32('g1c' + i), chunkOrdinal: 0, chunkCount: 1,
  })
  return [mk(0), mk(1)]
}
async function syncCorpus(c, recs, miv) {
  // 契约（lib/index-sync.js:64-75）：snapshot = { memoryIndexVersion, sources:[{scope,sourceRef,sourceEpoch,sourceVersion,fileDigest}], records }。
  //   ★records 必须在 **顶层**（m710 同款写法），塞进 sources[0] 会让 recordsRaw 取到 [] ⇒ 空计划、静默不同步。
  const snapshot = { memoryIndexVersion: miv, sources: [{ scope: 'Workspace', sourceRef: 'workspace:MEMORY.md', sourceEpoch: 'e-g1', sourceVersion: 1, fileDigest: sha256Hex('g1f0') }], records: recs }
  const plan = SYNC.buildIndexSyncPlansPre({ snapshot, workspaceKey: 'D:/tmp/g1' }).plans[0]
  await c.request('index_sync_begin', plan.begin)
  for (const pg of plan.pages) await c.request('index_sync_page', pg)
  const r = await c.request('index_sync_commit', plan.commit)
  return !!r.frame?.payload?.accepted
}
function pushOf(obs, miv, text) {
  return { kind: 'context_push', observationId: obs,
    session: { sessionId: 'sess-g1', agentId: 'agent-g1', workspaceKey: 'D:/tmp/g1', scope: 'Workspace' },
    cursor: { eventSeq: 1, contextVersion: 1 },
    index: { memoryIndexVersion: miv, sourceEpochs: ['e-g1'] },
    trigger: { segmentId: 'sg', digest: 'd'.repeat(16), kind: 'user', eventSeq: 1, contextVersion: 1, ts: 1, text },
    window: [], memoryRefs: [], evidence: [],
    policy: { contextPolicyVersion: 'context_bridge_pre_v1', gatePolicyVersion: 'gate_pre_v1', lexicalPolicyVersion: 'lexical_pre_v2', evidencePolicyVersion: 'evidence_pre_v1' },
    budget: { maxSegments: 8, maxInputBytes: 4096, maxMemoryRefs: 8, maxEvidenceItems: 16 },
    observedAt: 1000, deadlineAt: 6000 }
}

async function run(tag, embExtra, queries) {
  const home = mkdtempSync(path.join(tmpdir(), 'g1-' + tag + '-'))
  const cfgPath = mkEmbConfig(home, embExtra)
  const c = mkClient(home, cfgPath)
  const acts = [], errs = []
  try { const ch = c.processForTest(); ch.stderr.on('data', (d) => errs.push(d.toString())) } catch {}
  try { c.onActivation((e) => { if (e && e.activation) acts.push(e.activation) }) } catch (e) { console.error('onActivation threw:', e.message) }
  const miv = 'idx_pre_' + hex32('g1miv-' + tag)
  const synced = await syncCorpus(c, records(), miv)
  for (let i = 0; i < queries.length; i++) {
    try { await c.request('context_push', pushOf('obs_pre_' + hex32(tag + ':q' + i), miv, queries[i])) } catch (e) { console.error('push threw:', e.message) }
    await sleep(1200)
  }
  await sleep(900)
  try { c.dispose() } catch {}
  await sleep(300)
  const cfgNow = JSON.parse(readFileSync(cfgPath, 'utf8'))
  rmSync(home, { recursive: true, force: true })
  return { acts, synced, errTail: errs.join('').slice(-500), cfgNow }
}

const Q = [GOLD, GOLD];

// ---- T1：**旧行为复现**（负路径）——只设 activationPolicy.mode=active，不设 activationEmitMode
// ★2026-09-30 H 批改判（用户裁定「正式退休 v1 车道…不可接入正式用户线」）：
//   G 批当时让 v1 通道「以投递开关为准即可发帧」是**过渡修复**；H 批直接把它的发射权退休。
//   故 T1 语义由「仍能发帧」改为「**任何钥匙都不再打开 v1**」。
//   「fv2 车道仍能发帧」的正路径现由 smoke-test-h1-v1-lane-retired.mjs T2 承担（需 memoryRefs）。
console.log('[T1] v1 已退休：旧钥匙 activationPolicy.mode=active 也不再发帧')
const t1 = await run('t1', { activationPolicy: { mode: 'active', tOn: 0.1, tOff: 0.05, cooldownObs: 0 } }, Q);
ok(t1.synced, 'T1 语料同步成功（前置）')
ok(t1.acts.length === 0, 'T1 v1 退休：policy.mode=active 亦零帧（实收 ' + t1.acts.length + '；退休前为 2）')

// ---- T2：**用户真实场景**（正路径）——只设 activationEmitMode=active（UI 唯一能写的键）
// H 批后：本用例原先量的 2 帧其实是 **v1** 发的（fv2 explicit 车道需 memoryRefs，本用例未给）。
//   v1 退休后此处应为 0；fv2 的正路径见 h1 套件（带 refs）。
console.log('[T2] v1 退休：emitMode=active 且无 refs 时亦零帧')
const t2 = await run('t2', { activationEmitMode: 'active', activationPolicy: { mode: 'shadow', tOn: 0.1, tOff: 0.05, cooldownObs: 0 } }, Q);
ok(t2.synced, 'T2 语料同步成功（前置）')
ok(t2.acts.length === 0, 'T2 v1 退休：emitMode=active 无 refs 零帧（实收 ' + t2.acts.length + '；退休前为 2，那 2 帧来自 v1）')

// ---- T3：shadow 档必须**零帧**（fail closed 不得被本次改动破坏）
console.log('[T3] fail closed：全 shadow 档必须零帧')
const t3 = await run('t3', { activationEmitMode: 'shadow', activationPolicy: { mode: 'shadow', tOn: 0.1, tOff: 0.05, cooldownObs: 0 } }, Q);
ok(t3.acts.length === 0, 'T3 shadow 档零帧（实收 ' + t3.acts.length + '）')

// ---- T4：双车道不得对**同一 observation** 双发（两车道 id 同源）
console.log('[T4] 双车道同 observation 去重')
const t4 = await run('t4', { activationEmitMode: 'active', activationPolicy: { mode: 'active', tOn: 0.1, tOff: 0.05, cooldownObs: 0 } }, [GOLD]);
const ids = t4.acts.map((a) => a.activationId)
ok(new Set(ids).size === ids.length, 'T4 同 observation 无重复 activationId（两把钥匙全开；实收 ' + JSON.stringify(ids) + '）')

console.log('== G1 gate-unify: PASS ' + pass + ' / FAIL ' + fail + ' ==')
if (fail) process.exit(1)
