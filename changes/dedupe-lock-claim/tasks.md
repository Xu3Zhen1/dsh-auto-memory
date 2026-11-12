# 任务清单：config-lock 复用 shared-state-lock 的 claim

## 阶段 1：准备与取证
- [ ] T1 确认 `lib/config-lock.js` 与 `lib/shared-state-lock.js` 的 `claim` 逐字节相同（extract-identical: SAME）
- [ ] T2 确认 `lib/config-lock.js` **已** import `lib/shared-state-lock.js`（L12 reclaimDeadGate）⇒ 不新增依赖方向
- [ ] T3 记录基线：DRY 54 块，本文件对 4 块

## 阶段 2：核心实现
- [ ] T4 在 `lib/shared-state-lock.js` 末尾增加 `export { claim }`（实现不动）
- [ ] T5 在 `lib/config-lock.js` 中删除本地 `claim`，导入清单加 `claim`

## 复用复查（在 T5 之前执行）
- [ ] 检查剩余 3 块可否一并收口 —— 否：两侧 `removeDead` 实测 DIFF（语义已分叉），合并属行为变更
- [ ] 检查 `claimSync` 是否该一并导出 —— 否：config 侧不使用，无第二消费者

## 阶段 3：验证
- [ ] T6 运行 `node tools/run-smoke.mjs --filter=lock --jobs=2`（5 套）全绿
- [ ] T7 运行 `--filter=m9-e2e`、`--filter=issue341` 全绿
- [ ] T8 负控：把 `claim` 的 `openSync(file,'wx')` 改成「先 unlink 再创建」⇒ `issue341-lockgate` 必红
- [ ] T9 运行 `sdd-guard --only DRY-C1`：54 → 53
- [ ] T10 全量回归（分母 460），失败集不新增

## 完成判据
- [ ] 所有复选框勾选
- [ ] 规范中每个 Scenario 至少被一个测试覆盖
- [ ] 显式报告未执行项：剩余 3 块为何不可纯提取、`host` 字段缺本机可观测判据
