# Builtin Icon Registry

> **源码**: `src/utils/icons/builtinIconRegistry.ts`
> **状态**: [REVIEW]

## 概述

`builtinIconRegistry.ts` 统一管理 OpenCodian 内置 provider 图标的 registry、搜索、source 编解码和 provider id 自动匹配。它把 LobeHub 图标清单、OpenCode 内置图标 id，以及 models.dev provider id 三套数据合并为统一的 `BuiltinIconDefinition` 列表。

## 导入关系

```text
上游: src/core/types, src/utils/icons/lobehubIconManifest, src/utils/icons/modelsDevIconManifest
下游: ProviderIconService, providerIconEntryResolution, providerIconBuiltinSelection, providerIconAssetCache, utils/icons/index.ts, 相关单元测试
```

## 核心类型 / 接口

| 导出 | 说明 |
|------|------|
| `BuiltinIconLibraryId` | 内置库类型：`lobehub`、`opencode` 或 `modelsdev` |
| `BuiltinIconDefinition` | 统一图标定义，含别名、tokens、identityTokens、searchText 和可选 LobeHub metadata |
| `MODELS_DEV_LOGO_BASE_URL` / `getModelsDevLogoUrl()` | models.dev logo 的 URL 规则 |
| `PROVIDER_ICON_MAP` | provider/model 关键词到 LobeHub icon id 的映射 |
| `OPENCODE_ICON_ALIAS_MAP` | OpenCode 图标别名到规范 icon id 的映射 |
| `formatBuiltinSource()` / `parseBuiltinSource()` | `library:id` source 格式的编解码 |
| `findBuiltinIcon()` / `getBuiltinIcon()` | 通过 source 或 library/id 查找定义 |
| `listBuiltinIcons()` / `searchBuiltinIcons()` | 列出或搜索内置图标 |
| `resolveBuiltinIconMatch()` | 根据 provider id 推荐最匹配的内置图标（含碰撞/模糊匹配） |

## 核心逻辑

### Registry 构建

模块从 `LOBEHUB_ICON_MANIFEST` 生成 LobeHub 图标定义，结合 OpenCode 内置 icon id 列表，再用 `MODELS_DEV_PROVIDER_ICONS` 生成 models.dev 定义。每个定义都预计算 aliases、tokens、searchText 和 source。

`identityTokens` 只取 iconId 与人工别名，专供碰撞匹配；展示名、docs URL 等描述性文本只进入 `tokens`，避免 `FastGPT` 这类名字把通用词 `gpt` 变成品牌证据。

### 搜索与匹配

`searchBuiltinIcons()` 对 query 做规范化后计算匹配分数，再按分数和显示名排序。它默认**不收录 models.dev 定义**（需显式 `includeModelsDev`），因为这些 id 又长又含通用词，参与子串搜索会误命中 `provider`、`gateway` 之类的普通单词。

`resolveBuiltinIconMatch()` 分三阶段：

1. 直接匹配：OpenCode 本地别名 → `searchBuiltinIcons`（LobeHub 优先，其次本地）→ models.dev 精确 id
2. 后缀剥离重试：逐个剥掉 `-coding-plan`、`-cn`、`-gateway` 一类计划/区域/部署后缀后重跑第 1 步
3. 碰撞匹配：用 `identityTokens` 做最长品牌 token 重合，没有证据就返回 null

碰撞匹配是最后手段，只服务于任何图标库都没有的第三方网关 id（例如 `krill-gpt` → `openai`）。

### Source 格式

builtin source 固定为 `lobehub:<iconId>`、`opencode:<iconId>` 或 `modelsdev:<providerId>`。`parseBuiltinSource()` 会拒绝未知 library 或空 icon id。

## 数据流

```text
LobeHub manifest + OpenCode icon ids + models.dev provider ids
  → BuiltinIconDefinition[]
  → settings icon picker / provider icon resolution
  → ProviderIconService 缓存或渲染具体图标
```

## 与其他模块的交互

- `utils/icons/index.ts` 通过 barrel 暴露部分 registry API。
- `providerIconEntryResolution.ts` 和 `providerIconBuiltinSelection.ts` 用它解析 provider icon fallback。
- `providerIconAssetCache.ts` 用 `parseBuiltinSource()` 识别缓存来源；models.dev source 走远程下载。

## 配置项

无用户配置项；映射表和 icon id 是源码常量或生成数据。

## 注意事项

- 新增 provider alias 时优先补 `PROVIDER_ICON_MAP` 或 `OPENCODE_ICON_ALIAS_MAP`，不要在调用方写临时匹配。
- LobeHub 元数据来自 `lobehubIconManifest.ts`，models.dev 词汇表来自 `modelsDevIconManifest.ts`，两者都应通过同步脚本更新，不要手改生成文件。
- 调整碰撞匹配的通用词表或最小 token 长度时，要同步跑 `providerIconResolutionStages` 测试里的正反例。
