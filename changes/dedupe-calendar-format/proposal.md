# 提案：CALENDAR.md 解析/渲染收口（DRY 9 块 → 0）

**状态**：草稿 · **日期**：2026-11-12

## 问题

同一套 CALENDAR.md 格式逻辑有**两份拷贝**：

| 位置 | 形态 |
| :-- | :-- |
| `lib/index.js` | `MemoryEngine.parseCalendar()` / `renderCalendar()` 两个**类方法** |
| `lib/migrate-pack.js` | `calendarMergePre()` 内部两个**局部闭包** |

`DRY-C1` 报 **9 处**跨文件重复块。两处注释甚至互相点名——`migrate-pack.js` 原文写着
「改为与 index.renderCalendar 同款缩进续行」，即**维护者当时就知道这是同一套逻辑**。

可观察的坏事：这是 CALENDAR.md 的**磁盘格式契约**。两份实现漂移的后果不是"难看"，而是
**同一份日历在两处被解析/写出成不同形状**——`#254` 那条缺陷（多行备注被压平）就是
「一个出口修了、另一个出口没修」造成的，注释里明写「这是同一条缺陷的**第二个出口**」。
而这类缺陷**不会有测试变红**：两个出口各自有套件，各自都绿。

## 变更范围

| 文件 | 动作 |
| :-- | :-- |
| `lib/calendar-fields.js` | 追加 `calendarParsePre` / `calendarRenderPre`（复用其既有三个字段编解码原语） |
| `lib/index.js` | 两个类方法改为**薄包装**（保留方法名与调用点，行为委托） |
| `lib/migrate-pack.js` | 删除两个闭包，`calendarMergePre` 改用共享实现 |

## 非目标（YAGNI · 强制）

| 不做的事 | 为什么不做 |
| :-- | :-- |
| **不新建独立模块** | `migrate-pack.js` 有一条引擎红线守卫（`smoke-test-migrate-pack.mjs` 的 S10 段）：其 import 面被约束为「`node:` 内置 + 本地零 IO 叶子模块」。`calendar-fields.js` 正是那个叶子（零 import、零 IO）。扩展它既满足意图、又不新增模块 |
| 不删 `index.js` 的两个方法、改为直接调自由函数 | 类内与外部（`tests/lib/audit-engine.mjs` 暴露的 `MemoryEngine`）都按方法名调用；删方法 = 破坏契约。保留薄包装是最小 diff |
| 不把 `calendarIdentitiesPre`（id 补齐）一并搬走 | 那是**迁移语义**（给无 id 条目补稳定 id），只在 merge 路径需要；日历格式本身不依赖它 |
| 不顺手改 `calendar-fields.js` 原有的三个字段编解码函数 | 它们被 `tests/smoke/smoke-test-migrate-pack.mjs` S10c 单独守着「零 import 叶子」，且本片不动其语义 |
| 不动 `calendarEntriesPre` / `calendarTransactionPre` 等类内其它日历方法 | 它们不参与本片的重复块；只做纯提取，不扩大范围 |

## 验收标准

1. `DRY-C1` 全量 **53 → 44**（`index.js ↔ migrate-pack.js` 的 9 块归零）。
2. `KISS-C1` 保持 2092（不变多）；`YAGNI-C1` 保持 0。
3. **行为逐字节不变**：改前（基 `bd1497b8` 的源码抽取）vs 改后（真 import），
   15 条 parse 语料 + 15 条 render 语料 **0 差异**，且 `render(parse(x))` 幂等。
4. **三条既有负控仍真红**（本片改了它们的变异锚点，必须重新自证）：
   - 去掉续行**识别** ⇒ `note` 退回只存首行
   - 去掉续行**渲染** ⇒ round-trip 断裂、行数少 2 行
   - 去掉共享渲染出口的续行 ⇒ 多行备注被压平、但首行仍在（对照）
5. 全量回归（分母 460）失败集不新增。

## ★ 必须声明：本片改写了一条守卫，且**改强不改弱**

`smoke-test-migrate-pack.mjs` 的 `S10b` 原实现是：

```js
ok(imports === "import { calendarFieldEncodePre, … } from './calendar-fields.js' import { createHash } from 'node:crypto'")
```

它把 `migrate-pack.js` 的 import 面**整串逐字锁死**。本片要让 `migrate-pack` 使用新增的
`calendarParsePre` / `calendarRenderPre`，import 行必然变化 ⇒ S10b 必红。

**判断依据**：S10 段标题是「引擎红线：零依赖、零写盘（IO 全在宿主 ⇒ 可单测）」，
S10c 另测「`calendar-fields.js` 自身零 IO、零外部依赖」。可见**意图**是
「引擎不引入 IO、也不引入外部依赖」，而**实现**是"恰好这两个字符串"。
两者不等价：原判据会把同样零 IO 的内部模块误判为违规，却对「第三个模块自己偷偷写盘」无能为力
（它只验名字，不验内容）。

**改写后的判据（S10b-1..5 + S10c）按不变量判，且更强**：
- S10b-0 至少有一条 import（**空集不得视为通过**）
- S10b-1 不得出现裸包名（外部依赖）
- S10b-2 `node:` 仅允许 `node:crypto` / `node:path` / `node:url`（无副作用枚举）
- S10b-3 **每个**被 import 的本地模块递归验：无写/删调用 + 自身无 import（叶子）
- S10b-4/5 两条**负控**证明上述判定非恒真

**鉴别力自证（实测）**：
- 给 `calendar-fields.js` 塞一条 `import { createHash } from 'node:crypto'`
  ⇒ `FAIL - ★★S10b-3` + `FAIL - S10c-2` —— **原字符串判据抓不住这一条**（它只看 migrate-pack 的 import 行）。
- 给 `migrate-pack.js` 塞 `import fs from 'node:fs'` ⇒ `FAIL - ★S10b-2`。
- ⚠️ 需如实记录一个**不成立**的负控：塞 `import _ from 'lodash'` 会让模块**加载失败**
  （`ERR_MODULE_NOT_FOUND`），套件红但**不是判据红**——属 §1.3 明令禁止的「崩溃红冒充判据红」，
  故该项不作为判据有效的证据。

## ★ 附带影响：一条既有套件的变异锚点需跟随迁移

`smoke-test-calendar-multiline-254.mjs` 的 `[④]` 段有三条变异负控，锚点原先指向
`index.js` / `migrate-pack.js` 里**已被搬走的那几行**。收口后三处锚点必失效
（实测：`mutation anchor must hit exactly once … hits=0`）。

处置：把锚点跟随到 `lib/calendar-fields.js`，并给 `loadMutatedEngine` 增加 `opts.file`
以支持**变异依赖模块**（通过把 `index.js` 副本里的相对 import 改写成指向变异副本的绝对 URL
来实现，不改 `tests/lib/audit-engine.mjs`）。三条负控改写后**仍真红**（实测 37/0 + 三条负控全红）。

> 这不是「改判据迁就代码」：三条负控测的仍是同一批不变量（续行识别 / 续行渲染 / 共享出口），
> 只是被测代码换了文件。锚点「恰命中 1 次」的自证仍在，锚点漂移会立刻报错而非静默空转。