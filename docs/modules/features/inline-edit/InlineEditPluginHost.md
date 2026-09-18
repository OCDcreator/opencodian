# InlineEditPluginHost
> 2026-09-18 (R-B1/R-B2): bridge passthroughs for `listContextGroups` and `applyAutoInternalLinks`; both optional, keeping older hosts byte-identical.

> **源码**: `src/features/inline-edit/InlineEditPluginHost.ts`
> **状态**: [REVIEW]

## 概述

`InlineEditHost` 在插件侧的实现。插件主类持有聊天视图与 agent registry，因此由它提供依赖、由本模块把依赖转成宿主契约，使 `main.ts` 只保留几行装配代码。

## 职责

- `createInlineEditPluginHost(bridge)`：把 `InlineEditPluginBridge`（vault 路径、locale、registry、活动 tab 的 backend/模型、inlineEdit 设置）转成 `InlineEditHost`
- backend 解析：活动聊天 tab 的 backend → registry 活跃 backend；无 adapter 时返回 `null`
- `getAuxQuery()`：仅当 adapter 声明 `AgentCapability.AuxQuery` 时收窄为能力接口，否则返回 `null`（调用侧置灰）
- 模型解析：`inlineEditModelOverrides[kind]` 优先，其次活动 tab 模型，最后 `null`（用后端默认）
- `parseModelOverride()` / `normalizeTabModel()`：按 backend 归一化。opencode/pi 需要 `provider/model`，claude-code 与 codex 用单个 model 字符串；格式不合法时返回错误而不是回退
- 可选 `isModelAvailable()` 钩子：由插件提供后端目录校验；未提供时只做格式校验
- 可选 `createProviderIcon(providerId, size)`：透传插件注入的提供商图标工厂（`ProviderIconService.createIconElement`，与主输入窗口模型选择器同一管线），供悬浮条模型 chip 与菜单行渲染品牌图标；未提供时 overlay 回退 lucide 字形
- `supportsImages`（R-A4）：`hasCapability(adapter.capabilities, AgentCapability.Images)` 注入宿主句柄；四个 adapter 均声明图片能力，该字段防御性地支撑「后端不支持图片时显式提示、不静默降级」
- `listPresetPrompts()`（R-A2）：从 bridge 的 `InlineEditSettingsSlice.presetPrompts`（用户层）调 `listEffectiveInlineEditPresets()` 合成「内置 + 用户自定义」有效列表；内置目录的 i18n 与合成规则属于 `InlineEditPresets`

## 依赖

- `../../core/agents/AgentCapability`、`../../core/agents/backend/AgentAuxQueryCapability`、`../../core/agents/backend/AgentServiceRegistry`、`../../core/types`（`InlineEditPresetPrompt` 类型）、`../../core/types/chat`
- `./InlineEditHost`、`./InlineEditPresets`

- 可选 `listContextFiles()`：透传插件的 vault 文本文件列表（`md`/`txt`，过滤掉路径含 `<`/`>` 的项，因为它们会与提示词的标签协议冲突），供附加上下文选择器使用

> 2026-09-18 (R-A5/R-A6/R-A7)：`InlineEditSettingsSlice` 增加 `maxConcurrentEdits` 与 `documentModeEnabled`；host 暴露 `getMaxConcurrentEdits` / `isDocumentModeEnabled` / `resolveContextFile`（桥接实现，vault 解析 + instanceof 校验）。

## 维护约束

- 显式配置但解析/校验失败必须返回 `{ ok: false, error }`，由 controller 提示并中止；不要静默改用默认模型
- 模型引用格式随 backend 变化，新增 backend 时同步 `parseModelOverride` 与 `normalizeTabModel`
- 该模块只做解析与装配，不持有状态、不发起请求
