# 提案：消除 team-auth ↔ team-identity 的 9 处跨文件重复块

**状态**：草稿 · **日期**：2026-11-12

## 问题

`lib/team-auth.js` 与 `lib/team-identity.js` 各自私有实现了同一组「安全取值原语」：
`toText` / `safeGet` / `safeDiag` / `safeMessage` 共 4 个函数、约 14 行。

机器判据 `DRY-C1` 在 `--profile acceptance --code lib` 下报 **9 处跨文件重复块**
（`team-auth.js:56–67 ↔ team-identity.js:72–85`），是 `DRY-C1` 78 处中的第 4 大文件对。

可观察的坏事不是「重复难看」，而是**修一处漏一处**：

- `safeGet` 的语义是「getter 抛错也不外抛」。若某天为兼容某个宿主把 `team-auth` 里的
  `safeGet` 改成 `try { return holder[key] } catch (_) {}`，而忘了同步 `team-identity`，
  则同一宿主在两处 seam 上会得到**不同的降级行为**：一处返回 `undefined`、一处该抛的抛。
- 这类缺陷**不会有任何测试变红**：两侧各有自己的套件，各自都绿。

本仓已因同型理由做过同类收口（`config-lock.js` 头注 L7–L12：门回收判据「只有一份实现」，
直接复用 `shared-state-lock.js` 的 `reclaimDeadGate`，理由原文「若各自维护一份回收判据，
改一处漏一处就会变成半修（本仓已记过该教训）」）。本提案按同一纪律收口这 4 个原语。

## 变更范围

| 文件 | 动作 |
| :-- | :-- |
| `lib/team-primitives.js` | **新建**：导出 4 个原语（无 import，零依赖） |
| `lib/team-auth.js` | 删本地 4 份实现，改为从新模块具名导入 |
| `lib/team-identity.js` | 删本地 4 份实现（含 2 段 JSDoc），改为具名导入 |

不动任何导出签名、不动任何调用点、不改任何常量与超时值。

## 非目标（YAGNI · 强制）

| 不做的事 | 为什么不做 |
| :-- | :-- |
| 不把 `team-transport.js` / `team-transport-http.js` 的 `toText` 一起并进来 | **同名但语义不同**：带 trim 的是 auth/identity 版，不带 trim 的是 transport 版。实测 `toText('  x  ')` 两版分别得 `'  x  '` 与 `'x'`（3/7 输入不同）。合并会**静默改变传输层行为**，必须留作独立切片并单独论证 |
| 不动 `config-lock.js` ↔ `shared-state-lock.js` 的 4 块 | 那 4 块里有 3 块落在 async/sync 两条**不同**取锁循环内部，且两文件的 `removeDead` 已实测 DIFF ⇒ 不属本片 |
| 不修 `DRY-C1` 其余 69 块 | 本片只对一对文件负责；其余留给后续切片，避免 diff 无法审查 |
| 不统一 `team-sync.js` / `global-brief.js` 的同族 helper | 它们是 transport 的**非 trim** 语义，与上一行同因，须与传输层同批处理 |
| 不顺手把 `safeCall` / `detailOf` 等单侧私有函数搬进公共模块 | 只有一处用到，搬过去只增加一跳间接，违反 YAGNI |

## 验收标准

1. `DRY-C1` 的 `team-auth.js ↔ team-identity.js` 文件对从 **9 块降为 0 块**（机器判定）。
2. `DRY-C1` 全量从 78 块**只减不增**，且 `KISS-C1` 从 2092 处只减不增。
3. 4 个原语的行为**逐条不变**：以 `toText('  x  ')`、`safeGet(getterThatThrows)` 等
   边界输入做对拍，改前改后返回值必须完全一致。
4. `smoke-test-team-identity-seam` / `smoke-test-issue370-response-body` /
   `smoke-test-team-sync-livelock` 全绿，且全量回归失败集不新增。
5. **负控能真变红**：把新模块里 `safeGet` 的 `catch` 分支去掉后，
   相关套件必须失败（证明判据确实测到了这条路径，不是空转）。
