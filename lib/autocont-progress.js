/**
 * ★2026-11-26（用户口径「到位后的压缩次数」的**唯一实现**）：从会话事件回算。
 *
 * 为什么必须回算、而不是记一个运行时零点：
 *  · 零点记在 runtime 里 ⇒ 重启即丢，用户每次重启都要重新攒 N 次压缩（实测重启后 8 分钟才 +1）；
 *  · 更要紧的是语义：真正该问的是「**这个会话历史上**轮次/步数/用量到位之后，又压缩过几次」，
 *    而不是「插件这次启动之后压缩过几次」。gochat 实测：base 于 2026-11-25T00:45 到位，
 *    之后又压缩 7 次 —— 运行时零点只看到 1 次，事件回算才看到 7 次。
 *
 * 做法：一次顺序扫描 events，边累加 steps（assistant/message）/ turns（turn/end）/ tokens（usage 四桶），
 * 记下**首次**同时满足全部 base 条件的位置（下标 + 当时压缩次数），之后每遇 `compaction/start` 就 +1。
 *
 * base 条件取规则里的 base 层：显式 `tier:'base'`，或 tierMode!=='off' 时按 key 推断（steps/turns/tokens）。
 * 传空规则 ⇒ baseMet=true、baseIndex=0（等价「没有前置闸」）。
 */

const BASE_KEYS = ['steps', 'turns', 'tokens']

function pickBaseRules(rules, tierMode) {
  const autoTier = tierMode !== 'off'
  const base = []
  const rs = Array.isArray(rules) ? rules : []
  for (const r of rs) {
    if (!r || typeof r !== 'object' || r.off === true) continue
    const k = String(r.k || '')
    if (!BASE_KEYS.includes(k)) continue
    const tier = r.tier === 'trigger' ? 'trigger' : (r.tier === 'base' ? 'base' : (autoTier ? 'base' : ''))
    if (tier !== 'base') continue
    const op = String(r.op || '>=')
    const v = Number(r.v)
    if (!Number.isFinite(v)) continue
    base.push({ k: k, op: op, v: v })
  }
  return base
}

function ruleOk(a, r) {
  if (!Number.isFinite(a)) return false
  if (r.op === '>=') return a >= r.v
  if (r.op === '>') return a > r.v
  if (r.op === '==') return a === r.v
  if (r.op === '<') return a < r.v
  if (r.op === '<=') return a <= r.v
  return false
}

/**
 * @param {Array} events 会话事件（宿主 session events，元素含 type / data）
 * @param {Array} rules   autoContinueRules
 * @param {string} tierMode 'auto' | 'off' | undefined
 * @param {(usage:object)=>number|null} usageTokens 四桶求和函数（由调用方注入，避免本模块依赖 water-window）
 * @returns {{baseMet:boolean, baseIndex:number, totalCompactions:number, compactionsAfterBase:number}}
 */
export function autoContinueCompactionProgressPre(events, rules, tierMode, usageTokens) {
  const list = Array.isArray(events) ? events : []
  const base = pickBaseRules(rules, tierMode)
  const sum = typeof usageTokens === 'function' ? usageTokens : function () { return null }
  let steps = 0, turns = 0, tokens = 0, totalCompactions = 0
  let baseIndex = -1
  let compactionsAtBase = 0
  const satisfied = function () {
    for (const r of base) {
      const a = r.k === 'steps' ? steps : (r.k === 'turns' ? turns : tokens)
      if (!ruleOk(a, r)) return false
    }
    return true
  }
  for (let i = 0; i < list.length; i++) {
    const ev = list[i]
    if (!ev || typeof ev !== 'object') continue
    // 先判 base：base 一旦成立就立刻定格（其后的压缩才计入「到位之后」）
    if (baseIndex < 0 && satisfied()) { baseIndex = i; compactionsAtBase = totalCompactions }
    if (ev.type === 'compaction/start') { totalCompactions++; continue }
    if (ev.type === 'assistant/message') {
      steps++
      const n = sum(ev.data && ev.data.usage)
      if (n !== null && Number.isFinite(n)) tokens += n
    } else if (ev.type === 'turn/end') {
      turns++
    }
  }
  // base 在最后一个事件之后才成立（或事件为空且 base 为空）时也要定格
  if (baseIndex < 0 && satisfied()) { baseIndex = list.length; compactionsAtBase = totalCompactions }
  const baseMet = base.length === 0 ? true : baseIndex >= 0
  return {
    baseMet: baseMet,
    baseIndex: baseIndex,
    totalCompactions: totalCompactions,
    compactionsAfterBase: baseIndex < 0 ? 0 : Math.max(0, totalCompactions - compactionsAtBase),
  }
}
