# ModelConfigService

> **源码**: `src/core/config/ModelConfigService.ts`
> **状态**: [REVIEW]

## 概述

`ModelConfigService` 把项目级 OpenCode 配置里的模型字段，与 OpenCode 服务端返回的模型目录整合成统一的 catalog 视图。它本身不直接解析 JSON 或发起底层文件写入，而是分别委托：

- `OpencodeConfigManager` 读写项目配置文件
- `OpenCodeService` 拉取服务端 provider/model 目录
- `modelConfig.ts` 负责 catalog 构建、合并和模型引用解析

源码里的配置文件路径来自 `OpencodeConfigManager`，实际是当前 vault 下的 `.opencode/opencode.json`。

## 导入关系

```text
上游: src/core/config/OpencodeConfigManager.ts, src/core/opencode/index.ts, src/core/config/modelConfig.ts, src/core/types/index.ts
下游: src/main.ts, src/features/settings/OpenCodianSettings.ts, src/features/settings/ModelConfigModal.ts, src/features/settings/ModelConfigJsonModal.ts, src/features/chat/OpenCodianView.ts
```

## 核心类型 / 接口

```typescript
export interface ModelCatalogBundle {
  local: ModelCatalog;
  server: ModelCatalog;
  effective: ModelCatalog;
}

class ModelConfigService {
  getConfigPath(): string;
  readLocalModelConfig(): Promise<OpencodeModelConfigSubset>;
  writeLocalModelConfig(subset: OpencodeModelConfigSubset): Promise<void>;
  getLocalCatalog(): Promise<ModelCatalog>;
  getServerCatalog(): Promise<ModelCatalog>;
  getCatalogs(mode: ModelSourceMode): Promise<ModelCatalogBundle>;
  isModelAvailableOnServer(provider: string, model: string): Promise<boolean>;
  getLocalProviderIds(): Promise<string[]>;
}
```

## 核心逻辑

### 读取和写回模型子集

`readLocalModelConfig()` 从 `configManager.read()` 的完整 `OpencodeConfig` 里只摘出模型相关字段：

- `model`
- `small_model`
- `provider`
- `enabled_providers`
- `disabled_providers`

`writeLocalModelConfig()` 则先读取当前完整配置，再用 `applyModelConfig()` 只替换这几项，最后整体写回，因此不会覆盖 `permission`、`plugin`、`agent` 等其他字段。

### 构建本地 catalog

`getLocalCatalog()` 调用 `buildCatalogFromConfig()`，把项目配置里的 provider/model 映射转成 `ModelCatalog`：

- provider 名称优先取配置里的 `name`，否则回退到 provider id
- model 名称优先取模型配置里的 `name`，否则回退到 model id
- `contextWindow` 取 `limit.context`
- 本地构建出的条目 `source` 固定为 `'local'`

### 构建服务端 catalog

`getServerCatalog()` 直接消费 `openCodeService.getAvailableModels()` 的返回值，并映射为 `ModelCatalog`：

- provider 名称优先取服务端 `name`
- model 名称优先取服务端 `name`
- `contextWindow` 直接映射服务端字段
- 条目 `source` 固定为 `'server'`
- `defaults` 直接沿用服务端返回值

### 选择有效 catalog

`getCatalogs(mode)` 无论 `mode` 是什么，都会并发拉取：

- 本地 catalog
- 服务端 catalog

随后按 `mode` 决定 `effective`：

- `local` -> 直接返回本地 catalog
- `server` -> 直接返回服务端 catalog
- `merge` -> 用 `mergeCatalogs(server, local)` 生成合并视图

合并顺序是“以服务端为基底，再叠加本地”，因此本地新增 provider/model 会被补进结果，本地与服务端同时存在的条目会被标记为同时存在。

### 可用性判断和 provider 回退

`isModelAvailableOnServer()` 会重新拉取一遍服务端 catalog，再判断某个 `provider/model` 是否存在。

`getLocalProviderIds()` 的逻辑分两步：

1. 如果本地配置里有 `provider` 映射，直接返回其 key 列表
2. 否则尝试从 `model` 字符串中解析 `provider/model`

## 关键方法

| 方法 | 说明 |
|------|------|
| `getConfigPath()` | 透传项目配置文件路径，供设置 UI 展示 |
| `readLocalModelConfig()` | 读取模型相关字段子集 |
| `writeLocalModelConfig(subset)` | 只更新模型相关字段并写回完整配置 |
| `getLocalCatalog()` | 从本地配置构建 catalog |
| `getServerCatalog()` | 从 `OpenCodeService` 返回值构建 catalog |
| `getCatalogs(mode)` | 返回 `local/server/effective` 三套视图 |
| `isModelAvailableOnServer(provider, model)` | 校验某个模型是否真的存在于服务端目录 |
| `getLocalProviderIds()` | 从 `provider` 映射或 `model` 引用中提取本地 provider 列表 |

## 数据流

```text
OpencodeConfigManager.read()
  -> readLocalModelConfig()
  -> buildCatalogFromConfig()
  -> local catalog

OpenCodeService.getAvailableModels()
  -> getServerCatalog()
  -> server catalog

local + server
  -> getCatalogs(mode)
  -> effective catalog
  -> 设置页模型列表 / 聊天视图运行时模型校验
```

## 与其他模块的交互

- `src/main.ts` 在插件加载时创建 `ModelConfigService` 实例。
- `src/features/settings/ModelConfigModal.ts` 和 `src/features/settings/ModelConfigJsonModal.ts` 通过它读写本地模型配置。
- `src/features/settings/OpenCodianSettings.ts` 通过 `getCatalogs()` 展示本地、服务端和合并后的模型目录。
- `src/features/chat/OpenCodianView.ts` 使用 `effective.providers` 构建模型下拉，并用 `isModelAvailableOnServer()` 做运行时检查。

## 注意事项

- 源码里没有“只读本地、不碰服务端”的 `getCatalogs()` 快路径；即使 `mode === 'local'`，也仍会调用 `getServerCatalog()`。
- `writeLocalModelConfig()` 的“部分更新”依赖 `applyModelConfig()` 先删除旧模型字段再写入清洗后的新值。
- `getLocalProviderIds()` 当前没有在仓库内发现直接调用点，但它暴露了“从 `model` 回推 provider”的兜底语义。
