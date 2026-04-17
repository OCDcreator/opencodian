# Provider Icon Service

> **源码**: `src/utils/icons/ProviderIconService.ts`
> **状态**: [REVIEW]

## 概述

AI 模型提供商图标服务的公开入口。`M4` 后，`ProviderIconService.ts` 不再自己承载近 2k 行的 entry 解析、builtin 选择、custom source 与 cache runtime 细节，而是退回为薄 orchestration shell，继续对设置页、聊天视图与缓存管理 UI 暴露稳定静态 API。

当前 provider icon 责任拆分为四个 coarse owner：

- `providerIconEntryResolution.ts`：provider-id 解析、default entry、library canonical key 与 entry 更新/删除
- `providerIconBuiltinSelection.ts`：builtin picker、manifest-driven preview/variant、LobeHub candidate 选择
- `providerIconCustomSources.ts`：自定义 URL/文件归一化、批量输入拆分、MIME 检测与首次缓存写入
- `providerIconAssetCache.ts`：asset candidate runtime、vault cache、warm/clear、provider cache summary

## 导入关系
上游: `fs`, `path`, `obsidian` (App, normalizePath, requestUrl), `../../core/types` (ProviderIconEntry, ProviderIconLibrary), `../../shared` (createLogger)
下游: `OpenCodianView` (图标显示), `OpenCodianSettings` / `ProviderIconCacheModal` (缓存管理)

## 核心类型 / 接口

### ProviderIconCacheEntry
单个图标缓存条目的视图模型：`providerId`, `entry`, `iconId`, `cached`, `cachePath`, `iconUrl`, `isCurrentProvider`, `isSelected`, `requestedVariant`, `resolvedVariant`, `resolvedFormat`, `fallbackUsed`, `sourceLabel`。

### ProviderIconProviderState
按 provider 分组的缓存状态：`providerId`, `isCurrentProvider`, `entries[]`。

### ProviderIconCacheSummary
缓存摘要统计：`currentProviders`, `totalProviders`, `cachedProviders`, `totalIcons`, `cachedIcons`。

## 核心逻辑

### 公开入口

- `getIconUrl()` / `createIconElement()`：继续为简单 UI 预览提供 mapped LobeHub preview URL
- `resolveIconUrl()` / `getProviderCacheState()` / `warmProviderIcons()` / `clearCache()`：直接转发到 `providerIconAssetCache.ts`
- `listBuiltinIconOptions()` / `selectBuiltinIcon()` / `getSelectedBuiltinVariant()`：直接转发到 `providerIconBuiltinSelection.ts`
- `addCustomIconSource()` / `splitCustomIconSourcesInput()`：组合 `providerIconEntryResolution.ts`、`providerIconCustomSources.ts` 与 cache writer 完成写回

### Orchestration 边界

- `ProviderIconService` 保留现有静态 API，避免上层调用点大面积改名
- 需要跨 owner 协调时，只在这里组装最小依赖：例如 `addCustomIconSource()` 会先拿 resolution，再调用 custom cache bootstrap，最后写回 library
- 其余 preview/runtime/persistence 细节不再回流到 `ProviderIconService.ts`

## 关键方法

| 方法 | 说明 |
|------|------|
| `getIconUrl(providerId)` | 获取 mapped LobeHub preview URL |
| `resolveIconUrl(app, providerId, library, options)` | 委托 asset/cache runtime 解析图标 |
| `listBuiltinIconOptions(app, providerId, library, options?)` | 委托 builtin bundle 生成选择列表 |
| `addCustomIconSource(app, providerId, source, library)` | 组合 resolution + custom cache bootstrap + library 写回 |
| `getProviderCacheState(app, providerIds, library)` | 委托 cache bundle 构建缓存状态 |
| `clearCache(app)` / `warmProviderIcons(app, providerIds, library)` | 委托 cache bundle 管理缓存生命周期 |

## 数据流

```text
ProviderIconService.resolveIconUrl()
  → providerIconAssetCache.resolveProviderIconUrl()
    → providerIconEntryResolution.resolveProviderEntryResolution()
    → providerIconBuiltinSelection / providerIconCustomSources 提供 asset candidates
    → cache runtime 读取 / 加载 / 写回

ProviderIconService.addCustomIconSource()
  → providerIconEntryResolution.resolveProviderEntryResolution()
  → providerIconCustomSources.normalizeCustomSource()
  → providerIconCustomSources.createCachedCustomEntry()
  → providerIconEntryResolution 风格的 library write-back
```

## 与其他模块的交互

- **OpenCodianView**：继续只依赖 `resolveIconUrl()` 获取展示 URL
- **ProviderIconCacheModal**：继续通过服务获取 cache state，并触发 builtin/custom/library 更新
- **ProviderBuiltinIconPickerModal**：通过服务访问 builtin option/selection API，但实现已落到 `providerIconBuiltinSelection.ts`
- **StorageService / settings**：仍只感知 `ProviderIconLibrary` 数据，不感知新的内部 coarse modules

## 配置项

| 常量 | 值 | 说明 |
|------|-----|------|
| `ICON_CACHE_DIR` | `.opencodian/provider-icons` | cache runtime 与 custom bootstrap 共用目录 |

## 注意事项

- 所有对外方法仍保持静态 API，不需要上层改为实例化调用
- 需要改 provider icon 行为时，优先落到四个 coarse module owner，而不是把实现重新塞回 `ProviderIconService.ts`
- fallback 顺序仍然保持：mapped/LobeHub 或 builtin 预览 → custom / cache runtime → 上层 `<img>` 显示
