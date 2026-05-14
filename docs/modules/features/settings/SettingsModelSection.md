# SettingsModelSection

> **源码**: `src/features/settings/SettingsModelSection.ts`
> **状态**: [REVIEW]

## 概述

`SettingsModelSection` 是 settings/model 分区的 section shell owner。它从 `OpenCodianSettings.ts` 接管模型 section 的入口 lifecycle：创建 common / config / availability / tools 四个 block、注册 settings tab refresh callback，并把 catalog refresh/workspace 与 provider icon cache 细节分别委托给相邻 owner。

这个 owner 的职责边界刻意保持在“**模型 section 装配 + callback bridge**”：

- 持有模型 section 级别的 DOM 组装与刷新闭包
- 创建 `SettingsModelCatalogCoordinator` 与 `SettingsModelIconCacheManager`
- 维护 settings tab 与模型 section 之间的 refresh/server-state callback bridge
- 把 provider/model availability 的展示状态继续交给 `SettingsModelCatalogPresenter`

## 核心逻辑

### section lifecycle 收束

`attach()` 会在一个 owner 内完成模型 section 的主要阶段：

- 创建 common / config / availability / tools 四个 block
- 装配默认聊天模型 picker、source mode 切换与手动 refresh 的入口控制；默认聊天模型是 OpenCodian 发请求时的默认值，不会自动写入 OpenCode 项目级 `model`
- 装配 OpenCode 顶层 `small_model` 的 Common-tab 入口，让轻量备用模型不再只藏在项目配置弹窗里；它与 OpenCodian 的备用标题模型设置保持独立
- 把 project provider workspace 卡片与 JSON 入口交给 `SettingsModelCatalogCoordinator`
- 把 availability catalog DOM host 交给 `SettingsModelCatalogPresenter`
- 把 provider icon cache 概览、刷新、预热与显示模式设置交给 `SettingsModelIconCacheManager`

这样 `OpenCodianSettings` 不再直接持有大段模型 section 的 DOM/state/catalog wiring，只保留 owner 创建、跨 section callback 注册和 server-state 桥接。

### refresh orchestration

模型 section 的刷新链路现在由 `SettingsModelCatalogCoordinator` 集中处理：

- `refreshModelSettings()` 统一拉取 `ModelCatalogState`
- 同步 `defaultProvider` / `defaultModel` 与当前 `effective` catalog
- 刷新 common summary、workspace 卡片、availability host 和标题模型回调
- 在需要时触发 `plugin.saveSettings({ reloadModels: true, applyUi: true })`

这让 source mode 切换、provider/model availability bulk toggle、workspace 保存和手动 refresh 都复用同一条刷新主链，而不是各自在 `OpenCodianSettings` 里散落闭包。

## 关键方法

| 方法 | 说明 |
|------|------|
| `attach()` | 构建并挂载模型 section，注册 refresh callback，并启动首次 catalog/icon cache 刷新 |
| `dispose()` | 清理对 settings tab 的模型 refresh / catalog status callback 占位 |

## 与其他模块的交互

- `OpenCodianSettings.ts`: 创建并复用 owner，向其提供 section heading/block seam、inline-code 渲染、server-state 桥接，以及 refresh callback 注册位
- `ModelCatalogStateService.ts`: 提供 scoped catalog state 和 provider/model availability 写回逻辑
- `SettingsModelCatalogCoordinator.ts`: 管理 catalog refresh、workspace cards、default model picker、source mode 与 availability 写回
- `SettingsModelCatalogCoordinator.ts`: 同时负责 Common-tab `small_model` picker 的本地 `.opencode` 写回
- `SettingsModelCatalogPresenter.ts`: 管理 availability catalog 的 provider accordion、搜索、bulk toggle 与 probe presentation
- `SettingsModelIconCacheManager.ts`: 管理 provider icon cache 工具区、overview 刷新与 provider icon rendering callback

## 注意事项

- 不要把 provider/model accordion、probe badge/detail 或 catalog filter 逻辑重新塞回这里；那仍属于 `SettingsModelCatalogPresenter`。
- 不要改变 model availability layering、`disabledModelRefs` 过滤、provider icon fallback 或 title-generation fallback 语义。
- 默认聊天模型文案必须继续说明它只是 OpenCodian 请求默认；修改 `.opencode/opencode.json` 的项目 `model` 应走 Provider & Model Config / 项目配置编辑入口。
- OpenCode `small_model` 文案必须避免暗示它等同于 OpenCodian 备用标题模型。
- 如果后续继续推进 settings/model lane，优先扩展 `SettingsModelCatalogCoordinator` 或 `SettingsModelIconCacheManager` 这类相邻 owner，而不是回到 `OpenCodianSettings` 主类或 `SettingsModelSection` shell 里追加大段闭包。

## 2026-04-24 Tabbed layout support

Added `attachTabbed(containerEl, secondaryTabId)` method for the tabbed settings layout. It routes content by secondary tab:

- `common` — renders default model picker + source mode + refresh
- `common` — renders default model picker + OpenCode `small_model` picker + source mode + refresh
- `project-config` — renders provider workspace cards
- `availability` — renders provider/model catalog with accordion/search/toggle
- `tools` — renders provider icon cache tools

The classic `attach()` method remains unchanged.
