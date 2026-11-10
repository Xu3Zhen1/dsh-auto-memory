# AMup 项目冷数据档案（从项目笔记移出）

> 本文件存放**时序快照 / 一次性排查细节**，不再进项目笔记（笔记只留判据与指针）。
> 移出日期：2026-11-10。原文来源于 `~/.dsh/memory/workspaces/--G--AMup--/MEMORY.md` 的历史条目。

---

## A. #566（P1，autoContinue 完全不可用）三轮核实全过程

### A.1 第一轮：与 fork 的关系核对

**结论**：#566 描述的现象在当前 fork 上大概率已被 2026-11-09 的两处 P0 修复覆盖；报告者用的 3.3.17（上游 main 线）不含这些修复。

逐条：
1. 现象1「红字常驻 ✗ refresh ritual failed: ritual-inspection-unavailable」——fork 已有两段修复：
   · `index.js:6418` `ritualUsable` 预判（`sc.prompt`+`sc.inspect` 都在才跑仪式）；不可用只 diag（:6420），**不 throw**；
   · `index.js:6470` 把 `inspection-unavailable` 从「必须 throw」白名单里排除 ⇒ 按 `disabled` 同类跳过仪式、用 prepared 材料继续。
   ⇒ 常驻红字来自 `client.js:8025`（前端 onMsg 展示 msg），其 msg 源头是 `:6471` 的 throw；该 throw 已对 inspection-unavailable 关闭。
2. 现象2「点同意接续 ⇒ no pending auto-continue」——**未必被覆盖**：`hostAutoContinue` 开头若 `st.armed` 为空才返回该错，而 arm 在 tick 时已设；报告者环境里可能因仪式 throw 导致整次接续失败、armed 被清（:6460）。若如此修 ① 后一并消失；**未实测**。
3. 「两处能力校验不一致」——**确凿**：`:6394` 只查 `sc.create`；`:7092` 要求 `sc.prompt`+`sc.inspect`。
4. 「inspect 签名不是 (sessionId, signal)」——当时无法独立证实（app.asar 213MB、`app.asar\dsh` 不可读），交 parsing 核实。它自己标注「不确定」。

另：#558「整理向导模型/强度没传到子代理」**与接续链路无关**（属 upgrade/整理向导 → 子代理链路）。

### A.2 第二轮：parsing 实测宿主机（0.2.2-rc.1）

**坐标系差异**：parsing 读到的宿主是 **0.2.2-rc.1**，而 #566 报告者用 **0.2.1-rc.5**。
**我无法复算**：本机 `app.asar` 是单文件（IsDir=False），`app.asar.unpacked/dsh/node_modules/@deepseek-ai` 只解包 3 个包，session-controller 不在其中 ⇒ parsing 的结论按「他报的事实」引用。

parsing 报（0.2.2-rc.1）：
① `sessionController` 共 **对外 Remote 成员 28 个**（resolveAgent/list/search/create/selectModel/initializeDefaultModel/modelCatalog/canOpenWorkspacePath/workspaceDesktop/openWorkspacePath/workspacePathApplications/rename/fork/prompt/attachment/updateQueue/cancel/page/events/observeEvent/observeProjections/state/observeState/wait/follow/projections/control）；
② **`inspect` 不在其中**：`typert.host.js` 成员块命中 0；`lib/index.js` 全文 `inspect` 仅 2 处且都是注释/错误消息（:3071 JSDoc、:3104 错误模板）；
③ #566 grep 到的三种 `async inspect(...)` 归属：`inspect(spec,options,signal)` 属 **pluginManager**（读包 spec）、`inspect(workspaceFileScope,path,signal)` 属 workspace 文件服务（读文件）——**都不是会话**；
④ `create(request)` 单参；`prompt(request, signal)` 双参且 `:4049` 首行 `signal.throwIfAborted()`；
⑤ 读会话事件的等价能力是 `events(request, signal)`（`page` 已 `@deprecated`）与 `follow(...)`，地址形态 `{ address: { kind:'session', sessionId } }`——**不接受裸 sessionId**。

