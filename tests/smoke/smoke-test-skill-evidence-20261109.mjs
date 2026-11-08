#!/usr/bin/env node
/**
 * smoke-test-skill-evidence-20261109.mjs —— 缺口②「技能证据通路对 agent 直写条目结构性不可达」修复守卫。
 *
 * ## 缺陷（Lead 已核实，本套件负责钉住修复）
 *   · procedures.json 里 agent 直写条目（memory_procedure write/activate 产生）的
 *     `sourceMemoryIds` **刻意为空数组**（lib/index.js 直写时写死 []; 语义正当：模型写的技能没有 memory 来源）。
 *   · 而 addEvidence 的唯一调用点（context-host persistEvidence 的 hub 直达段）前置门是
 *     `p.sourceMemoryIds.includes(ev.memoryId)` ⇒ 空数组恒 false ⇒ addEvidence 永不执行 ⇒
 *     evidence 六元组恒 0 ⇒ 统计晋升门（minSessionDiversity=3 / minSuccessCount=2）永不开门。
 *
 * ## 修法（语义裁定）与判据
 *   新增一条**按 procedureId 记账**的通路（原有按 memoryId 匹配的通路原样保留）：
 *     · `seen`  = 技能被**呈现给模型**
 *                 - activation 臂（Python 档无 query）：activation-host.matchSkillByCandidates 命中 best；
 *                 - JS 档：context-host 技能段注入命中（act.skill 已挂上）。
 *                 两臂互斥（JS 档请求已自带 skill ⇒ matchSkillByCandidates 不被调用），故同一注入只记一次。
 *     · `reuse` = 技能被**真正采用**：procedure-store.activate() 成功启用（index.js 的
 *                 memory_procedure(action=activate) / 面板「直接激活」都走这一原语）。
 *     · 记证据必须带 sessionRef（minSessionDiversity 靠 session 去重）。
 *
 * ## 负控（删掉新接线 ⇒ 本套件必红）
 *   本文件逐段覆盖两个 seen 接线点 + 两个 reuse 钩子安装点，每个场景**单独构造引擎**
 *   （只有一个 host 拿到 hub），因此删掉任一接线点都会让对应段真红：
 *     · 删 activation-host 的 seen 记录   → [E1] 红
 *     · 删 context-host 的 seen 记录      → [E2] 红
 *     · 删 context-host 的 hook 安装      → [E4a] 红
 *     · 删 activation-host 的 hook 安装   → [E4b]/[E4c] 红
 *
 * ## 已显式承认的残差（不静默，也不在本修复范围内）
 *   minSuccessCount 读的是 evidence.success。seen/reuse 不是 success，本修复**不冒充** success
 *   ⇒ [E3] 断言统计门只前进到第二道（diversity 已满足、success 仍为 0 是剩余阻塞项）。
 *
 * 全内存 + 临时 DSH_HOME 隔离，零真实记忆接触、零网络。
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import path from 'node:path'

const tmpHome = mkdtempSync(path.join(tmpdir(), 'dam-skill-evidence-'))
process.env.DSH_HOME = tmpHome
globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => ({}) })

const { createProcedureStorePre } = await import('../../lib/procedure-store.js')
const { createActivationHost } = await import('../../lib/activation-host.js')
const { createContextHost } = await import('../../lib/context-host.js')
const { sessionRefOf } = await import('../../lib/evidence-store.js')
const A = await import('../../lib/activation-inbox.js')
const { CorpusRegistry, buildSourceCatalog, canonicalize } = await import('../../lib/m4-corpus.js')
const { buildSidecar } = await import('../../lib/memory-anchor.js')

const NOW = 1700000000000
let pass = 0
let fail = 0
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ok - ' + name) }
  else { fail++; console.error('  FAIL - ' + name + (extra === undefined ? '' : ' << ' + extra)) }
}
function eq(a, b, name) {
  const ja = JSON.stringify(a)
  const jb = JSON.stringify(b)
  ok(ja === jb, name, 'got=' + ja + ' want=' + jb)
}
const sha256 = (s) => createHash('sha256').update(String(s), 'utf8').digest('hex')
const memId = (tag) => 'mem_' + sha256('mid:' + tag).slice(0, 32)
const evOf = (store, pid) => (store.get(pid) || {}).evidence || {}

/** 真实 procedure store（io 纯内存；now 固定 ⇒ 断言与时间无关）。 */
function mkStore() {
  return createProcedureStorePre({
    io: { save() {}, load() { return null }, clear() {} },
    now: () => NOW,
    gates: {
      minSessionDiversity: 3, minSuccessCount: 2, maxCorrectionRate: 0.3,
      maxContradictions: 0, highRiskRequiresApproval: true,
    },
  })
}
/** agent 直写条目（= memory_procedure 的形状：origin=agent + sourceMemoryIds 刻意空）。 */
function mkAgentProc(store, title, extra = {}) {
  const r = store.observe({
    title,
    steps: ['第一步：执行流程', '第二步：核对结果'],
    successCriteria: ['结果可复现'],
    origin: 'agent',
    sourceMemoryIds: [],
    sourceEpisodes: [],
    riskLevel: 'low',
    ...extra,
  })
  if (!r.ok) throw new Error('observe failed: ' + r.reason)
  return r.procedure.procedureId
}
function promoteModel(store, pid) {
  const pr = store.promote(pid, {}, { authorizedBy: 'model' })
  if (!pr || !pr.ok || pr.decision !== 'promote') throw new Error('promote failed: ' + JSON.stringify(pr && pr.reasonCodes))
  return pr
}
function mkActiveAgentProc(store, title) {
  const pid = mkAgentProc(store, title)
  promoteModel(store, pid)
  const ar = store.activate(pid)
  if (!ar || !ar.ok) throw new Error('activate failed: ' + (ar && ar.reason))
  return pid
}

