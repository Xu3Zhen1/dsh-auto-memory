# 任务清单：消除 evidence-store ↔ shadow-host 的 4 处跨文件重复块

## 阶段 1：准备与取证

- [ ] T1 确认 `lib/evidence-store.js` 与 `lib/shadow-host.js` 的 `shouldReportDiag` 规范化后逐字节相同
      （`extract-identical` 期望 `SAME shouldReportDiag`、`diff=0`）
- [ ] T2 记录改前基线：`DRY-C1` 全量 69 块，其中本文件对 4 块；`KISS-C1` 全量 2092 处

## 阶段 2：核心实现

- [ ] T3 新建 `lib/diag-throttle.js`：模块级表 + `shouldReportDiag(key)`，零 import
- [ ] T4 在 `lib/evidence-store.js` 中删除本地 `_diagAt` / `DIAG_THROTTLE_MS_PRE_V1` / `shouldReportDiag`，
      改为 `import { shouldReportDiag } from './diag-throttle.js'`
- [ ] T5 在 `lib/shadow-host.js` 中做同样替换

## 复用复查（在 T5 之前执行）

- [ ] 检查是否与 `lib/index.js` 的 `diagThrottled` 重复 —— 是，但**刻意不并入**（r26 哈希锁），
      已在 `changes/dedupe-diag-throttle/proposal.md` 非目标表登记理由
- [ ] 确认 `lib/diag-throttle.js` 零 import（不引入新依赖）

## 阶段 3：验证

- [ ] T6 新增 `tests/smoke/smoke-test-diag-throttle.mjs`，覆盖 6 条 Requirement 的全部 Scenario
- [ ] T7 运行 `node tools/run-smoke.mjs --filter=diag-throttle --jobs=1`、
      `--filter=evidence`、`--filter=shadow`，全绿
- [ ] T8 运行 `sdd-guard check --only DRY-C1,KISS-C1`，本文件对归零、全量只减不增
- [ ] T9 负控：变异窗口常量为 0（永不压制）⇒ 新判据红；变异体须自证真应用 + 语法可编译
- [ ] T10 全量回归（分母 457），失败集不新增

## 完成判据

- [ ] 所有复选框勾选
- [ ] 规范中每个 Scenario 至少被一个测试覆盖
- [ ] 显式报告「哪些规格分支没有被执行」
