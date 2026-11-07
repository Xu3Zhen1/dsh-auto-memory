import { createHash } from 'node:crypto'

/** Episode-only rows cannot earn memory-ID evidence. Do not fabricate provenance or gates. */
export function isObservationOnlyPre(p) {
  if (!p || typeof p !== 'object') return false
  if (p.observationOnly === true) return true
  // Already validated/active, user-authored and deprecated history keeps its existing semantics.
  if (p.origin === 'user' || (p.stage && !['observed', 'candidate'].includes(p.stage))) return false
  return Array.isArray(p.sourceEpisodes) && p.sourceEpisodes.length > 0 &&
    (!p.sourceMemoryIds || p.sourceMemoryIds.length === 0) &&
    (!p.successCriteria || p.successCriteria.length === 0)
}

/** Additive metadata migration only; no change to identity, text, risk, evidence or stage. */
export function normalizeProcedureObservationPre(p) {
  if (!p || p.pinned || p.observationOnly !== undefined || !isObservationOnlyPre(p)) return p
  return { ...p, observationOnly: true }
}

/** A title is not an identity. Rich and observation-only candidates must not contaminate each other. */
export function procedureFingerprintPre(p) {
  return JSON.stringify([p.title, p.origin === 'user' ? 'user' : 'agent', p.riskLevel || 'low',
    isObservationOnlyPre(p), p.steps || [], p.preconditions || [], p.checks || [],
    p.successCriteria || [], p.rollback || []])
}

export function matchingProcedurePre(rows, candidate) {
  const fingerprint = procedureFingerprintPre(candidate)
  return rows.find(p => p.stage !== 'deprecated' && procedureFingerprintPre(p) === fingerprint)
}

export function mergeProcedureSourcesPre(existing, candidate) {
  // These are the only mergeable fields. In particular, never inherit a lower risk or approval.
  existing.sourceMemoryIds = [...new Set([...(existing.sourceMemoryIds || []), ...(candidate.sourceMemoryIds || [])])]
  existing.sourceEpisodes = [...new Set([...(existing.sourceEpisodes || []), ...(candidate.sourceEpisodes || [])])]
}

export function newProcedureIdentityPre(candidate, now, rows, idPrefix = 'proc_pre_') {
  // ★ 内容寻址（2026-09-26 B1-1 修复）：id 只由**内容指纹**决定。
  //
  // 旧实现在哈希里掺了 now 与 sequence:
  //   ['procedure-v2', fingerprint, now, sequence]
  // ⇒ **同内容在两台机器/两个时刻得到不同 id** ⇒ 同步后变重复条目。
  // 这是身份级缺陷：不修则团队库里的同名技能会不断增殖。
  //
  // 修法：去掉时间与序号，只用 procedureFingerprintPre（纯内容字段：
  //   title / origin / riskLevel / observationOnly / steps / preconditions /
  //   checks / successCriteria / rollback）。跨机一致：同内容 ⇒ 同 id。
  //
  // 退化情形：若内容寻址 id 已被占用，用**确定性递增序号**消歧 ——
  // 仍不含时间戳，故同输入必得同输出（幂等）。
  // 前缀必须与 procedure-store.js 的 PROCEDURE_ID_PREFIX 一致 ——
  // 发布线会由 tools/release.mjs 反向转换，故此处字面量按 pre 线写。
  const used = new Set(rows.map(p => p.procedureId))
  const fingerprint = procedureFingerprintPre(candidate)
  for (let sequence = 0; sequence <= rows.length + 1; sequence++) {
    const seed = sequence === 0
      ? ['procedure-v3', fingerprint]
      : ['procedure-v3', fingerprint, sequence]
    const digest = createHash('sha256').update(JSON.stringify(seed)).digest('hex')
    const id = idPrefix + digest.slice(0, 32)
    if (!used.has(id)) return id
  }
  throw new Error('procedure-id-exhausted')
}

