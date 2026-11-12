# 配置锁 claim 复用 规范

### Requirement: 系统必须让 config-lock 的 claim 与 shared-state-lock 共用同一实现

#### Scenario: 两处行为一致
- **GIVEN** 仓库处于本变更应用后的状态
- **WHEN** 运行 `sdd-guard check --only DRY-C1 --code lib`
- **THEN** `config-lock.js ↔ shared-state-lock.js` 的块数从 4 降为 3

---

### Requirement: 系统必须保持 claim 的原子独占语义

#### Scenario: 已存在的锁文件不可被覆盖
- **GIVEN** 锁文件已存在（活主持有）
- **WHEN** 另一个进程调用 `claim(lock)`
- **THEN** 抛 `EEXIST` 且**不删除**已有文件

#### Scenario: 认领失败时清理自己创建的文件
- **GIVEN** `openSync(file,'wx')` 成功但后续写元数据抛错
- **WHEN** `claim` 捕获该错误
- **THEN** 关闭 fd、unlink 该文件、并把原错误重抛

---

### Requirement: 系统必须保持 owner 元数据的字段契约

#### Scenario: 元数据含 pid 与 host
- **GIVEN** `claim` 成功写入
- **WHEN** 读回文件内容并 JSON 解析
- **THEN** 同时含 `pid`（正整数）与 `host`（本机 hostname）

> ⚠️ 已知覆盖缺口：删掉 `host` 字段是**本机不可观测**的等价变异（同机回环下
> `host` 恒等于自身，只有跨机场景才暴露）。实测 `--filter=lock` 全 5 套对该变异全绿。
> 该不变量目前无本机判据，需跨机或桩 `os.hostname` 的套件才能覆盖 —— 如实记录，不遮掩。
