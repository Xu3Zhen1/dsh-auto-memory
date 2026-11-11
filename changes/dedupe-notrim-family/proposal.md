# 提案：消除 notrim 家族三文件的 6 处跨文件重复块

**状态**：草稿 · **日期**：2026-11-12

## 问题

`lib/team-transport.js`、`lib/team-sync.js`、`lib/global-brief.js` 三处各自私有一份
**逐字节相同的** `toText` / `safeGet`（不 trim 语义）。`DRY-C1` 报 **6 处**跨文件重复块：

| 文件对 | 块数 |
| :-- | ---: |
| `global-brief.js` ↔ `team-sync.js` | 3 |
| `global-brief.js` ↔ `team-transport.js` | 3 |
| （`global-brief.js` ↔ `team-transport-http.js` 的 3 块归同一源） | — |

可观察的坏事：`toText` 是**键与载荷的字节口径**。若某处被顺手改成 trim，存储键会静默变化
（`'team/a '` 与 `'team/a'` 变同键），而三份实现各改各的，改一处漏两处就是半修。

## 变更范围

| 文件 | 动作 |
| :-- | :-- |
| `lib/team-primitives-notrim.js` | **新建**：导出 `toText` / `safeGet`（不 trim、只挡 null/undefined），零 import |
| `lib/global-brief.js` | 删本地两份实现，改为具名导入 |
| `lib/team-sync.js` | 同上 |
| `lib/team-transport.js` | 同上 |

## 非目标（YAGNI · 强制）

| 不做的事 | 为什么不做 |
| :-- | :-- |
| **不与 `lib/team-primitives.js` 合并** | 两个 `toText` **语义不同**（一个 trim、一个不 trim，实测 7 个边界输入中 3 个不同）；两个 `safeGet` 也不同（一个挡 truthiness、一个只挡 null/undefined，实测 44 个用例中 5 个不同）。**合并会静默改变传输层的键语义**。已加双向差异锁套件钉死 |
| 不动 `team-transport-http.js` 的那份副本 | 该文件被 `smoke-test-team-transport-http` 的 I4/I4b 钉死为「import 面恰好 2 条、不含 team-transport」。**这是刻意的隔离代价**（见 `team-transport.js` L510–515：互相引用会产生 TDZ）。动它必须重立架构论证，不属本片 |
| 不顺手收口 `safeMessage` / `safeDiag` / `trimSlashes` / `withPrefix` | 它们与 http 副本的重复同上一条，被同一守卫挡住 |
| 不把两个原语拆成两个模块 | 它们总是成对出现（`safeGet` 极少单独用），拆开只多一跳间接 |

## 验收标准

1. `DRY-C1` 全量 **65 → 54**（该家族 6 块归零 + 因首见方变更连带减 5 块）。
2. `KISS-C1` 保持 2092（不变多）；`YAGNI-C1` 保持 0。
3. **差异锁生效**：把 notrim 版改成 trim 语义 ⇒ 新套件必须红；把 `safeGet` 改成 truthiness ⇒ 必须红。
4. 全量回归（分母 459）失败集不新增。

## 判据方法论备注（本片实测发现，供后续片参考）

`DRY-C1` 的窗口是「**规范化后 6 行逐字相同**」。因此：

- 新模块若写成 `export function toText(`，首行与 `team-transport-http.js` 里的裸
  `function toText(` **不同** ⇒ 窗口整体错位 ⇒ 那 3 块真实重复**检测不到**。
  实测：`export` 前缀写法报 51 块；裸声明 + 末尾 `export {}` 写法报 54 块。**差 3 块是判据假象，不是真实收益**。
- ⇒ 本片坚持写成「裸 `function` + 末尾 `export { }`」，让判据如实报出那 3 块。
- 但也要说清：**这 3 块是"真重复但本轮不动"**（因为它们指向 http 那份被守卫钉死的副本）。
  所以本片的诚实口径是「**6 块归零**」，而不是"11 块"。
