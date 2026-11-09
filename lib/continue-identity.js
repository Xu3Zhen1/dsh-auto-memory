/** continue-identity.js —— D1：接续「待续身份」桥（不依赖 agent 出现时刻）。
 *
 * 背景（见 docs / 草案 §2）：
 *   hostAutoContinue 只有 sc.prompt 之后才拿得到新会话 agent（index.js 同处注释已写明），
 *   而新会话首回合注入发生在 prompt 之后、rt.projectTag 写入之前。
 *   没有这张表时，首屏 [身份] 会回落工作区根，handoff/projects 副本也选不到。
 *
 * 设计：
 *   - create 后 / prompt 前写 pending 一条（projectTag + 源会话 + contSeq + at）；
 *   - whoiamIdentityFor 在 rt.projectTag 为空时按 session.id 查表并懒回填 rt（唯一回填点）；
 *   - 回填成功 / 续接收尾 / 超时（TTL 10 分钟）/ 失败清理 四路删除。
 * 纪律：写失败绝不阻断接续；读失败一律 fail-soft（返回空表或 null），不抛。
 */
import path from 'node:path'
import { resolveDshHomePre } from './dsh-home.js'
import { readStateJson, writeStateJson } from './continuation-state.js'

export const CONTINUE_IDENTITY_FILE = 'continue-identity-pending.json'
export const CONTINUE_IDENTITY_TTL_MS = 10 * 60 * 1000

const emptyState = () => ({ version: 1, bySession: {} })
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v)

/** 待续身份表的绝对路径（overrideDir 供测试注入）。 */
export function continueIdentityFilePre(overrideDir) {
  const dir = overrideDir || path.join(resolveDshHomePre(), 'memory')
  return path.join(dir, CONTINUE_IDENTITY_FILE)
}

/** 解析并清洗状态：无效条目静默丢弃（这是短生命周期缓存，不是权威账本）。 */
export function parseContinueIdentityStatePre(v) {
  if (!isObj(v) || v.version !== 1 || !isObj(v.bySession)) throw new Error('invalid continue-identity state')
  const out = { version: 1, bySession: {} }
  for (const [sid, rec] of Object.entries(v.bySession)) {
    if (!isObj(rec)) continue
    const projectTag = typeof rec.projectTag === 'string' ? rec.projectTag.trim() : ''
    const at = Number(rec.at) || 0
    if (!sid || !projectTag || !at) continue
    out.bySession[sid] = {
      projectTag,
      sourceSessionId: typeof rec.sourceSessionId === 'string' ? rec.sourceSessionId : '',
      contSeq: Number(rec.contSeq) || 0,
      at,
    }
  }
  return out
}

/** 丢弃过期条目（TTL）。 */
export function pruneContinueIdentityPre(state, now) {
  const base = parseContinueIdentityStatePre(state)
  const out = { version: 1, bySession: {} }
  for (const [sid, rec] of Object.entries(base.bySession)) {
    if (now - rec.at < CONTINUE_IDENTITY_TTL_MS) out.bySession[sid] = rec
  }
  return out
}

function readPruned(file) {
  const raw = readStateJson(file, emptyState(), parseContinueIdentityStatePre)
  return pruneContinueIdentityPre(raw, Date.now())
}

/** 读表（损坏/不可读 ⇒ 空表；绝不抛）。 */
export function loadContinueIdentityPre(file) {
  try { return readPruned(file) } catch (e) { return emptyState() }
}

/** 写表（先清洗再原子写；损坏输入 ⇒ 抛给调用方，由引擎侧 fail-soft）。 */
export function saveContinueIdentityPre(file, state) {
  const clean = pruneContinueIdentityPre(state, Date.now())
  writeStateJson(file, clean)
  return clean
}

/** 写入/覆盖一条待续身份。 */
export function putContinueIdentityPre(file, rec) {
  const sid = String((rec && rec.sessionId) || '')
  const projectTag = String((rec && rec.projectTag) || '').trim()
  if (!sid || !projectTag) throw new Error('putContinueIdentityPre: sessionId/projectTag required')
  const st = loadContinueIdentityPre(file)
  st.bySession[sid] = {
    projectTag,
    sourceSessionId: String((rec && rec.sourceSessionId) || ''),
    contSeq: Number(rec && rec.contSeq) || 0,
    at: Number(rec && rec.at) || Date.now(),
  }
  saveContinueIdentityPre(file, st)
  return st.bySession[sid]
}

/** 按会话 id 查（过期即删并返回 null）。 */
export function lookupContinueIdentityPre(file, sessionId, now) {
  const sid = String(sessionId || '')
  if (!sid) return null
  const at = Number.isFinite(now) ? Number(now) : Date.now()
  let st = emptyState()
  // ★读**未剪枝**的原表：命中过期项时要能就地删除并回写（若先剪枝，盘上陈旧项会永远留着）。
  try { st = parseContinueIdentityStatePre(readStateJson(file, emptyState(), parseContinueIdentityStatePre)) } catch (e) { return null }
  const rec = st.bySession[sid]
  if (!rec) return null
  if (at - rec.at >= CONTINUE_IDENTITY_TTL_MS) {
    try { delete st.bySession[sid]; saveContinueIdentityPre(file, st) } catch (e) {}
    return null
  }
  return { projectTag: rec.projectTag, sourceSessionId: rec.sourceSessionId, contSeq: rec.contSeq, at: rec.at }
}

/** 删除一条（不存在返回 false）。 */
export function removeContinueIdentityPre(file, sessionId) {
  const sid = String(sessionId || '')
  if (!sid) return false
  let st = emptyState()
  try { st = readPruned(file) } catch (e) { return false }
  if (!st.bySession[sid]) return false
  delete st.bySession[sid]
  try { saveContinueIdentityPre(file, st) } catch (e) { return false }
  return true
}

/** 清过期（返回清理条数；异常返回 0）。 */
export function cleanupContinueIdentityPre(file, now) {
  const at = Number.isFinite(now) ? Number(now) : Date.now()
  let st = emptyState()
  // ★读**未剪枝**的原表：先剪枝会让 before 计数失真（过期项已被丢掉 ⇒ removed 恒 0）。
  try { st = parseContinueIdentityStatePre(readStateJson(file, emptyState(), parseContinueIdentityStatePre)) } catch (e) { return 0 }
  const before = Object.keys(st.bySession).length
  const clean = pruneContinueIdentityPre(st, at)
  const removed = before - Object.keys(clean.bySession).length
  if (removed > 0) { try { writeStateJson(file, clean) } catch (e) { return 0 } }
  return removed
}
