# ModelConfigService

> **源码**: `src/core/config/ModelConfigService.ts`
> **状态**: [REVIEW]

## 概述

`ModelConfigService` 是“模型目录解析层”。它把三种信息拼到一起：

- vault 下 `.opencode` 配置里的 provider/model 定义
- OpenCode 服务端返回的实时模型目录
- 插件侧的可用性过滤条件，例如 `disabledModelRefs`

它不直接维护 UI，也不直接写整个配置文件，而是负责给上层返回一个既能表达“基础事实”，又能表达“当前可选状态”的模型 catalog bundle。

## 核心类型

```typescript
export interface ModelCatalogBundle {
  local: ModelCatalog;
  server: ModelCatalog;
  baseEffective: ModelCatalog;
  effective: ModelCatalog;
}
```

- `local`: 仅来自本地 `.opencode` 配置。
- `server`: 仅来自 OpenCode 服务端目录。
- `baseEffective`: 依 `modelSourceMode` 解析后的基础目录，不应用插件侧模型禁用过滤。
- `effective`: 在 `baseEffective` 之上再应用 provider/model 可用性过滤后的最终目录。

## 关键行为

### 读取和写回本地模型子集

`readLocalModelConfig()` 只摘取模型相关字段：

- `model`
- `small_model`
- `provider`
- `enabled_providers`
- `disabled_providers`

`writeLocalModelConfig()` 通过 `applyModelConfig()` 做局部更新，所以不会误伤 `permission`、`plugin`、`agent` 等其他配置段。

### 构建 catalog

- `getLocalCatalog()`：调用 `buildCatalogFromConfig(..., 'local')`
- `getServerCatalog()`：消费 `openCodeService.getAvailableModels()`，并补齐 `source`、`existsInLocal`、`existsInServer`

### 解析“基础目录”与“最终目录”

`getCatalogs(mode, disabledModelRefs = [])` 的核心逻辑是：

1. 并发读取本地模型子集和服务端目录
2. 生成 `local` 与 `server`
3. 按 `mode` 解析 `baseEffective`
4. 再对 `baseEffective` 应用 `filterCatalog(...)`，得到 `effective`

这一步是最近文档最容易过期的地方。现在服务显式区分：

- `baseEffective`: 用于保留完整 provider/model 元数据，即使某项当前不可选也仍可显示
- `effective`: 真正允许聊天发送、标题生成和设置默认值解析的过滤后目录

过滤条件包括：

- 本地配置里的 `enabled_providers` / `disabled_providers`
- 插件设置里的 `disabledModelRefs`

### 服务端可用性校验

`isModelAvailableOnServer()` 仍然只回答“服务端目录里是否存在这个 `provider/model`”，不考虑插件侧过滤，也不考虑当前 `modelSourceMode`。

## 关键方法

| 方法 | 说明 |
|------|------|
| `getConfigPath()` | 返回当前 vault 的 `.opencode` 配置路径 |
| `readLocalModelConfig()` | 读取模型相关配置子集 |
| `writeLocalModelConfig(subset)` | 局部更新模型配置子集 |
| `getLocalCatalog()` | 从本地配置构建 catalog |
| `getServerCatalog()` | 从 OpenCode 服务端构建 catalog |
| `getCatalogs(mode, disabledModelRefs?)` | 返回 `local/server/baseEffective/effective` 四套视图 |
| `isModelAvailableOnServer(provider, model)` | 校验服务端是否存在某模型 |
| `getLocalProviderIds()` | 从本地配置反推出启用 provider 列表 |

## 数据流

```text
OpencodeConfigManager.read()
  -> readLocalModelConfig()
  -> buildCatalogFromConfig()
  -> local

OpenCodeService.getAvailableModels()
  -> getServerCatalog()
  -> server

local + server + modelSourceMode
  -> resolveCatalog()
  -> baseEffective

baseEffective + disabledModelRefs + provider config
  -> filterCatalog()
  -> effective
```

## 与其他模块的交互

- `OpenCodianSettings.ts`：同时消费 `baseEffective` 和 `effective`，以便区分“存在但被禁用/不可用”和“完全不存在”。
- `OpenCodianView.ts`：使用 `effective` 约束聊天发送，但需要 `baseEffective` 保留展示元数据。
- `TitleGenerationService.ts`：解析 `aiTitleModel` 时会先在 `baseEffective/effective` 上做 availability-aware fallback。
- `ModelConfigModal.ts` / `ModelConfigJsonModal.ts`：通过它读写本地模型配置。

## 注意事项

- `mode === 'local'` 时也会读取服务端目录，因为返回 bundle 需要完整 `server` 视图。
- `effective` 不是“唯一真实目录”；`baseEffective` 同样重要，尤其是 UI 展示和降级判断。
- 这个服务不决定“选中哪个模型”，它只提供目录与过滤后的事实数据。
