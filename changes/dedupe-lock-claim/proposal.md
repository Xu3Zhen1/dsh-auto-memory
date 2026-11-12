# 提案：config-lock 复用 shared-state-lock 的 claim（DRY 4 块 → 3 块）

**状态**：草稿 · **日期**：2026-11-12

## 问题

`lib/config-lock.js` 与 `lib/shared-state-lock.js` 各有一份**逐字节相同的** `claim(file)`
（`openSync(file,'wx')` 原子认领 + 写 owner 元数据）。`DRY-C1` 报 **4 处**跨文件重复块。

可观察的坏事：`claim` 是**互斥的原子原语**。两处各写一份，改一处漏一处的后果不是"难看"，
而是**一个锁行为变了、另一个没变** —— 两种锁对同一进程的并发行为分叉。

本仓已因同型理由收口过一次：`config-lock.js` L7–L12 的头注明确写着
「门的**回收判据只有一份实现** —— 直接复用 shared-state-lock.js 导出的 reclaimDeadGate，
而不是在本文件再抄一遍……若各自维护一份回收判据，改一处漏一处就会变成半修」。
本片把同一纪律推进到 `claim`。

## 变更范围

| 文件 | 动作 |
| :-- | :-- |
| `lib/shared-state-lock.js` | 末尾增加 `export { claim }`（实现不动） |
| `lib/config-lock.js` | 删除本地 `claim`，改为从该模块具名导入（**该 import 已存在**，不新增依赖方向） |

## 非目标（YAGNI · 强制）

| 不做的事 | 为什么不做 |
| :-- | :-- |
| **不收口剩下的 3 块**（取锁循环体里的 `claim(gate)` / `claim(lock)` / `removeDead` 序列） | 两侧的 `removeDead` **语义已分叉**（实测 DIFF：config 版内联死主判据、shared 版调用 `isDead` 函数）。把它们合并 = 把两种判据压成一种 = **行为变更**，不属纯提取。该 3 块留给需要单独论证的切片 |
| 不动 `config-lock.js` 的 `canonical` / `ensureLockDir` / `tryAcquire` | 是 config 侧独有语义（符号链接拒绝、目录不可用则跳过加锁），shared 侧没有对应物 |
| 不动 `shared-state-lock.js` 的 `claimSync` / `canonicalSharedStatePathSync` / `sleepSyncPre` | 同步版三件套，config 侧不使用；合并只会造出没有第二消费者的抽象 |
| 不合并两个锁模块本身 | 二者事务边界不同（config = 单文件配置读改写；shared = 跨进程共享状态），合并会让「何时用哪个锁」变成需要人脑记的隐性知识 |

## 验收标准

1. `DRY-C1` 全量 **54 → 53**（该文件对 4 块 → 3 块）。
2. `KISS-C1` 保持 2092；`YAGNI-C1` 保持 0。
3. **负控能真变红**：把 `claim` 的 `openSync(file,'wx')` 原子认领改成「先 unlink 再创建」
   ⇒ `smoke-test-issue341-lockgate` 必须红（实测：`★#341 负路径:活主门必须照旧超时 :: NO-THROW`）。
4. 锁相关套件（`--filter=lock`，5 套）与 `m9-e2e` 全绿；全量回归失败集不新增。

## 诚实交代：本片只减 1 块，不是 4 块

`claim` 收口后，该文件对从 4 块降到 3 块。**剩下的 3 块不是没做完，而是不可纯提取**（见非目标表）。
若把 4 块全部消掉需要动 `removeDead` 语义，那是行为变更，必须有独立的风险论证与更强的判据。

## 附：本片之前试过并被否决的方案（留档防重试）

| 方案 | 干跑结果 | 否决原因 |
| :-- | :-- | :-- |
| 把 transport 的 7 个函数抽到新模块 `team-transport-shared.js`，只从 transport 一侧卸掉 | DRY **62**（比基线 54 **更差**） | 新模块成了 http 侧的新配对对象（27 块），重复只是**转移**不是消除。⇒ **抽到第三个文件只有在"两侧都改用它"时才减少块数；只改一侧会把块数推高** |
| 同上，但 http 侧也改用新模块 | 理论 35 | 会让 `team-transport-http.js` 的 import 面变 3 条 ⇒ I4/I4b 必红。I4 是目前**按条数硬钉**的验收判据，改它属验收口径变更，须单独裁定 |
| 让 `team-transport.js` 从 `team-transport-http.js` 导入共享函数 | 35（数值漂亮） | 制造**假的依赖方向**：传输后端不该依赖 T2 后端模块。数值改善不能作为采纳理由 |
