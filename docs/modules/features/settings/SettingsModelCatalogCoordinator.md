# SettingsModelCatalogCoordinator

> **源码**: `src/features/settings/SettingsModelCatalogCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`SettingsModelCatalogCoordinator` 是 settings/model 分区的 catalog refresh 与 workspace 卡片 owner。它从 `SettingsModelSection.ts` 接管模型目录刷新、默认模型按钮、project provider workspace 卡片、provider/model availability 写回和手动 refresh lifecycle。

这个 owner 的职责边界是“**catalog state orchestration + workspace entry rendering**”：

- 读取 `ModelCatalogStateService` 并同步 local/server/baseEffective/effective catalog state
- 渲染当前 project provider workspace 卡片与 JSON/workspace 编辑入口
- 处理默认聊天模型 picker、source mode 切换、手动 refresh 和 availability bulk toggle 写回
- 在 catalog 变化后协调 title model refresh 与 provider icon cache overview refresh

## 核心逻辑

### catalog refresh 主链

`refreshModelSettings()` 统一执行 model section 的刷新主链：

- 拉取当前 `ModelCatalogState`
- 同步 `defaultProvider` / `defaultModel` 与 `effective` catalog
- 生成 model picker groups
- 刷新 common summary、workspace cards、availability host 和 title model callback
- 在 dirty 或强制刷新时触发 `saveSettings({ reloadModels: true, applyUi: true })`

### workspace 与 availability 写回

workspace 保存、source mode 变化、provider/model availability toggle 和手动 refresh 都复用同一条 catalog refresh 主链。provider icon 解析仍通过 `SettingsModelIconCacheManager` 注入的 `applyProviderIcon` callback 完成，避免在 catalog coordinator 里重新实现 icon fallback 顺序。

## 关键方法

| 方法 | 说明 |
|------|------|
| `refreshModelSettings()` | 刷新 catalog state、workspace cards、availability host 与默认模型按钮 |
| `renderConfigCards()` | 渲染当前 project provider workspace 卡片与 JSON 入口 |
| `applyProviderAvailabilityChange()` | 将 provider bulk toggle 写回 model config 并触发刷新 |
| `applyModelAvailabilityChange()` | 将 model bulk toggle 写回 `disabledModelRefs` 并触发刷新 |
| `handleManualModelRefresh()` | 检查 server health 后执行带 Notice/debug snapshot 的手动刷新 |

## 与其他模块的交互

- `SettingsModelSection.ts`: 创建 coordinator，并向它提供 runtime getter、server-state bridge 与 callback seam
- `SettingsModelCatalogPresenter.ts`: 负责 provider accordion/search/probe 的 presentation state；coordinator 只提供 semantic writeback callback
- `SettingsModelIconCacheManager.ts`: 提供 provider icon rendering 与 icon cache overview refresh
- `ModelConfigModal.ts` / `ModelConfigJsonModal.ts`: 提供 workspace 与 JSON 编辑入口
- `ModelPickerModal.ts`: 提供默认聊天模型 picker

## 注意事项

- 不要在这里修改 provider/model disable layering、server catalog merge 或 project-local override 语义；这些仍属于 `ModelCatalogStateService` / config 层。
- 不要把 provider accordion、probe badge/detail 或搜索过滤状态放进 coordinator；那仍属于 `SettingsModelCatalogPresenter`。