⇒ 判定：「inspect 签名错位」**不成立**（至少 0.2.2-rc.1：方法根本不存在）；插件 `:7092` 判据恒真 ⇒ `ritual-inspection-unavailable` 恒返回，**不需要「签名错位」假设**；fork 既有降级正是对该宿主的正确适配。
⇒ 仍未覆盖：0.2.1-rc.5 无法核实；`no pending auto-continue` 未查；真机触发未实测。
⇒ 0.2.1-rc.5 拿不到（parsing 翻遍 app.asar / updater 缓存 `%LOCALAPPDATA%\@deepseek-aidsh-desktop-updater`（只有 rc.1 installer）/ `%APPDATA%` / pnpm·npm·.cache）。**两台机器安装形态不同**：它那台 app.asar 是可读目录，我这台是单文件。

### A.3 第三轮：全量契约对账（6 个方法）

吻合 5 个：`cancel {sessionId}` / `rename {sessionId,title}` / `selectModel {sessionId,provider,model,reasoningEffort?}` / `resolveAgent` 返回 `{agent}|{error}` 原样透传 / `create` 入参两处合法（`:6500`、`:13229`）。
假阳性 2 个：`sc.toFixed` @10376、`sc.request` @17856 是同名局部变量。

**唯一差异**：`String((created && (created.sessionId || created.id)) || '')` 出现在 **`index.js:6513` 与 `:13233` 两处**；宿主 `SessionCreateValue = { sessionId, agentPreset? }` **无 `id`** ⇒ `created.id` 两支是**死分支**。
性质：不是缺陷（`||` 顺序对），属「本地兜底写法比宿主契约更宽」——若别处写 `created.id` 而漏 sessionId 会变真故障，且现有测试抓不到（对的那支永远命中）。**同一形状 2 次，比单点更易被复制。**
（另 `created.childId` @13419/13420 是子代理路径，字段名不同，不属这条。）

### A.4 本片区域累计

| # | 项 | 处数 | 性质 | 处置 |
|:--|:--|:--|:--|:--|
| 1 | `inspect` 不存在 | 2 调用点 | **真缺陷**（0.2.2-rc.1） | fork 已修（`:6418`/`:6470`），不改 |
| 2 | `prompt` signal 降级 undefined | 3 处 | 潜在（死代码形状） | 不改，记排查口径 |
| 3 | `created.id` 死分支 | **2 处** | 潜在（兜底比契约宽） | 不改，记结构性盲区 |

### A.5 prompt signal 三处（明细）

- `:6595` `sc.prompt({...}, signal)`，signal 来自三元 `AbortSignal.timeout ? ... : undefined`；
- `:6671` 直接 `sc.prompt({...}, AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined)`；
- `:7131` 在 `probe((signal) => sc.prompt({...}, signal))` 内 ⇒ ✅ 必传；
- `:13001` `sc.prompt({...}, signal)`，同 `:6595` 三元。

⇒ 三处依赖三元降级分支。宿主 `prompt` 首行 `signal.throwIfAborted()` ⇒ 传 undefined **必然 TypeError**（实测 `fn({}, undefined)` → `Cannot read properties of undefined (reading 'throwIfAborted')`）。
⇒ 但当前环境 `AbortSignal.timeout` 存在（node v24.19.0；Node ≥15.14 起有）⇒ 三元的 else 分支是**死代码形状的风险**，非现网故障。
⇒ **排查口径**：将来若有用户报 `throwIfAborted` TypeError，优先查这三处——失败会伪装成宿主内部错误。
⇒ 落盘证据：`alpha6run/verify-prompt-signal.mjs`（5/0）。

### A.6 给 #566 的处置建议（未发上游）

不改代码，回报报告者 + 附降级证据 + 给一条带约束的自证命令：
1. **必须先打印包版本**（`dsh-api-session-controller/package.json`），否则「有/无 inspect」无法归因到具体版本；
2. **必须给命中数而不是「没搜到」**：`(Select-String … -Pattern 'inspect' -AllMatches).Matches.Count` ——「没搜到」与「搜错文件」同形。

---

## B. 身份卡（whoiam.md）正文易变事实漂移

**结论**：不是产品固有缺陷，是用法/维护缺陷——但暴露一个可观测性缺口。

