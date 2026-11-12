# 任务清单：CALENDAR.md 解析/渲染收口

## 阶段 1：准备与取证

- [ ] T1 确认 `DRY-C1` 基线：`index.js ↔ migrate-pack.js` = 9 块（全量 53）
- [ ] T2 确认 `lib/calendar-fields.js` 是 migrate-pack 白名单内的**零 import 零 IO 叶子**
- [ ] T3 干跑确认收益：只改 migrate-pack 一侧 ⇒ DRY 升到 77（重复转移）；两侧都改 ⇒ 44
- [ ] T4 行为对拍基线：从基 `bd1497b8` 抽取原实现，与「待写入的共享实现」比对 30 用例

## 阶段 2：核心实现

- [ ] T5 在 `lib/calendar-fields.js` 追加 `calendarParsePre` / `calendarRenderPre`
- [ ] T6 `lib/index.js` 两个类方法改为薄包装（保留方法名与契约）
- [ ] T7 `lib/migrate-pack.js`：删两个闭包，`calendarMergePre` 改调共享实现；import 补两个名字

## 阶段 3：守卫升级（改强不改弱）

- [ ] T8 `tests/smoke/smoke-test-migrate-pack.mjs`：S10b 从「import 串逐字相等」改为**不变量判**（S10b-0..5）
- [ ] T9 S10c 拆成两条（零 IO / 零 import），保留原意图
- [ ] T10 自证：塞 import 进 `lib/calendar-fields.js` ⇒ `S10b-3` + `S10c-2` 真红（原判据抓不住）
- [ ] T11 自证：塞 `node:fs` 进 `lib/migrate-pack.js` ⇒ `S10b-2` 真红

## 阶段 4：迁移既有负控锚点

- [ ] T12 `tests/smoke/smoke-test-calendar-multiline-254.mjs`：`loadMutatedEngine` 支持 `opts` 的 `file` 选项（变异依赖模块）
- [ ] T13 三处变异锚点跟随到 `lib/calendar-fields.js`（注意缩进差异：4 空格 vs 原 6 空格）
- [ ] T14 三条负控复红（续行识别 / 续行渲染 / 共享渲染出口），套件 37/0

## 阶段 5：验证

- [ ] T15 行为对拍：15 parse + 15 render + 往返幂等，全部 0 差异
- [ ] T16 `sdd-guard --only DRY-C1,KISS-C1`：53 → 44，KISS 不变
- [ ] T17 **重钉 r26**（index.js 哈希）：`2A2B9E88…` → 用套件自身表达式复算
- [ ] T18 全量回归（分母 460），失败集不新增

## 完成判据

- [ ] 所有复选框勾选
- [ ] 显式报告：S10b 判据升级（附鉴别力自证）、三处既有负控锚点迁移、
      以及一个**不成立**的负控（lodash 导致 ERR_MODULE_NOT_FOUND 属崩溃红，不作证据）