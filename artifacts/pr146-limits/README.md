# PR146 限制项补齐

基线：`79528da`。本轮继续修改原 PR 分支；测试全部使用隔离 DSH_HOME。上一轮报告保留，当前结论以此文和 UI-INVENTORY 为准。

## 已解决的代码问题

1. **宿主设置窄屏挤压**：容器不足 360px 自动展开设置，桌面也可手动展开。稳定 portal 容器移动到 body，表单实例不重建；保留草稿、当前分组、返回宿主、Esc 和焦点圈定，不修改宿主侧栏。
2. **宿主强制卸载丢草稿**：按会话、工作区及 host/workbench 来源保存模块内临时草稿。重挂载恢复，保存/取消/明确同意丢弃时清除；服务器已变更时显示冲突提醒。配置不写 localStorage/sessionStorage，不自动提交恢复内容。浏览器进程退出仍由 beforeunload 提醒，不能保证进程崩溃后恢复。
3. **首次欢迎立即消失**：宿主首次加载会话不再被当成用户从一个会话切到另一个；后续真实切换仍会撤下向导。
4. **欢迎开关写错类型与失败假回显**：工作台目录字符串不再作为 boolean switch，改为既有 `workbenchEnabled`；读配置失败禁用写入并提供重试，写入失败回退选中态并明确报错，保存期间禁用重复写入/完成。
5. **自定义 DSH_HOME 的推理库找不到**：deep detector 原来硬编码 `os.homedir()/.dsh/profiles`，现在使用 `resolveDshHomePre()/profiles`。这是本轮真实安装验证发现的问题，新增执行实际方法的回归。

## 新增真实证据

| 项目 | 结果与证据 |
|---|---|
| 窄屏/展开设置 | `responsive-results.json` 15 条通过；320/390/640px、草稿保留、取消、Esc、Tab、深色、样式单实例。截图 `settings-*.png` |
| 首次运行 | `first-run-results.json` 5 条通过；全新浏览器自动欢迎、真实开关写入/还原、完成退出、同意后真实建立工作区/会话且权限校验通过 |
| 欢迎失败处理 | `tour-failure-results.json` 4 条通过；明确注入 GET 503/POST 500，验证禁用、重试、回退、恢复原值。没有把故障注入当真实上游故障 |
| 下载 | `download-results.json`：真实宿主下载 135,392,183 字节，5 文件，终态 done。发起经过真实 loopback API，界面读取实际进度，无拦截或模拟下载 |
| 安装与离线推理 | `semantic-results.json`：5 文件大小/SHA256 匹配 manifest；实际加载 E5 q8 CPU 模型，两段文本产生不同且归一化的 384 维向量。未注入假 embedder |
| 宿主检测/接续拒绝 | `host-semantic-results.json` 4 条通过；真实宿主探测隔离 profile 内的 transformers 并显示就绪，空闲时无 pending，非法 agree 被拒绝 |
| 索引/删除/迁移 | `maintenance-results.json` 9 条通过；真实文件追加临时锚点、重建 sidecar、越界删除拒绝、摘要冲突拒绝、实际删除及磁盘回读、导出/预览/导入。源文件与开关 finally 还原 |
| 既有交互 | `live-checks.json` 37 条与 `edge-results.json` 13 条再次通过；笔记、日程、设置、失败重试、经典切换、长文/来源/缩放 |

下载模型和推理库仅安装于 `%TEMP%/dsh-iter5-qa-20260928`。transformers 3.7.6 与 onnxruntime-node 1.21.0；首次 npm 下载长时间停滞，改用 npm mirror 重试后完成，沿用 npm 的包完整性校验。npm 12 阻止了可选安装脚本；本次 Windows CPU 路径使用包内预编译库，真实推理已经验证，不声称其他执行后端也可用。

## 回归

- 生成器 build/check、两入口语法、`smoke-test-iter5-skin.mjs`、`smoke-test-ui-host-limits.mjs`、工作台路径契约通过。
- `smoke-test-autocont-host.mjs` **95/95**：执行生产方法的宿主逻辑回归，覆盖倒计时、过期拒绝、取消/仪式/建立调用顺序等；sessionController 为测试实现，明确不是收费模型端到端成功证据。
- 全量 **197 PASS / 26 FAIL / 0 TIMEOUT**，CI 四项排除口径不变，失败集合与上一轮相同。`smoke-comparison.json` 保存逐项对比。中间发现源码换行意外变 LF，已恢复 CRLF；另将错误依赖欢迎目录 boolean key 的旧断言改为“设置字符串输入存在 + 欢迎不得布尔写目录”两项，未放宽原功能要求。
- Impeccable 检测仅提示既有交接正文左线，未新增主题问题。

## 仍需外部条件的项目

- 隔离宿主明确提示“添加 API Key 开始使用”。工作区/会话创建、权限与挂载已真实完成，**初始化模型回复、收费模型的完整自动接续成功链路仍不能凭空验证**。本轮没有借用或导出日常凭据，也没有用假模型截图冒充真实成功。
- 远端团队服务权限组合、Python int8 可选档、升级安装、Desktop/Mica、所有语言/多设备仍需对应环境。旧的 26 项失败仍在报告中，没有以本轮新增通过数掩盖。
- 默认隐藏的白板画布未变成正式入口；本轮未为了消除“未验证”标记而启用未达可用标准的功能。

## 复跑

先启动隔离 DSH web 19388，登录 URL 只存 `%TEMP%/iter5-refine-host.log`。依次运行 `verify-responsive.cjs`、`first-run.cjs`、`tour-failures.cjs`、`maintenance.cjs`、`host-semantic.cjs`、`semantic-inference.mjs`。下载复跑需显式执行 `download.cjs`，会真实访问模型镜像；不要并行运行配置写入脚本。迁移生成目录和模型资产均在隔离根内，不进 Git 或 npm 包。
