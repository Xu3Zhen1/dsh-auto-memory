# 技术设计：传输层 7 个纯函数收口

## 方案摘要

新建 `lib/team-transport-primitives.js`（承载 7 个纯函数，语义依赖 `team-primitives-notrim.js`），
两个传输后端模块都改为从它具名导入。零行为变更。

## 复用清单（DRY · 强制）

| 现有模块路径 | 提供什么能力 | 本次如何复用 |
| :-- | :-- | :-- |
| `lib/team-primitives-notrim.js` | `toText`（不 trim）/ `safeGet`（只挡 null/undefined），零依赖叶子 | **直接复用**（新模块 import 它） |
| `lib/team-transport.js` | S3/memory 后端；内含 7 个纯函数私有实现 | 迁出，改为导入 |
| `lib/team-transport-http.js` | T2 HTTP 后端；内含 9 个纯函数私有实现 | 迁出 `toText`/`safeGet`（→notrim）与 7 个（→新模块） |
| `lib/team-primitives.js` | trim 版 `toText` + truthiness 版 `safeGet` | **不适用**：语义不同（实测 7 个边界输入差 3、44 个用例差 5），合并会静默改键语义 |
| `lib/diag-throttle.js` | 诊断节流 | **不适用**：与传输键语义无关 |

无新增第三方依赖（新模块只 import 一个本地零依赖叶子）。

## 接口契约

进程内单包插件，无前后端边界。契约真源：

| 契约真源路径 | 承载什么 | 谁引用 |
| :-- | :-- | :-- |
| `lib/team-transport-primitives.js` | `safeMessage` / `safeDiag` / `trimSlashes` / `withPrefix` / `withoutPrefix` / `toBuffer` / `compareKeys` 的**唯一实现** | `lib/team-transport.js`、`lib/team-transport-http.js` |

**键语义契约（磁盘/服务端存储键，改这里等于改三个后端的契约）**：
`withPrefix(prefix, key)` = `prefix + '/' + trimSlashes(key)`（前缀或键为空时退化），
`withoutPrefix(prefix, stored)` 为其逆。三者（含 `trimSlashes`）必须**逐字节**一致，
否则 S3Backend / MemoryBackend / HttpBackend 之间「写入键 ≠ 读取键」，表现为静默读不到。

**依赖图契约（本片的核心不变量）**：
```
team-transport.js ──┐
                    ├─→ team-transport-primitives.js ─→ team-primitives-notrim.js（叶子）
team-transport-http.js ─┘
```
两条边都指向叶子，**无环**。禁止 `team-transport-http.js → team-transport.js` 的反向边
（那才是原本注释担心的 TDZ 场景），由 I4-5 递归判据守着。

## 结构决策

**为什么这次能收口，而上一轮判「不可」：**

上一轮依据是 `lib/team-transport.js` L510–515 的注释（「两文件互相引用造成 TDZ ⇒ 改装配层注入」）。
但实测两文件**当前并不互相引用**；引入**第三个**模块后依赖图无环。
⇒ 那条顾虑针对 `http → transport` 方向，本片避开它。

**为什么不把 7 个函数直接加进 `team-primitives-notrim.js`：**
那个模块的职责是「通用安全访问原语」（`toText`/`safeGet`，被 team-sync / global-brief 等共用）；
`withPrefix`/`withoutPrefix`/`toBuffer` 等是**传输键语义**，只有两个传输后端用。
混入会让「通用原语」变成杂货铺。分层：通用原语 ← 传输原语。

## 刻意不采用的模式

| 模式 | 为什么不采用 |
| :-- | :-- |
| 用类/命名空间对象导出 7 个函数 | 调用点是裸调用（`trimSlashes(x)`），改成 `P.trimSlashes(x)` 要动 60+ 处，diff 无法审查 |
| 让 http 从 transport 导入（而非第三模块） | 造出 `http → transport` 反向依赖，正是 TDZ 场景；且语义上传输后端不该依赖另一个后端 |
| 把 `toBuffer` 做成可配置（返回 Buffer 还是 Uint8Array） | 三个后端都要求 Buffer；加开关只会诱导未来传别的值 |
| 合并两个后端模块本身 | 职责不同（S3 签名/分片 vs HTTP 请求构造），合并造成编译期耦合 |

## 验证方式

1. **行为对拍**：改前（基 `8a9cad48` 的 http 侧副本源码抽取）vs 改后（真 import），
   49 个边界用例 → 0 差异。
2. **I4 判据改写后的三条负控**（均真红且命中预期判据）：
   - http 引入 `node:fs` ⇒ `I4-2`
   - 链上模块偷偷写盘（`node:fs` + 别名调用）⇒ `I4-4` / `I4-4b`（**原判据完全抓不到**）
   - http 依赖 `team-transport.js` ⇒ `I4-5`（**原判据完全抓不到**）
3. `DRY-C1` 44 → 22；`KISS-C1` 保持 2092。
4. 全量回归（分母 460）失败集不新增。