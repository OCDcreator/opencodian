# OpenCodianSettings

> **源码**: `src/features/settings/OpenCodianSettings.ts`
> **状态**: [REVIEW]

## 概述

`OpenCodianSettings.ts` 是插件的主设置面板。它继承 `PluginSettingTab`，负责组合各个设置分区，并把模型、样式、调试与 modal 编排挂到 Obsidian 的 settings UI 上。

当前文件支持两种布局模式：

- **经典平铺模式**: 所有 section 完整平铺展示，但首个一级分区现在是 `General`，其中设置界面模式与界面语言合并到同一张通用卡片里，不再额外显示 `Basic` / `Language` 小标题
- **多级标签分类模式**: 标题下显示一级标签栏；多数分区会继续显示二级标签栏，但 `General` 现在直接显示合并卡片，不再拆 `Basic` / `Language`；这个模式不显示 quick-nav，也不显示左侧竖排 section 列表

布局模式通过 `settingsLayoutMode` settings 字段持久化，新用户默认 `'tabbed'`，老用户升级默认 `'classic'`。标签模式的标签结构定义在 `settingsLayoutRegistry.ts`，渲染委托给 `SettingsTabbedRenderer`。

classic 和 tabbed 两种布局都必须按当前 active backend 过滤后端专属 section：OpenCode active 时显示 Server / Model / Agents / Commands / MCP / Formatter / Plugins / Security / Skills / Tools / ACP 等 OpenCode-owned 分区；Claude Code active 时只显示 Claude Code 自身分区以及 Conversation / UI / Style / Debug / User 等通用分区。不要仅因为某个 backend 在 `enabledBackends` 中就显示它的专属设置。

聊天 header 和其他 runtime 入口可以通过 settings tab 的 scroll-prep 方法跳到对应 backend owner：OpenCode 跳 Server / connection，Claude Code 跳 Claude Code / runtime；classic 布局滚动到 section 标题，tabbed 布局切换 primary / secondary tab。

## Settings Layout Contract

标准 settings tab 的根设置容器会暴露稳定布局契约标记：`data-settings-surface="page"` 和 `data-settings-layout-mode="classic|tabbed"`。CSS 与测试应优先使用这些 data marker 做页面 surface / layout mode 的契约检查，而不是只从 `.opencodian-settings--classic` 或 `.opencodian-settings--tabbed` 等视觉 class 推断当前模式。

General 里的设置界面模式、界面语言、在编辑区打开设置，以及由各 section owner 渲染的普通 Obsidian `Setting` 行，都继承 `settings-layout-contract.css` 的 Settings Form Row Card contract。该 contract 借鉴 shadcn `Card + Field`：中性 row-card root、左侧 label/description、右侧 control column；普通设置行不应再用整块 warning/error/accent tint 表达状态。

当前文件的重点不只是“渲染设置项”，还包括：

- 模型 / 样式 / server / security owner 的装配与跨 section 桥接
- 通过 `SettingsConversationSection` 协调 conversation section 的 title model / project-scoped compaction editor / chat font size / question card / user-markup lifecycle
- 通过 `SettingsAgentsSection` 协调 Agents section 的 runtime+project agent catalog、default_agent、project agent core-field CRUD（含 `disable`）与基础 subagent visibility lifecycle
- 通过 `SettingsCommandsSection` 协调 Commands section 的 runtime+project slash-command catalog、project command editor shell / placeholder reference、`hiddenSlashCommands` 用户可见性与 `slashCommandSkillMode` lifecycle
- 通过 `SettingsPluginSection` 协调 plugin snapshot / project config editor / OMO lifecycle
- 通过 `SettingsStyleSection` 协调 style section 的 preset / background / input appearance / custom CSS lifecycle
- 通过 `SettingsServerSection` 协调 server section 的 mode/auth/status lifecycle
- 通过 `SettingsModelSection` 协调 model section 的 source mode / refresh / workspace / icon cache lifecycle
- 通过 `SettingsSecuritySection` 协调 security section 的 config-status/permission/restart/blocklist lifecycle
- 通过 `SettingsToolSection` 协调 Tools section 的 built-in permission、项目 `.opencode/tools` 自定义工具文件、全局 tools 只读目录和运行时 custom tool catalog 权限 lifecycle
- 通过 `SettingsDebugSection` 协调 debug logging、log path picker、diagnostic action 与 console help lifecycle
- `SettingsDebugSection` 内的 OpenCode、Codex 与 Claude Code workbench 分别由 `debug/OpenCodeDebugPanel`、`debug/CodexDebugPanel` 和 `debug/ClaudeCodeDebugPanel` 完整持有；本标准设置组合路径通过三个 `create*TraceDiagnosticsPort()` adapter 注入窄 diagnostics ports。Claude classic/tabbed 都继续渲染，Codex panel 只由 tabbed debug route 挂载，classic legacy attach omission 保持不变
- 通过 `SettingsStyleBackgroundSection` 协调 style owner 下的聊天背景图子区块 lifecycle
- 对多个 modal 与辅助服务的编排

