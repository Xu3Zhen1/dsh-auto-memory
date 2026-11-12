# 提案：传输层 7 个纯函数收口（DRY 22 块 → 0）

**状态**：草稿 · **日期**：2026-11-12

## 问题

`lib/team-transport.js`（S3/memory 后端）与 `lib/team-transport-http.js`（T2 HTTP 后端）
各自私有实现同一组 7 个纯函数：

`safeMessage` / `safeDiag` / `trimSlashes` / `withPrefix` / `withoutPrefix` / `toBuffer` / `compareKeys`

`DRY-C1` 报 **22 处**跨文件重复块（19 块两两配对 + 3 块 `team-primitives-notrim ↔ http`），
是全仓剩余重复的**最大来源**。

可观察的坏事：`withPrefix` / `withoutPrefix` / `trimSlashes` 是**三个后端的键语义唯一实现**。
两份拷贝漂移 ⇒ 一个后端「写入用一个键、读取用另一个键」——**不会崩，只会静默读不到**。

## 变更范围

| 文件 | 动作 |
| :-- | :-- |
| `lib/team-transport-primitives.js` | **新建**：7 个纯函数，从 `team-primitives-notrim.js` 取 `toText`/`safeGet` |
| `lib/team-transport.js` | 删 7 个本地实现，改为具名导入 |
| `lib/team-transport-http.js` | 删 9 个本地实现（含 `toText`/`safeGet`），改为从两个叶子模块导入 |

## 非目标（YAGNI · 强制）

| 不做的事 | 为什么不做 |
| :-- | :-- |
| 不与 `lib/team-primitives.js`（trim 版）合并 | 两版语义实测不同（trim vs 不 trim、truthiness vs 只挡空值），合并会静默改键语义。前序片已加双向差异锁 |
| 不删 `team-transport-http.js` 后端本身 | 用户 2026-11-12 裁定「保留」（与 25 卷 T0/T1/T2 分档一致，属产品能力）。本片只收口其**实现重复**，不动其存在 |
| 不把 `toText`/`safeGet` 也搬进新模块 | 它们已在 `team-primitives-notrim.js`（前序片收口，含双向差异锁）。搬进来等于制造第三个副本 |
| 不合并两个 transport 后端模块 | 二者职责不同（S3 签名/分片 vs HTTP 请求构造）；合并会让「不需要哪个」变成编译期耦合 |
| 不改 `createHttpBackend` 的装配状态 | 属产品裁定（未联调、刻意不注入），前序片已把表述改正，本片不动行为 |

## 验收标准

1. `DRY-C1` 全量 **44 → 22**（这 22 块归零）。
2. `KISS-C1` 保持 2092（不变多）；`YAGNI-C1` 保持 0。
3. **行为逐条不变**：改前（基 `8a9cad48` 的 http 侧副本）vs 改后（新模块），
   49 个边界用例 **0 差异**（含 `toBuffer` 的 Buffer/TypedArray/原始值、`compareKeys` 的全序、
   `safeDiag` 的强制转换与抛错回调、`withPrefix`/`withoutPrefix` 的空前缀/空键/多重斜杠）。
4. **I4 判据改写后仍能真红**（三条负控，见下）。
5. 全量回归（分母 460）失败集不新增。

## ★ 必须声明：本片第二次改写验收判据，且**改强不改弱**

`smoke-test-team-transport-http.mjs` 的 I4/I4b 原实现：

```js
eq(imports.length, 2, 'I4 ★import 面恰好 2 条')
eq(imports.join(' | '), "import http from 'node:http' | import https from 'node:https'", 'I4b ★★零第三方依赖…')
```

本片让 http 导入两个本地叶子模块 ⇒ import 面变 4 条 ⇒ I4/I4b 必红。

**判断依据**：I4b 自述意图是「★★零第三方依赖（两条 import 均为 node: 内置；不含 fetch /
不含 team-transport）」。原实现守的是「**恰好这两条**」，而意图是「**零第三方 + 不耦合 team-transport**」。
两者不等价：原判据会把同样零 IO 的内部叶子误判为违规，却对「本地模块自己偷偷写盘」与
「形成 http → transport 的反向依赖」**无能为力**（它只验名字，不验内容与依赖图）。

**上一轮判断「这 22 块是刻意隔离代价、不可消除」的依据被推翻**：
`lib/team-transport.js` L510–515 的注释称「两文件互相引用会造成 ESM 循环 import 的 TDZ」。
但实测**两文件现在并不互相引用**（http 只 import `node:http`/`node:https`；transport 只 import
`node:crypto` 与 `team-primitives-notrim.js`）。而**第三个模块**被两侧同时导入时，依赖图是
`transport → 本模块 ← http`，两条边都指向叶子，**不构成环**。
⇒ 那条 TDZ 顾虑针对的是 `http → transport` 方向；本片正是**避开**它，不是绕过它。

**新判据（I4-0..8）按不变量判且递归验证依赖链**：
- I4-0 / I4-0b：import 语句与说明符数量自洽 + **至少一条**（空集不得视为通过）
- I4-1：无裸包名（零第三方依赖）
- I4-2：`node:` 仅允许 `node:http` / `node:https`
- I4-3：本地依赖链无缺失模块
- I4-4：链上任何模块**无写/删调用**（递归，非只验一层）
- **I4-4b：链上任何模块不得 import 具备 IO/网络能力的内置**（防别名逃逸，见下）
- **I4-5：链上不含 `team-transport.js`** —— 这才是 TDZ 顾虑的**真实不变量**（禁止反向依赖）
- I4-6：依赖链非空（证明遍历真走了，不是空集恒真）
- I4-7 / I4-8：两条负控证明判定非恒真

**鉴别力自证（三条变异，均真红且命中预期判据）**：

| 变异 | 命中 | 原判据能否抓到 |
| :-- | :-- | :-- |
| http 引入 `node:fs` | `I4-2` | ✅ 能（会红，但只因条数/串变了，不是因为它理解了"fs 是 IO"） |
| **链上模块偷偷写盘**（primitives 引 `node:fs` + 别名调用） | `I4-4`/`I4-4b` | ❌ **完全抓不到**（它只看 http 自己的 import 行） |
| **http 依赖 `team-transport.js`** | `I4-5` | ❌ **完全抓不到**（串里没有 team-transport 时它仍可能通过条数以外的检查） |

**★ 一个被负控逼出来的判据补漏（如实记录）**：
第一版 I4-4 只检查「IO 函数名 + `(`」正则。实测变异
`import { writeFileSync as __wf } from 'node:fs'` + `__wf(...)` —— **完全逃逸、套件全绿**。
这是判据的真实缺口（**别名导入可绕过名字匹配**），不是变异无效。
⇒ 补 `I4-4b`：按**模块来源**判（链上不得 import 具备 IO/网络能力的内置），不按函数名判。
补后该变异真红。