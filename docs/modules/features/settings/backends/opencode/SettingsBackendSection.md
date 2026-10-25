# SettingsBackendSection

OpenCode 2 runtime catalog refresh renders native MCP connections and integration authentication. API keys stay in password inputs and go to the native server; OAuth has external authorization, code completion, status readback and cancellation. Agent/command/skill/plugin names are displayed from the native catalog; their local definitions stay in the version-specific configuration overlay.

> **源码**: `src/features/settings/backends/opencode/SettingsBackendSection.ts`
> **状态**: [REVIEW]

## 概述

`SettingsBackendSection` 负责 `General > Agent Management` 设置面板。它管理当前已实现 agent backend 的启用范围与当前 active agent，并在任意 backend 开关变化时以 best-effort 方式同步 runtime 生命周期（start/stop adapter）。切换默认 backend 只启动新 adapter；仍启用的旧 adapter 保留给现有会话。

2026-06-28：本 section 同步纳入智能体管理 Settings UI 第一阶段重构。它是截图中 `通用 > 智能体管理` 的真实 owner，现在复用 agent settings control surface：外层挂载 `.opencodian-agent-settings-shell.opencodian-backend-agent-surface`，默认智能体使用 compact Form/Card row，已启用智能体列表使用 scroll/list 风格的低调数据行，状态通过 badge 与 `data-backend-agent-*` 属性表达，而不是把 active/enabled/off 文案塞进大卡片或重复标题。

## 职责

- 渲染 active backend 的下拉选择，选项来自当前 enabled backend 列表；切换后会刷新设置页，让 tabbed settings surface 立即进入对应 backend 的专属设置面
- 在默认 backend 行旁渲染 R-F4 `chatWarmSessionEnabled` 普通 toggle：仅预热当前聊天 backend 的空只读 aux session，不发 prompt/turn、不产生模型计费；真实聊天另建自己的会话
- 通过 `IMPLEMENTED_AGENT_BACKENDS` 过滤已知 backend，渲染所有已实现的 backend 开关（`opencode`、`claude-code`、`codex`）
- 为 backend 管理 surface 输出稳定样式与 QA 选择器：`.opencodian-backend-agent-surface`、`.opencodian-backend-agent-list`、`.opencodian-backend-agent-row`、`data-backend-agent-id`、`data-backend-agent-active`、`data-backend-agent-enabled`
- 在 backend 行标题旁追加低调 badge：active、enabled、disabled。行标题本身只保留 backend 名称，避免重复朗读和视觉噪音
- 导出 `BACKEND_OPTIONS`，让 agent switcher 复用同一组已实现 backend id 与 locale key
- 允许所有 backend 被禁用，并在没有 enabled backend 时显示空状态提示
- 在当前 active backend 被禁用时回退到 enabled 列表中的第一个 backend
- 更新设置时同步 `AgentServiceRegistry` 的 enabled/active 状态，触发聊天视图的 active-backend change 监听
- **通用生命周期**：启用/禁用任意 backend 时调用对应 adapter 的 `start()`/`stop()`；OpenCode 在 adapter 不存在时回退到 `openCodeService`
- **Active 切换生命周期**：切换 active backend 时启动新 adapter，保留其他已启用 adapter 的运行状态

## 公共导出

- `BACKEND_OPTIONS`: 从内部已知 backend 列表按 `IMPLEMENTED_AGENT_BACKENDS` 过滤后的设置页选项，包含 backend id、名称 locale key 和描述 locale key。
- `SettingsBackendSection`: 设置 section class，构造参数包含 `plugin` 与 `requestDisplayRefresh()`；调用 `attach()` 挂载默认 backend 下拉与 enabled backend 开关。

## 集成

- `SettingsTabbedRenderer`: 在 `general/backend` 二级标签下创建并挂载本 section
- `OpenCodianSettings.activeBackend`: 保存当前 active backend，决定新会话创建、设置 tab 可见性和聊天 view 的 backend surface 切换
- `OpenCodianSettings.enabledBackends`: 保存启用 backend 范围，并在读取/渲染时过滤到已实现 backend
- `AgentServiceRegistry`: 同步 active backend、enabled backend 状态，并通过 `get(kind)` 管理所有 adapter 的 start/stop 生命周期
- `OpenCodeService`: 当 OpenCode registry adapter 不存在时作为 start/stop fallback

## 维护约束

- 展示文案必须通过 `t()` 和 locale key 获取，避免硬编码 UI 字符串
- 非 OpenCode backend 只有加入 `IMPLEMENTED_AGENT_BACKENDS` 后才应出现在本 section
- 样式只允许走 agent settings control surface，不应重新引入大色块、重阴影、嵌套卡片或 Sheet/Drawer 流程
- badge 只表达状态，不改变 backend 启用、active fallback、adapter lifecycle 或保存逻辑
- 任意 backend 的 start/stop 均为 best-effort：失败不应阻止设置保存或 UI 刷新
- 默认 backend 切换不得终止其他 tab 的请求；禁用 backend 时停止其 adapter，包括先前启动、现已非默认的 adapter
- 默认 backend 下拉或禁用 active backend 的 fallback 改变 active backend 后，必须调用 plugin 的 `onChatWarmSessionBackendChanged()`；R-F4 开启时由组合根排他地替换旧预热 session

## 2026-09-08 Pi 独立服务接入

Pi 加入已实现后端选择。仅启用 Pi 时挂载独立 SettingsPiSection，既有启停逻辑不变。

2026-09-09：通用智能体页只负责启停/默认后端，移除内联Pi配置；Pi配置在独立后端标签。

2026-09-22：ZCode 加入已实现后端选择（`settings.agent.name.zcode` / `settings.agent.zcode.desc`）；启用/禁用不影响其他后端的启停语义。

## 2026-09-27 OpenCode 2 compatibility

The backend list exposes OpenCode 1 and 2 separately; OpenCode 2 settings select local executable or remote URL/password.

2026-10-07: OpenCode 2 catalog reads keep fixed denied/unavailable/failed state text and data-catalog-state. Raw upstream exception messages are not rendered in this catalog read surface.


## 2026-10-08 后台会话与默认后端切换

默认后端选择只决定新会话/设置路由，保留其他已启用 adapter，避免中断后台 tab。禁用该后端和插件卸载负责释放资源；设置页头部按钮与默认后端下拉使用相同语义。两台桌面的长工具调用、目标取消/续聊及后端切换需单独验证，不能由设置 ACK 推断。


## 2026-10-23 DSH backend

后端启用列表新增 DeepSeek Harness。启用后显示 CLI/桌面包路径、工作目录及“测试连接”；空路径走自动发现，空目录使用当前 vault。测试连接只启动适配器并读取状态，不创建会话或发送模型提示。控件挂载不订阅持久状态回调，避免设置页重建后残留 DOM listener。

## 目录定位（2026-10-23）

- 源码位置：`src/features/settings/backends/opencode/SettingsBackendSection.ts`。
- 原位置：`src/features/settings/SettingsBackendSection.ts`；文件名、导出接口与业务职责保持不变。
- 随目录调整更新的依赖：`src/core/agents/backend/opencode/OpenCode2Adapter.ts`。

## 2026-10-24 DSH 设置区分离

后端启用/默认选择组合层将 DSH 的完整设置区交给 `SettingsDshSection`，仅注入设置读写、适配器窄控制面和统一 MCP 校验。保留原有 OpenCode 2 管理行为，避免把多个后端的设置逻辑继续堆入此模块。
