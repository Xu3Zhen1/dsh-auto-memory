# C 原生桌面 UI 逐页实施表

已逐入口实现；这不是全量视觉通过声明。证据/限制见 coverage.json；独立设计审查只覆盖其列出的截图。用户指定 C 方向，未随机抽风格，未计算 comp-diff 相似度。

|参考|页面|实际证据|限制|
|---|---|---|---|
|C01|欢迎使用|[tour-1440-1.png](tour-1440-1.png)、[tour-390-1.png](tour-390-1.png)|Actual controls; download/install/model-provider execution not verified.|
|C02|核心能力|[tour-1440-2.png](tour-1440-2.png)、[tour-390-2.png](tour-390-2.png)|Actual controls; download/install/model-provider execution not verified.|
|C03|记忆快照|[tour-1440-3.png](tour-1440-3.png)、[tour-390-3.png](tour-390-3.png)|Actual controls; download/install/model-provider execution not verified.|
|C04|日常体验|[tour-1440-4.png](tour-1440-4.png)、[tour-390-4.png](tour-390-4.png)|Actual controls; download/install/model-provider execution not verified.|
|C05|每日助理|[tour-1440-5.png](tour-1440-5.png)、[tour-390-5.png](tour-390-5.png)|Actual controls; download/install/model-provider execution not verified.|
|C06|外部记忆|[tour-1440-6.png](tour-1440-6.png)、[tour-390-6.png](tour-390-6.png)|Actual controls; download/install/model-provider execution not verified.|
|C07|检索引擎|[tour-1440-7.png](tour-1440-7.png)、[tour-390-7.png](tour-390-7.png)|Actual controls; download/install/model-provider execution not verified.|
|C08|唤起与固化|[tour-1440-8.png](tour-1440-8.png)、[tour-390-8.png](tour-390-8.png)|Actual controls; download/install/model-provider execution not verified.|
|C09|欢迎完成|[tour-1440-9.png](tour-1440-9.png)、[tour-390-9.png](tour-390-9.png)|Actual controls; download/install/model-provider execution not verified.|
|C10|工作台|[operations-home.png](operations-home.png)、[operations-home-narrow.png](operations-home-narrow.png)|见报告的检查范围|
|C11|记忆库·浏览|[library-浏览.png](library-浏览.png)|见报告的检查范围|
|C12|记忆库·日志|[library-日志.png](library-日志.png)|见报告的检查范围|
|C13|记忆库·反思|[library-反思.png](library-反思.png)|见报告的检查范围|
|C14|记忆库·检索|[library-检索.png](library-检索.png)|见报告的检查范围|
|C15|接续·当前任务|[operations-handoff.png](operations-handoff.png)、[operations-handoff-narrow.png](operations-handoff-narrow.png)|Actual continuation provider call not performed.|
|C16|接续·白板|[handoff-board-1440.png](handoff-board-1440.png)、[handoff-board-390.png](handoff-board-390.png)|Read/selection tested; imports/removals not executed.|
|C17|接续·外部来源|[external-isolated-1440.png](external-isolated-1440.png)、[external-isolated-390.png](external-isolated-390.png)|Read/selection tested; imports/removals not executed.|
|C18|日程|[operations-calendar.png](operations-calendar.png)、[operations-calendar-narrow.png](operations-calendar-narrow.png)|见报告的检查范围|
|C19|技能|[operations-skills.png](operations-skills.png)、[operations-skills-narrow.png](operations-skills-narrow.png)|Live host has zero skills; nonempty actions only component-tested.|
|C20|唤起回顾|[operations-recall.png](operations-recall.png)、[operations-recall-narrow.png](operations-recall-narrow.png)|见报告的检查范围|
|C21|工作区关系|[map-1440.png](map-1440.png)、[map-390.png](map-390.png)|见报告的检查范围|
|C22|存储与维护|[operations-storage.png](operations-storage.png)、[operations-storage-narrow.png](operations-storage-narrow.png)|见报告的检查范围|
|C23|团队协作|[operations-team.png](operations-team.png)、[operations-team-narrow.png](operations-team-narrow.png)|No remote team server or synchronization tested.|
|C24|统计|[operations-stats.png](operations-stats.png)、[operations-stats-narrow.png](operations-stats-narrow.png)|见报告的检查范围|
|C25|白板看板|[board-native.png](board-native.png)、[board-detail.png](board-detail.png)|见报告的检查范围|
|C26|白板画布·可选入口|[canvas-native.png](canvas-native.png)、[canvas-detail.png](canvas-detail.png)|见报告的检查范围|
|C27|工作台设置·引擎|smoke-test-iter5-skin.mjs|Workbench shell of these four groups not individually recaptured in final screenshot pass. Same settings component as host form.|
|C28|工作台设置·记忆|smoke-test-iter5-skin.mjs|Workbench shell of these four groups not individually recaptured in final screenshot pass. Same settings component as host form.|
|C29|工作台设置·外观与目录|smoke-test-iter5-skin.mjs|Workbench shell of these four groups not individually recaptured in final screenshot pass. Same settings component as host form.|
|C30|工作台设置·行为与维护|smoke-test-iter5-skin.mjs|Workbench shell of these four groups not individually recaptured in final screenshot pass. Same settings component as host form.|
|C31|DSH记忆设置·引擎|[host-引擎.png](host-引擎.png)|Long form requires scroll; first viewport only.|
|C32|DSH记忆设置·记忆|[host-记忆.png](host-记忆.png)|Long form requires scroll; first viewport only.|
|C33|DSH记忆设置·外观与目录|[host-外观与目录.png](host-外观与目录.png)|Long form requires scroll; first viewport only.|
|C34|DSH记忆设置·行为与维护|[host-行为与维护.png](host-行为与维护.png)|Long form requires scroll; first viewport only.|
|C35|轻面板·概览|[panel-light.png](panel-light.png)|见报告的检查范围|
|C36|轻面板·展开分区|[panel-expanded.png](panel-expanded.png)|见报告的检查范围|
|C37|追加笔记编辑区|[editor-note-1440.png](editor-note-1440.png)、[editor-note-390.png](editor-note-390.png)|见报告的检查范围|
|C38|日程新增与编辑|[editor-calendar-1440.png](editor-calendar-1440.png)、[editor-calendar-390.png](editor-calendar-390.png)|见报告的检查范围|
|C39|自动接续确认|[fixture-continue-confirm-1440.png](fixture-continue-confirm-1440.png)、[fixture-continue-confirm-390.png](fixture-continue-confirm-390.png)|UI state only; not an actual provider/model workflow.|
|C40|接续执行进度|[fixture-continue-progress-390.png](fixture-continue-progress-390.png)|UI state only; not an actual provider/model workflow.|
|C41|记忆中枢初始化|[workbench-init-live.png](workbench-init-live.png)|Existing workbench state; new initialization not run.|
|C42|内置模型安装与下载|[engine-install-ready.png](engine-install-ready.png)|Ready/detection UI only; no model download or Python dependency installation.|
|C43|高级Python环境配置|[python-install-1440.png](python-install-1440.png)、[python-install-390.png](python-install-390.png)|Ready/detection UI only; no model download or Python dependency installation.|
|C44|版本与更新说明|[update-live-1440.png](update-live-1440.png)、[update-live-390.png](update-live-390.png)|见报告的检查范围|
|C45|诊断与调试中心|[diagnostics-1440.png](diagnostics-1440.png)、[diagnostics-390.png](diagnostics-390.png)|Partial scroll viewport; all expanded sections not individually captured.|
|C46|记忆导出|[migration-export.png](migration-export.png)|见报告的检查范围|
|C47|记忆导入预览|[migration-preview-1440.png](migration-preview-1440.png)、[migration-preview-390.png](migration-preview-390.png)|Preview/cancel only; no import application or destructive deletion.|
|C48|危险操作确认|[delete-confirm.png](delete-confirm.png)|Preview/cancel only; no import application or destructive deletion.|
|C49|模型与思考强度选择|[model-picker-1440.png](model-picker-1440.png)、[model-picker-390.png](model-picker-390.png)|见报告的检查范围|
|C50|目录选择|[path-browser-fallback-1440.png](path-browser-fallback-1440.png)、[path-browser-fallback-390.png](path-browser-fallback-390.png)|Fallback browse list from host; native OS picker success unverified.|
|C51|经典模式与回退|[classic-1440.png](classic-1440.png)、[classic-390.png](classic-390.png)|C51 switch roundtrip tested, runtime crash fallback not live-injected. C58 explicit HTTP403 UI fixture; no remote team ACL tested.|
|C52|暂离返回提示|[fixture-greeting-390.png](fixture-greeting-390.png)|UI state only; not an actual provider/model workflow.|
|C53|阶段总结|[fixture-summary-1440.png](fixture-summary-1440.png)、[fixture-summary-390.png](fixture-summary-390.png)|UI state only; not an actual provider/model workflow.|
|C54|插件通知|[fixture-notice-1440.png](fixture-notice-1440.png)、[fixture-notice-390.png](fixture-notice-390.png)|UI state only; not an actual provider/model workflow.|
|C55|空数据状态|[state-empty-1440.png](state-empty-1440.png)、[state-empty-390.png](state-empty-390.png)|见报告的检查范围|
|C56|加载状态|[state-loading.png](state-loading.png)|见报告的检查范围|
|C57|读取失败与重试|[state-read-error-1440.png](state-read-error-1440.png)、[state-read-error-390.png](state-read-error-390.png)|Narrow capture scrolls to error detail.|
|C58|权限不足状态|[fixture-permission-1440.png](fixture-permission-1440.png)、[fixture-permission-390.png](fixture-permission-390.png)|C51 switch roundtrip tested, runtime crash fallback not live-injected. C58 explicit HTTP403 UI fixture; no remote team ACL tested.|
|C59|窄屏工作台|[operations-home-narrow.png](operations-home-narrow.png)|见报告的检查范围|
|C60|窄屏展开记忆设置|[host-memory-390.png](host-memory-390.png)|见报告的检查范围|
|C61|窄屏轻面板|[dark-panel-390.png](dark-panel-390.png)|Narrow panel is captured in dark theme.|
|C62|深色欢迎页|[dark-welcome.png](dark-welcome.png)|见报告的检查范围|
|C63|深色记忆设置|[dark-host-memory.png](dark-host-memory.png)|见报告的检查范围|
|C64|深色轻面板|[dark-panel.png](dark-panel.png)、[dark-panel-390.png](dark-panel-390.png)|见报告的检查范围|