// ═══ ★F4 接线（2026-11-08）：相似度查重 ═══
//
// 背景：#457 上游已 CLOSED，但 procedureSimilarityPre 在上游全仓零调用点（alpha.6 /
// alpha.7 preview c2dee738 逐条复核仍如此）⇒ 「换措辞的同一条流程」依旧重复入库。
// 本仓把该纯函数**原样移植**（来源 c2dee738:lib/procedure-observation.js，逐字节同源），
// 并在两个调用点接线：① index.js 的 proceduresFindDuplicatePre 第三路判据；
// ② memory-hub.js 的 procedure 自动喂入层（此前 observe(cand) 完全绕过查重 ——
// 作者在 #457 原话：「接线时两处都要处理，只接一处就是半修」）。
//
// 阈值 0.62 的出处：作者在 #457 的实测 —— A/B 用例 0.673074 应判重、
// AG591 V7.3~V7.9 = 0.3848 不应判重。抽成导出常量供测试直接 import 断言，
// 不允许在调用点写死第二份字面量。

/** 判重相似度阈值（#457 作者实测口径；测试直接 import 本常量断言，调用点禁止另写字面量）。 */
export const PROCEDURE_DUP_SIMILARITY_THRESHOLD_PRE_V1 = 0.62

/** CJK 字符类（含扩展 A；不含标点）。 */
const PROC_CJK_RE = /[\u3400-\u4dbf\u4e00-\u9fff]+/g
/** ASCII 词：至少含 2 个字母或数字（纯标点不算词）。 */
const PROC_WORD_RE = /[a-z0-9][a-z0-9_.+\/-]*/g

/** token 化（导出仅供测试复算口径）。 */
export function procedureTokensPre(text) {
  const s = String(text == null ? '' : text).toLowerCase()
  const out = []
  for (const m of s.match(PROC_WORD_RE) || []) {
    if (String(m).replace(/[^a-z0-9]/g, '').length >= 2) out.push('w:' + m)
  }
  for (const m of s.match(PROC_CJK_RE) || []) {
    const run = String(m)
    if (run.length === 1) { out.push('c:' + run); continue }
    for (let i = 0; i + 1 < run.length; i++) out.push('c:' + run.slice(i, i + 2))
  }
  return out
}

/** 步骤数组 → 每步一份 token 集合（非数组/空步被丢弃）。 */
function procedureStepTokensPre(steps) {
  const list = Array.isArray(steps) ? steps : []
  const out = []
  for (const s of list) {
    const toks = procedureTokensPre(s)
    if (toks.length) out.push(toks)
  }
  return out
}

/** Jaccard（集合口径；两边都空 ⇒ 0，不声称相似）。 */
function procedureJaccardPre(a, b) {
  const A = new Set(a)
  const B = new Set(b)
  if (!A.size && !B.size) return 0
  let inter = 0
  for (const x of A) if (B.has(x)) inter++
  return inter / (A.size + B.size - inter)
}

/** 顺序无关的步骤集合相似度（双向最优匹配平均）。 */
function procedureStepMatchPre(stepsA, stepsB) {
  if (!stepsA.length || !stepsB.length) return 0
  const directed = (X, Y) => {
    let sum = 0
    for (const x of X) {
      let best = 0
      for (const y of Y) {
        const s = procedureJaccardPre(x, y)
        if (s > best) best = s
      }
      sum += best
    }
    return sum / X.length
  }
  return (directed(stepsA, stepsB) + directed(stepsB, stepsA)) / 2
}

/**
 * 流程相似度（#457 口径，移植自上游 c2dee738）：标题 Jaccard × 0.15 + 步骤双向最优匹配 × 0.85；
 * 只有一边有步骤时退回纯标题相似度（保自反性）；两边全空 ⇒ 0（不声称相似）。
 */
export function procedureSimilarityPre(a, b) {
  const A = a && typeof a === 'object' ? a : {}
  const B = b && typeof b === 'object' ? b : {}
  const titleA = procedureTokensPre(A.title)
  const titleB = procedureTokensPre(B.title)
  const stepsA = procedureStepTokensPre(A.steps)
  const stepsB = procedureStepTokensPre(B.steps)
  if (!titleA.length && !titleB.length && !stepsA.length && !stepsB.length) return 0
  const titleScore = procedureJaccardPre(titleA, titleB)
  const stepScore = procedureStepMatchPre(stepsA, stepsB)
  const hasBothSteps = stepsA.length > 0 && stepsB.length > 0
  const score = hasBothSteps ? 0.15 * titleScore + 0.85 * stepScore : titleScore
  return Math.max(0, Math.min(1, Number(score.toFixed(6))))
}
