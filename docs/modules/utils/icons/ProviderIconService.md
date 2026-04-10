# Provider Icon Service

> **源码**: `src/utils/icons/ProviderIconService.ts`
> **状态**: [REVIEW]

## 概述

AI 模型提供商图标管理服务。使用 LobeHub Icons CDN（`@lobehub/icons-static-svg`）与插件内置的 OpenCode provider 图标作为内置来源，同时保留自定义图标源。提供图标 URL 解析、本地缓存、自定义图标上传、内置图标选择和批量预热功能。所有静态方法设计为无状态工具类；图标最终显示颜色由全局 `providerIconColorMode` + CSS 变量 `--lobehub-icon-filter` 决定。

## 导入关系
上游: `fs`, `path`, `obsidian` (App, normalizePath, requestUrl), `../../core/types` (ProviderIconEntry, ProviderIconLibrary), `../../shared` (createLogger)
下游: `OpenCodianView` (图标显示), `OpenCodianSettings` / `ProviderIconCacheModal` (缓存管理)

## 核心类型 / 接口

### ProviderIconCacheEntry
单个图标缓存条目的视图模型：`providerId`, `entry`, `iconId`, `cached`, `cachePath`, `iconUrl`, `isCurrentProvider`, `isSelected`, `sourceLabel`。

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

### 图标加载管线

1. **resolveIconUrl()** — 入口，委托给 `resolveEntryUrl()`
2. **resolveEntryUrl()** — 检查内存缓存 → 检查失败记录 → 去重 in-flight 请求 → 发起加载
3. **loadEntryUrl()** — 先尝试本地缓存文件 → 不存在则按条目类型加载（LobeHub CDN / OpenCode 内置资源 / 自定义源）→ 写入缓存 → 返回 data URL

### 自定义图标

`addCustomIconSource()` 支持 URL 和本地文件路径，流程：
1. 归一化输入（`normalizeCustomSource`）
2. 加载资源（远程通过 `requestUrl`，本地通过 `fs.readFile`）
3. 检测 MIME 类型（文件头魔数 + Content-Type + 扩展名）
4. 写入缓存目录（`.opencodian/provider-icons/`）
5. 添加到 library

### 内置图标选择

- `listBuiltinIconOptions()`：为单个 provider 生成可浏览的内置图标数据
- `selectBuiltinIcon()`：将选中的内置图标置顶并去重
- `getSelectedBuiltinSource()`：把当前 effective 条目归一成 `libraryId:iconId`

### 缓存管理

- 缓存目录：`.opencodian/provider-icons/`
- 文件名格式：`{provider}-{timestamp}-{random}.{ext}`
- 最大文件大小：1 MB
- 支持格式：SVG, PNG, JPEG, WEBP, GIF
- `clearCache()` 清空缓存目录和内存映射

## 关键方法

| 方法 | 说明 |
|------|------|
| `getIconUrl(providerId)` | 获取 CDN URL（仅 mapped 类型） |
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
- **OpenCodianSettings**: 调用 `getProviderCacheState()` 在图标缓存设置面板显示状态，并负责切换全局 provider 图标颜色模式
- **ProviderIconCacheModal**: 调用 `selectBuiltinIcon()`, `addCustomIconSource()`, `removeProviderEntry()`, `clearCache()` 管理图标
- **ProviderBuiltinIconPickerModal**: 调用 `listBuiltinIconOptions()` 浏览内置图标库，并在颜色模式切换时复用相同的 preview URL
- **StorageService**: 持久化 `ProviderIconLibrary` 到 settings

## 配置项

| 常量 | 值 | 说明 |
|------|-----|------|
| `LOBEHUB_CDN_BASE` | `https://unpkg.com/@lobehub/icons-static-svg@latest/icons` | CDN 基础 URL |
| `ICON_CACHE_DIR` | `.opencodian/provider-icons` | 缓存目录（vault 相对路径） |
| `MAX_ICON_BYTES` | 1048576 | 最大图标文件大小 |

## 注意事项

- 所有方法为静态方法，不需要实例化
- 内存缓存（`resolvedIconUrls`, `inFlightIconLoads`, `failedIconIds`）为模块级状态
- `requestUrl` 使用 Obsidian API，不走系统代理
- MIME 检测优先级：Content-Type header → 文件头魔数 → 扩展名
- `PROVIDER_ICON_MAP` 仍是旧映射稳定层；OpenCode 图标则通过 registry + alias + 搜索接入
