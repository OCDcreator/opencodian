# Builtin Icon Registry

> **源码**: `src/utils/icons/builtinIconRegistry.ts`
> **状态**: [REVIEW]

## 概述

`builtinIconRegistry.ts` 统一管理 OpenCodian 内置 provider 图标的 registry、搜索、source 编解码和 provider id 自动匹配。它把 LobeHub 图标清单与 OpenCode 内置图标 id 合并为统一的 `BuiltinIconDefinition` 列表。

## 导入关系

```text
上游: src/core/types, src/utils/icons/lobehubIconManifest
下游: ProviderIconService, providerIconEntryResolution, providerIconBuiltinSelection, providerIconAssetCache, utils/icons/index.ts, 相关单元测试
```

## 核心类型 / 接口

| 导出 | 说明 |
|------|------|
| `BuiltinIconLibraryId` | 内置库类型：`lobehub` 或 `opencode` |
| `BuiltinIconDefinition` | 统一图标定义，含别名、tokens、searchText 和可选 LobeHub metadata |
| `PROVIDER_ICON_MAP` | provider/model 关键词到 LobeHub icon id 的映射 |
| `OPENCODE_ICON_ALIAS_MAP` | OpenCode 图标别名到规范 icon id 的映射 |
| `formatBuiltinSource()` / `parseBuiltinSource()` | `library:id` source 格式的编解码 |
| `findBuiltinIcon()` / `getBuiltinIcon()` | 通过 source 或 library/id 查找定义 |
| `listBuiltinIcons()` / `searchBuiltinIcons()` | 列出或搜索内置图标 |
| `resolveBuiltinIconMatch()` | 根据 provider id 推荐最匹配的内置图标 |

## 核心逻辑

### Registry 构建

模块从 `LOBEHUB_ICON_MANIFEST` 生成 LobeHub 图标定义，再结合 OpenCode 内置 icon id 列表生成 `BuiltinIconDefinition`。每个定义都预计算 aliases、tokens、searchText 和 source。

### 搜索与匹配

`searchBuiltinIcons()` 对 query 做规范化后计算匹配分数，再按分数和显示名排序。`resolveBuiltinIconMatch()` 先查 OpenCode alias map，未命中时退回到 builtin 搜索的首个结果。

### Source 格式

builtin source 固定为 `lobehub:<iconId>` 或 `opencode:<iconId>`。`parseBuiltinSource()` 会拒绝未知 library 或空 icon id。

## 数据流

```text
LobeHub manifest + OpenCode icon ids
  → BuiltinIconDefinition[]
  → settings icon picker / provider icon resolution
  → ProviderIconService 缓存或渲染具体图标
```

## 与其他模块的交互

- `utils/icons/index.ts` 通过 barrel 暴露部分 registry API。
- `providerIconEntryResolution.ts` 和 `providerIconBuiltinSelection.ts` 用它解析 provider icon fallback。
- `providerIconAssetCache.ts` 用 `parseBuiltinSource()` 识别缓存来源。

## 配置项

无用户配置项；映射表和 OpenCode icon id 是源码常量。

## 注意事项

- 新增 provider alias 时优先补 `PROVIDER_ICON_MAP` 或 `OPENCODE_ICON_ALIAS_MAP`，不要在调用方写临时匹配。
- LobeHub 元数据来自 `lobehubIconManifest.ts`，应通过同步脚本更新，不要手改生成文件。