try {
  // ────────────────────────────────────────────────────────────────────────────
  console.log('[E0] 结构前提：agent 直写条目 sourceMemoryIds 为空 ⇒ 旧记忆门恒不命中')
  {
    const store = mkStore()
    const pid = mkActiveAgentProc(store, '发布前跑全量回归并核对基线哈希')
    const p = store.get(pid)
    eq(p.sourceMemoryIds.length, 0, 'E0-a agent 直写条目 sourceMemoryIds 是空数组（刻意的：没有 memory 来源）')
    eq(p.sourceEpisodes.length, 0, 'E0-b sourceEpisodes 同为空')
    ok(p.stage === 'active', 'E0-c 条目已 active（绕 authorizedBy=model 进的）')
    const ev = p.evidence
    ok(['seen', 'read', 'cite', 'reuse', 'success', 'correction'].every((k) => ev[k] === 0),
      'E0-d 修复前基线的证据六元组全 0')
    // 旧门演算：把 addEvidence 唯一调用点的匹配式原样复算 —— 对 agent 直写条目恒 0 命中。
    const oldHit = store.query({}).filter((x) => Array.isArray(x.sourceMemoryIds) && x.sourceMemoryIds.includes(memId('any')))
    eq(oldHit.length, 0, 'E0-e 旧通路（按 memoryId 匹配）命中数 = 0（结构性不可达，与原通路是否保留无关）')
  }

  // ────────────────────────────────────────────────────────────────────────────
  console.log('[E1] seen — activation 臂（Python 档无 query：候选 ∩ sourceMemoryIds 命中 best）')
  const MIV = new CorpusRegistry().get(buildSourceCatalog({ workspaceKey: canonicalize('c:/ws-a') })).snapshot.memoryIndexVersion
  function mkRec(tag) {
    return {
      memoryId: memId(tag), anchorId: 'anc_pre_' + sha256('anc:' + tag).slice(0, 16),
      scope: 'Workspace', sourceRef: 'workspace:MEMORY.md',
      sourceEpoch: '33333333-3333-4333-8333-333333333333', sourceVersion: 1,
      fileDigest: sha256('file:' + tag), recordDigest: sha256('rec:' + tag),
      excerpt: '参考内容 ' + tag,
    }
  }
  function mkReq(records, o = {}) {
    return A.makeFakeActivationRequestPre({
      seed: 'skill-evidence-20261109', sessionId: o.sessionId || 's1', agentId: 'a1',
      workspaceKey: 'c:/ws-a', contextVersion: 7, memoryIndexVersion: MIV, ttlSteps: 5,
      now: NOW, records, maxItems: o.maxItems || records.length,
    })
  }
  /** 只装 activation-host 的引擎（确保 ownership 单一 ⇒ 删哪处接线红哪段）。 */
  function mkActivationEngine(store, sessionIds, cfg = {}) {
    const engine = {
      config: {
        associativeMemoryEnabled: true, activationInboxEnabled: true, pythonBackendEnabled: true,
        activationSource: 'python', memoryHubEnabled: true, procedureInjectEnabled: true, ...cfg,
      },
      runtimes: new Map(),
      runtimeFor: () => null,
      state: { ws: 'c:/ws-a' },
      __homedirFn: () => tmpHome,
      _memoryHub: { stores: { procedures: store } },
    }
    const host = createActivationHost({ engine })
    host.initCapability({ systemPrompt: { context: () => 'x' } })
    const rts = {}
    for (const sid of sessionIds) {
      const rt = { key: 'k-act-' + sid, sessionId: sid, agentId: 'a1', disposed: false, eventCursor: 1 }
      engine.runtimes.set(rt.key, rt)
      rts[sid] = rt
      host.capturePaths(rt.key, { ws: 'c:/ws-a' })
    }
    engine.runtimeFor = () => rts[sessionIds[0]]
    return { engine, host, rts }
  }
  /** 造一条 crossFeed 形状的 active 条目（带 sourceMemoryIds —— activation 臂只认这条通路）。 */
  function mkActiveWithSources(store, title, sourceMemoryIds) {
    const pid = mkAgentProc(store, title, { sourceMemoryIds })
    promoteModel(store, pid)
    const ar = store.activate(pid)
    if (!ar || !ar.ok) throw new Error('activate failed: ' + (ar && ar.reason))
    return pid
  }
  {
    const store = mkStore()
    const pid = mkActiveWithSources(store, '部署流程一键执行', [memId('r1')])
    const { engine, host, rts } = mkActivationEngine(store, ['s1', 's2', 's2'])
    // s1 首次命中
    engine.runtimeFor = () => rts['s1']
    const r1 = host.offerExternalActivation(mkReq([mkRec('r1'), mkRec('r2')]))
    ok(r1 && r1.ok === true, 'E1-a offer 被接受（技能段确实进入投递链）')
    eq(evOf(store, pid).seen, 1, 'E1-b ★ seen=1：activation 臂命中 best 后按 procedureId 记账')
    eq(evOf(store, pid).sessions, 1, 'E1-c sessions=1（sessionRef 必带）')
    eq(evOf(store, pid).reuse, 0, 'E1-d 仅呈现不等于采用：reuse 仍为 0')
    const pAfter = store.get(pid)
    ok(pAfter._sessions instanceof Set && pAfter._sessions.has(sessionRefOf('s1')),
      'E1-e 证据会话身份 = sessionRefOf(s1)（不是裸 sessionId，也不是空串）')
    // 另一个会话再来一次 ⇒ 跨会话多样性 +1
    engine.runtimeFor = () => rts['s2']
    host.offerExternalActivation(mkReq([mkRec('r1')], { sessionId: 's2' }))
    eq(evOf(store, pid).seen, 2, 'E1-f 第二个会话再呈现 ⇒ seen=2')
    eq(evOf(store, pid).sessions, 2, 'E1-g sessions=2（minSessionDiversity 的去重维度真的在长）')
    // 同会话重复呈现 ⇒ seen 增、sessions 不重复计
    host.offerExternalActivation(mkReq([mkRec('r1')], { sessionId: 's2' }))
    eq(evOf(store, pid).seen, 3, 'E1-h 同会话再次呈现 ⇒ seen=3')
    eq(evOf(store, pid).sessions, 2, 'E1-i 同会话不虚增 sessions（去重有效）')
    // 负向对照：同一条 store 里，**agent 直写条目**（sourceMemoryIds 空）在 activation 臂上不会被匹配
    const agentPid = mkActiveAgentProc(store, '发布前跑全量冒烟测试')
    const before = evOf(store, agentPid).seen
    host.offerExternalActivation(mkReq([mkRec('r1')], { sessionId: 's2' }))
    eq(evOf(store, agentPid).seen, before, 'E1-j 本臂对 agent 直写条目不可达（匹配仍走 sourceMemoryIds）——见 E2 才是它的呈现面')
    // 注入总闸关闭 ⇒ 不呈现、不记证据
    const offStore = mkStore()
    const offPid = mkActiveWithSources(offStore, '部署流程一键执行', [memId('r1')])
    const off = mkActivationEngine(offStore, ['s9'], { procedureInjectEnabled: false })
    off.host.offerExternalActivation(mkReq([mkRec('r1')], { sessionId: 's9' }))
    eq(evOf(offStore, offPid).seen, 0, 'E1-k 技能注入总闸关闭时零证据（不凭空记账）')
  }

  // ────────────────────────────────────────────────────────────────────────────
  console.log('[E2] seen — JS 档（技能段注入命中：context-host 命中 active 技能 → act.skill）')
  // 语料 = 带 anchor 的记忆文件 + 对应 sidecar（loadCorpusSnapshot 只认 sidecar 记录的语料；
  // 直接写无 anchor 的 md 会得到 sources=0/records=0 ⇒ 这里的 C2/技能匹配整条链不会启动）。
  const jsWs = path.join(tmpHome, 'ws-js')
  const jsUserDir = path.join(tmpHome, 'user-js')
  mkdirSync(jsWs, { recursive: true })
  mkdirSync(jsUserDir, { recursive: true })
  const jsNotes = path.join(jsWs, 'MEMORY.md')
  const jsUserFile = path.join(jsUserDir, 'MEMORY.md')
  const sidecarDir = path.join(tmpHome, 'memory', 'index', 'files')
  mkdirSync(sidecarDir, { recursive: true })
  function writeAnchoredMemFile(file, anchorTag, heading, body) {
    const text = '# 记忆\n\n<!-- memory:' + memId(anchorTag) + ' -->\n## ' + heading + '\n' + body + '\n'
    writeFileSync(file, text, 'utf8')
    const sb = buildSidecar({ sourceFile: file, content: text })
    if (!sb.ok) throw new Error('buildSidecar failed: ' + sb.reason)
    writeFileSync(path.join(sidecarDir, sha256(canonicalize(file)) + '.json'), JSON.stringify(sb.sidecar), 'utf8')
  }
  writeAnchoredMemFile(jsNotes, 'js-workspace-1', '部署', '- 部署流程先 pnpm build，再 rsync 到目标机')
  writeAnchoredMemFile(jsUserFile, 'js-user-1', '偏好', '- 偏好可复现的证据')
  /** 只装 context-host 的引擎（activation-host 用 spy 记录，不参与证据记账）。 */
  function mkCtxEngine(store, sessionState, cfg = {}) {
    const engine = {
      config: {
        associativeMemoryEnabled: true, contextBridgeEnabled: true, contextSinkMode: 'null',
        memoryHubEnabled: true, procedureInjectEnabled: true,
        jsDecideCooldownRounds: 0, dayBoundaryMinutes: 450, contextBridgeObserveChildSessions: true,
        ...cfg,
      },
      __homedirFn: () => tmpHome,
      state: { ws: jsWs },
      _memoryHub: { stores: { procedures: store } },
      _activationHost: {
        offers: [],
        offerExternalActivation(act) { this.offers.push(act); return { ok: true } },
      },
      _jsSemanticRank: async function (input) {
        const m = new Map()
        if (input && Array.isArray(input.sources)) {
          for (const r of (input.records || [])) m.set(r.memoryId, 0.5)
          return { scores: m }
        }
        for (const r of ((input && input.records) || [])) m.set(r.memoryId, 0.9)
        return { scores: m }
      },
      _jsDecide: async () => ({
        ok: true, decision: 'emit', lane: 'js',
        features: { intentProb: 0.9 }, reasonCodes: [],
      }),
      jsEmitMode: () => 'active',
      currentSessionId: () => sessionState.sid,
    }
    return engine
  }
  const flush = () => new Promise((r) => setTimeout(r, 120))
  function mkCtxRuntime(sid, segText) {
    const seg = {
      id: 'seg_' + sid + '_' + ++mkCtxRuntime.seq, digest: 'a'.repeat(32), kind: 'user',
      eventSeq: mkCtxRuntime.seq, nativeSeq: mkCtxRuntime.seq, contextVersion: mkCtxRuntime.seq,
      ts: NOW + mkCtxRuntime.seq, text: segText,
    }
    const rt = {
      key: 'k-ctx-' + sid, sessionId: sid, agentId: 'a1', contextVersion: 1, disposed: false,
      segments: { snapshot: () => [seg] },
      agent: { session: { header: {} } },
    }
    return { rt, seg }
  }
  mkCtxRuntime.seq = 0
  {
    const store = mkStore()
    const pid = mkActiveAgentProc(store, '部署流程执行与核对')
    const sidState = { sid: 'sess-js-1' }
    const engine = mkCtxEngine(store, sidState)
    const host = createContextHost({ engine })
    host.capturePaths('k-ctx-sess-js-1', { ws: jsWs, userDir: jsUserDir, notesPath: jsNotes })
    const { rt, seg } = mkCtxRuntime('sess-js-1', '现在开始部署流程')
    host.onSegmentAccepted(rt, seg, { payload: {} })
    await flush()
    eq(engine._activationHost.offers.length, 1, 'E2-a JS 判定 emit + 技能命中 ⇒ 确实发出了带技能段的注入请求')
    const offered = engine._activationHost.offers[0] || {}
    eq(offered.skill && offered.skill.procedureId, pid, 'E2-b 注入请求里的技能段指向该 active 技能（= 真的呈现给模型）')
    eq(evOf(store, pid).seen, 1, 'E2-c ★ seen=1：JS 档技能段注入命中后按 procedureId 记账')
    eq(evOf(store, pid).sessions, 1, 'E2-d sessions=1')
    ok((store.get(pid)._sessions || new Set()).has(sessionRefOf('sess-js-1')),
      'E2-e 证据会话身份 = sessionRefOf(sess-js-1)')
    // 同会话第二轮
    const s2 = mkCtxRuntime('sess-js-1', '继续部署流程并核对结果')
    host.onSegmentAccepted(s2.rt, s2.seg, { payload: {} })
    await flush()
    eq(evOf(store, pid).seen, 2, 'E2-f 同会话再次注入 ⇒ seen=2')
    eq(evOf(store, pid).sessions, 1, 'E2-g 同会话不虚增 sessions')
    // 另一会话
    const sidState2 = { sid: 'sess-js-2' }
    const engine2 = mkCtxEngine(store, sidState2)
    const host2 = createContextHost({ engine: engine2 })
    host2.capturePaths('k-ctx-sess-js-2', { ws: jsWs, userDir: jsUserDir, notesPath: jsNotes })
    const s3 = mkCtxRuntime('sess-js-2', '部署流程再来一遍')
    host2.onSegmentAccepted(s3.rt, s3.seg, { payload: {} })
    await flush()
    eq(evOf(store, pid).seen, 3, 'E2-h 第二会话注入 ⇒ seen=3')
    eq(evOf(store, pid).sessions, 2, 'E2-i sessions=2')
    // 第三个会话（minSessionDiversity=3 的达标点）
    const sidState3 = { sid: 'sess-js-3' }
    const engine4 = mkCtxEngine(store, sidState3)
    const host4 = createContextHost({ engine: engine4 })
    host4.capturePaths('k-ctx-sess-js-3', { ws: jsWs, userDir: jsUserDir, notesPath: jsNotes })
    const s5 = mkCtxRuntime('sess-js-3', '部署流程第三轮')
    host4.onSegmentAccepted(s5.rt, s5.seg, { payload: {} })
    await flush()
    eq(evOf(store, pid).seen, 4, 'E2-l 第三会话注入 ⇒ seen=4')
    eq(evOf(store, pid).sessions, 3, 'E2-m ★ sessions=3（minSessionDiversity=3 已由真实使用满足）')
    // 总闸关闭 ⇒ 零证据
    const offStore = mkStore()
    const offPid = mkActiveAgentProc(offStore, '部署流程执行与核对')
    const engine3 = mkCtxEngine(offStore, { sid: 'sess-js-x' }, { procedureInjectEnabled: false })
    const host3 = createContextHost({ engine: engine3 })
    host3.capturePaths('k-ctx-x', { ws: jsWs, userDir: jsUserDir, notesPath: jsNotes })
    const s4 = mkCtxRuntime('sess-js-x', '部署流程')
    host3.onSegmentAccepted(s4.rt, s4.seg, { payload: {} })
    await flush()
    eq(engine3._activationHost.offers.length, 0, 'E2-j 总闸关闭 ⇒ 不发注入')
    eq(evOf(offStore, offPid).seen, 0, 'E2-k 总闸关闭 ⇒ 零证据')
    // ── 统计门：第三会话后 diversity 已满足；success 仍是剩余阻塞项（如实暴露，不冒充）
    const pMid = store.get(pid)
    store.update(pid, { riskLevel: 'high' }) // 内容/风险变更 ⇒ active 回退 validated（真实再审批路径）
    ok(store.get(pid).stage === 'validated', 'E3-a 风险升级 ⇒ active 回退 validated（证据保留，真实可再晋升）')
    const view = store.evaluatePromotion(pid)
    const codes = (view && view.reasonCodes) || []
    ok(!codes.some((c) => /^diversity-below-/.test(c)),
      'E3-b ★ 统计门多样化这一道**已不再拦**（修复前恒为 diversity-below-3）', JSON.stringify(codes))
    ok(codes.some((c) => /^success-below-/.test(c)),
      'E3-c 剩余阻塞是 minSuccessCount（seen/reuse 不冒充 success，残差如实暴露）', JSON.stringify(codes))
    eq(pMid.evidence.success, 0, 'E3-d success 仍 0 —— 需要独立证据源（本修复范围外，已报告）')
    const pr = store.promote(pid, {}, {})
    eq(pr.decision, 'keep', 'E3-e 未授权 promote 仍被第二道统计门拦（不是恒真也不是恒假）')
    eq((pr.reasonCodes || []).filter((c) => /^diversity-below-/.test(c)).length, 0,
      'E3-f promote 的原因码里没有 diversity-below-*（多样化门已被真实使用满足）')
  }

  // ────────────────────────────────────────────────────────────────────────────
  console.log('[E4] reuse — activate() 成功启用（memory_procedure(action=activate)/面板直接激活）')
  {
    // (a) 钩子由 context-host 的每轮入口安装（构造顺序与真实引擎一致：先建 host，后建 hub）
    const store = mkStore()
    const pid = mkAgentProc(store, '回归发布流程并核对 sha')
    promoteModel(store, pid)
    const sidState = { sid: '' }
    const engine = { config: {}, __homedirFn: () => tmpHome, state: {}, _memoryHub: null, currentSessionId: () => sidState.sid }
    const host = createContextHost({ engine })
    engine._memoryHub = { stores: { procedures: store } } // 真实引擎：hub 在 host 构造之后才建
    host.capturePaths('k-reuse', { ws: jsWs, userDir: jsUserDir, notesPath: jsNotes })
    sidState.sid = 'sess-reuse-a'
    const ar = store.activate(pid)
    ok(ar && ar.ok === true, 'E4a-a activate 正常成功')
    eq(evOf(store, pid).reuse, 1, 'E4a-b ★ reuse=1：activate 成功启用后按 procedureId 记账')
    eq(evOf(store, pid).sessions, 1, 'E4a-c sessions=1（用当前会话的 sessionRef）')
    // 幂等分支（alreadyActive）不重复记账
    store.activate(pid)
    eq(evOf(store, pid).reuse, 1, 'E4a-d 幂等 activate（alreadyActive）不虚增 reuse')
    host.disposeAll('test')
  }
  {
    // (b) 钩子由 activation-host 的 capturePaths 安装
    const store = mkStore()
    const pid = mkAgentProc(store, '归档旧日志并重建索引')
    promoteModel(store, pid)
    const engine = {
      config: {}, __homedirFn: () => tmpHome, state: {}, runtimes: new Map(), runtimeFor: () => null,
      _memoryHub: null, currentSessionId: () => 'sess-reuse-b',
    }
    const host = createActivationHost({ engine })
    engine._memoryHub = { stores: { procedures: store } }
    host.capturePaths('k-reuse-2', { ws: 'c:/ws-b' })
    const ar = store.activate(pid)
    ok(ar && ar.ok === true, 'E4b-a activate 成功')
    eq(evOf(store, pid).reuse, 1, 'E4b-b ★ reuse=1（activation-host 安装点生效）')
    host.disposeAll('test')
  }
  {
    // (c) 钩子由 activation-host 的 onPreStep 安装（每步入口，先于 feature-gate 早退）
    const store = mkStore()
    const pid = mkAgentProc(store, '同步知识库并校验条目数')
    promoteModel(store, pid)
    const engine = {
      config: {}, __homedirFn: () => tmpHome, state: {}, runtimes: new Map(), runtimeFor: () => null,
      _memoryHub: null, currentSessionId: () => 'sess-reuse-c',
    }
    const host = createActivationHost({ engine })
    engine._memoryHub = { stores: { procedures: store } }
    host.onPreStep(null) // 配置未开 ⇒ 内部早退，但钩子安装必须在早退之前完成
    store.activate(pid)
    eq(evOf(store, pid).reuse, 1, 'E4c ★ reuse=1（onPreStep 安装点生效，且早退也安装）')
    host.disposeAll('test')
  }
  {
    // (d) 拿不到会话身份时不记账（不造无主会话，不污染 minSessionDiversity）
    const store = mkStore()
    const pid = mkAgentProc(store, '导出配置快照')
    promoteModel(store, pid)
    const engine = { config: {}, __homedirFn: () => tmpHome, state: {}, _memoryHub: null, currentSessionId: () => '' }
    const host = createContextHost({ engine })
    engine._memoryHub = { stores: { procedures: store } }
    host.capturePaths('k-reuse-3', { ws: jsWs })
    store.activate(pid)
    eq(evOf(store, pid).reuse, 0, 'E4d-a 无会话身份 ⇒ 不记 reuse（宁缺不造）')
    eq(evOf(store, pid).sessions, 0, 'E4d-b 也不虚增 sessions')
    host.disposeAll('test')
  }
  {
    // (e) 原有按 memoryId 匹配的通路原样保留（不因新增通路被改写/削弱）
    const store = mkStore()
    const src = memId('r9')
    const pid = mkAgentProc(store, '带来源记忆的技能', { sourceMemoryIds: [src] })
    const p = store.get(pid)
    ok(Array.isArray(p.sourceMemoryIds) && p.sourceMemoryIds.includes(src),
      'E4e-a 带 sourceMemoryIds 的条目仍照旧保存来源（语义未被改动）')
    const hit = store.query({}).filter((x) => Array.isArray(x.sourceMemoryIds) && x.sourceMemoryIds.includes(src))
    eq(hit.length, 1, 'E4e-b 旧 memoryId 匹配式仍能命中带来源的条目（原通路未被替换）')
  }
} finally {
  try { rmSync(tmpHome, { recursive: true, force: true }) } catch (_) {}
}

console.log('\n结果: PASS=' + pass + ' FAIL=' + fail)
process.exit(fail ? 1 : 0)