最近还把一组稳定的 panel chrome 逻辑（标题品牌、通用 block 壳层、inline-code 格式化、help button、语言选择器）抽到 companion 模块 `SettingsPanelChrome.ts`，让主设置页 owner 更聚焦于 section 装配与跨 owner bridge。设置页原生下拉的视觉接管由 `SettingsDropdownControl.ts` 扫描当前 settings container 完成，主 owner 只负责 display / hide 生命周期里的挂载与销毁；主设置页 display 会把 `this.app.keymap` 透传给增强器，使打开态 dropdown Scope 优先处理 trigger Escape，关闭或销毁时恢复宿主 scope。

## 主要分区

`display()` 会重建整个设置面板，并按当前 active backend 挂载这些分区：

- General
- Claude Code（仅 Claude Code active）
- Server（仅 OpenCode active）
- MCP（仅 OpenCode active）
- Model（仅 OpenCode active）
- Conversation
- Agents（仅 OpenCode active）
- Commands（仅 OpenCode active）
- Formatter（仅 OpenCode active）
- Plugins（仅 OpenCode active）
- Security（仅 OpenCode active）
- UI
- Style
- Debug
- User
- Skills（仅 OpenCode active）
- Tools (Built-in + Custom)（仅 OpenCode active）
- ACP Agents（仅 OpenCode active）

其中最近变化较大的几块是：

- **Model**
  - 重构成由 `SettingsModelSection` 持有的“常用 / 当前提供商与模型 / 可用范围与目录 / 工具区”厚切口
  - 默认聊天模型不再拆成 provider/model 两个普通下拉，而是走可搜索 picker
- provider 级可用性开关仍只写回当前项目 `.opencode/opencode.json`，可覆盖服务器继承的 provider 白名单 / 黑名单；具体写回组合逻辑已委托给 `ModelCatalogStateService`
- model 级可用性开关仍写回插件设置 `disabledModelRefs`，但归并与规范化同样走 `ModelCatalogStateService`
- `OpenCodianSettings` 现在不再直接维护 model section 的 source mode、refresh、workspace 卡片、icon cache 工具区和 catalog host 装配；这些生命周期已委托给 `SettingsModelSection`
  - provider accordion、search、bulk toggle 与 probe badge/detail 的 UI 状态机继续委托给 `SettingsModelCatalogPresenter`
  - 项目配置块本身改成双列 provider 卡片入口：直接展示当前项目本地 provider，点击卡片按 `provider.id` 打开 `ModelConfigModal`，点击加号则直接进入新增 provider 流程
  - provider / model 的项目级配置与图标缓存管理收拢进 `ModelConfigModal`；该弹窗现按 `CC Switch` 风格重组为顶部预设条 + 横向 provider 切换 + 单列表单流，配置 JSON 与重启选项固定放在底部预览区
  - provider 图标缓存工具区新增全局 `providerIconColorMode` 与 `providerIconDefaultVariant`：前者控制运行时颜色策略（跟随系统 / 单色 / 彩色），后者控制 `auto` 条目优先尝试的 LobeHub 静态 variant；内置图标选择器会实时预览当前模式并允许显式保存 variant
- **Conversation**
  - `SettingsConversationSection` 现在接管 title mode、`aiTitleModel` picker、project-scoped compaction editor（写入 `.opencode/opencode.json`）、global chat font size、question card display/position、answered-card toggle 与 user-markup render toggle
  - conversation section 现在复用 `createSettingsBlock()` 拆成“会话标题 / 上下文压缩（项目级） / 阅读与显示 / 提问交互 / 消息渲染”五个二级分组，而不是单层平铺
  - 从会话设置弹窗跳转全局设置时，tabbed 布局会切到 Conversation 的对应二级标签；classic 布局会把 `secondaryTab` 映射到对应二级分组标题并在打开后滚动定位
  - `OpenCodianSettings` 不再直接铺开 conversation section 的 DOM/state/model-picker wiring，只保留 owner 装配与 block seam 透传
- **Agents**
  - `SettingsAgentsSection` 现在接管 agent 目录壳层：合并 runtime built-in/project agent 与 project `.opencode/opencode.json` override
  - 当前已暴露默认主代理下拉、project agent 核心字段 create/edit/delete（`mode`、`disable`、`description`、`prompt`、`model`、`temperature`、`top_p`、`steps`、`color`）、project-scoped `permission.task` allowlist、raw `options` JSON，以及 `mode: 'subagent'` 的 `hidden` 可见性开关，写回路径统一走 `OpencodeConfigManager`
  - Commands/slash runtime 不属于 Agents section；命令级 hidden agent 由 `OpencodeConfigManager` / slash command catalog 路径维护
