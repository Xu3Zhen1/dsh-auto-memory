/**
 * team-primitives —— 团队子系统共用的「安全访问原语」**唯一实现处**。
 *
 * ★2026-11-12（重构切片 `changes/dedupe-auth-identity`）：本模块是纯提取，**零行为变更**。
 *   提取前 `lib/team-auth.js` 与 `lib/team-identity.js` 各自私有实现了同一组 4 个函数
 *   （规范化为逐字节相同），机器判据 `DRY-C1` 报 9 处跨文件重复块。
 *
 * 为什么必须收口（可观察的坏事，不是「重复难看」）：
 *   `safeGet` 的契约是「getter 抛错也不外抛」。若某天只在 `team-auth` 里改它的降级形态，
 *   而忘了同步 `team-identity`，同一宿主在两处 seam 上就会得到**不同的降级行为**
 *   —— 一处返回 undefined、一处该吞的抛。这类缺陷两侧套件都绿，**不会有任何测试变红**。
 *   本仓已因同型理由收口过一次：`lib/config-lock.js` 头注明确「门回收判据只有一份实现」，
 *   直接复用 `lib/shared-state-lock.js` 的回收函数，理由原文是「改一处漏一处就会变成半修」。
 *
 * ★★ 边界（改动前必读）：**不要**把 `lib/team-transport.js` / `lib/team-transport-http.js`
 *   的同名函数并进来。它们看起来同名，**语义不同**：那里的 `toText` **不做 trim**
 *   （实测 `toText('  x  ')`：本模块得 `'x'`，传输层得 `'  x  '`；7 个边界输入里 3 个不同）。
 *   合并即静默改变传输层行为 ⇒ 传输层那两组必须各自独立立片、单独论证。
 *
 * 本模块**零 import**（连 node: 内置都不需要）—— 保持可被任何半边无副作用的引入。
 */

/**
 * 保守转字符串：**保留前后空白**（本仓 `team-auth` / `team-identity` 公用的 trim 版）。
 *
 * 与传输层的同名函数不同：这里**会** trim。之所以 trim，是因为这 4 个原语服务于
 * 「从宿主/配置里抠出一个可比较的标识」（token、成员 id、角色名），空白是噪声；
 * 而传输层处理的是**键与载荷字节**，trim 会破坏键语义。
 *
 * @param {*} value 任意值
 * @returns {string} 字符串（null/undefined ⇒ ''；任何异常也 ⇒ ''，不抛）
 */
export function toText(value) {
  if (value === null || value === undefined) return ''
  try { return String(value).trim() } catch (_) { return '' }
}

/**
 * 安全取值：holder 上带抛错 getter 时也不外抛。
 *
 * 语义细节（易被"优化"错的点）：判据是 `holder ? …: undefined`，**不是**
 * `typeof holder === 'object'`。因此 `holder = 'abc'` 时读 `holder.length` 会得 3，
 * 而 `holder = 0` / `''` / `false` / `null` 都走 falsy 分支得 undefined。
 * 这不是疏漏 —— 前序实现在两侧都把 falsy holder 统一归一为 undefined，
 * 搬进本模块时**逐字保留**，不得改写成更"规范"的判据。
 *
 * @param {*} holder 持有者（对象 / 字符串 / falsy）
 * @param {string} key 属性名
 * @returns {*} 属性值或 undefined（任何异常 ⇒ undefined，不抛）
 */
export function safeGet(holder, key) {
  try { return holder ? holder[key] : undefined } catch (_) { return undefined }
}

/**
 * 诊断回调：可缺省，且**自身异常绝不放大**。
 *
 * diag 是宿主注入的可选钩子。它抛错时若冒泡，会顶掉调用方真正的业务错误面
 * （本仓已多次踩到「可观测性代码把真实故障掩盖成另一条报错」）。
 *
 * @param {Function|undefined} diag 诊断钩子
 * @param {*} message 消息（**不**在此处 toText：由 diag 自行决定如何渲染）
 * @returns {void}
 */
export function safeDiag(diag, message) {
  try { if (typeof diag === 'function') diag(message) } catch (_) {}
}

/**
 * 安全取错误消息，带回退链：`error.message` → `String(error)` → `'unknown-error'`。
 *
 * 注意回退链的最后一环是**字面量** `'unknown-error'`，不是空串 —— 因为下游把它拼进
 * reason 字段，空串会让「有错误但说不清是什么」与「完全没有错误」不可区分。
 *
 * @param {*} error 任意错误形态（Error / 字符串 / 对象 / null）
 * @returns {string} 非空错误描述
 */
export function safeMessage(error) {
  return toText(error && error.message) || toText(error) || 'unknown-error'
}
