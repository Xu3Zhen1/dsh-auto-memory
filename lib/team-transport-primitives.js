/**
 * team-transport-primitives —— 传输层两个后端（S3/memory 与 http）共用的**纯函数单一实现处**。
 *
 * ★2026-11-12（切片 `dedupe-transport-primitives`）：本模块是纯提取，**零行为变更**。
 *   提取前 `lib/team-transport.js` 与 `lib/team-transport-http.js` 各自私有实现同一组
 *   7 个纯函数，`DRY-C1` 报 19 处跨文件重复块（全仓最大的一对）。
 *   实测两侧这 7 个函数在 **35 个边界用例上 0 差异**（见交付报告的对拍脚本），故可安全收口。
 *
 * ★★ 为什么这次能收口（上一轮判过"不可"，现在推翻了）：
 *   旧判断依据是 `lib/team-transport.js` L510–515 的注释——「两文件互相引用会造成 ESM
 *   循环 import 的 TDZ 问题，故改用装配层注入」。但实测**两文件现在并不互相引用**：
 *     · `lib/team-transport-http.js` 只 import `node:http` / `node:https`
 *     · `lib/team-transport.js` 只 import `node:crypto` 与 `team-primitives-notrim.js`
 *   而**第三个模块**（本文件）被两侧同时导入时，依赖图是 `transport → 本模块 ← http`，
 *   两条边都指向叶子，**不构成环**。⇒ 那条 TDZ 顾虑针对的是「http → transport」的方向，
 *   本片正是避开它，而不是绕过它。
 *
 * ⚠️ 键语义契约（改这里 = 改三个后端的存储键）：
 *   `withPrefix` / `withoutPrefix` / `trimSlashes` 是 S3Backend / MemoryBackend / HttpBackend
 *   三者**键必须逐字节相同**的唯一实现。任何改动都会让一个后端与另两个的键空间分裂，
 *   表现为「写入用一个键、读取用另一个键」——那种缺陷不会崩，只会静默读不到。
 *
 * 语义依赖：`toText` / `safeGet` 来自 `lib/team-primitives-notrim.js`（**不 trim** 版，
 * 与前序片收口的 trim 版不同，两者不可合并 —— 详见该模块头注）。
 */

import { toText, safeGet } from './team-primitives-notrim.js'

/**
 * 安全取错误消息，回退链：`error.message` → `String(error)` → 空串。
 *
 * 注意末环是**空串**（不是 `'unknown-error'`）—— 与 `lib/team-primitives.js` 那版不同；
 * 传输层用空串表示「取不到消息」，由调用方决定如何渲染。
 */
function safeMessage(error) {
  try { return toText(safeGet(error, 'message')) || toText(error) } catch (_) { return '' }
}

/** 诊断钩子：可缺省，且自身异常绝不放大（失败不放大）。 */
function safeDiag(diag, message) {
  if (typeof diag !== 'function') return
  try { diag(toText(message)) } catch (_) { /* diag 自身异常不得影响主流程 */ }
}

/** 去掉首尾斜杠（键归一化的第一步）。 */
function trimSlashes(value) {
  return toText(value).replace(/^\/+/, '').replace(/\/+$/, '')
}

/** 拼团队前缀（两个后端共用 —— 键语义必须唯一）。 */
function withPrefix(prefix, key) {
  const k = trimSlashes(key)
  if (!prefix) return k
  if (!k) return prefix
  return prefix + '/' + k
}

/** 去团队前缀（两个后端共用）。 */
function withoutPrefix(prefix, stored) {
  if (!prefix) return stored
  const p = prefix + '/'
  return stored.indexOf(p) === 0 ? stored.slice(p.length) : stored
}

/** 值归一化为 Buffer（string / Buffer / TypedArray / 其它走 String）。 */
function toBuffer(value) {
  if (Buffer.isBuffer(value)) return value
  if (value instanceof Uint8Array) return Buffer.from(value)
  return Buffer.from(toText(value), 'utf8')
}

/** 全序比较器（码元序，非 localeCompare）—— 跨机收敛要求全序，键唯一即可满足。 */
function compareKeys(a, b) {
  const x = toText(a)
  const y = toText(b)
  if (x === y) return 0
  return x < y ? -1 : 1
}

export { safeMessage, safeDiag, trimSlashes, withPrefix, withoutPrefix, toBuffer, compareKeys }