- **Commands**
  - `SettingsCommandsSection` 现在接管 slash command 目录壳层：合并 `sdk.command.list()` 返回的 runtime slash commands 与 project `.opencode/opencode.json` `command` 条目
  - 当前已暴露 companion owner `SettingsProjectCommandEditor`：支持创建 / 编辑 / 删除 project `command.<id>` 的 `template`、`description`、`agent`、`model`、`temperature`、`top_p`、`subtask`，并展示 OpenCodian placeholder reference
  - slash menu visible/hidden 开关仍写回插件设置 `hiddenSlashCommands`；skill 调用形态写回 `slashCommandSkillMode`；命令级 `temperature` / `top_p` 通过 `OpencodeConfigManager` 自动落到 command-owned hidden agent；runtime placeholder expansion 与 slash execution 则继续留在相邻 runtime seam
- **Plugins**
  - `SettingsPluginSection` 现在接管 plugin environment snapshot、project config plugin editor、isolation mode、project plugin directory 与 OMO config 管理
  - `OpenCodianSettings` 不再直接铺开 plugin snapshot refresh、config editor 保存、directory/OMO action 或 restart notice 细节，只保留 owner 装配与 inline-code formatting seam
- **UI**
  - `SettingsUiSection` 现在接管 max tabs、tab position/layout、auto scroll、chat scroll mode 与 open-in-main-tab 的完整 section lifecycle
  - `OpenCodianSettings` 不再直接铺开 UI section 的 dropdown/toggle/slider wiring，只保留 owner 装配
- **Claude Code**
  - `SettingsClaudeCodeSection` 现在接管 Claude Code Phase 1 配置基础，包括 executable path、setting sources、permission mode、model/fallback model、thinking/effort、additional directories 与 runtime diagnostics
  - 该 section 只写入 `backendSettings.claudeCode`；`claude-code` 是否启用由 General / Backend 的 `SettingsBackendSection` 管理，runtime 注册由 `main.ts` 的 backend registry bootstrap 管理
- **Style**
  - `SettingsStyleSection` 现在接管 theme preset、layout/user/assistant/scrollbar/input/advanced 分组、custom CSS 与 reset / refresh 编排
  - 聊天背景图上传/调参/预览拖拽继续由 `SettingsStyleBackgroundSection` 作为 style owner 的子区块 owner 处理
  - assistant metadata / time / provider-model 独立样式控制
  - 输入面板 glass refraction / liquid glass 参数与帮助说明入口
- **Security**
  - config file status / permission mode / restart action 现已委托给 `SettingsSecuritySection`
  - blocklist、external access、export path 与平台 blocked commands 的 section 组装同样收口到专属 owner
  - security section 当前读写 `.opencode/opencode.json` 并管理 OpenCode permission/restart/blocklist 语义，只能在 OpenCode active 时显示；Claude Code 的 permission mode 属于 `SettingsClaudeCodeSection`
- **Tools**
  - `SettingsToolSection` 继续管理 built-in tool permission 分组，并新增自定义工具文件管理：可在 `.opencode/tools/` 创建默认 TS 工具模板、编辑/删除项目工具文件、只读展示 `~/.config/opencode/tools` 全局工具，并保留运行时 catalog custom tool 的真实 tool id 权限控制
  - 自定义工具的启用 / 询问 / 拒绝仍写入项目 `.opencode/opencode.json` 的 `permission.<toolName>`；文件管理不直接执行或加载工具
- **Debug**
  - `SettingsDebugSection` 现在接管 `enableDebugLogging`、`inlineSerializedDebugLogArgs`、log path picker、diagnostic copy/generate action 与 console help block
  - `OpenCodianSettings` 不再直接铺开 debug section 的路径/导出/帮助说明 UI 细节，只保留 owner 装配

## 核心逻辑

### 面板重建

`display()` 不是局部 patch，而是清空容器后整体重建。这让语言切换、主题预设同步和复杂控件刷新更容易保持一致，但也意味着：

- DOM 引用会失效
- section heading / quick-nav / scroll restore 需要在重建后重新接线
- 每次重建前都必须先释放各 section owner 的副作用；现在 `disposeSections()` 也会显式销毁 `SettingsUserSection`，避免 user prompt / excluded-tags textarea 的 size-memory observer 残留在旧 DOM 上；tabbed plugin owner 与 Codex owner 都必须由 renderer 注册回 settings shell，前者确保离开 Plugin Overview 时释放 SDK evidence observer，后者确保账号页的 Codex 连接订阅不会残留在旧 DOM 上

