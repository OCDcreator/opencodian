# Plugin Entry Point (main.ts)

> **源码**: `src/main.ts`
> **状态**: [REVIEW]

## 概述

`main.ts` 定义 `OpenCodianPlugin`，是 Obsidian 侧的总装配点。它负责：

- 初始化 `StorageService`，并通过 `src/core/types/settingsLoadNormalization.ts` 加载/迁移持久化设置
- 创建 `OpenCodeService`、`OpencodeConfigManager`、`ModelConfigService`
- 在 `OpenCodianView` 注册前预加载会话元数据
- 注册 ribbon、明暗主题自适应品牌图标、命令、设置页与视图
- 协调主题外观、日志、诊断导出和本地 `.opencode` 权限配置同步

它不是单纯的“入口壳”，还承担了插件级状态缓存和诊断导出；但启动期的 persisted-settings merge / normalization 已收束到相邻 bootstrap owner，启动后的 runtime warmup / cross-view refresh 调度也已委托给 `PluginRuntimeCoordinator`。

从 `main.ts` 中提取的启动引导序列和性能追踪现已由 `OpenCodianStartupCoordinator` 统一编排。`main.ts` 保留插件生命周期入口所有权，`onload()` 创建 coordinator 实例并通过回调注入具体行为，启动完成后保留 coordinator 引用以供诊断报告读取 perf trace 数据。

设置保存编排（`saveSettings()`、主题/外观变更、背景资源管理、防抖定时器）已从 `main.ts` 提取到 `OpenCodianSettingsRuntimeCoordinator`。`main.ts` 保留公共 API 表面，所有设置运行时调用委托给该 coordinator。

文件头部保留了针对 `simple-import-sort/imports` 的局部豁免：入口导入按启动编排 seam 手工分组，避免 owner-guard 保护下的 wiring 变更频繁触发与行为无关的排序 diff。

## 导入关系

