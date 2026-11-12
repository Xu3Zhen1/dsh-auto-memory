# 技术设计：config-lock 复用 shared-state-lock 的 claim

## 方案摘要

`lib/shared-state-lock.js` 末尾导出 `claim`；`lib/config-lock.js` 删掉本地副本改为导入
（该 import 语句**已存在**，本片只是把导入清单加一项）。零行为变更。

## 复用清单（DRY · 强制）

| 现有模块路径 | 提供什么能力 | 本次如何复用 |
| :-- | :-- | :-- |
| `lib/shared-state-lock.js` | 锁协议全套：`claim` / `claimSync` / `removeDead` / `reclaimDeadGate` / `isDead` | **直接复用** 其 `claim`（逐字节相同，实测 SAME） |
| `lib/config-lock.js` | 配置事务锁；已 **import shared-state-lock**（L12 `reclaimDeadGate`） | 迁出 `claim`，导入清单加一项 |
| `lib/diag-throttle.js` | 诊断节流（前序片收口） | **不适用**：与锁无关 |
| `lib/team-primitives-notrim.js` | 安全访问原语（前序片收口） | **不适用**：锁模块不读宿主对象 |

无新增第三方依赖。

## 接口契约

进程内单包插件，无前后端边界。契约真源：

| 契约真源路径 | 承载什么 | 谁引用 |
| :-- | :-- | :-- |
| `lib/shared-state-lock.js` | `claim(file)`：`openSync(file,'wx')` 原子独占 + 写入 `{pid, host}` owner 元数据；失败时**关 fd 并 unlink 后重抛** | `lib/config-lock.js`、`lib/shared-state-lock.js` 自身 |

**原子性契约**：`claim` 的互斥性来自 `openSync(file, 'wx')` 的**原子独占创建**，不是来自任何
后续检查。任何"先 unlink 再创建"、"先 stat 再 create"的改写都会**破坏互斥**——
这是本片负控所验证的不变量（实测：该改写让 `smoke-test-issue341-lockgate` 报
`★#341 负路径:活主门必须照旧超时 :: NO-THROW` + `活主门逐字节未被改动 :: DELETED`）。

**owner 元数据契约**：字段 `{pid, host}` 被 `removeDead` 的死主判定消费
（`owner.host !== os.hostname()` ⇒ 不回收；`Number.isInteger(pid) && pid > 0` ⇒ 才判死）。
⚠️ **删掉 `host` 字段是等价变异（本机测不出）**：同机回环环境下 `host` 恒等于自身，
只有跨机场景才暴露。已实测确认锁套件对此变异全绿 —— 该不变量目前**无本机可观测的判据**，
是已知覆盖缺口，记录在此不遮掩。

## 结构决策

**为什么不新建第三个模块把两边的锁原语都放进去：**

`lib/config-lock.js` 已经 import `lib/shared-state-lock.js`（既有依赖方向成立）。新建第三个模块会让
两个锁模块都依赖它，而它承载的东西（`claim`）只有两份副本 —— 等于为「两个使用者」造一层
中间层，同时**把 `claim` 从 `lib/shared-state-lock.js` 的实现上下文里剥离**（该模块头注解释了
claim 与 `reclaimDeadGate` 的配套关系）。直接从既有模块导出，依赖方向不变、上下文不丢。

> 实测佐证：在 `lib/team-transport.js` 那片试过「抽到第三个模块、只改一侧」，
> DRY 从 54 **升到 62** —— 新模块成了另一侧的新配对对象。⇒ 抽到第三个文件只在**两侧都改用它**时减少块数。

## 刻意不采用的模式

| 模式 | 为什么不采用 |
| :-- | :-- |
| 把 `claim` 与 `claimSync` 参数化成一个带 `sync` 开关的函数 | 同步版用 Atomics.wait 睡眠、异步版用 `delay`；合并会让同步路径意外带上 Promise |
| 把两侧 `removeDead` 也统一 | 语义已分叉（`lib/config-lock.js` 内联判据 / `lib/shared-state-lock.js` 调 `isDead`）。合并 = 行为变更，须独立论证 |

## 验证方式

1. `--filter=lock`（5 套）+ `m9-e2e` + `issue341` 全绿。
2. 负控：`claim` 原子性被破坏 ⇒ `issue341-lockgate` 必红（已实测）。
3. 全量回归（分母 460）失败集不新增。
4. `DRY-C1` 54 → 53。