从 R9 开始，这部分壳层生命周期已委托给 `SettingsSectionCoordinator`：`OpenCodianSettings` 只负责按顺序挂载当前 backend 可见的 General / backend-specific sections / Conversation / UI / Style / Debug / User 等 section，本身不再直接持有 quick-nav DOM 组装或滚动恢复定时器细节。tabbed 模式也必须先进入 `beginDisplay({ showQuickNav: false })`，由 coordinator 捕获当前滚动位置后再清空重建内容；不要在调用 `beginDisplay()` 前额外 `empty()` 容器，否则新增/删除格式化器等 tabbed 刷新会先把滚动容器夹回顶部。tabbed 模式只保留标题 + 一级标签栏 + 二级标签栏 + 内容区。

2026-04-26 的后续导航微调又把 `MCP` 固定到 `Commands` 和 `Formatter` 之间：一级标签顺序、classic section 挂载顺序和 quick-nav 按钮顺序都保持一致，避免在两种布局之间切换时看到不同的导航位置。

设置页最上方的 panel title 现在不再直接复用纯文本 `h2`；`OpenCodianSettings` 会在 classic / tabbed 两种布局里都传入自定义标题渲染器，让顶部标题使用和聊天头部 `opencodian-title` 一致的品牌逻辑：左侧 `opencodian-app-icon` + 亮/暗主题 wordmark，不再额外拼接 `Settings / 设置` 文本后缀。

### 模型目录与可用性控制

模型分区现在显式区分：

- 服务端宽目录是否存在某 provider/model
- 运行时当前返回哪些 provider/model
- 当前 source mode 下是否进入 `baseEffective`
- 服务器或项目 provider 白名单 / 黑名单是否禁用 provider
- 插件侧是否被 `disabledModelRefs` 过滤掉

因此设置页能展示“存在但被禁用”的模型，而不只是“当前下拉可选项”。

新的结构把模型任务拆开了：`ModelCatalogStateService` 负责 core catalog state 语义，`SettingsModelSection` 负责模型 section shell 与 callback bridge，`SettingsModelCatalogCoordinator` 负责 refresh/workspace orchestration，`SettingsModelIconCacheManager` 负责 provider icon 工具区，`SettingsModelCatalogPresenter` 负责“可用范围与目录”的展示状态机，而 `OpenCodianSettings` 只保留 owner 装配与跨 section callback 桥接：

- **模型 section owner**：`SettingsModelSection` 负责 block shell、refresh callback 与 server-state bridge；默认聊天模型、来源模式、手动刷新、workspace 卡片和 icon cache 工具区分别由相邻 owner 承接
- **可用范围与目录**：`ModelCatalogStateService` 先把 `baseEffective` / `effective` / `currentEnabledProviderIds` 整理成 `ModelCatalogState`，再由 `SettingsModelCatalogPresenter` 负责 provider accordion、模型级开关、project/server/effective/disabled 四张目录摘要卡，以及 provider probe badge/detail 呈现；`服务器目录` 应直接反映当前 runtime / `opencode models` 看到的 provider，provider 的禁用状态则作为配置层信息叠加到 `当前生效列表` / `当前禁用列表`；provider 卡主状态优先显示“项目禁用”，其次才是“服务端/继承配置禁用”，并保留逐 provider 的“测试可用性”按钮，用当前 vault 作用域重新探测 runtime 是否真的可用
  - provider 批量按钮现在绑定到当前激活的目录卡片，只对该目录里的 provider 集合生效，而不是跨全部目录统一操作；provider 展开后的批量模型按钮始终针对该 provider 的完整模型集，而不是当前搜索/过滤后剩余的可见子集
  - 这个按钮现在已经改成“最小真实发送测试”：允许发送时会挑一个测试模型创建临时 session，真正发一条极小请求；因此它能直接暴露 `invalid_api_key`、provider 鉴权失败、服务端拒绝等真实错误，而不再只是看 runtime/目录
  - `当前生效列表` 现在按 `ModelConfigService.currentEnabledProviderIds` 判断 provider 是否真启用，所以不会再把当前作用域里被配置禁用的 provider 显示成绿色“已启用”
  - 三张卡的正确关系必须长期保持：
    - `服务器目录` = `opencode models` / `config.providers(directory)` 当前 provider 集合
    - `当前生效列表` = `服务器目录` 再叠加当前 scoped config、项目本地 provider 开关与 source mode 过滤
    - `当前禁用列表` = 当前目录中被配置禁用的项 + 仅来自配置层的禁用占位 + 模型级 `disabledModelRefs`
- **当前提供商与模型**：设置块直接展示当前项目 provider 卡片；点击卡片进入 provider/model 配置弹窗，集中处理 provider 主字段、模型列表、图标缓存入口和实时 JSON 预览
- “可用范围与目录”和“当前提供商与模型”都是默认展开的 `details` block，用户折叠状态会写回插件设置并在下次打开时恢复

