// H 批 · v1 车道正式退休 —— 真执行守卫（不是源码字符串断言）。
//
// 用户裁定：「正式退休 v1 车道，或者注释明白只用于调参实验，不可接入正式用户线」。
// 本套件把该裁定变成**可执行的硬不变量**：
//   · 即便 activationPolicy.mode=active **且** activationEmitMode=active 双开，v1 车道也**不得发帧**；
//   · 但 v1 车道的 **shadow 行必须照写**（它是调参/离线评测的唯一数据源，退休的是发射权不是观测）；
//   · fv2 车道仍正常工作（退休不得连坐）；
//   · 全 shadow 时零帧（fail closed 不破）。
import { mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
process.on('uncaughtException', (e) => { console.error('[H1] FATAL:', (e && (e.stack || e.message)) || e); process.exit(1) })
process.on('unhandledRejection', (r) => { console.error('[H1] REJ:', r); process.exit(1) })

let pass = 0, fail = 0
const ok = (c, n) => { if (c) { pass++; console.log('  ok - ' + n) } else { fail++; console.error('  FAIL - ' + n) } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const sha256Hex = (s) => createHash('sha256').update(Buffer.from(s)).digest('hex')
const hex32 = (s) => sha256Hex(s).slice(0, 32)

const CLIENT = await import('../../lib/python-sidecar-client.js')
const SYNC = await import('../../lib/index-sync.js')
const HERE = path.dirname(fileURLToPath(import.meta.url))
const SEM_WORKER = path.join(HERE, '..', '..', 'python', 'worker_semantic_v1.py')
const PYEXE = existsSync(path.join(HERE, '..', '..', 'python', 'bench', '.venv', 'Scripts', 'python.exe'))
  ? path.join(HERE, '..', '..', 'python', 'bench', '.venv', 'Scripts', 'python.exe')
  : 'python'

const GOLD = '语义激活 v1 退休守卫黄金记录：workerEpoch 语义激活 v1 退休守卫 breaker 熔断语义激活'

function mkEmbConfig(home, extra) {
  const p = path.join(home, 'emb-h1.json')
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
function records() {
  const wsr = 'wsr_' + hex32('h1ws')
  const mk = (i) => ({
    memoryId: 'mem_' + hex32('h1:m:' + i), anchorId: 'anc_' + hex32('h1a' + i).slice(0, 12),
    scope: 'Workspace', workspaceRef: wsr, sourceRef: 'workspace:MEMORY.md',
    sourceEpoch: 'e-h1', sourceVersion: 1, fileDigest: sha256Hex('h1f' + i),
    recordDigest: sha256Hex('h1r' + i), heading: null, text: i === 0 ? GOLD : ('无关条目 ' + i),
    chunkId: 'chk_pre_' + hex32('h1c' + i), chunkOrdinal: 0, chunkCount: 1,
  })
  return [mk(0), mk(1)]
}
async function syncCorpus(c, recs, miv) {
  const snapshot = { memoryIndexVersion: miv, sources: [{ scope: 'Workspace', sourceRef: 'workspace:MEMORY.md', sourceEpoch: 'e-h1', sourceVersion: 1, fileDigest: sha256Hex('h1f0') }], records: recs }
  const plan = SYNC.buildIndexSyncPlansPre({ snapshot, workspaceKey: 'D:/tmp/h1' }).plans[0]
  await c.request('index_sync_begin', plan.begin)
  for (const pg of plan.pages) await c.request('index_sync_page', pg)
  const r = await c.request('index_sync_commit', plan.commit)
  return !!r.frame?.payload?.accepted
}
function pushOf(obs, miv, text, memRefs) {
  return { kind: 'context_push', observationId: obs,
    session: { sessionId: 'sess-h1', agentId: 'agent-h1', workspaceKey: 'D:/tmp/h1', scope: 'Workspace' },
    cursor: { eventSeq: 1, contextVersion: 1 },
    index: { memoryIndexVersion: miv, sourceEpochs: ['e-h1'] },
    trigger: { segmentId: 'sg', digest: 'd'.repeat(16), kind: 'user', eventSeq: 1, contextVersion: 1, ts: 1, text },
    window: [], memoryRefs: memRefs || [], evidence: [],
    policy: { contextPolicyVersion: 'context_bridge_pre_v1', gatePolicyVersion: 'gate_pre_v1', lexicalPolicyVersion: 'lexical_pre_v2', evidencePolicyVersion: 'evidence_pre_v1' },
    budget: { maxSegments: 8, maxInputBytes: 4096, maxMemoryRefs: 8, maxEvidenceItems: 16 },
    observedAt: 1000, deadlineAt: 6000 }
}
const v1rows = (home) => {
  const p = path.join(home, 'memory', 'semantic', 'activation-shadow.jsonl')
  return existsSync(p) ? readFileSync(p, 'utf8').trim().split(String.fromCharCode(10)).filter(Boolean).map((l) => JSON.parse(l)) : []
};

async function run(tag, embExtra, queries, refs) {
  const home = mkdtempSync(path.join(tmpdir(), 'h1-' + tag + '-'));
  const cfgPath = mkEmbConfig(home, embExtra);
  const c = mkClient(home, cfgPath);
  const acts = [];
  try { c.onActivation((e) => { if (e && e.activation) acts.push(e.activation) }) } catch {}
  const miv = 'idx_pre_' + hex32('h1miv-' + tag);
  const synced = await syncCorpus(c, records(), miv);
  for (let i = 0; i < queries.length; i++) {
    try { await c.request('context_push', pushOf('obs_pre_' + hex32(tag + ':q' + i), miv, queries[i], refs)) } catch (e) { console.error('push threw:', e.message) }
    await sleep(1200);
  }
  await sleep(900);
  const rows = v1rows(home);
  try { c.dispose() } catch {}
  await sleep(300);
  rmSync(home, { recursive: true, force: true });
  return { acts, rows, synced };
}
const Q = [GOLD, GOLD];

// ---- T1 ★核心负路径：双钥匙全开，v1 车道也**不得**发帧 ----
console.log('[T1] 双钥匙全开 -> v1 车道零帧（退休生效）')
const t1 = await run('t1', { activationEmitMode: 'active', activationPolicy: { mode: 'active', tOn: 0.1, tOff: 0.05, cooldownObs: 0 } }, Q);
ok(t1.synced, 'T1 语料同步（前置）')
ok(t1.acts.length === 0, 'T1 ★ v1 车道 retirement：双开仍零帧（实收 ' + t1.acts.length + '）；退休前此处为 2')
ok(t1.rows.length >= 1, 'T1 v1 shadow 行**照写**（退休的是发射权、不是观测；实收 ' + t1.rows.length + ' 行）')

// ---- T2 fv2 车道不得连坐：仅 activationEmitMode=active 时 fv2 应仍能发帧 ----
console.log('[T2] fv2 车道不受影响（退休不连坐）')
// fv2 的 explicit 车道要求 memoryRefs 与 top-K 有交集（见 docs/M7-CLOSED-LOOP-WIRING.md §1）
const H1_REFS = [{ memoryId: 'mem_' + hex32('h1:m:0'), anchorId: 'anc_' + hex32('h1a0').slice(0, 12),
  scope: 'Workspace', sourceRef: 'workspace:MEMORY.md', sourceEpoch: 'e-h1', sourceVersion: 1,
  fileDigest: sha256Hex('h1f0'), recordDigest: sha256Hex('h1r0') }];
const t2 = await run('t2', { activationEmitMode: 'active', activationPolicy: { mode: 'shadow', tOn: 0.1, tOff: 0.05, cooldownObs: 0 } }, [GOLD], H1_REFS);
ok(t2.synced, 'T2 语料同步（前置）')
ok(t2.acts.length >= 1, 'T2 fv2 车道仍发帧（退休不连坐；实收 ' + t2.acts.length + '）')

// ---- T3 fail closed：全 shadow -> 零帧 ----
console.log('[T3] 全 shadow -> 零帧')
const t3 = await run('t3', { activationEmitMode: 'shadow', activationPolicy: { mode: 'shadow', tOn: 0.1, tOff: 0.05, cooldownObs: 0 } }, Q);
ok(t3.acts.length === 0, 'T3 全 shadow 零帧（实收 ' + t3.acts.length + '）')

// ---- T4 静态不变量：源码层唯一 append 点 ----
console.log('[T4] 源码不变量：activation_request append 唯一')
const src = readFileSync(SEM_WORKER, 'utf8')
const appends = (src.match(/frames[.]append[(]self[.]_frame[(]req, 'activation_request'/g) || []).length
ok(appends === 1, 'T4 activation_request append 恰 1 处（fv2 emit bridge）；实物 ' + appends)
ok(!/if [(]self[.]activation_policy[[\]'mode'[\]] == 'active'/.test(src), 'T4 v1 旧放行判定已归零（代码形态正则，不被注释喂饱）')

console.log('== H1 v1-lane-retired: PASS ' + pass + ' / FAIL ' + fail + ' ==')
if (fail) process.exit(1)
