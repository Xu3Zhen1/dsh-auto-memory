# 提案：消除 evidence-store ↔ shadow-host 的 4 处跨文件重复块（诊断节流）

**状态**：草稿 · **日期**：2026-11-12

## 问题

`lib/evidence-store.js` 与 `lib/shadow-host.js` 各自私有实现了同一套**诊断节流表**：
模块级 `_diagAt` Map + `DIAG_THROTTLE_MS_PRE_V1 = 300000` + `shouldReportDiag(key)`
（规范化后逐字节相同，`extract-identical` 判 SAME）。

`DRY-C1` 报 **4 处跨文件重复块**（`evidence-store.js:117–125 ↔ shadow-host.js:51–59`）。

可观察的坏事：

- 两处注释都写着「**语义同 index.js 的 diagThrottled**：首条立即透出，窗口内重复压掉」。
  也就是说，同一个节流语义在这仓里已有**三份**实现（index.js / evidence-store / shadow-host）。
  改节流窗口时，只改一处就会让「同一条诊断在不同子系统下表现不一致」——
  排查现场最典型的困惑是「为什么这边压掉了、那边没压」。
- 节流是**可观测性**设施。它错了不会崩，只会**静默地少报或漏报**，
  恰好是本仓反复强调的「缺失必须留痕，不许静默回落」要防的形态。

## 变更范围

| 文件 | 动作 |
| :-- | :-- |
| `lib/diag-throttle.js` | **新建**：导出 `shouldReportDiag(key)`（模块级表 + 300s 窗口，零 import） |
| `lib/evidence-store.js` | 删本地 `_diagAt` / `DIAG_THROTTLE_MS_PRE_V1` / `shouldReportDiag`，改为具名导入 |
| `lib/shadow-host.js` | 同上 |

## 非目标（YAGNI · 强制）

| 不做的事 | 为什么不做 |
| :-- | :-- |
| 不把 `index.js` 的 `diagThrottled` 一起并进来 | `index.js` 是 22k 行的巨文件且被 r26 哈希锁钉住；本次改动它需要重钉锁，会把「纯提取」与「锁值变更」混在一个 diff 里，无法审查。该收口留给独立切片 |
| 不为两个模块建**独立**的节流表 | 两模块的 key 前缀已天然隔离（`evidence:*` / `shadow:*`），共享一张表不会互相压制；各建一张反而把「同一条诊断在不同子系统共享窗口」这个既有语义改掉 |
| 不把节流窗口做成可配置参数 | 当前没有任何调用方需要别的窗口；加参数只会诱导未来"顺手传个别的值"，把一处语义变成 N 处 |
| 不顺手改 `reportDiag` 的回调形态（`onDiag(key,msg)` vs `this._onDiag`） | 两者形态不同（一个实例方法、一个闭包），属各自的宿主结构；本片只收口**节流判据**，不动上报出口 |
| 不动 `activation-host.js ↔ context-host.js` 的 3 块 | 那 3 块是 `pathsByKey.set(...)` 这类**数据装配**片段，不是可独立成立的函数；抽取会造出难以命名的中间层，风险高于收益 |

## 验收标准

1. `DRY-C1` 的 `evidence-store.js ↔ shadow-host.js` 文件对从 **4 块降为 0 块**。
2. `DRY-C1` 全量从 69 块只减不增；`KISS-C1` 从 2092 处只减不增。
3. 节流语义**逐条不变**：同 key 首次放行、窗口内第二次压制、超过窗口再放行；
   `Date.now()` 抛错时**仍放行**（catch 后 return true）。
4. **负控能真变红**：把窗口从 300s 改成 0（永不压制）后，新判据必须失败。
5. 全量回归失败集不新增。

## 附带影响：一处既有守卫需要迁移锚点（不是豁免，是改判据口径）

`tests/smoke/smoke-test-p3-batchb-guards.mjs` 的 `P3B-4c`（标题：「节流表必须在模块级
（同进程多实例共享，否则各自双写）」）原实现要求字面量 `const _diagAt = new Map()`
与 `DIAG_THROTTLE_MS_PRE_V1 = 300000` **逐字出现在这两个文件里**。

它守的是**实现位置**，而标题写的是**不变量**。本片把表移走后该断言变红（实测：
`FAIL - P3B-4c ★ shadow-host 无模块级节流表`）。

处置：把断言改为按**不变量**判 —— ① 单一实现模块里表是模块级（在导出函数之前）；
② 窗口仍是 300000ms；③ 两个使用方都从 `lib/diag-throttle.js` 导入且**不再自带表**。

> **这不是为变绿而放宽判据**（§6.1 纪律 2）。判别依据：迁移后**同时**用三次手工变异
> 自证新判据仍能真红 ——
> ① 窗口改 999 ⇒ `★ 节流窗口不是 5 分钟`；
> ② 把 `_lastReportAt` 抄回 shadow-host 并删掉 import ⇒ `★ shadow-host 未从 diag-throttle.js 导入`；
> ③ 表移到函数之后 ⇒ `★ 节流表不在模块级`。
> 且**行为级**的 `P3B-4e`（连续 2 次写失败只透出 1 条诊断）**原样通过、一行未改**。
> 后者才是"节流真的生效"的判据，前者只是它的静态影子。