provider 开关写回仍遵循 `ModelConfigService` 返回的 `effectiveProviderConfig` 继承规则：项目 `enabled_providers` / `disabled_providers` 字段存在时替换服务器字段，这也意味着项目本地可以缩小或清空继承层禁用数组，而不是把继承禁用视为不可覆盖的硬限制。但设置页展示启用态时，额外参考 `currentEnabledProviderIds`，避免把当前作用域下已不可用的 provider 显示成“已启用”。这些 core availability 组合规则现在集中在 `ModelCatalogStateService`，`SettingsModelSection` 负责 refresh/save orchestration，而 `SettingsModelCatalogPresenter` 只做呈现。设置页的 provider 可用性测试现在分两层：

- 先读 scoped runtime、connected directory 和 server catalog，判断当前是“项目禁用”“继承/服务端配置禁用”“只有目录占位”还是“可尝试发送”
- 只有真正允许发送且能选出测试模型时，才会做一次最小真实请求

### 设置面板滚动恢复

滚动恢复与 quick-nav 现在由 `SettingsSectionCoordinator` 持有；`OpenCodianSettings` 只保留“下一次打开前记录意图”的公开入口。当前恢复链路仍然包括：

- `settingsPanelScrollTop` 持久化到插件设置
- `prepareRestoreScrollOnNextOpen()` / `prepareScrollToServerOnNextOpen()` / `prepareScrollToLspOnNextOpen()` / `prepareScrollToConversationOnNextOpen()` 在下次打开前注册意图；LSP 入口在 tabbed 模式切到 Formatter -> Language servers，在 classic 模式滚动到语言服务小节
- 已显示的设置页在整页刷新前会先捕获当前 `scrollTop`，覆盖 Formatter/MCP/Server 等 `requestDisplayRefresh()` 触发的即时重建
- `MutationObserver` + 多次延迟重试用于等待 DOM 稳定

这是最近文档里最容易漏掉的行为之一，因为它已经不只是简单的“记住 scrollTop”。

### 实时状态与节流刷新

- server section 的 mode/auth/status DOM/state 现在由 `SettingsServerSection` 持有，并继续通过固定轮询刷新
- security section 的 config-status、permission mode、restart flow 与 blocklist/export-path 输入现在由 `SettingsSecuritySection` 持有
- model section 的 source mode、workspace 卡片、手动 refresh、icon cache 和 callback wiring 现在由 `SettingsModelSection` 持有
- conversation section 的 title model、project-scoped compaction editor、global chat font size、question card 与 user-markup toggle 现在由 `SettingsConversationSection` 持有
- Agents section 的 runtime+project agent catalog、default_agent、project agent 核心字段 CRUD（含 `disable`）与基础 subagent visibility 现在由 `SettingsAgentsSection` 持有
- Commands section 的 runtime+project slash-command catalog、project command editor shell、`hiddenSlashCommands` 可见性与 `slashCommandSkillMode` 写回现在由 `SettingsCommandsSection` 持有
- plugin section 的 snapshot refresh、project config editor、isolation mode、project directory 与 OMO config 管理现在由 `SettingsPluginSection` 持有
- UI section 的 max tabs、tab position/layout、auto scroll、chat scroll mode 与 open-in-main-tab 写回现在由 `SettingsUiSection` 持有
- debug section 的 shared shell、logging toggle、log path picker、plugin diagnostic export/action 与 console help block 现在由 `SettingsDebugSection` 持有；OpenCode、Codex 与 Claude trace settings/status/actions/catalog 分别由三个 backend panel 持有，section 通过窄 callbacks 提供 shared helpers、visible logs 与 summary-only report
- 模型加载后的 UI 刷新走 `requestAnimationFrame`
- style section 的 preset/status、binding 同步与 reset/apply/save orchestration 现在由 `SettingsStyleSection` 持有；input subsection rerender 继续委托给 `SettingsStyleInputPanelSection`
- 聊天背景图 subsection 继续由 `SettingsStyleBackgroundSection` 持有自己的 host、preview request guard 与 reset/upload lifecycle，`OpenCodianSettings` 只负责装配 `SettingsStyleSection`

## 关键方法

