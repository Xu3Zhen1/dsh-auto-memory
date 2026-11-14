# `acceptance-evidence.json` 说明（不可作为验收依据）

> 本文件的存在价值是**演示 sdd-guard `ACCEPT-E1/E2/E3` 三键证据链的格式**，
> 不是本仓当前状态的验收记录。**验收以 `node tools/run-smoke.mjs --jobs=4` 实时结果为准。**

## 1. 它是 2026-11-12 在隔离子项目跑出的快照

```
生成环境 : G:\AMup\refactor\dsh-auto-memory（隔离子项目，基线 700525ec）
生成日期 : 2026-11-12
生成命令 : node F:\DSH\AIcode\sdd-guard\tools\make-evidence.mjs \
             --config evidence.config.json --out acceptance-evidence.json \
             --cwd <隔离子项目绝对路径>
```

## 2. 里面有两处与当前主线**不一致**，原因不同

### 2.1 `tests`：456 / 4 / 460 → 现在应为 457 / 4 / 461

差异是**预期的**：本批合入新增了 3 个套件
（`smoke-test-team-primitives` / `-team-primitives-notrim` / `-diag-throttle`），
且全部为绿 ⇒ 分母 +3、通过 +3、失败数不变（仍为基线既有 4 条）。

复现：`node tools/run-smoke.mjs --jobs=4`

### 2.2 `mutation`：`killed=10, total=14` → **本仓不可复现**

★ **这不是"过期"，是该快照绑定了一个未合入的变更。**

快照里的 `10/14` 是在**含 `cf8c7a0e`（`iter5ReadMode` 嵌套扁平化）的树**上测的。
该片在合入方案中被**刻意排除**（它改 `lib/client.js` + `skins/`，DRY 贡献 0、
KISS 仅 −3，代价远大于收益）。

排除后，`M9` 的锚点失去了宿主：

```
M9 锚点: localStorage.setItem(ITER5_MODE_KEY, mirrored)
        └─ 变量 mirrored 由 cf8c7a0e 引入，主线无此代码 ⇒ 命中 0 次

700525ec（基线）     : mirrored 0 次
cf8c7a0e（被排除）   : mirrored 3 次   ← 锚点在此才成立
主线 220e0cac        : mirrored 0 次   ⇒ ANCHOR-MISS
```

**当前主线可复现的变异值是：**

```
killed = 9
applicable = 13          ← M9 因目标代码不存在，不计入分母
survived = 4             ← M11/M12/M13/M14，均为已定性的等价变异
anchorMiss = 1           ← M9
杀死率 = 9/13 = 0.69
```

复现：`node tools/mutation-scoreboard.mjs`

## 3. 为什么保留而不是删除

`acceptance-evidence.json` 在主线仓**没有任何消费点**
（`grep` `tools/` / `tests/smoke/` / `*.config.json` 均 0 命中）——它是纯静态文件，
不影响 CI，也不影响任何判据。删掉它反而会失去"证据链长什么样"的样例。

但**必须有本说明文件**，否则下一个人会拿 `10 vs 9`、`456 vs 457` 困惑，
甚至把 `10/14` 当作主线验收证据引用。

## 4. 若要一份**当前真实**的快照

```bash
# sdd-guard 不在本仓；它在开发者机器的某处（示例路径）
node <sdd-guard>/tools/make-evidence.mjs \
  --config evidence.config.json --out acceptance-evidence.json \
  --cwd "$(pwd)"
```

注意 `--cwd` **必须显式传**：不传时它默认回落到 sdd-guard 自己的仓库根，
三个 producer 会在错误目录执行并全部报 `Cannot find module`。

## 5. 附：ACCEPT-E2 的阈值现实

`minMutationRatio` 默认 `0.8`，而本仓 **0.69**（9/13）低于它 ⇒ `ACCEPT-E2` 判 FAIL。

那 4 个存活变异**在语言语义上不可杀死**（已在 `tools/mutation-scoreboard.mjs`
的注释里逐条说明），而 sdd-guard 当时**没有等价变异豁免机制**
（`equivalentMutants` 是后加的，且该版本尚未进入本仓使用链）。

⇒ 这个 FAIL **是真实的、应保留的**，不应通过调低阈值或剔除等价变异来"修绿"。