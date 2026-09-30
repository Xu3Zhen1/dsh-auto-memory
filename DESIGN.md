---
name: "DSH Auto Memory · L2-1 浅色仪器"
description: "L2-1 浅色仪器：白瓷机箱、索引凹井、连续读面与紧凑控制。"
colors:
  i5-blue: "#1764FF"
  i5-fill: "#1764FF"
  i5-primary: "#1764FF"
  i5-on-accent: "#FFFFFF"
  i5-bg: "#F5FAFF"
  i5-surface: "#FFFFFF"
  i5-side: "#F2F8FF"
  i5-soft: "#EAF2FE"
  i5-text: "#102044"
  i5-secondary: "#4E6080"
  i5-muted: "#5B6B85"
  i5-line: "#DCE8F7"
  i5-ok: "#1F7A4D"
  i5-error: "#B42338"
  i5-warning: "#8A5A0E"
  i5-indigo: "#4F46E5"
  i5-purple: "#7C3AED"
  i5-green: "#047857"
  i5-orange: "#B45309"
  i5-pink: "#BE123C"
  i5-cyan: "#0E7490"
  i5-slate: "#475569"
  i5-blue-dark: "#9ABEFF"
  i5-fill-dark: "#77A9FF"
  i5-bg-dark: "#151D2C"
  i5-surface-dark: "#1D293D"
  i5-side-dark: "#172338"
  i5-soft-dark: "#283F61"
  i5-text-dark: "#ECF2FF"
  i5-secondary-dark: "#C4D1E8"
  i5-muted-dark: "#B2C3DE"
  i5-line-dark: "#3B4D67"
  i5-ok-dark: "#8EDAAF"
  i5-error-dark: "#FFB2BC"
  i5-warning-dark: "#F0CB8A"
  i5-indigo-dark: "#B6B1FF"
  i5-purple-dark: "#CFADFF"
  i5-green-dark: "#8EDAAF"
  i5-orange-dark: "#F0CB8A"
  i5-pink-dark: "#FFB3C7"
  i5-cyan-dark: "#8FD6E7"
  i5-slate-dark: "#C4D1E8"
  i5-face: "#FFFFFF"
  i5-face-edge: "#E8F1FC"
  i5-recess: "#F4F7FC"
  i5-bezel: "#C7D2E0"
  i5-bezel-dark: "#A8B6CA"
typography:
  headline:
    fontSize: "calc(22px * var(--dam-user-scale,1))"
    fontWeight: 650
    lineHeight: 1.4
    letterSpacing: "0"
  title:
    fontSize: "calc(16px * var(--dam-user-scale,1))"
    fontWeight: 600
  body:
    fontFamily: "\"Segoe UI Variable Text\",system-ui,\"Segoe UI\",\"Microsoft YaHei UI\",\"Microsoft YaHei\",sans-serif"
    fontSize: "calc(14px * var(--dam-user-scale,1))"
    lineHeight: 1.6
  label:
    fontSize: "calc(12px * var(--dam-user-scale,1))"
  mono:
    fontFamily: "ui-monospace,Consolas,monospace"
    fontSize: "12px"
    lineHeight: 1.6
rounded:
  i5-radius: "14px"
  i5-well-radius: "10px"
  i5-control-radius: "8px"
  i5-tag-radius: "6px"
spacing:
  i5-compact-gap: "12px"
