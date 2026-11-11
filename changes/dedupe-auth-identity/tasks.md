# 任务清单：消除 team-auth ↔ team-identity 的 9 处跨文件重复块

> 每条任务给出**具体文件路径**。路径会被机器校验：不存在且未标注"新建"的，直接判失败。

## 阶段 1：准备与取证

- [ ] T1 在 `lib/team-auth.js` 与 `lib/team-identity.js` 中确认 4 个原语**规范化后逐字节相同**
      （比对同名顶层函数，期望 4 个 SAME / 0 个 DIFF）
- [ ] T2 记录改前基线：`DRY-C1` 全量 78 块，其中本文件对 9 块；`KISS-C1` 全量 2092 处

## 阶段 2：核心实现

- [ ] T3 新建 `lib/team-primitives.js`：导出 `toText` / `safeGet` / `safeDiag` / `safeMessage`，
      **零 import**（标准库都不用），保留原 JSDoc 语义说明
- [ ] T4 在 `lib/team-auth.js` 中删除本地 4 份实现（原 L58–L73），改为
      `import { toText, safeGet, safeDiag, safeMessage } from './team-primitives.js'`
- [ ] T5 在 `lib/team-identity.js` 中删除本地 4 份实现及 2 段 JSDoc（原 L74–L91），改为同样的具名导入

## 复用复查（在 T5 之前执行）

- [ ] 检查 T3 是否与 `lib/shared-state-lock.js` / `lib/team-transport.js` 的既有能力重复
      —— 结论：`lib/shared-state-lock.js` 不含这 4 个原语；`lib/team-transport.js` 的 `toText`
      **语义不同**（不 trim），不可复用，已在提案非目标表登记理由
- [ ] 确认 `lib/team-primitives.js` 不引入新依赖（应为 0 条 import）

## 阶段 3：验证

- [ ] T6 运行 `node tools/run-smoke.mjs --filter=team --jobs=2` 与
      `--filter=issue370` / `--filter=symbol-closure` / `--filter=depre-residue`，全绿
- [ ] T7 运行 `node F:\DSH\AIcode\sdd-guard\cli.mjs check --only DRY-C1,KISS-C1`，
      确认本文件对归零、全量只减不增
- [ ] T8 负控：变异新模块 `safeGet` 的 catch 分支，确认至少一个套件真变红（记录变异体来源与报错）
- [ ] T9 确认变更文件均落在声明范围内（仅 3 个文件，均在 `lib/`）

## 完成判据

- [ ] 所有复选框勾选
- [ ] 规范中每个 Scenario 至少被一个测试覆盖
- [ ] 显式报告「哪些规格分支没有被执行」