| 方法 | 说明 |
|------|------|
| `display()` | 重建完整设置面板，根据 `settingsLayoutMode` 分发到经典或标签布局 |
| `hide()` | 清理轮询、样式绑定，并让 `SettingsSectionCoordinator` 收尾滚动状态 |
| `onModelsLoaded()` | 模型目录刷新后合并 UI 更新 |
| `scrollToServerSection()` / `scrollToModelSection()` | 跳转到指定分区（经典模式滚动，标签模式切标签） |
| `prepareRestoreScrollOnNextOpen()` | 记录下次打开时的滚动恢复目标 |
| `prepareScrollToConversationOnNextOpen(secondaryTab?: string)` | 记录下次打开时跳转到 Conversation 设置分区；标签布局可同时指定二级标签，经典布局滚动到对应分区 |
| `renderLanguageSetting()` | 渲染语言选择器（经典模式在 `General` 合并卡片内，标签模式在 `General > Language` 二级面板内） |
| `renderLayoutModeSetting()` | 渲染设置界面模式切换控件（经典模式在 `General` 合并卡片内，标签模式在 `General > Basic`） |
| `addServerSettings()` | 创建并挂载 `SettingsServerSection` owner，把 server section lifecycle 从主类中收口出去 |
| `addSecuritySettings()` | 创建并挂载 `SettingsSecuritySection` owner，把 security section lifecycle 从主类中收口出去 |
| `addModelSettings()` | 创建并挂载 `SettingsModelSection` owner，把模型 section lifecycle 从主类中收口出去 |
| `addConversationSettings()` | 创建并挂载 `SettingsConversationSection` owner，把 conversation section lifecycle 从主类中收口出去 |
| `addAgentsSettings()` | 创建并挂载 `SettingsAgentsSection` owner，把 Agents section lifecycle 从主类中收口出去 |
| `addCommandsSettings()` | 创建并挂载 `SettingsCommandsSection` owner，把 Commands section lifecycle 从主类中收口出去 |
| `addPluginSettings()` | 创建并挂载 `SettingsPluginSection` owner，把 plugin management lifecycle 从主类中收口出去 |
| `addUISettings()` | 创建并挂载 `SettingsUiSection` owner，把 UI section lifecycle 从主类中收口出去 |
| `addStyleSettings()` | 创建并挂载 `SettingsStyleSection` owner，把完整 style section lifecycle 从主类中收口出去 |
| `addDebugSettings()` | 创建并挂载 `SettingsDebugSection` owner，并在标准 settings 组合边界注入 OpenCode、Codex 与 Claude 的三个窄 diagnostics ports/adapters；主类只保留 section 装配 |
| `addFormatterSettings()` | 创建并挂载 `SettingsFormatterSection` owner，把 formatter runtime status / config / mode-switch lifecycle 从主类中收口出去 |
| `addMcpSettings()` | 创建并挂载 `SettingsMcpSection` owner，把 MCP 服务器状态概览与刷新 lifecycle 从主类中收口出去 |
| `addUserSettings()` | 创建并挂载 `SettingsUserSection` owner，把用户 profile/prompt/tags 的经典 section shell 从主类中收口出去 |

## 与其他模块的交互

