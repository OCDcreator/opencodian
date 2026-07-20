# SettingsModelCatalogCoordinator

> **源码**: `src/features/settings/SettingsModelCatalogCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`SettingsModelCatalogCoordinator` 是 settings/model 分区的 catalog refresh 与 workspace 卡片 owner。它从 `SettingsModelSection.ts` 接管模型目录刷新、默认模型按钮、OpenCode lightweight fallback 按钮、project provider workspace 卡片、provider/model availability 写回和手动 refresh lifecycle。

这个 owner 的职责边界是“**catalog state orchestration + workspace entry rendering**”：

- 读取 `ModelCatalogStateService` 并同步 local/server/baseEffective/effective catalog state
- 渲染当前 project provider workspace 卡片与 JSON/workspace 编辑入口
- 处理默认聊天模型 picker、OpenCode `small_model` picker、source mode 切换、手动 refresh 和 availability bulk toggle 写回
- 在 catalog 变化后协调 title model refresh 与 provider icon cache overview refresh

## 核心逻辑

### catalog refresh 主链

`refreshModelSettings()` 统一执行 model section 的刷新主链：

- 拉取当前 `ModelCatalogState`
- 同步 `defaultProvider` / `defaultModel` 与 `effective` catalog
- 生成 model picker groups
- 刷新 common summary、V2 catalog comparison 状态行、默认模型按钮、`small_model` 按钮、workspace cards、availability host 和 title model callback
- 在 dirty 或强制刷新时触发 `saveSettings({ reloadModels: true, applyUi: true })`

### Common 模型 picker

`openDefaultModelPicker()` 写回插件设置里的 `defaultProvider` / `defaultModel`，用于 OpenCodian 默认聊天模型。`openSmallModelPicker()` 写回 local `.opencode` model config 的顶层 `small_model` 字段，用于 OpenCode lightweight fallback；它通过 `ModelConfigService.readLocalModelConfig()` / `writeLocalModelConfig()` 保留其他 provider/model 配置，并在保存后刷新 catalog 与 icon overview。

### workspace 与 availability 写回

workspace 保存、source mode 变化、provider/model availability toggle 和手动 refresh 都复用同一条 catalog refresh 主链。provider icon 解析仍通过 `SettingsModelIconCacheManager` 注入的 `applyProviderIcon` callback 完成，避免在 catalog coordinator 里重新实现 icon fallback 顺序。

当 comparison 为 drift 时，普通 UI 只渲染差异数量，完整 legacy-only / V2-only provider/model 引用写入结构化 debug 日志；unavailable 使用中性诊断样式，不标记 provider 故障。

## 关键方法

| 方法 | 说明 |
|------|------|
| `refreshModelSettings()` | 刷新 catalog state、workspace cards、availability host 与默认模型按钮 |
| `renderConfigCards()` | 渲染当前 project provider workspace 卡片与 JSON 入口 |
| `updateSmallModelButton()` | 根据 local `.opencode` `small_model` 更新 Common tab lightweight fallback 按钮 |
| `openSmallModelPicker()` | 打开 `small_model` 选择器并写回 local `.opencode` model config |
| `applyProviderAvailabilityChange()` | 将 provider bulk toggle 写回 model config 并触发刷新 |
| `applyModelAvailabilityChange()` | 将 model bulk toggle 写回 `disabledModelRefs` 并触发刷新 |
| `handleManualModelRefresh()` | 检查 server health 后执行带 Notice/debug snapshot 的手动刷新 |

## 与其他模块的交互

- `SettingsModelSection.ts`: 创建 coordinator，并向它提供 runtime getter、server-state bridge 与 callback seam
- `SettingsModelCatalogPresenter.ts`: 负责 provider accordion/search/probe 的 presentation state；coordinator 只提供 semantic writeback callback
- `SettingsModelIconCacheManager.ts`: 提供 provider icon rendering 与 icon cache overview refresh
- `ModelConfigModal.ts` / `ModelConfigJsonModal.ts`: 提供 workspace 与 JSON 编辑入口
- `ModelPickerModal.ts`: 提供默认聊天模型与 OpenCode `small_model` picker

## 注意事项

- 不要在这里修改 provider/model disable layering、server catalog merge 或 project-local override 语义；这些仍属于 `ModelCatalogStateService` / config 层。
- 不要把 provider accordion、probe badge/detail 或搜索过滤状态放进 coordinator；那仍属于 `SettingsModelCatalogPresenter`。
- `small_model` 是 OpenCode 顶层配置字段，不是插件 `settings.defaultModel` 的别名；保存时必须走 local model config write path，避免把 fallback 模型误写进 OpenCodian 默认聊天模型设置。
