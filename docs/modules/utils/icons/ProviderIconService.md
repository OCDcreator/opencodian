# Provider Icon Service

> **源码**: `src/utils/icons/ProviderIconService.ts`
> **状态**: [REVIEW]

## 概述

AI 模型提供商图标管理服务。运行时继续使用原生 `<img>`，但 LobeHub 图标的可用 variant/静态资源 URL 不再靠文件名猜测，而是读取构建期生成的 `lobehubIconManifest.ts`。服务统一管理 LobeHub CDN、插件内置 OpenCode provider 图标，以及自定义 URL/文件图标，并把解析结果缓存到本地。

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

### 图标 ID 解析

`getIconId()` 使用 5 级策略解析 provider ID 到稳定的 LobeHub icon ID：
1. 直接小写匹配
2. 移除特殊字符后匹配
3. 提取英文部分逐个/组合匹配
4. 部分包含匹配（providerId 包含 key）
5. 反向部分包含匹配（key 包含 providerId）

### 默认图标决策

`getDefaultEntry()` 的优先级为：
1. 现有 `PROVIDER_ICON_MAP` 命中的 `mapped`
2. `OpenCode` alias 命中的 `builtin`
3. 双图库搜索命中的首个 `builtin`（同分优先 `LobeHub`）

### Manifest 驱动 variant 决策

- 构建期脚本 `sync:lobehub-icons` 会把 `@lobehub/icons` 的 `toc` 与 CDN 规则固化成 `lobehubIconManifest.ts`
- 运行时先看 provider entry 的显式 `variant`
- 若条目是 `auto`，再读全局 `providerIconDefaultVariant`
- 如果全局仍是 `auto`，才按 `providerIconColorMode` 推导候选顺序
- 所有候选最终都会回到 `mono` 兜底；`combine` 目前只保留能力信息，不假设存在静态资源

### 图标加载管线

1. **resolveIconUrl()** — 入口，委托给 `resolveEntryUrl()`
2. **resolveEntryUrl()** — 检查内存缓存 → 检查失败记录 → 去重 in-flight 请求 → 发起加载
3. **loadEntryUrl()** — 先尝试本地缓存文件 → 不存在则按条目类型加载（manifest 驱动的 LobeHub CDN / OpenCode 内置资源 / 自定义源）→ 写入缓存 → 返回 data URL

### 自定义图标

`addCustomIconSource()` 支持 URL 和本地文件路径，流程：
1. 归一化输入（`normalizeCustomSource`）
2. 加载资源（远程通过 `requestUrl`，本地通过 `fs.readFile`）
3. 检测 MIME 类型（文件头魔数 + Content-Type + 扩展名）
4. 写入缓存目录（`.opencodian/provider-icons/`）
5. 添加到 library

### 内置图标选择

- `listBuiltinIconOptions()`：为单个 provider 生成可浏览的内置图标数据，并给出 `requestedVariant / resolvedVariant / resolvedFormat`
- `selectBuiltinIcon()`：将选中的内置图标置顶并去重；LobeHub 条目会同时持久化显式 `variant`
- `getSelectedBuiltinSource()`：把当前 effective 条目归一成 `libraryId:iconId`

### 缓存管理

- 缓存目录：`.opencodian/provider-icons/`
- LobeHub 缓存 key 包含 `iconId + requestedVariant + resolvedVariant + theme + format`
- 自定义文件名仍是 `{provider}-{timestamp}-{random}.{ext}`
- 最大文件大小：1 MB
- 支持格式：SVG, PNG, JPEG, WEBP, GIF
- `clearCache()` 清空缓存目录和内存映射

## 关键方法

| 方法 | 说明 |
|------|------|
| `getIconUrl(providerId)` | 获取预览 URL（优先 manifest 首选候选） |
| `resolveIconUrl(app, providerId, library, options)` | 解析图标 URL（含缓存和远程加载） |
| `getIconId(providerId)` | 5 级策略匹配 provider ID |
| `hasIcon(providerId)` | 检查是否有图标映射 |
| `createIconElement(providerId, size)` | 创建 `<img>` 元素 |
| `getProviderCacheState(app, providerIds, library)` | 构建完整缓存状态 |
| `listBuiltinIconOptions(app, providerId, library, options?)` | 生成内置图标选择列表 |
| `selectBuiltinIcon(providerId, libraryId, iconId, library)` | 选择并置顶某个内置图标 |
| `addCustomIconSource(app, providerId, source, library)` | 添加自定义图标 |
| `updateProviderEntries(providerId, entries, library)` | 更新 provider 的图标条目 |
| `removeProviderEntry(providerId, entryId, library)` | 删除单个图标条目 |
| `splitCustomIconSourcesInput(sourceInput)` | 解析多行/多来源图标输入为独立来源字符串 |
| `clearCache(app)` | 清空所有缓存 |
| `warmProviderIcons(app, providerIds, library)` | 批量预热图标缓存 |
| `persistDefaultEntries(providerIds, library)` | 将默认映射持久化到 library |

## 数据流

```
getProviderCacheState(app, currentProviderIds, library)
  → mergeProviderIds() → 合并当前和历史 provider
  → 对每个 provider:
    → getEffectiveEntries() → library entries + default entry
    → readCachedAsset() → 检查本地缓存
    → 构建 ProviderIconCacheEntry[]

resolveIconUrl(app, providerId, library)
  → getEffectiveEntries() → 取第一个 entry
  → resolveEntryUrl()
    → 内存缓存命中? → 返回
    → readCachedAsset() → 本地文件缓存命中? → 返回 data URL
    → loadMappedAsset() / loadBuiltinAsset() / loadCustomSourceAsset()
    → writeCachedAsset() → 返回 data URL
```

## 与其他模块的交互

- **OpenCodianView**: 调用 `resolveIconUrl()` 在模型选择器和消息头部显示 provider 图标
- **OpenCodianSettings**: 负责写回 `providerIconColorMode` 与 `providerIconDefaultVariant`
- **ProviderIconCacheModal**: 展示命中的 `variant / format / fallback`，并调用 `selectBuiltinIcon()`, `addCustomIconSource()`, `removeProviderEntry()`, `clearCache()`
- **ProviderBuiltinIconPickerModal**: 调用 `listBuiltinIconOptions()` 浏览内置图标库，并把显式 `variant` 一起传回上层
- **StorageService**: 持久化 `ProviderIconLibrary` 到 settings

## 配置项

| 常量 | 值 | 说明 |
|------|-----|------|
| `ICON_CACHE_DIR` | `.opencodian/provider-icons` | 缓存目录（vault 相对路径） |
| `MAX_ICON_BYTES` | 1048576 | 最大图标文件大小 |

## 注意事项

- 所有方法为静态方法，不需要实例化
- 内存缓存（`resolvedIconUrls`, `inFlightIconLoads`, `failedIconIds`）为模块级状态
- `requestUrl` 使用 Obsidian API，不走系统代理
- MIME 检测优先级：Content-Type header → 文件头魔数 → 扩展名
- `PROVIDER_ICON_MAP` 仍是旧映射稳定层；OpenCode 图标则通过 registry + alias + 搜索接入
- `providerIconColorMode` 仍会通过 CSS filter 影响最终显示，但资源选择本身已优先使用更合适的静态 variant
