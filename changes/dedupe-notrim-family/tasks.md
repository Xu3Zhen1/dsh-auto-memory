# 任务清单：消除 notrim 家族三文件的 6 处跨文件重复块

## 阶段 1：准备与取证

- [ ] T1 确认三文件的 `toText` / `safeGet` 逐字节相同（`extract-identical` 期望 SAME / diff=0）
- [ ] T2 实测两个 `safeGet` 版本的语义差分：`safeGet('', 'length')` 一版得 `0`、一版得 `undefined`
- [ ] T3 干跑确认收益：只改一处 DRY 降 3；三处全改降 11（诚实口径 6 块 + 5 块连带）

## 阶段 2：核心实现

- [ ] T4 新建 `lib/team-primitives-notrim.js`（**裸 function + 末尾 export {}**，不用 `export function`）
- [ ] T5 在 `lib/global-brief.js` 中删除本地两份实现，改为具名导入
- [ ] T6 在 `lib/team-sync.js` 中同上
- [ ] T7 在 `lib/team-transport.js` 中同上

## 复用复查（在 T7 之前执行）

- [ ] 检查是否与 `lib/team-primitives.js` 重复 —— 是，但**语义不同**（trim vs 不 trim、
      truthiness vs 只挡空值），已在提案非目标表登记理由，并加双向差异锁套件
- [ ] 检查是否与 `lib/team-transport-http.js` 重复 —— 是，但该文件被 I4/I4b 钉死，不在本片范围

## 阶段 3：验证

- [ ] T8 新增 `tests/smoke/smoke-test-team-primitives-notrim.mjs`（含 A13/A14 非字符串路径用例）
- [ ] T9 负控 1：notrim 版改成 trim 语义 ⇒ 套件真红（A13/A14）
- [ ] T10 负控 2：`safeGet` 改成 truthiness ⇒ 套件真红（B5/B6/B7）
- [ ] T11 运行 `sdd-guard check --only DRY-C1,KISS-C1,YAGNI-C1`：65 → 54，KISS 不变
- [ ] T12 全量回归（分母 459），失败集不新增

## 完成判据

- [ ] 所有复选框勾选
- [ ] 规范中每个 Scenario 至少被一个测试覆盖
- [ ] 显式报告「哪些规格分支没有被执行」（含被 I4/I4b 挡住的 http 副本）
