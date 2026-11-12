# CALENDAR.md 格式收口 规范

### Requirement: 系统必须让 parseCalendar 与 calendarMergePre 共用同一解析实现

#### Scenario: 两处对同一文本产出相同条目
- **GIVEN** 一段合法 CALENDAR.md 文本
- **WHEN** 分别经 `MemoryEngine.parseCalendar()` 与 `calendarMergePre` 内部解析
- **THEN** 两者产出的条目数组逐字段相同

#### Scenario: 判据下降
- **GIVEN** 仓库处于本变更应用后的状态
- **WHEN** 运行 `sdd-guard check --only DRY-C1 --code lib`
- **THEN** `index.js ↔ migrate-pack.js` 的 9 处重复块消失

---

### Requirement: 系统必须保持 CALENDAR.md 的磁盘格式逐字节不变

#### Scenario: 单行备注渲染
- **GIVEN** 条目 `{date:'2026-10-20', time:'09:00', quadrant:'重要紧急', title:'交报告', note:'单行备注'}`
- **WHEN** 调用 `renderCalendar`
- **THEN** 输出 `- [ ] 09:00 | 重要紧急 | 交报告 | 单行备注`

#### Scenario: 多行备注按缩进续行落盘
- **GIVEN** 条目 note 为三行文本
- **WHEN** 调用 `renderCalendar`
- **THEN** 第 2/3 行以 4 空格缩进续行落盘

#### Scenario: 转义字段带标记
- **GIVEN** 标题含 `|`（需转义）
- **WHEN** 调用 `renderCalendar`
- **THEN** 行尾带 `<!-- calendar-fields: escaped-v1 -->`

#### Scenario: 有条目 id 时带 id 标记
- **GIVEN** 条目含 `id: 'cal_<32hex>'`
- **WHEN** 调用 `renderCalendar`
- **THEN** 行尾带 `<!-- calendar-id: cal_<32hex> -->`

---

### Requirement: 系统必须保持解析的续行语义

#### Scenario: 缩进行只在其前的条目存在时才算续行
- **GIVEN** 文本为 `## 2026-10-20` / `- [ ] 09:00 | 未分类 | A | 首行` / `    续行`
- **WHEN** 调用 `parseCalendar`
- **THEN** 该条目 note 为 `'首行\n续行'`

#### Scenario: 空行终止续行段
- **GIVEN** 续行后跟一个空行、再跟一个缩进行
- **WHEN** 调用 `parseCalendar`
- **THEN** 空行之后的缩进行**不计入**前一条目

#### Scenario: 备注里的类条目行按续行收
- **GIVEN** 续行内容形如 `    - [ ] 09:00 | 未分类 | 看起来像条目`
- **WHEN** 调用 `parseCalendar`
- **THEN** 它被当作前一条目的续行，**不**产生新条目

---

### Requirement: 系统必须保持往返幂等

#### Scenario: 两次渲染逐字节相同
- **GIVEN** 任一合法 CALENDAR.md 文本
- **WHEN** 先 `render(parse(text))` 再 `render(parse(第一次输出))`
- **THEN** 两次输出逐字节相同

---

### Requirement: 系统必须保持 migrate-pack 引擎的零 IO 红线

#### Scenario: 引擎仅 import 内置与零 IO 叶子模块
- **GIVEN** `lib/migrate-pack.js`
- **WHEN** 运行 `smoke-test-migrate-pack.mjs` 的 S10 段
- **THEN** 其全部 import 来自 `node:` 内置（白名单）或本地**零 IO、零 import 叶子**
- **AND** 每个被 import 的本地模块自身无写/删调用、无 import

> ⚠️ 本片把 S10b 从「import 面逐字等于两串」改为**不变量判**（并新增 S10b-0..5 六条）。
> 改强不改弱：新增「本地模块递归验零 IO」「空集不得通过」「两条非恒真负控」。
> 已实测：给 `calendar-fields.js` 塞 import ⇒ `S10b-3` 真红（原判据抓不住）。