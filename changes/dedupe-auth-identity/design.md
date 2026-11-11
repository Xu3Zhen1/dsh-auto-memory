# 技术设计：消除 team-auth ↔ team-identity 的 9 处跨文件重复块

## 方案摘要

新建零依赖模块 `lib/team-primitives.js`，承载 4 个「安全访问原语」；
`team-auth.js` 与 `team-identity.js` 改为具名导入，删除各自私有副本。
函数体逐字节照搬（含注释），不重写、不"顺带优化"。

## 复用清单（DRY · 强制）

> 下面每条路径都真实存在（`DRY-D1` 会机器校验）。

| 现有模块路径 | 提供什么能力 | 本次如何复用 |
| :-- | :-- | :-- |
| `lib/team-auth.js` | 出站鉴权 fetch；内含 4 个原语私有实现 | 迁出这 4 个实现，改为导入；其余逻辑不动 |
| `lib/team-identity.js` | 成员身份与能力矩阵；内含同 4 个原语私有实现 | 同上 |
| `lib/shared-state-lock.js` | 锁协议、`reclaimDeadGate`、`canonicalSharedStatePath` | **不适用**：不含本片 4 个原语。本片沿用其「判据只有一份实现」的既有纪律，不复用其代码 |
| `lib/team-transport.js` | 传输后端；含同名 `toText` / `safeGet` / `safeDiag` / `safeMessage` | **不适用（刻意不复用）**：其 `toText` **不做 trim**，与本片 4 原语语义不同（实测 3/7 输入结果不同）。合并会静默改变传输层行为 |
| `lib/config-lock.js` | 配置事务锁；已示范「复用而不再抄一份判据」 | **不适用**：仅作纪律先例引用（其头注 L7–L12），不为本片提供代码 |

## 新增依赖（KISS · 强制）

无。`lib/team-primitives.js` **零 import**（连 `node:` 内置都不需要）。

## 接口契约

本片是**进程内单包插件**，没有前后端边界（`guard.config.json` 刻意不配 `boundaries`／
`contractPrefixes`，配了只会让 `DECOUPLE-2` 从 skip 变成误报）。因此「契约真源」不是
跨端 schema，而是 **4 个原语的唯一实现处**：

| 契约真源路径 | 承载什么 | 谁引用 |
| :-- | :-- | :-- |
| `lib/team-primitives.js` | `toText` / `safeGet` / `safeDiag` / `safeMessage` 的**唯一实现**与语义注释 | `lib/team-auth.js`、`lib/team-identity.js` 具名导入 |

**真源纪律**：这 4 个函数的行为只允许在 `lib/team-primitives.js` 里改。两个调用方
（`lib/team-auth.js`、`lib/team-identity.js`）**不得**再出现同类私有实现
—— 本片的验收判据就是「该文件对在 `DRY-C1` 里归零」。

> **明确不做的契约统一**：`lib/team-transport.js` 与 `lib/team-transport-http.js` 的同名
> `toText` **不属于本契约**（语义不同：不 trim）。它们是另一条契约，须独立立片。
> 本片若把它们也纳入，等于用一个契约覆盖两种语义 —— 那正是静默改变行为的路径。

## 结构决策

**为什么建新模块，而不是让 `team-identity.js` 去 import `team-auth.js`：**

| 选项 | 采纳 | 理由 |
| :-- | :-- | :-- |
| A. 提 `team-primitives.js` | ✅ | 两个文件是**同层**关系（auth 出站 / identity 成员），谁 import 谁都会造出一条**假的依赖方向**：identity 并不需要 auth 的任何鉴权能力，只为拿 4 个字符串工具而 import 整个鉴权模块，会让「改 auth 会不会影响 identity」变成需要人脑记住的隐性耦合 |
| B. identity → auth | ❌ | 造出虚假依赖方向，且 `team-auth.js` 有模块级状态 `cachedVersion`，被无谓拉起 |
| C. auth → identity | ❌ | 更糟：identity 依赖配置与 engine，被 auth 拉起会把两侧初始化顺序绑死 |

## 刻意不采用的模式

| 模式 | 为什么不采用 |
| :-- | :-- |
| 建 `lib/utils.js` 之类的通用命名 | 本仓已有 `team-*` 命名族；通用名会诱导后续把**任何**小函数都丢进去，最终变成新的垃圾场。名字带 `team-` 前缀，把适用范围钉死在团队子系统 |
| 用 class / 命名空间对象导出 | 调用点全是 `toText(x)` 这种裸调用，改成 `P.toText(x)` 要动 40+ 处调用点，diff 无法审查，且没有任何收益 |
| 把 4 个原语做成可配置（trim 开关） | 那正是「参数化到能覆盖所有用法」的坑：会诱使传输层也来接，从而把**语义不同**的两套静默合并成一个带开关的函数——比现在更危险 |

## 验证方式

1. **行为对拍（改前 vs 改后）**：用固定输入集跑 4 个原语，输出序列化后比对。
   输入集含边界：`null` / `undefined` / `0` / `''` / `false` / `'  x  '` / `'\n\t'` /
   抛错 getter / 非对象 holder。
2. **机器判据**：`sdd-guard check --only DRY-C1,KISS-C1`，本文件对归零、全量只减不增。
3. **回归**：`node tools/run-smoke.mjs`（分母 457），失败集不得新增。
4. **负控**：变异 `lib/team-primitives.js` 的 `safeGet`（去掉 catch 的兜底返回），
   确认至少一个套件真变红；且变异体须自证「真应用 + `node --check` 通过」。
