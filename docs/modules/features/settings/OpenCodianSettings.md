# OpenCodianSettings

> **源码**: `src/features/settings/OpenCodianSettings.ts`
> **状态**: [REVIEW]

## 概述

`OpenCodianSettings.ts` 是插件的主设置面板。它继承 `PluginSettingTab`，负责组合各个设置分区，并把模型、样式、调试与 modal 编排挂到 Obsidian 的 settings UI 上。

当前文件的重点不只是“渲染设置项”，还包括：

- 模型中心的 host 装配与持久化写回
- 主题预设与样式控件联动
- 通过 `SettingsServerSection` 协调 server section 的 mode/auth/status lifecycle
- 通过 `SettingsSecuritySection` 协调 security section 的 config-status/permission/restart/blocklist lifecycle
- 通过 `SettingsStyleBackgroundSection` 协调聊天背景图子区块 lifecycle
- 对多个 modal 与辅助服务的编排

## 主要分区

`display()` 会重建整个设置面板，并依次挂载这些分区：

- Language
- Server
- Model
- Conversation
- Plugins
- Security
- UI
- Style
- Debug
- User

其中最近变化较大的几块是：

- **Model**
  - 重构成“常用 / 可用范围与目录 / 当前提供商与模型”三段式模型中心
  - 默认聊天模型不再拆成 provider/model 两个普通下拉，而是走可搜索 picker
- provider 级可用性开关仍只写回当前项目 `.opencode/opencode.json`，可覆盖服务器继承的 provider 白名单 / 黑名单；具体写回组合逻辑已委托给 `ModelCatalogStateService`
- model 级可用性开关仍写回插件设置 `disabledModelRefs`，但归并与规范化同样走 `ModelCatalogStateService`
  - `OpenCodianSettings` 现在不再直接维护 provider accordion、search、bulk toggle 与 probe badge/detail 的 UI 状态机，这部分已委托给 `SettingsModelCatalogPresenter`
  - 项目配置块本身改成双列 provider 卡片入口：直接展示当前项目本地 provider，点击卡片按 `provider.id` 打开 `ModelConfigModal`，点击加号则直接进入新增 provider 流程
  - provider / model 的项目级配置与图标缓存管理收拢进 `ModelConfigModal`；该弹窗现按 `CC Switch` 风格重组为顶部预设条 + 横向 provider 切换 + 单列表单流，配置 JSON 与重启选项固定放在底部预览区
  - provider 图标缓存工具区新增全局 `providerIconColorMode` 与 `providerIconDefaultVariant`：前者控制运行时颜色策略（跟随系统 / 单色 / 彩色），后者控制 `auto` 条目优先尝试的 LobeHub 静态 variant；内置图标选择器会实时预览当前模式并允许显式保存 variant
- **Conversation**
  - `questionDisplayMode`
  - `questionCardPosition`
  - `showAnsweredQuestionCards`
  - `aiTitleModel` 的 availability-aware 选项解析与可搜索 picker
- **Style**
  - theme preset + custom overrides
  - 聊天背景图上传/调参/预览拖拽现已委托给 `SettingsStyleBackgroundSection`
  - assistant metadata / time / provider-model 独立样式控制
  - 输入面板 glass refraction / liquid glass 参数
- **Security**
  - config file status / permission mode / restart action 现已委托给 `SettingsSecuritySection`
  - blocklist、external access、export path 与平台 blocked commands 的 section 组装同样收口到专属 owner
- **Debug**
  - `enableDebugLogging`
  - `inlineSerializedDebugLogArgs`
  - 诊断导出路径、复制最近诊断、生成日志文件

## 核心逻辑

### 面板重建

`display()` 不是局部 patch，而是清空容器后整体重建。这让语言切换、主题预设同步和复杂控件刷新更容易保持一致，但也意味着：

- DOM 引用会失效
- section heading / quick-nav / scroll restore 需要在重建后重新接线

从 R9 开始，这部分壳层生命周期已委托给 `SettingsSectionCoordinator`：`OpenCodianSettings` 只负责按顺序挂载 Language / Server / Model / Conversation / Plugins / Security / UI / Style / Debug / User 各 section，本身不再直接持有 quick-nav DOM 组装或滚动恢复定时器细节。

### 模型目录与可用性控制

模型分区现在显式区分：

