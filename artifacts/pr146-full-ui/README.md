# PR146 全入口 UI 改造与验收

> 后续限制项已补齐一批：以 [PR146 限制项补齐](../pr146-limits/README.md) 为当前状态，下文保留本轮历史记录。

基线 `ee9ef014b0f3cd28fccd2da44a379293d51757a0`，2026-09-28。入口逐项结果见 [UI-INVENTORY](../../UI-INVENTORY.md)。本目录全部效果截图来自本机隔离 DSH web/profile/workspace 的真实组件与 API，不是 Demo。未使用或修改日常 profile。

## 交付

- 欢迎保留全部 **9 步**、选项、保存/退出逻辑。重新安排居中主视觉、标题、可滚动正文与稳定操作区；窄屏正文不再受旧版 56px 内边距挤压。保留真实未安装与未配置提示。
- DSH 设置注册改为 `Iter5HostSettings → Iter5Settings`，直接复用生成器的四组表单、patch 保存、失败与取消逻辑，没有工作台侧栏。多实例使用独立 ID；宿主换页/关闭时保护草稿。
- 轻面板默认轻量概览，可展开全部原分区，保留拖动、调整、关闭重开与返回完整工作台。无当前会话时完整工作台按钮禁用并解释原因。
- 全部注册入口与看板 portal 获得独立 `Iter5Surface`。共享样式引用计数清理；经典回退仍保留共享基础控件。修复 shell.overlay 被宿主设置层叠上下文遮挡，以及实际 DSH 的 body 深色标记/color-scheme 未被旧监听识别的问题。
- 主工作台、11 个可见页面（含团队、统计）延续紧凑布局；没有统一压缩欢迎，也没有删除经典模式、白板或不常用入口。
- npm 包排除历史设计演示、交接 ZIP、概念截图和嵌套 node_modules；本目录不在发布包中。

## 同条件 before / after

桌面均 1440×900。基线截图通过临时加载 `git show ee9ef01:lib/client.js` 的真实宿主取得，finally 恢复工作中源码；截图等待动画结束。

| 入口 | Before | After |
|---|---|---|
| 欢迎 | [原欢迎](before-welcome.png) | [新欢迎](after-tour-light-1.png)、[深色](after-welcome-dark.png)、[390px](after-tour-narrow-4.png) |
| DSH 设置 | [旧宿主表单](before-host-settings-shell.png) | [共享表单](after-host-settings-light.png)、[深色](after-host-settings-dark.png) |
| 轻面板 | [原面板](before-panel.png) | [概览](after-panel-light.png)、[展开](after-panel-expanded.png)、[深色](after-panel-dark.png) |

欢迎每步的完整截图为 `after-tour-light-1..9.png` 与 `after-tour-narrow-1..9.png`。其余实际页面为 `after-page-*.png`，白板为 `after-whiteboard.png`，更新/诊断为 `after-update-dialog.png`、`after-host-diagnostics.png`。截图保存时最终新增的“无会话禁用”状态以运行代码为准；独立面板早期图片可能显示尚未禁用的按钮。

## 验证结果

真实宿主共 **98 条断言通过**，结果分开保存：

- `results.json`：29 条，独立设置、全欢迎步骤、浅深色、390px、轻面板拖动/重开、同时打开两处设置 ID 唯一、无 React 异常。
- `host-settings-results.json`：8 条，宿主草稿/取消、保存 500 后重试、还原原值、方向键、诊断、无异常。500 是明确的故障注入，其余读写经过真实宿主。
- `live-checks.json`：37 条，真实隔离配置、即时模式、保存失败、笔记、日程新增/完成/删除、回顾反馈、窄屏导航与经典切换。
- `edge-results.json`：13 条，真实长文件写入/还原、英文长串、来源可达、字体放大、跨组草稿、拒绝离开/刷新/经典切换、取消。
- `extra-results.json`：11 条，独立白板入口、轻面板真实缩放/返回工作台/深色/窄屏、欢迎正反 Tab、减少动效与 125%/150% 继承字号 token。字号 token 测试不冒称已验证所有宿主偏好入口。

`node --check lib/index.js`、`node --check lib/client.js`、生成器 `--check`、`smoke-test-iter5-skin.mjs` 均通过。后者执行实际生成表单与 Hook 测试，新增真实宿主主题标记测试，保留 LF/CRLF 构建幂等检查；共享入口按本次已审阅修改更新源码冻结指纹，不再声称经典源码完全未改。

全量沿用 CI 的四个排除项（`-live`、`m79-feature-v2`、`m710-fv2-emit`、`c4-fresh-install`）：**196 PASS / 26 FAIL / 0 TIMEOUT**。冻结原 head 的 tracked tree 为 196 PASS / 24 FAIL；将本机原有的两份未跟踪 ui-v4 套件复制入冻结树，二者也失败。最终相同 222 套件失败集合完全一致，详见 `smoke-comparison.json`，没有新增失败，绝不等于全部通过。原因为缺失 Python 旧 worker/fixtures、既有源码契约不匹配等；没有删除用例或放宽失败断言。

机械设计检测只报告既有交接正文 3px 左线，未改该既有规则。`npm pack --dry-run` 包含新主视觉与 skin 源，排除验收目录和开发依赖，包体从本地原配置约 369MB 降至约 40MB。

## 限制与未验证范围

- **390px 下 DSH 设置自身保留左侧导航，给插件约 100px 宽度，依旧拥挤**，见 `after-host-settings-narrow.png`。插件没有越权改宿主设置外壳；完整工作台窄屏回归通过。
- 首次自动弹出、欢迎完成后真实初始化、全部开关持久化组合、自动接续倒计时/费用调用、模型下载与安装、更新安装、导入导出、删除/迁移/重建索引、团队远端权限组合未做端到端验收。访问欢迎下载步时拦截 `/semantic-download`，只验证真实状态展示，未下载模型。
- 默认隐藏的白板画布未启用，白板看板仅确认真实入口与当前状态；未伪造图数据。未全覆盖多工作区、多窗口并发、Desktop/Mica、所有语言、全部视口与状态笛卡尔积。
- 设置脏状态保护覆盖已测宿主按钮导航与关闭/刷新机制；外部宿主强制卸载不保证能够拦截。
- Before 基线与 After 首屏截图的背景会话是否打开不同（独立入口验收要求），比较对象是插件面板本身，不能用于宿主背景布局评价。

## 素材

`lib/assets/skin/slots/hero.welcome-memory-v2.png`：本次通过内置 imagegen 生成，1536×1024，PNG 带透明通道，约 1.48MB；记录片/丝带汇入蓝色册页的构图，无 UI 文字。浅深色共用透明图，由各自背景承接；资源路由、失败占位保持原机制。旧图保留，未覆盖。未引入第三方运行时图片/字体服务。SHA256 见 `asset-manifest.json`。

## 复跑

使用已有隔离 profile 启动 19388 端口，日志只放 `%TEMP%/iter5-refine-host.log`；不提交登录 URL。脚本先断言隔离 memoryRoot，然后使用实际 UI 操作。依赖本机 Playwright 与 Chromium（路径见脚本）。先 `node tools/build-iter5-skin.mjs`，依次运行 `verify.cjs`、`host-settings-checks.cjs`、`live-regression.cjs`、`edge-checks.cjs`、`extra-surfaces.cjs`。不要同时运行有写入的宿主脚本。