实证：
- `renderWhoiamScaffoldPre` 模板只有两节：`## 这是什么` + `## 归属说明`——**没有 HEAD/ahead/behind/tag 结构**，不是产品引导写易变事实；
- `renderWhoiamStatusPre` 只报文件是否存在、作用域树（含 orphan/mismatch/bad-frontmatter）、本会话身份、作用域链——**不校验正文**（设计如此）；
- scaffold 语义「已存在绝不覆盖」⇒ 正文一旦写上，**没有机制再核对它**；
- 模式：3 张卡里只有 `G:\AMup\whoiam.md` 含 HEAD/ahead/behind/tag；另两张无或只提 alpha ⇒ 单点写法，非系统诱因。

⇒ 最小改进（文案级，不需机制）：① status 输出加「正文未校验（自由文本）」；② scaffold 注释加「勿在正文写易变事实，改放 PLAN/账本」。
⊘ 待定：是否落到 fork。

---

## C. 「写根身份时提示写进 AGENTS.md」可行性核实

现状：
- 插件**从不写 AGENTS.md**（全 lib 里 AGENTS 命中 1 处）；
- `index.js:15768-15774` 把 AGENTS.md 列进「项目约定类」外部记忆源（与 CLAUDE.md / CODEBUDDY.md / Windsurf.md / copilot-instructions / .cursor/rules 并列），**link 模式**（只记路径不抄内容）push 成 `project-conventions`；
- `WHOIAM_SOURCES` 只有 file / 降级 / mismatch / bad-frontmatter ⇒ **身份无 AGENTS 侧入口**。

⇒ 这条补的是**跨工具可见性缺口**：whoiam 身份只对 DSH 会话可见，而 Codex/Claude Code/Cursor/CodeBuddy 只看 AGENTS.md。

硬约束：①**只能放指针不能放副本**（复制 name/parent/status = 第二份真相）；②**必须幂等**（marker 判重）；③**不擅自改用户文件**（需显式开关）。

三档落地：A 文案级（零风险，status/scaffold 附指针模板）；B 检测级（status 发现 AGENTS.md 无 whoiam 指针则提示）；C 写入级（`linkAgents:true` 才幂等追加）。**推荐先 A+B。**
⊘ 待定：是否实现。

---

## D. 接续会话项目归属（机制、原缺陷与已实施修复）

四步链路：
1. 源会话交付带 tag：`index.js:6511` `srcProjectTag = d.projectTag`；
2. 写待续身份桥：`:3741 rememberContinueIdentity(newId, srcProjectTag, oldSid, d.contSeq)` → `<dshHome>/memory/continue-identity-pending.json`，**必须早于 sc.prompt**；
3. 两路回填 rt：主路 `:6592-6611`（agent 就绪后写 `rtNewP.projectTag` + `peekRuntime` 校验；失败只 diag）；兜底路 `whoiamIdentityFor:3713-3721`（rt 为空 ⇒ 按 session.id 查表 ⇒ 命中写回 rt / 删 pending / diag）；
4. `resolveWhoiamIdentityPre({tree,wsKey,projectTag})` 按 name 定位 + 自下而上建 scopeChain ⇒ 注入 `[身份] wsKey · project · scope`。

原缺陷（静默）：桥失效（TTL 10 分钟过期 / 源会话无 tag）时 projectTag='' ⇒ resolve 走「未指定 ⇒ 工作区根、source=file」⇒ **身份看起来完全正常**，只是 project 悄悄变根，无告警。
后果：续接首屏落根项目；`handoff/projects/<project>.md` 副本选不到；白板按错 scope 归。
同族旧病 `whoiam.js:150-156`（指定但找不到 ⇒ 静默拿根）已修为 `source=降级`。

**已实施修复（2026-11-10，B 步）**：
- `continue-identity.js` 新增 `recoverProjectTagForSessionPre(file,sid,opts)`：扫 `auto-continue-done.d/`，按 `rec.to` 命中、沿 `rec.from` 回溯（maxDepth 4 / maxFiles 200 / fail-soft）；
- `index.js` `whoiamIdentityFor` 在 pending 未命中的 else 分支调用反查并回填 rt（**优先级 rt > pending > done**）；
- `continuation-state.js` `finishContinuedSource` 无 tag 时写 `projectTagMissing: true`（留痕）；
- 套件 31 → **47/0**；三条变异负控全红。
- 长期证据：`dsh-auto-memory/repro/repro-continue-project-offset.mjs`。