- `SettingsSectionCoordinator`: 管理 section heading 注册、quick-nav 构建、post-render setup 与 scroll restoration，避免这些 DOM/runtime 细节继续堆在设置页主类里
- `SettingsPanelChrome`: 管理 panel title 品牌渲染、通用 block shell、inline-code 格式化、help button 和语言选择器这类稳定展示壳层
- `SettingsDropdownControl`: 管理设置页 `<select>` / `DropdownComponent` 的跨平台自绘视觉层，底层保存逻辑仍走原 select change 事件
- `SettingsTabbedRenderer`: 标签模式下的标签栏渲染与内容路由，从 `OpenCodianSettings` 中提取以控制代码行数；用户标签内容通过单一 `renderUserContent` seam 委托给 user section owner
- `SettingsUserSection`: 用户 profile/prompt/tags 设置的经典 section shell 与 tabbed content routing owner，从 `OpenCodianSettings` 中提取
- `display()` / `hide()` 生命周期现在会先调用 `disposeSections()`，因此 `SettingsUserSection` 的 textarea size-memory 清理由主设置页 shell 统一触发
- `settingsLayoutRegistry`: 标签模式的标签结构定义与查找/回退函数
- `SettingsServerSection`: 管理 server section 的 mode 切换、host/port/remote URL、auth 输入、状态轮询与 start/stop/test/refresh action；`OpenCodianSettings` 只保留 owner 装配与跨 section server-state 同步
- `SettingsMcpSection`: 管理 MCP 服务器状态概览、逐服务器行渲染、catalog subscription 与显式刷新 action；tabbed 模式下路由到独立一级 `MCP` 标签，classic 模式下紧跟 Server 部分之后并进入 quick-nav
- `SettingsModelSection`: 管理模型 section 的 block shell、callback bridge 与 `SettingsModelCatalogPresenter` host；source mode、refresh 链路、workspace 卡片和 icon cache 工具区继续委托给相邻 model-section owners
- `SettingsConversationSection`: 管理 conversation section 的 title mode、AI title model picker、project-scoped compaction editor、global chat font size、question card display/position、answered-card toggle 与 user-markup render toggle，并复用主设置页 block 组件把它们拆成多层级分组；`OpenCodianSettings` 只保留 owner 装配、block seam 与 title-model refresh callback bridge
- `ConversationCompactionHelpModal`: 作为 conversation section compaction 子区块的帮助入口；`OpenCodianSettings` 继续通过共享 `addSettingHelpButton()` seam 提供统一的 `help-circle` 交互
- `SettingsAgentsSection`: 管理 Agents section 的 runtime+project agent catalog、默认主代理选择、project agent 核心字段 CRUD（含 `disable`）与基础 subagent `hidden` 可见性写回；project agent 表单细节继续委托给 companion owner `SettingsProjectAgentEditor`，`OpenCodianSettings` 只保留 owner 装配
- `SettingsCommandsSection`: 管理 Commands section 的 runtime+project slash-command catalog、project command editor shell / placeholder reference、`hiddenSlashCommands` 用户可见性写回与 `slashCommandSkillMode`；project command 表单细节继续委托给 companion owner `SettingsProjectCommandEditor`，runtime placeholder expansion 与 slash execution 则分别留在 `OpenCodeSessionControlOrchestrator` / `SlashCommandExecutionService`
- `SettingsPluginSection`: 管理 plugin section 的 environment snapshot、project config plugin editor、isolation mode、project plugin directory 与 OMO config open/create action；`OpenCodianSettings` 只保留 owner 装配与 formatting bridge
- `SettingsUiSection`: 管理 UI section 的 max tabs、tab position/layout、auto scroll、chat scroll mode 与 open-in-main-tab 保存逻辑；`OpenCodianSettings` 只保留 owner 装配
- `SettingsDebugSection`: 管理 shared debug shell、logging/export/help 与 section-level callbacks；三个 backend panel 通过窄 ports 注入，`OpenCodianSettings` 只保留 owner 装配
- `SettingsSecuritySection`: 管理 security section 的 config status、permission mode 写回、restart action 与 blocklist/export-path 输入；`OpenCodianSettings` 只保留 owner 装配
- `SettingsStyleSection`: 管理 style section 的 theme preset、binding sync、background/input 子 owner 装配与 custom CSS；`OpenCodianSettings` 只保留 owner 装配
- `SettingsFormatterSection`: 管理 formatter section 的 runtime status 展示、project config 模式切换（default/disabled/custom）与 formatter 子树读写；`OpenCodianSettings` 只保留 owner 装配与 display refresh bridge
- `SettingsToolSection`: 管理 Tools section 的内置工具权限、自定义工具文件 authoring、全局工具只读展示和运行时 custom tool 权限列表；`OpenCodianSettings` 只负责 classic / tabbed 两种布局下的 owner 装配
- `SettingsStyleInputPanelSection`: 管理 input panel theme family/variant、glass-refraction 参数与 input subsection rerender；`SettingsStyleSection` 只向它提供通用 style-control seam
- `ModelCatalogStateService`: 提供 settings/model 分区使用的 catalog state API，并集中 provider/model availability 的 core 写回操作
- `SettingsModelCatalogPresenter`: 管理 provider/model accordion、search、bulk toggle、catalog summary 卡片与 provider probe presentation；`SettingsModelSection` 只向它提供 settings writeback 与 icon/inline-code host seam
- `SettingsStyleBackgroundSection`: 管理聊天背景图 subsection 的上传、预览、fit mode / numeric controls、drag focus 与 reset lifecycle；`SettingsStyleSection` 向它提供通用 style-group scaffolding、binding 清理与 apply/save seam
- `SettingsStyleLiquidGlassInputControls`: 管理 liquid glass adapter 参数表单与 plain-language help button；`SettingsStyleInputPanelSection` 向它提供 numeric-control/save seam
- `ModelConfigService`: 读取 `local/server/baseEffective/effective` 目录，以及 `serverConfig` / `effectiveProviderConfig` / `currentEnabledProviderIds`，并提供逐 provider 的真实发送 probe
- `OpencodeConfigManager`: 读写 `.opencode` 配置
- `PluginManagementService`: 由 `SettingsPluginSection` 用于构建插件环境快照与写回 project plugin config
- `ProviderIconService` / `ProviderIconCacheModal`: provider icon 缓存与自定义图标管理
- `ProviderBuiltinIconPickerModal`: 除了搜索与图库过滤外，还负责 provider 图标颜色模式的即时预览与保存
- `ModelPickerModal`: 默认模型和 AI 标题模型共用的搜索式 picker；标题模型即使被开关链路禁用也会保留当前选择，并在设置项右侧显示警告入口
- `ModelConfigModal` / `ModelConfigJsonModal` / `OpencodeConfigModal`: 配置编辑入口
- `ServerSettingHelpModal`: server 设置项帮助说明入口
- `main.ts`: 通过 `addSettingTab()` 注册，并调用 `onModelsLoaded()` / `refreshServerStatusDisplay()`
- `shared/logger.ts`: Debug 分区通过插件设置切换 debug 输出，以及是否把对象参数内联序列化成文本

