# SettingsModelIconCacheManager

> **源码**: `src/features/settings/SettingsModelIconCacheManager.ts`
> **状态**: [REVIEW]

## 概述

`SettingsModelIconCacheManager` 是 settings/model 工具区里的 provider icon cache owner。它从 `SettingsModelSection.ts` 接管 icon cache overview、refresh/warm 操作、颜色模式/默认 variant 设置，以及 settings model cards 和 catalog presenter 共用的 provider icon rendering callback。

这个 owner 的职责边界是“**provider icon tools + existing fallback order host**”：

- 渲染 icon cache overview、查看缓存、刷新缓存和预热缓存控制
- 写回 provider icon color mode 与默认 Lobehub variant 设置
- 调用 `ProviderIconService` 持久化默认 entries、清理/预热 cache，并刷新 overview
- 为 model workspace cards 与 availability catalog 提供统一 `applyProviderIcon()` callback

## 核心逻辑

### icon cache 工具区

`attachTools()` 创建 icon cache 工具区的四类控制：当前缓存状态、查看缓存 modal、refresh/warm 按钮、颜色模式与默认 variant dropdown。refresh/warm 期间会禁用相关按钮，成功后刷新 provider cards 与 cache overview。

### icon rendering host

`applyProviderIcon()` 只调用 `ProviderIconService.resolveIconUrl()`，然后把解析结果渲染到目标 DOM。provider icon fallback order 仍完全由 `ProviderIconService` / `builtinIconRegistry` 管理，本模块不做 ad-hoc matching。

## 关键方法

| 方法 | 说明 |
|------|------|
| `attachTools()` | 挂载 provider icon cache 工具区 |
| `refreshProviderIconCache()` | 执行 refresh/warm 并保存 provider icon library |
| `refreshIconCacheOverview()` | 读取 cache summary 并更新工具区描述 |
| `applyProviderIcon()` | 复用 `ProviderIconService` 解析并渲染 provider icon |

## 与其他模块的交互

- `SettingsModelSection.ts`: 创建 manager，并提供 runtime getter 与 provider card rerender callback
- `SettingsModelCatalogCoordinator.ts`: 在 workspace cards 中通过 callback 使用 icon rendering，并在 catalog 刷新后请求 overview refresh
- `ProviderIconCacheModal.ts`: 提供 provider icon cache 管理 modal
- `ProviderIconService.ts`: 负责真正的 icon fallback、cache、custom source 与 builtin source 解析

## 注意事项

- 不要在本模块新增 provider/icon fallback 规则；必须继续集中在 `ProviderIconService` 与 `builtinIconRegistry`。
- 不要改变 refresh/warm 的 settings 保存参数或 provider id 来源；这会影响 model catalog 与 icon cache 的同步语义。