---

## E. 已过期的时序快照（保留供追溯，勿当现值）

### E.1 上游 3.4 快照坐标（2026-11-08）
- 当时判断：最新 3.4 预览是 dangling commit `c2dee738`（package.json 3.4.0-alpha.6，2026-11-07）；`upstream/preview` 是 3.4.0-alpha.5（`b989a5f9`）更旧；`upstream/main` 是 3.3.17。
- **后经实测更正（2026-11-10）**：`git ls-remote upstream preview` = **`c2dee738`** ⇒ `upstream/preview` 已推进到该提交，与 fork 线 HEAD 相同。见项目笔记「远端核验要打远端」条。
- blob 等价：`lib/procedure-store.js`（5ed974a3）、`lib/memory-hub.js`（ed28dba8）在三个 ref 中**逐字节相同** ⇒ 行号可跨版本复用；`lib/index.js` 三版各不同（926bf30e / e7984a57 / 24b16b13）⇒ 行号必须按 ref 分列，回灌时用**函数锚文本**定位。

### E.2 重启后验证口径 R151/R152（2026-11-09）
- 只有 R151 有「新代码已装载」HTTP 信号：`auto-continue-state` 出现 `autoContFailCount`/`autoContFused` 两键（键存在性，与值无关）。
- R152 无等价可观测键，其装载与生效只能由一次真实自动接续的四类证据判定：① diag `host auto-continue project carried: newId=… project=…`；② `auto-continue-done.d/<sha256(from)>.json` 出现 `projectTag`；③ 新会话 `whoiam?ws=` 的 projectTag == 源 tag；④ 新会话注入块出现 `[白板来源] 本项目快照（project=…`。
- 活代码基线（2026-11-09 06:20）：宿主 pid 28804，StartTime 2026-11-09 01:51:46；部署 lib/index.js mtime 04:10、sha256 `9FB9ECBD109AF814…`（R151+R152 两处标记均命中）；结论：宿主旧于磁盘 ⇒ 重启仍必要，但 R151 已在 01:51 装载。
- `autoContinueEnabled=false` ⇒ 不打开开关就永无自动接续事件，R152 写侧证据永不出现。

### E.3 parsing 解耦定稿指纹（2026-11-09）
- host-inventory.json 226,096 B / sha256 1da769eb…689b24；host-inventory.md 70,671 B / bfbf67f7…391afc；client-inventory.json 116,868 B / 1a28b159…5cce39；client-inventory.md 67,512 B / 5f82dd54…08241b。

### E.4 接续模块拆分三层判定（2026-11-09）
- 上游 alpha.6 宿主已有独立模块 1,089 行（continuation.js 35 / continuation-state.js 207 / event-carry.js 126 / water-window.js 553 / handoff-anchor.js 115 / path-write-queue.js 53）；仍在 index.js 的接续核心 ≈1,100 行（arm 69 + tick 26 + hostAutoContinue 285 + state 44 + decide 62 + permission 30 + 闩 34 + 触发点 21 + carry 444 + 仪式 87 + 路由 30）。客户端接续面 ≈520–560 行、散在 ≥10 处（设置字段 3 份重复）。
- 判据：判断「某功能能否独立成插件」，先数它需要几条**服务链**。接续 = 水位测量→会话生命周期→交接材料→持久闩/诊断 四条链；跨 3 条以上服务链的功能，独立插件必须先契约化，否则拆出的是空壳。
- 双实例风险：接续类功能若拆包，必须证明「两个实例同时 enable 时只有一个 arm」；负控必须能造出「两个都执行」的红。
- 客户端独立 bundle 前置：单 `__ModuleLoader__` factory + 无 bundler + 生成区逐字锚点 + 29/36 片段同 SCC ⇒ 前置不成立时不要承诺「独立 bundle」，只承诺「文件内分区」。
- 完整评估：`parsing/decoupled/AUTO-CONTINUE-SPLIT.md`。