components:
  button-secondary:
    backgroundColor: "{colors.i5-surface}"
    textColor: "{colors.i5-text}"
    rounded: "{rounded.i5-control-radius}"
    padding: "6px 12px"
    typography: "{typography.body}"
  button-primary:
    backgroundColor: "{colors.i5-primary}"
    textColor: "{colors.i5-on-accent}"
    rounded: "{rounded.i5-control-radius}"
    padding: "6px 12px"
  button-primary-soft:
    textColor: "{colors.i5-blue}"
    rounded: "{rounded.i5-control-radius}"
    padding: "6px 12px"
  button-link:
    textColor: "{colors.i5-blue}"
    padding: "4px 0"
  input:
    backgroundColor: "{colors.i5-surface}"
    textColor: "{colors.i5-text}"
    rounded: "{rounded.i5-control-radius}"
    padding: "7px 10px"
  navigation-active:
    backgroundColor: "{colors.i5-soft}"
    textColor: "{colors.i5-blue}"
    rounded: "{rounded.i5-control-radius}"
    padding: "5px 10px"
  chip:
    backgroundColor: "{colors.i5-soft}"
    textColor: "{colors.i5-blue}"
    rounded: "{rounded.i5-tag-radius}"
    padding: "3px 9px"
  card:
    backgroundColor: "{colors.i5-surface}"
    rounded: "{rounded.i5-radius}"
    padding: "16px"
  quick-record:
    backgroundColor: "{colors.i5-surface}"
    textColor: "{colors.i5-text}"
    rounded: "10px"
    padding: "14px"
---

# Design System: DSH Auto Memory · L2-1 浅色仪器

## Overview

2026-09-30 新增用户选择：保留 L2-1 仪器，并将已确认的 L2-2 编辑与 L2-3 活水实现为独立皮肤。三者均提供浅色、深色、跟随宿主，明暗与皮肤分开保存。以下机箱规则属于仪器皮肤；编辑皮肤使用纸面、细线与排印，活水皮肤使用连续水面与分层记录。它们共享功能和数据，但不强制共享首页构图。新证据见 `artifacts/three-skins-20260930/ACCEPTANCE.md`，此前九张浅色复审不自动扩展到新皮肤。

**Creative North Star: "L2-1 浅色仪器"**

白瓷珐琅面板承载任务，凹井盛放数据，刻字标明用途，机加工键执行动作，LED 报告状态。用户明确要求严格贴近 L2-1 HTML 示例的质感和密度，并否决层层白卡与浅蓝框拼接的旧实现。

视觉权威为主仓库 `_design-lab-20260929/design-demos/L2-1-浅色仪器.html`；最新截图与证据在 `artifacts/iter5-instrument-rebuild-20260930/`。独立视觉复审意见为 ship，范围是所审的九张浅色截图可以交付用户查看，尚非用户视觉验收。

**Key Characteristics:**

- 一层主要机箱与一层功能凹井
- 连续读面，不再给详情套卡
- 文字导航与紧凑控制
- 真实数据与原有操作保留

## Colors

蓝白亮色为主。primary/on-accent 承担实色主键；blue 承担交互文字；fill 承担选中刻度。face 是白瓷读面，recess 是索引凹井，bezel 是控件边缘。类型与状态颜色只承担局部标记。暗色由 skin.css 的主题变量继承，本轮没有完整暗色实拍矩阵。

**The Semantic Color Rule.** 使用现有语义变量，不把类型色扩展为大面积装饰。

## Typography

正文使用现有系统中英文字体栈，字号保留用户缩放。工作页铭牌为 14px、文档标题为 16px、正文为 14px、辅助标签为 12px；首页保留较大仪表读数。数值使用 tabular-nums。全界面字级仍有历史差异，不以局部截图证明所有文字均达到既定字号与对比度目标。

## Layout

顶部导轨为 64px，工作台使用显式 grid。导航采用文字式分组，刷新和聚焦控件放入导轨并保留无障碍标签。工作页主标题仍保留在无障碍结构中，视觉上不再占用独立标题带。1440px 导轨导航完整显示；窄屏切换为菜单行和可展开侧栏。

浏览、检索、接续、唤起使用一层机箱，左侧索引凹井与右侧连续读面共享内部网格。检索的数量与耗时进入铭牌右端。日程把格盘和议程放入同一面板；关系图只保留一个画布凹井。容器 740px 以下相应双栏上下排列；列表保持有界滚动。

设置保留有实际功能含义的分组。存储的读数条、账册与维护区在同一机箱中以分隔线组织，取消嵌套健康卡和大红危险卡外框。白板、经典托管区域保留原组件与动作。

**The Single Chassis Rule.** 页面外壳承担整体深度，详情正文不重复包卡。