- 服务端宽目录是否存在某 provider/model
- 运行时当前返回哪些 provider/model
- 当前 source mode 下是否进入 `baseEffective`
- 服务器或项目 provider 白名单 / 黑名单是否禁用 provider
- 插件侧是否被 `disabledModelRefs` 过滤掉

因此设置页能展示“存在但被禁用”的模型，而不只是“当前下拉可选项”。

新的结构把模型任务拆开了：`ModelCatalogStateService` 负责 core catalog state 语义，`SettingsModelCatalogPresenter` 负责“可用范围与目录”的展示状态机，而 `OpenCodianSettings` 只保留设置写回与 modal 装配：

- **常用**：默认聊天模型、来源模式、刷新摘要
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

provider 开关写回仍遵循 `ModelConfigService` 返回的 `effectiveProviderConfig` 继承规则：项目 `enabled_providers` / `disabled_providers` 字段存在时替换服务器字段，这也意味着项目本地可以缩小或清空继承层禁用数组，而不是把继承禁用视为不可覆盖的硬限制。但设置页展示启用态时，额外参考 `currentEnabledProviderIds`，避免把当前作用域下已不可用的 provider 显示成“已启用”。这些 core availability 组合规则现在集中在 `ModelCatalogStateService`，而 `SettingsModelCatalogPresenter` 只做呈现、`OpenCodianSettings` 只提供 semantic toggle 回调与 refresh orchestration。设置页的 provider 可用性测试现在分两层：

- 先读 scoped runtime、connected directory 和 server catalog，判断当前是“项目禁用”“继承/服务端配置禁用”“只有目录占位”还是“可尝试发送”
- 只有真正允许发送且能选出测试模型时，才会做一次最小真实请求

### 设置面板滚动恢复

滚动恢复与 quick-nav 现在由 `SettingsSectionCoordinator` 持有；`OpenCodianSettings` 只保留“下一次打开前记录意图”的公开入口。当前恢复链路仍然包括：

- `settingsPanelScrollTop` 持久化到插件设置
- `prepareRestoreScrollOnNextOpen()` / `prepareScrollToServerOnNextOpen()` 在下次打开前注册意图
- `MutationObserver` + 多次延迟重试用于等待 DOM 稳定

这是最近文档里最容易漏掉的行为之一，因为它已经不只是简单的“记住 scrollTop”。

### 实时状态与节流刷新

- server section 的 mode/auth/status DOM/state 现在由 `SettingsServerSection` 持有，并继续通过固定轮询刷新
- security section 的 config-status、permission mode、restart flow 与 blocklist/export-path 输入现在由 `SettingsSecuritySection` 持有
- 模型加载后的 UI 刷新走 `requestAnimationFrame`
- 样式控件通过 `styleControlBindings` 统一同步，避免 theme preset 切换后控件显示滞后
- 聊天背景图 subsection 现在由 `SettingsStyleBackgroundSection` 持有自己的 host、preview request guard 与 reset/upload lifecycle，`OpenCodianSettings` 只负责装配 owner 与复用通用 style control seam

## 关键方法

| 方法 | 说明 |
|------|------|
| `display()` | 重建完整设置面板，并委托 `SettingsSectionCoordinator` 收口 section scaffolding |
| `hide()` | 清理轮询、样式绑定，并让 `SettingsSectionCoordinator` 收尾滚动状态 |
| `onModelsLoaded()` | 模型目录刷新后合并 UI 更新 |
| `scrollToServerSection()` / `scrollToModelSection()` | 跳转到指定分区 |
| `prepareRestoreScrollOnNextOpen()` | 记录下次打开时的滚动恢复目标 |
| `addServerSettings()` | 创建并挂载 `SettingsServerSection` owner，把 server section lifecycle 从主类中收口出去 |
| `addSecuritySettings()` | 创建并挂载 `SettingsSecuritySection` owner，把 security section lifecycle 从主类中收口出去 |
| `addModelSettings()` | 装配模型中心 host，包括默认模型 picker、`SettingsModelCatalogPresenter`、provider workspace 卡片，以及高级工具区 |
| `addConversationSettings()` | 渲染标题、question 和回答回顾相关设置 |
| `addStyleSettings()` | 渲染 theme preset、挂载 `SettingsStyleBackgroundSection`，并装配其余 chat appearance / glass / liquid glass 控件 |

## 与其他模块的交互