## 注意事项

- `display()` 每次都会重建 DOM，因此不要长期持有 section 内部元素引用。
- `OpenCodianSettings.ts` 目前已加入仓库级 `max-lines` 豁免名单，因为它仍是 settings shell / owner 装配入口；后续若继续增长，优先把稳定逻辑拆到相邻 section owner 或 renderer，而不是继续把实现细节塞回主类。
- 如果只是调整 settings panel scaffolding，优先改 `SettingsSectionCoordinator`，不要再把 quick-nav/scroll 定时器塞回 `OpenCodianSettings`。
- 如果只是调整 server mode/host/auth/status/action 组装，优先改 `SettingsServerSection`，不要再把这一整块 lifecycle 塞回主设置类。
- 如果只是调整模型 section 的 source mode、workspace 卡片、icon cache 或 refresh orchestration，优先改 `SettingsModelSection`，不要再把这条 lifecycle 塞回主设置类。
- 如果只是调整 conversation section 的 title model、project-scoped compaction editor、global chat font size、question card 或 user-markup render 组装，优先改 `SettingsConversationSection`，不要再把这条 lifecycle 塞回主设置类。
- 如果只是调整 Agents section 的目录加载、default_agent 写回、project agent 核心字段 CRUD（含 `disable`）或基础 subagent visibility，优先改 `SettingsAgentsSection`，不要再把这条 lifecycle 塞回主设置类。
- 如果只是调整 Commands section 的目录加载、project command 核心字段 CRUD、`hiddenSlashCommands` 可见性或 `slashCommandSkillMode` 写回，优先改 `SettingsCommandsSection` / `SettingsProjectCommandEditor`，不要再把这条 lifecycle 塞回主设置类。
- 如果只是调整 plugin snapshot、project config plugin editor、isolation mode、project directory 或 OMO config 组装，优先改 `SettingsPluginSection`，不要再把这条 lifecycle 塞回主设置类。
- 如果只是调整 UI section 的 tab layout、auto scroll、scroll mode 或 open-in-main-tab 组装，优先改 `SettingsUiSection`，不要再把这条 lifecycle 塞回主设置类。
- 如果只是调整 debug logging、log path picker、diagnostic export 或 console help 组装，优先改 `SettingsDebugSection`，不要再把这条 lifecycle 塞回主设置类。
- 如果只是调整 security config-status/permission/restart/blocklist/export-path 组装，优先改 `SettingsSecuritySection`，不要再把这一整块 lifecycle 塞回主设置类。
- 如果只是调整模型目录 UI 状态、provider probe badge/detail、accordion/filter 行为，优先改 `SettingsModelCatalogPresenter`，不要再把这套状态机塞回 `OpenCodianSettings`。
- 如果只是调整完整 style section（theme preset、input appearance、custom CSS、glass/liquid glass 参数），优先改 `SettingsStyleSection`，不要再把这条 lifecycle 塞回主设置类。
- 如果只是调整聊天背景图 subsection，优先改 `SettingsStyleBackgroundSection`，不要再把 background preview / upload / drag / reset 逻辑塞回 `SettingsStyleSection` 或 `OpenCodianSettings`。
- 样式分组和默认值最终都以 `core/types/settings.ts` 的归一化逻辑为准。
- 这个文件同时处理“运行时 UI 状态”和“持久化设置”，两者不要混淆。
- 任何新增设置如果涉及 i18n、默认值、迁移或视图刷新，通常都不只改这一处。
- provider 图标颜色模式虽然存在于模型工具区，但它影响聊天区、设置页、模型工作区与图标管理 modal 的所有 provider 图标显示，因此保存后要同步触发全局 UI 应用。
- Debug 分区里的“内联序列化调试参数”只影响 `logger.debug(...)` 的 console 输出形式，不改变 `info/warn/error` 的独立对象参数行为。
- 如果设置页 `服务器目录` 的 provider 数量明显少于 `opencode models`，先排查 `ServerManager` 是否接管了旧的本地 `4096` 进程；不要先改这里的展示过滤逻辑。

## 2026-07-28 General version management

Classic General renders its layout, locale, and editor-area controls inside `.opencodian-settings-general-merged-block`, then mounts `SettingsPluginUpdateSection` as that merged block's direct sibling. `OpenCodianSettingTab` only supplies the redraw seam; release discovery, backup actions, and confirmation behavior remain in the dedicated owner so classic and tabbed layouts cannot drift. The section itself remains the only version-management card and is never wrapped in another settings block.

The owner keeps `pluginUpdateExpanded` as ephemeral UI state. It passes that value and an `onExpandedChange` callback to `SettingsPluginUpdateSection`, so check/install/restore redraws preserve the disclosure state without writing to plugin settings. `hide()` resets the field to `false` for the next classic settings session.