## Elevation & Depth

机箱使用轻微白瓷表面变化、统一顶部高光与柔和低投影；四角螺丝只用于主要工作面板。数据井使用蓝调内阴影，控件使用顶部高光与短按键程。主操作保持实色。工作页无编排入场动画；减少动态效果偏好关闭动画和过渡。首页既有少量状态特效保留，柱图不再过渡 height。

## Shapes

主面板 14px、凹井 10px、普通控制 7–8px、标签 6px，轻面板外框允许 16px。选中索引使用 2px 内侧蓝色刻度。圆盘、LED 与仪表使用圆形几何；旧组件的其他圆角不是新界面的规范。

## Components

主键用 primary 与 on-accent，实拍检查了检索键常态、悬停、键盘聚焦的文字对比度，均至少 4.5:1。统一焦点为 2px blue、offset 3px，禁用状态保持现有语义。

索引行使用细分隔线、类型点、来源和时间；右侧保留宿主原文。日历提供 LED、+N 溢出读数及原有增删完成操作。反馈使用 A/P/S/H/E 按键，仍提交原审查队列。

关系图使用带表面层次的圆盘，中心双圈，主题按归一化标签去重，长标签按词与中英文宽度折行。工作区节点保留键盘选择；主题不再伪装成工作区切换按钮，完整文本保留在 title 和主题列表。

对话框保留焦点约束、关闭 SVG、取消和 Escape。轻面板、通知、摘要、更新和自动接续保留独立挂载与主题边界。欢迎九步和插画结构不改。皮肤源经 tools/build-iter5-skin.mjs 生成，禁止手改 client.js 的生成区。

## Do's and Don'ts

- Do 以已选 L2-1 HTML 为视觉依据，使用真实宿主数据。
- Do 保留键盘焦点、字号偏好、主题与窄屏操作。
- Do 区分功能检查、截图复审与用户验收。
- Don't 通过重复外框、横幅与卡片叠层制造分区。
- Don't 以静态演示替代真实交互。
- Don't 把浅色截图复审推广为全主题、全状态的验收。


## 2026-09-30 最终打磨补充

三套皮肤保持蓝白基调；用户最后明确「部分组件的配色加以放开，不破坏整体」，不采用整页暖色或青绿色换肤。统一类型色：日志蓝、笔记绿、反思紫、偏好琥珀；浅深分别使用 memory-* tokens，仪器电平柱、图例、最近记录与活水分类标记同义同色。

活水以现存改进版 L2-3 HTML 为视觉依据：连续水箱、双层细水线、斜射光、下沉微粒、横贯接续线和紧凑单色岩芯；旧版蓝底分组列表已替换。纹理是固定 SVG 背景；运动仅 transform/opacity，reduced-motion 关闭。水体仍属蓝色，类型色仅用于小图例。

编辑版保持薄线与大数字，减少重复标题；仪器深色玻璃反光降至 0.06。16 条圆角、2 条字号 detector advisory 属参考构图中的表盘、纸面、信号胶囊和展示数字，不是通用控件尺度；无非 advisory finding。最终截图与验证边界见 docs/skin-figures/iter5-final/README.md。


宿主设置例外（用户最新指定）：使用 DSH 风格的中性表单，浅色白底、深色随宿主；不继承工作台皮肤材质。使用分隔线代替重叠卡片，工作台外观选择放在外观与目录中。字体与字号继承 DSH 全局变量。

记忆设置的阅读顺序：先解释查找与回忆、记录与使用的区别，再展示常用开关；高级容量、阈值、提示词和维护项按需展开。标签描述结果和单位，立即生效的选择明确标注；不以纯技术术语作为普通用户的唯一说明。实拍统一标明 DSH 全局字号，见 docs/skin-figures/settings-clarity/README.md。

宿主设置配色必须消费 DSH bg-layer-2 / label / border token，并先在 settings 包装和嵌入根恢复被工作台重映射的宿主变量。不得再用独立的固定深灰背景；页头、内容、保存区与宿主弹窗同色。
