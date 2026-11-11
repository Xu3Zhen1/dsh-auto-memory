# 复用清单（DRY 强制）

| 现有模块路径 | 提供什么能力 | 本次如何复用 |
| :-- | :-- | :-- |
| `lib/team-transport.js` | 传输后端；内含 notrim 版 `toText` / `safeGet` 私有实现 | 迁出这两份实现，改为导入；其余逻辑不动 |
| `lib/team-sync.js` | 团队同步；内含同款实现 | 同上 |
| `lib/global-brief.js` | 全局简报；内含同款实现 | 同上 |
| `lib/team-primitives.js` | trim 版 `toText` + truthiness 版 `safeGet` | **不适用（刻意不复用）**：语义不同（实测 7 个边界输入中 3 个不同、44 个用例中 5 个不同）。合并会静默改传输层行为 |
| `lib/team-transport-http.js` | T2 后端；含同形实现 | **不适用**：该文件被 I4/I4b 钉死为「import 面恰好 2 条、不含 team-transport」 |

无新增第三方依赖（`lib/team-primitives-notrim.js` 零 import）。

# 接口契约

进程内单包插件，无前后端边界。契约真源为 notrim 原语的唯一实现处：

| 契约真源路径 | 承载什么 | 谁引用 |
| :-- | :-- | :-- |
| `lib/team-primitives-notrim.js` | `toText`（不 trim）/ `safeGet`（只挡 null/undefined）的唯一实现与语义注释 | `lib/team-transport.js`、`lib/team-sync.js`、`lib/global-brief.js` |

**差异契约**：本模块与 `lib/team-primitives.js` **必须保持语义不同**，由
`tests/smoke/smoke-test-team-primitives-notrim.mjs` 的 C 组（双向差异锁）钉死。
任何人想合并两份实现，必须先让 C 组变红并修改它 —— 那就是一次需要显式论证的行为变更。

# 目标
对本仓库的 DRY 债务继续做「纯提取」式收口：把 notrim 家族三文件里逐字节相同的
`toText` / `safeGet` 收口到单一实现处，且**不改变任何行为**。

# 非目标（三行硬约束）
- 不改 `team-transport-http.js`：该文件被 I4/I4b 守卫钉死为 import 面恰好 2 条。
- 不与 `lib/team-primitives.js` 合并：两版语义实测不同（trim vs 不 trim、truthiness vs 只挡空值）。
- 不动 `index.js` / `client.js`：前者受 r26 哈希锁、后者此次不涉及。

# 验收标准
- `DRY-C1` 从 65 降到 54；`KISS-C1` 保持 2092 不变多；`YAGNI-C1` 保持 0。
- 新增差异锁套件在两次变异下均真红（trim 语义、truthiness 判据）。
- 全量回归（分母 459）失败集不新增。

# 已试方案与失败原因
- **方案：与 `team-primitives.js` 合并成一个模块** → 否决：两版 `safeGet` 实测 44 用例差 5
  （`safeGet('', 'length')` 一版得 `0`、一版得 `undefined`），合并即静默改传输层行为。
- **方案：新模块用 `export function` 前缀** → 否决：DRY 窗口首行错位，会漏检 3 块真实重复
  （报 51 块 vs 裸声明报 54 块）⇒ 属"骗过判据"而非"消除重复"。
- **方案 B：让 `team-transport.js` 导出、另两文件导入** → 否决：净减 6 但只动 2 文件，
  且会让 `team-transport.js` 承担"公共模块"职责，依赖方向变假。

# 进度与下一步
- 已完成：新建 `lib/team-primitives-notrim.js`（裸 function + 末尾 export）、三文件改为具名导入。
- 已完成：`tests/smoke/smoke-test-team-primitives-notrim.mjs`（30 断言，含双向差异锁 A/B/C 组）。
- 已完成：负控两次均真红（trim 语义 → A13/A14 红；truthiness → B5/B6/B7 红）。
- 待做：全量回归比对；提交；更新报告。
