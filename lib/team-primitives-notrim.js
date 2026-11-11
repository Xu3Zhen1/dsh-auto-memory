/**
 * team-primitives-notrim —— 「**不 trim**」安全访问原语的单一实现处。
 *
 * ★2026-11-12（切片 `dedupe-notrim-family`）：本模块是纯提取，**零行为变更**。
 *   提取前 `lib/team-transport.js`、`lib/team-sync.js`、`lib/global-brief.js` 三处
 *   各自私有实现了逐字节相同的 `toText` / `safeGet`，`DRY-C1` 报 6 处跨文件重复块
 *   （global-brief ↔ team-sync / team-transport / team-transport-http 各 2–3 块）。
 *
 * ★★ 与 `lib/team-primitives.js` 的**根本区别**（改动前必读）：
 *   那个模块的 `toText` **会 trim**（服务于"从宿主/配置里抠出可比较的标识"：token、成员 id、角色名）；
 *   本模块的 `toText` **不 trim**（服务于"键与载荷字节"，trim 会破坏键语义）。
 *   实测 7 个边界输入中 3 个结果不同（`'  x  '` / `'  '` / `'\n\t'`）。
 *   两个 `safeGet` 也不等价：本模块判据是 `target === null || target === undefined`（**只挡空值**），
 *   而 team-primitives 版是 `holder ? … : undefined`（**falsy 全挡**）。
 *   实测 44 个用例中 5 个不同 —— 全部是「falsy 但不是 null/undefined 的 holder」上读
 *   `length` / `toString` 这类**继承属性**的场景（如 `safeGet('', 'length')`：
 *   本模块得 `0`，team-primitives 版得 `undefined`）。
 *   ⇒ **两个模块不可合并**。合并会静默改变传输层的键语义。
 *
 * ★ 为什么用「裸 function + 末尾 export {}」而不是 `export function`：
 *   `DRY-C1` 的窗口是「规范化后 6 行逐字相同」。若写成 `export function toText(`，首行与
 *   `team-transport-http.js` 里的裸 `function toText(` 不同，窗口整体错位 ⇒ **该配对的重复
 *   会被检测不到**（实测：本模块 3 块与 http 副本的真实重复会消失）。
 *   那不是"消除了重复"，是"骗过了判据"。故此处坚持裸声明 + 末尾导出，让判据如实报出。
 *
 * ⚠️ 本模块**零 import**，可被任何半边无副作用引入。
 */

/**
 * 保守转字符串：任何异常都退回空串（不抛）。**保留前后空白**。
 *
 * @param {*} value 任意值
 * @returns {string} 字符串（null/undefined ⇒ ''；任何异常也 ⇒ ''，不抛）
 */
function toText(value) {
  if (typeof value === 'string') return value
  if (value === null || value === undefined) return ''
  try { return String(value) } catch (_) { return '' }
}

/**
 * 安全取属性：getter 抛错也不外抛。**只挡 null/undefined，不挡其它 falsy**。
 *
 * 语义细节（易被"优化"错的点）：判据是 `target === null || target === undefined`，
 * **不是** `target ? …`。因此 `safeGet('', 'length')` 得 `0`、`safeGet(0, 'toString')`
 * 得原生函数 —— 而 truthiness 版本会得 `undefined`。这不是疏漏：本模块服务于传输层，
 * 那里 holder 可能是字符串/数字等原始值，按 truthiness 挡会丢掉合法读值。
 *
 * @param {*} target 持有者
 * @param {string} key 属性名
 * @returns {*} 属性值或 undefined（任何异常 ⇒ undefined，不抛）
 */
function safeGet(target, key) {
  try { return target === null || target === undefined ? undefined : target[key] } catch (_) { return undefined }
}

export { toText, safeGet }