- `SettingsSectionCoordinator`: 管理 section heading 注册、quick-nav 构建、post-render setup 与 scroll restoration，避免这些 DOM/runtime 细节继续堆在设置页主类里
- `SettingsServerSection`: 管理 server section 的 mode 切换、host/port/remote URL、auth 输入、状态轮询与 start/stop/test/refresh action；`OpenCodianSettings` 只保留 owner 装配与跨 section server-state 同步
- `SettingsSecuritySection`: 管理 security section 的 config status、permission mode 写回、restart action 与 blocklist/export-path 输入；`OpenCodianSettings` 只保留 owner 装配
- `ModelCatalogStateService`: 提供 settings/model 分区使用的 catalog state API，并集中 provider/model availability 的 core 写回操作
- `SettingsModelCatalogPresenter`: 管理 provider/model accordion、search、bulk toggle、catalog summary 卡片与 provider probe presentation；`OpenCodianSettings` 只向它提供 settings writeback 与 icon/inline-code host seam
- `SettingsStyleBackgroundSection`: 管理聊天背景图 subsection 的上传、预览、fit mode / numeric controls、drag focus 与 reset lifecycle；`OpenCodianSettings` 只向它提供通用 style-group scaffolding、binding 清理与 apply/save seam
- `ModelConfigService`: 读取 `local/server/baseEffective/effective` 目录，以及 `serverConfig` / `effectiveProviderConfig` / `currentEnabledProviderIds`，并提供逐 provider 的真实发送 probe
- `OpencodeConfigManager`: 读写 `.opencode` 配置
- `PluginManagementService`: 构建插件环境快照
- `ProviderIconService` / `ProviderIconCacheModal`: provider icon 缓存与自定义图标管理
- `ProviderBuiltinIconPickerModal`: 除了搜索与图库过滤外，还负责 provider 图标颜色模式的即时预览与保存
- `ModelPickerModal`: 默认模型和 AI 标题模型共用的搜索式 picker；标题模型即使被开关链路禁用也会保留当前选择，并在设置项右侧显示警告入口
- `ModelConfigModal` / `ModelConfigJsonModal` / `OpencodeConfigModal`: 配置编辑入口
- `ServerSettingHelpModal` / `LiquidGlassSettingHelpModal`: 帮助说明入口
- `main.ts`: 通过 `addSettingTab()` 注册，并调用 `onModelsLoaded()` / `refreshServerStatusDisplay()`
- `shared/logger.ts`: Debug 分区通过插件设置切换 debug 输出，以及是否把对象参数内联序列化成文本

## 注意事项

- `display()` 每次都会重建 DOM，因此不要长期持有 section 内部元素引用。
- 如果只是调整 settings panel scaffolding，优先改 `SettingsSectionCoordinator`，不要再把 quick-nav/scroll 定时器塞回 `OpenCodianSettings`。
- 如果只是调整 server mode/host/auth/status/action 组装，优先改 `SettingsServerSection`，不要再把这一整块 lifecycle 塞回主设置类。
- 如果只是调整 security config-status/permission/restart/blocklist/export-path 组装，优先改 `SettingsSecuritySection`，不要再把这一整块 lifecycle 塞回主设置类。
- 如果只是调整模型目录 UI 状态、provider probe badge/detail、accordion/filter 行为，优先改 `SettingsModelCatalogPresenter`，不要再把这套状态机塞回 `OpenCodianSettings`。
- 如果只是调整聊天背景图 subsection，优先改 `SettingsStyleBackgroundSection`，不要再把 background preview / upload / drag / reset 逻辑塞回主设置类。
- 样式分组和默认值最终都以 `core/types/settings.ts` 的归一化逻辑为准。
- 这个文件同时处理“运行时 UI 状态”和“持久化设置”，两者不要混淆。
- 任何新增设置如果涉及 i18n、默认值、迁移或视图刷新，通常都不只改这一处。
- provider 图标颜色模式虽然存在于模型工具区，但它影响聊天区、设置页、模型工作区与图标管理 modal 的所有 provider 图标显示，因此保存后要同步触发全局 UI 应用。
- Debug 分区里的“内联序列化调试参数”只影响 `logger.debug(...)` 的 console 输出形式，不改变 `info/warn/error` 的独立对象参数行为。
- 如果设置页 `服务器目录` 的 provider 数量明显少于 `opencode models`，先排查 `ServerManager` 是否接管了旧的本地 `4096` 进程；不要先改这里的展示过滤逻辑。
