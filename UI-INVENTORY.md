# PR 146 UI 入口清单

基线：ee9ef014b0f3cd28fccd2da44a379293d51757a0。入口盘点来自实际注册与渲染链路；验收状态默认未验证，不能以共享样式推定通过。

| 入口 | 实际组件 | 样式/主题边界 | 状态与验收 |
|---|---|---|---|
| 首次启动 / 设置重看引导 | DialogHost / TOUR_STEPS | shell.overlay 独立挂载 | 9 步浅色桌面/深色390截图、Esc与焦点通过；首启自动触发、开关写入/还原、完成与工作区/会话建立已补测；下载+离线E5推理已通过，收费模型回复仍缺凭据 |
| DSH 设置 → 记忆设置 | settings.section → Iter5HostSettings → Iter5Settings | 宿主设置容器 | 独立四组、取消离开、保存500/重试/还原、方向键通过；320/390/640px 自动独立展开通过，保留表单和草稿 |
| 侧栏记忆按钮 → 轻面板 | SidebarButton → MemoryPanel | shell.overlay 独立挂载 | 独立打开、拖动、缩放、展开、关闭重开、返回工作台、浅深色/窄屏通过；固定持久性未复测 |
| 会话 → 记忆 → 工作台 | MemoryPageView → Iter5Page → Iter5Home | data-iter5 | 实际工作台截图、最近记录、状态展示通过 |
| 记忆库 → 浏览/检索/日志/反思 | Iter5Browse / SearchTab / Iter5History | data-iter5 | 实际数据、长文/无空格英文、来源、笔记写入/还原通过；检索模型执行未验证 |
| 接续 | Iter5Handoff / ConnectTab / PlanTab | data-iter5 | 真实页面/未配置状态截图通过；付费生成和完整自动接续未执行 |
| 日程 | Iter5Calendar | data-iter5 | 继承真实回归：新增/完成/删除、取消通过；全部编辑边界未覆盖 |
| 技能 | Iter5Skills | data-iter5 | 实际页面与空数据截图通过；审批/弃用写入未执行 |
| 唤起回顾 | Iter5Recall | data-iter5 | 实际页面与反馈回读回归通过；模型判定未执行 |
| 工作区关系 | Iter5Workspaces | data-iter5 | 真实关系页面截图通过；跨工作区切换迟到响应仅自动测试 |
| 存储维护 | Iter5Storage | data-iter5 | 真实状态页面截图通过；真实隔离文件索引重建、删除、冲突/越界拒绝、迁移导出/预览/导入已通过 |
| 工作台设置 | Iter5Settings（生成） | data-iter5 | 四组、跨组草稿、即时模式、保存失败、取消、拒绝离开/刷新/经典切换通过 |
| 团队 / 统计 | TeamTab / StatsTab（兼容入口） | 工作台与轻面板 | 两个实际页面均截图；单机未登录/空统计通过，团队联网及权限组合未验证 |
| 会话 → 白板看板 | KanbanView | 独立 conversation.view | 真实 conversation.view 已打开并截图；启用图模式后的详情/数据操作未验证 |
| 可选白板画布 | WhiteboardGraphView | localStorage 开关注册 | 默认隐藏：未启用、未验证；共享portal主题已接线 |
| 诊断 / 模型安装 / 更新 / 工作台初始化 | DebugCenter / DialogHost | 独立浮层 | 真实宿主更新说明、诊断、模型未安装提示已截图；E5下载、CPU推理与工作区/会话创建已补测；升级安装和收费初始化回复未验证 |
| 笔记编辑 / 日程编辑 / 导入导出 / 删除 | 对应页内编辑器、DialogHost、浏览器确认 | 页面或浮层 | 笔记/日程回归通过；真实隔离迁移导入导出、删除路由与拒绝条件已补测；全部UI确认/长预览组合未穷举 |
| 自动接续确认 / 倒计时 | AutoContinueHost | 独立 shell.overlay | 主题已接入；95条生产方法逻辑回归通过；真实宿主空闲/无待处理拒绝通过，收费模型端到端仍缺凭据 |
| 经典模式 / 渲染失败回退 | MemoryPageView / MemoryTabBody | 原布局 + 共享控件 | 真实切换经典、退出新皮肤通过；渲染故障回退未做宿主故障注入 |
| 页头与消息栏 | 仓库注册入口检查 | 宿主负责布局 | 当前注册为 sidebar.footer.action，未发现独立消息工具栏注册，不适用 |

共通矩阵：浅/深色、桌面/390px/实际窄容器、125%/150% 字号、键盘、关闭返回焦点、工作区切换、减少动效。未逐项测量的组合不得记为已通过。

## 证据索引

真实宿主截图与测试记录见 [验收报告](artifacts/pr146-full-ui/README.md)。所有未验证项目已明确列出；共享样式已接入不等于业务状态验收通过。

本轮限制项补齐见 [后续验收](artifacts/pr146-limits/README.md)：真实下载/推理、首次运行、维护迁移与窄屏修复的证据单独保存。

## 2026-09-29：C 原生桌面全量复刻（进行中）

本轮从 b5d5914 开始替换视觉布局。上表验收是上一轮历史证据，不能用于新版完成声明。新版的 64 项入口映射、逐页状态见 [C 参考图实施表](artifacts/pr146-native-ui/COVERAGE.md)，真实宿主复验结果单独记录。
