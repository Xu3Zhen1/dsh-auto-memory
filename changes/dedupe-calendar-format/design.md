# 技术设计：CALENDAR.md 解析/渲染收口

## 方案摘要

在 `lib/calendar-fields.js`（**已在 migrate-pack 的 import 白名单内、零 import 零 IO 的叶子模块**）
追加 `calendarParsePre` / `calendarRenderPre`；`lib/index.js` 的两个类方法与 `lib/migrate-pack.js`
的两个闭包都改为委托它。零行为变更。

## 复用清单（DRY · 强制）

| 现有模块路径 | 提供什么能力 | 本次如何复用 |
| :-- | :-- | :-- |
| `lib/calendar-fields.js` | 三个字段编解码原语（`calendarFieldEncodePre` / `DecodePre` / `calendarQuadrantPre`），零 import 零 IO | **追加**两个格式函数，复用其三个原语；不新建模块 |
| `lib/index.js` | `MemoryEngine.parseCalendar` / `renderCalendar`（类方法） | 保留方法壳，体内委托共享实现 |
| `lib/migrate-pack.js` | `calendarMergePre` 内的 parse/render 两个闭包 | 删除闭包，改调共享实现 |
| `lib/team-primitives-notrim.js` | 安全访问原语（前序片收口） | **不适用**：日历格式不读宿主对象 |
| `lib/diag-throttle.js` | 诊断节流（前序片收口） | **不适用**：与日历无关 |

无新增第三方依赖（`lib/calendar-fields.js` 保持零 import）。

## 接口契约

进程内单包插件，无前后端边界。契约真源：

| 契约真源路径 | 承载什么 | 谁引用 |
| :-- | :-- | :-- |
| `lib/calendar-fields.js` | `calendarParsePre(text)` / `calendarRenderPre(entries)`：CALENDAR.md 的**唯一格式实现** | `lib/index.js`（两个类方法）、`lib/migrate-pack.js`（`calendarMergePre`） |

**格式契约（磁盘字节级，改这里 = 改用户的 CALENDAR.md）**：

```
# 日历与日程 (CALENDAR)
## YYYY-MM-DD
- [x| ] HH:MM | 象限 | 标题 | 备注
    <缩进续行：多行备注的第 2 行起>
```

行尾两种注释必须**先剥后解析**，且顺序不可颠倒：
`<!-- calendar-fields: escaped-v1 -->`（先，表示转义）→ `<!-- calendar-id: cal_<32hex> -->`（后）。

**续行契约**：只有**紧跟在条目行之后**的缩进行才算续行；空行 / 标题 / 其它行终止续行段。
缩进判定**先于**条目正则 —— 故备注里自带 `- [ ] ...` 的行会被按续行收走。

## 结构决策

**为什么放 `lib/calendar-fields.js` 而非新建模块：**
`lib/migrate-pack.js` 的引擎红线守卫把 import 面约束为「`node:` 内置 + 本地零 IO 叶子模块」。
`lib/calendar-fields.js` 正是那个叶子。扩展它：

- 满足守卫**意图**（引擎仍零 IO、可单测）
- 不新增模块（新增会让守卫的「白名单」概念变复杂）
- 三个原语与新函数同属「日历格式」这一主题，内聚合理

## 刻意不采用的模式

| 模式 | 为什么不采用 |
| :-- | :-- |
| 新建 `lib/calendar-format.js` 并让 migrate-pack import 它 | 该 import 行是 S10 守卫的观测对象；新增模块名需要改守卫白名单，且模块数膨胀。扩展既有叶子更小 |
| 删掉 `lib/index.js` 的两个方法、调用点改调自由函数 | `tests/lib/audit-engine.mjs` 按 `MemoryEngine` 的方法名暴露契约；删方法 = 破坏契约 |
| 把 `calendarIdentitiesPre`（id 补齐）一并搬进格式模块 | 那是**迁移语义**（给无 id 条目补 id），只在 merge 路径需要，不属格式本身 |
| 用 Map 统一分组结构 | `lib/index.js` 原用普通对象、`migrate-pack` 原用 `Map`。二者对 `YYYY-MM-DD` 键行为等价（date 恒匹配 `^\d{4}-\d{2}-\d{2}$`，不可能撞 `__proto__`），统一为普通对象即可，无需引 Map |

## 验证方式

1. **行为对拍**（双通道）：改前（基 `bd1497b8` 源码抽取）vs 改后（真 import），
   15 条 parse 语料 + 15 条 render 语料 + 往返幂等 ⇒ 全部 0 差异。
2. **三条既有负控复红**（本片迁移了它们的变异锚点）：续行识别 / 续行渲染 / 共享渲染出口。
3. **S10 守卫升级自证**：新增 `lib/calendar-fields.js` 内含 import ⇒ `S10b-3` 真红
   （原字符串判据抓不住）；含 `node:fs` ⇒ `S10b-2` 真红。
4. `DRY-C1` 53 → 44；全量回归（分母 460）失败集不新增。
5. `lib/index.js` 变更 ⇒ **重钉 r26** 的 index 哈希锁（`2A2B9E88…` → `D3524715…`，用套件自身表达式复算）。