```text
上游:
- Obsidian API (`Plugin`, `Notice`, `Editor`, `MarkdownView`)
- Node `fs` / `path`
- `src/core/config/*`
- `src/core/opencode/*`
- `src/core/storage/*`
- `src/core/theme/*`
- `src/core/types/*`
- `src/features/chat/OpenCodianView`
- `src/features/settings/OpenCodianSettings`
- `src/i18n`
- `src/shared/*`
- `src/utils/glass`

下游:
- Obsidian 插件加载器
- `OpenCodianView` / `OpenCodianSettingTab` 在运行时回调插件实例
```

## 核心类型 / 状态

- `OpenCodianPlugin extends Plugin`: 插件主类。
- `BUILD_ID`: 由构建阶段注入的常量，用于启动首行、诊断导出和版本复制动作。
- `settings`: 当前归一化后的 `OpenCodianSettings`。
- `storage`: vault 侧持久化入口。
- `openCodeService`: OpenCode 运行时门面。
- `opencodeConfigManager` / `modelConfigService`: 只有拿到 vault 路径后才创建。
- `conversations`: 只在内存里缓存会话元数据；正文按需从 `StorageService.loadFullConversation()` 读取。
- `themeBackgroundDataUrlCache` / `themeBackgroundDataUrlRequests`: 聊天背景图 data URL 缓存与并发去重。
- `chatAppearanceSaveTimeoutId` / `settingsUiStateSaveTimeoutId`: 插件级设置保存节流句柄。
- `settingsPersistenceWritable`: 启动恢复失败时切到只读保护，阻止默认值覆盖已损坏的设置文件。
- `runtimeCoordinator`: 插件级 runtime 调度 owner，持有 deferred warmup timer、model refresh frame 与 cross-view refresh fan-out。
- `startupPerfTrace`: 最近一次插件启动埋点快照，记录分阶段耗时、运行状态、最慢嵌套步骤，以及自动诊断输出，用于冷启动诊断报告和慢启动自动快照。

## 核心逻辑

### 启动顺序 (`onload`)

`onload()` 的顺序是有意排好的：

1. 记录启动首行：版本、`BUILD_ID` 和 vault 路径；这条日志走 `always`，默认也可见。
2. 用 `measureStartupStep()` 给顶层和关键嵌套子步骤打点；`loadSettings()` 会继续拆出 `storage.loadPersistedSettings` / `normalizeLoadedSettings` / `persistNormalizedSettings`，而 `loadConversations()` 会继续拆出 `storage.listConversations` / `cacheConversationMetas`。
3. 注册品牌 icon。
4. 创建并初始化 `StorageService`。
5. 调用 `loadSettings()`，完成设置归一化与历史字段迁移。
6. 注册内置 glass adapter，并按设置启用/关闭调试日志。
7. 设置 i18n locale。
8. 从存储中读取上次保存的 `ManagedServerState`。
9. 若 vault 下还没有 `.opencode` 配置，按当前 `permissionMode` 调用 `OpencodeConfigManager.ensureInitialized()` 创建。
10. 构造 `OpenCodeService`，注入 server status / error / models loaded 回调，以及 `initialManagedServerState`、`SDK_FEATURE_FLAG_ROLLOUT_DEFAULTS` 和 managed server state 持久化回调。
11. 如果能解析到 vault 路径，就创建 `OpencodeConfigManager` / `ModelConfigService`，并把 vault 路径传给 `openCodeService`。
12. 在注册视图之前执行 `loadConversations()`，只预热会话元数据；`StorageService` 会优先读取轻量 `session-metas/` sidecar，缺失时再回退完整 session JSON，并把这次 fallback 统计送进 startup diagnosis。
13. 注册 `OpenCodianView`、自定义品牌 icon（供 ribbon / tab header 复用）、命令与设置页。
14. 启动结束时输出一行汇总日志；这条汇总同样走 `always`。若检测到失败或明显慢启动，还会额外输出一条 automatic diagnosis。
15. 最近一次 trace 会暴露给诊断报告；若 debug 已开启，或本次启动被判定为慢启动/失败，还会自动把 `startup-perf-latest.log` 写到 vault 的 `.opencodian/debug/`。诊断报告也会输出 Claude Code backend 设置摘要、debug module 状态和 debug channel 配置，但不会把 Claude Code 能力包装成 full runtime proof。
16. `onload()` 返回后再后台调度 deferred runtime warmup：本地 sidecar 自启动与首个 server snapshot 不再阻塞插件注册和视图恢复；真正需要新 session 的路径（当前主要是 `createConversation()`）才会显式接管并等待这次 warmup，避免首次建会话撞上未就绪 server，同时不拖慢已有会话的视图首开。
17. 这条 warmup 现在还会先看当前是否真的启用了 `opencode` backend。若用户把所有 backend 都禁用，`main.ts` 只向 `PluginRuntimeCoordinator` 暴露 enabled-backend truth，不再触发启动期的 runtime warmup / snapshot 探测，避免聊天界面已明确显示“已禁用”时后台仍做无意义的本地服务离线探测并产生日志噪音。

这里没有调用 `OpenCodeService.initialize()`；实际运行时由 `main.ts` 自己决定是否启动服务。

### 设置归一化与迁移 (`loadSettings`)

`loadSettings()` 不是简单的“读 JSON 合并默认值”，还承担了多轮历史兼容与恢复：

- 先读取 `StorageService.loadPersistedSettings()` 返回的分层结果，区分 `primary / backup / legacy / missing / blocked`。
- `settings.core.json` / `settings.ui.json` 任一主文件损坏时，优先尝试对应 `.bak`。
- 若新格式不存在或不可恢复，再尝试旧 `.opencodian/settings.json` 自动迁移。
- 只有真正 `missing` 才按首次安装处理；`blocked` 会阻止后续自动写盘。

- 把旧的 `debugLogPath` 合并进新的 `debugLogPaths`（按当前平台落位）。
- 把旧的扁平 `server.{host,port,autoStart}` 迁移为新的 `server.mode/local/remote/auth` 结构。
- 归一化 `chatAppearance`、`theme`、`tabState`、`providerIconLibrary`。
- 归一化 `questionDisplayMode`、`questionCardPosition`、`showAnsweredQuestionCards`。
- 归一化 `inlineSerializedDebugLogArgs`，确保 debug 控制台输出格式开关总是布尔值。
- 归一化 `debugModuleSettings` 与 `debugRefreshIntervalMs`，保证模块开关和高频日志限频始终完整可用。
- 归一化 `disabledModelRefs`，避免历史配置中的脏模型引用污染当前运行时。
- 根据 `inputPanelGlassRefractionGlassDefaultsVersion` 判断是否重置 glass/card/pill 默认层级参数。
- 检测旧版 `nikdelvin` 液态玻璃默认档案并替换为新默认值。
- 丢弃已废弃的 `experimentalComposerGlassRefractionEnabled` 与 `inputPanelLiquidGlassMode`。
- 当主题预设开启时，重新计算 `theme.customAppearanceOverrides` 与生效的 `chatAppearance`。

因此，`this.settings` 在赋值前已经是“当前版本可用”的归一化结果。

### 设置保存与全局刷新 (`saveSettings`)

`saveSettings()` 负责四件事：

1. 清掉延迟保存/延迟 UI 状态的 timer。
2. 先把新设置同步到 `OpenCodeService.updateSettings()`；若服务层更新失败，就回滚到旧快照。
3. 把归一化后的设置拆成 `core/ui` 两个域，再写回 `StorageService` 的串行写队列。
4. 刷新所有已打开的 `OpenCodianView`，并在需要时调用 `OpencodeConfigManager.syncPermissionMode()` 让 `.opencode` 权限配置与 `permissionMode` 对齐。

此外，保存完成后入口层现在会主动广播一次 slash command catalog 失效，让 `OpenCodianView` 内部的 `SlashCommandMenuCatalogCache` 不必再等 120 秒 TTL 才看到新的项目命令/Skill 可见性变化。

`handleModelsLoaded()` 会在服务层模型默认值变化后把新 provider/model 回写到设置，并用 `requestAnimationFrame` 合并视图刷新。

OpenCode server status 回调也不再只刷新设置页状态：当本地/远端服务重新进入 `running` 时，入口层会通知所有已打开的 `OpenCodianView` 立即清空 slash command catalog，并触发一次后台 warm preload，这样服务重启后的命令列表能尽快和当前 runtime 对齐。

聊天外观的防抖保存只写 `core` 域；tab/设置页 UI 状态的防抖保存只写 `ui` 域。视图层不再直接把整份 `this.settings` 落盘。

### 视图、命令与插件级 UI 调度

入口层直接注册这些 UI 能力，并把启动后的跨视图刷新调度交给 `PluginRuntimeCoordinator`：

- `activateView()`: 按 `openInMainTab` 决定在主标签页或右侧边栏打开 `OpenCodianView`。
- `startNewConversationForCurrentView()`: 供 `new-conversation` 命令使用；先激活聊天视图，再委托当前 `OpenCodianView` 的 current-tab 新建会话入口，避免只创建后台 conversation 而 UI 仍停在旧 session。
- ribbon 图标：`bot`
- 命令：
- `open-view`
- `new-conversation`
- `toggle-liquid-diamond-demo`
- `toggle-liquid-diamond-demo-webgl`
- `toggle-glass-octahedron`
- `inline-edit`
- `add-current-note-to-context`
- `add-selection-to-context`

`PluginRuntimeCoordinator` 会向所有已打开的视图广播：

- `applyLocaleTexts()`
- `applyChatAppearanceSettings()`
- `applyChatScrollMode()`
- `applyTabBarLayout()`
- `reloadModelCatalog()`
- `refreshCurrentConversationRendering()`
- `refreshQuestionUi()`

同时它还统一拥有插件级 runtime warmup gate：

- 只有 `enabledBackends` 里包含 `opencode`，且当前 server 仍是 local auto-start 模式时，才会安排 deferred warmup 或被 `createConversation()` 接管为 session-bootstrap warmup。
- 这个 gate 只决定“是否值得启动/探测本地 runtime”，不会改变既有会话、历史记录、tab runtime 或会话绑定 backend 的持久化语义。

### 会话缓存与本地持久化

`loadConversations()` 只读取 `StorageService.listConversations()` 返回的元数据，并通过 `conversationsLoadPromise` 防止并发重复加载。

后续流程分成两层：

- `createConversation()` 会以 `settings.activeBackend` 作为新会话 owner，再从 `AgentServiceRegistry` 查找同名 adapter，并通过 `AgentBackendRouting.hasSessionCreationCapability()` 确认其声明 sessions 且实现 create/delete/title-update 这组会话创建所需方法。OpenCode 会话仍会先接管 deferred runtime warmup，非 OpenCode backend 则直接调用其 `createSession()`，并只写 `backendSessionId`。如果当前 active backend 是 Claude/Codex 等非 OpenCode，但对应 adapter 没有会话创建能力或不可用，入口会直接报错，不会回退去创建 OpenCode 会话。更宽的 session read/list/preview seam 仍由 `hasSessionCapability()` 判定。
- `createConversationFromSession()` 允许已有 backend session 映射为新的本地 conversation。优先使用调用方传入的 `initial.backend`（如 fork 来源 conversation 的 backend），未指定时回退到 `settings.activeBackend`。只有最终 backend 是 OpenCode 时才写 legacy `openCodeSessionId`，其他 backend 只写通用 `backendSessionId`。
- `getConversationById()` 默认优先从磁盘补全完整消息，再更新内存缓存；`preferCache` 可跳过这一步。
- `deleteConversation()` 会先把本地缓存删掉，再按 conversation owner 解析 session backend 并 best-effort 删除 backend session，最后清理本地存储。历史 conversation 缺失 `backend` 时继续按 OpenCode 处理。

### 主题背景资源与诊断导出

入口层还承接两类“插件级”能力：

- 主题背景图：
  - 导入文件到 `StorageService.saveThemeBackgroundAsset()`
  - 维护 data URL 缓存
  - 在保存失败时回滚外观并删除新导入的资源
- 诊断导出：
  - `buildDiagnosticReport()` 汇总 OpenCode server 状态、Claude Code SDK 诊断状态、关键设置、debug module 开关、debug refresh interval、最近一次 startup perf trace、自动 startup analysis 与最近日志，导出前通过 `sanitizeDiagnosticReport()` 对全文执行密钥/令牌/密码净化
  - Claude Code 诊断区块只写摘要计数与开关状态，例如 model/effort、setting sources、MCP/env/additional directory 数量、checkpoint/hook/subagent 诊断开关，不导出环境变量值或 prompt 内容
  - 密钥净化覆盖 Bearer 令牌、API key 赋值、CLI 标志、URL 内嵌密码、查询字符串参数、环境变量、Anthropic API key 前缀、PEM 私钥块等常见敏感模式
  - `writeDiagnosticLogFile()` 把报告写到指定目录
  - `getDebugBuildIdentityText()` 提供设置页“复制版本 / BUILD_ID”动作使用的稳定文本

## 关键方法

| 方法 | 说明 |
|------|------|
| `onload()` | 完成服务装配、设置迁移、视图/命令注册与会话预加载 |
| `onunload()` | 停止 `OpenCodeService`，清除 chat appearance timer 与模型刷新帧请求 |
| `loadSettings()` | 读取并迁移历史设置，生成当前版本的归一化配置 |
| `saveSettings()` | 同步服务层、写回存储、刷新所有视图、同步 `.opencode` 权限配置 |
| `activateView()` | 打开或定位 `OpenCodianView` |
| `startNewConversationForCurrentView()` | 激活聊天视图并在当前视图/当前 tab 打开新会话 |
| `loadConversations()` | 预加载会话元数据，保证视图恢复前数据已就绪 |
| `createConversation()` | 按 `settings.activeBackend` 创建对应 backend session 并建立本地 conversation |
| `getConversationById()` | 从缓存或磁盘获取完整 conversation |
| `deleteConversation()` | 删除本地 conversation，并 best-effort 删除远端 session |
| `buildDiagnosticReport()` | 生成调试报告文本 |
| `writeDiagnosticLogFile()` | 将调试报告写成日志文件 |
| `handlePrepareStartupState()` | 创建 StorageService、加载设置、应用启动副作用、加载 managed server state |
| `handleBootstrapOpenCodeRuntime()` | 初始化 `.opencode` 配置、构造 OpenCodeService、配置 vault-scoped 服务、预加载会话 |

## 数据流

```mermaid
graph TD
    A[Obsidian 加载插件] --> B[OpenCodianStartupCoordinator.execute]
    B --> C[registerAppIcon]
    B --> D[handlePrepareStartupState]
    D --> D1[StorageService.initialize]
    D --> D2[loadSettings / 迁移旧设置]
    D --> D3[setLocale + registerBuiltinGlassAdapters]
    B --> E[handleBootstrapOpenCodeRuntime]
    E --> E1[OpencodeConfigManager.ensureInitialized]
    E --> E2[创建 OpenCodeService]
    E --> E3[设置 vaultPath / ConfigManager / ModelConfigService]
    E --> E4[loadConversations 预载元数据]
    B --> F[registerWorkspaceIntegration]
    F --> F1[registerView / ribbon / commands / setting tab]
    B --> G[scheduleDeferredRuntimeWarmup]
    G --> H[需要新 session 时接管 warmup]
    H --> I[OpenCodianView 运行时回调插件实例]
```

## 与其他模块的交互

- `StorageService`: 读写分层设置、会话、managed server state、主题背景资源。
- `settingsLoadNormalization.ts`: 收束启动期 core/ui settings snapshot merge、历史 server/theme/input-panel 迁移与“是否需要回写归一化结果”的判定。
- `OpenCodeService`: 承担 OpenCode 侧运行时；插件把设置、vault 路径和 managed PID 状态注入进去。
- `OpencodeConfigManager`: 用于首次创建或后续同步 `.opencode` 权限配置。
- `ModelConfigService`: 在拿到 vault 路径后构建，供设置页和视图读取模型目录。
- `OpenCodianStartupCoordinator`: 启动引导运行时 owner，负责编排 `onload` 阶段的启动序列和性能追踪；`main.ts` 通过回调注入具体行为，启动完成后保留 coordinator 引用读取诊断数据。
- `PluginRuntimeCoordinator`: 入口旁的 runtime orchestration owner，负责 deferred warmup、session-bootstrap warmup readiness、model refresh frame、slash catalog invalidation 和 cross-view UI refresh fan-out。
- `OpenCodianView`: 由入口注册，并在运行时回调插件实例获取会话、刷新 UI、附加上下文等能力。
- `OpenCodianSettingTab`: 通过插件实例保存设置、刷新服务状态和模型目录。
- `core/theme`: 负责主题预设与外观覆盖的归一化。
- `i18n`: 由入口设置 locale，并通过 `PluginRuntimeCoordinator` 的跨视图刷新把文字变更传播出去。

## 配置项

`main.ts` 直接消费的设置主要包括：

- `server.*`: 决定 OpenCode 连接方式、基础地址和是否自动启动本地服务。
- `permissionMode`: 决定 `.opencode` 初始/同步写入的权限模式。
- `locale`: 决定 i18n 语言。
- `openInMainTab`: 决定 `activateView()` 打开主标签页还是右侧边栏。
- `theme` / `chatAppearance` / `inputPanel*`: 决定外观归一化、预设覆盖与主题背景资源行为。
- `enableDebugLogging` / `debugModuleSettings` / `debugRefreshIntervalMs` / `inlineSerializedDebugLogArgs` / `debugLogPaths`: 控制调试日志及其 Console 输出格式、模块放行和高频日志节流。
- `defaultProvider` / `defaultModel`: 会在模型加载后由服务层回写和校正。

## 注意事项

### 优先扩展的相邻模块

新功能不应直接加入 `main.ts`。根据功能类型，优先扩展以下 owner：

| 功能类型 | 优先扩展 |
|----------|----------|
| OpenCode 运行时行为 | `src/core/opencode/OpenCodeService.ts` |
| 会话 / tab 生命周期 | `ConversationTabRuntimeCoordinator` / `ConversationViewStateService` |
| 模型目录 / provider 逻辑 | `ModelConfigService` / `OpencodeConfigManager` |
| 设置 UI | `OpenCodianSettings` / 对应 section owner |
| 主题 / 外观 | `src/core/theme/` 下对应模块 |
| 存储层 | `StorageService` |
| 聊天视图行为 | `OpenCodianView` 的各 coordinator / service |

### 不可移除的关键行为

1. **`loadConversations()` 必须在视图注册之前完成**：`onload()` 先预载会话再注册 `OpenCodianView`，这是热重载/恢复链路的顺序约束；违反会导致视图恢复时拿不到会话数据。
2. **`loadSettings()` 归一化链路**：分层设置读取（`primary/backup/legacy/missing/blocked`）+ 历史字段迁移 + 归一化是不可切断的启动前置；跳过任何环节都可能导致旧版设置被默认值覆盖。
3. **`saveSettings()` 的服务层回滚**：先同步服务层、失败时回滚到旧快照，再写磁盘；这个顺序不能颠倒，否则磁盘写成功但服务层失败会导致运行时状态不一致。
4. **`settingsPersistenceWritable` 只读保护**：当启动阶段判定设置不可恢复时，插件进入持久化只读保护，通过 `Notice` 告警而非写入默认值；不能绕过此保护写盘。

### 其他注意事项

- `loadConversations()` 只加载元数据，不加载消息正文；正文由 `getConversationById()` 按需补读。
- 会话元数据加载会把 legacy `openCodeSessionId` 回填为 `backendSessionId`；新建 OpenCode 会话会双写两者。删除和标题同步这类 OpenCode-only 路径只在能解析到 OpenCode session id 时调用底层 `OpenCodeService`。
- 本地 server auto-start 已改成注册完成后的后台 warmup；冷启动 trace 现在更接近"插件何时可见"，而不是"sidecar 何时 ready"。
- 启动 trace 会同时记录顶层 phase 和嵌套子步骤；诊断报告里的总耗时只汇总顶层 phase，避免双重累计。
- `saveSettings()` 的失败回滚只覆盖服务层设置同步；分层磁盘写入发生在服务层更新之后。
- `measureStartupStep()` 现已由 `OpenCodianStartupCoordinator` 持有，但 `main.ts` 中的 handler 方法仍然可以调用 coordinator 的 `measureStartupStep()` 来给子步骤继续嵌套打点。
- 慢启动自动快照不依赖用户先打开 debug；只要启动失败，或顶层总耗时 / 主导 phase 超过阈值，就会把 trace 写到 `.opencodian/debug/startup-perf-latest.log`。
- `onunload()` 当前没有显式调用 `clearSettingsUiStateSaveTimer()`；卸载时只清除了 chat appearance timer 与 model refresh 帧请求。
