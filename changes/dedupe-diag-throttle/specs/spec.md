# 诊断节流 规范

### Requirement: 系统必须对同一 key 的首次诊断立即放行

#### Scenario: 首次调用
- **GIVEN** 进程刚启动，`lib/diag-throttle.js` 的表为空
- **WHEN** 调用 `shouldReportDiag('shadow:no-paths')`
- **THEN** 返回 `true`

---

### Requirement: 系统必须在 300 秒窗口内压制同一 key 的重复诊断

#### Scenario: 窗口内的第二次调用
- **GIVEN** `shouldReportDiag('k')` 刚返回过 `true`
- **WHEN** 在 300 秒内再次调用 `shouldReportDiag('k')`
- **THEN** 返回 `false`

#### Scenario: 不同 key 互不压制
- **GIVEN** `shouldReportDiag('evidence:write-failed')` 刚返回过 `true`
- **WHEN** 立即调用 `shouldReportDiag('shadow:no-paths')`（不同子系统前缀）
- **THEN** 返回 `true`

---

### Requirement: 系统必须在窗口到期后重新放行

#### Scenario: 超过 300 秒后再调用
- **GIVEN** 某 key 上次放行发生在 301 秒前
- **WHEN** 再次调用 `shouldReportDiag(key)`
- **THEN** 返回 `true`

#### Scenario: 恰好 300 秒边界
- **GIVEN** 某 key 上次放行发生在恰好 300000 毫秒前
- **WHEN** 再次调用 `shouldReportDiag(key)`
- **THEN** 返回 `true`（判据是 `<` 严格小于，等于时已放行）

---

### Requirement: 系统必须在计时失败时 fail-open 放行

#### Scenario: Date.now 抛错
- **GIVEN** `Date.now()` 被替换为抛错函数
- **WHEN** 调用 `shouldReportDiag('k')`
- **THEN** 返回 `true` 且不抛出

> 理由：节流是**可观测性**设施。计时失败时压制诊断，等于在最需要留痕的时刻静默。
> 宁可刷屏，不可漏报 —— 与本仓「缺失必须留痕，不许静默回落」的纪律一致。

---

### Requirement: 系统必须让两个子系统共用同一张节流表

#### Scenario: 两模块导入同一实例
- **GIVEN** `lib/evidence-store.js` 与 `lib/shadow-host.js` 均从 `lib/diag-throttle.js` 导入
- **WHEN** 分别对同一 key 先后调用
- **THEN** 第二次被压制（证明共享同一张表，不是各持一份）

---

### Requirement: 系统必须不再有跨文件的节流表重复实现

#### Scenario: 判据归零
- **GIVEN** 仓库处于本变更应用后的状态
- **WHEN** 运行 `sdd-guard check --only DRY-C1 --code lib`
- **THEN** 报告里不再出现 `evidence-store.js ↔ shadow-host.js` 这一文件对
