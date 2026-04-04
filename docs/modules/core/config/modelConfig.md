# Model Config Helpers

> **源码**: `src/core/config/modelConfig.ts`
> **状态**: [REVIEW]

## 概述

`modelConfig.ts` 是 Worker 2 范围里最底层的配置辅助模块。它同时承担 3 类职责：

- 解析带注释的 OpenCode 配置文本
- 清洗 / 提取 / 回写模型相关字段子集
- 把模型配置映射成 `ModelCatalog`，并与服务端目录做合并

它被多个模块复用：

- `ModelConfigService` 用于模型 catalog 读写
- `OpencodeConfigManager` 和 `PluginManagementService` 用于解析 `opencode.json`
- `ServerManager` 也直接复用了 `parseOpencodeConfigText()`

## 导入关系

```text
上游: src/core/types/index.ts
下游: src/core/config/ModelConfigService.ts, src/core/config/OpencodeConfigManager.ts, src/core/config/PluginManagementService.ts, src/core/opencode/ServerManager.ts
```

## 核心类型 / 接口

```typescript
export const OPENCODE_SCHEMA_URL = 'https://opencode.ai/config.json';

export type ModelCatalogSource = 'local' | 'server' | 'merge';

export interface ModelCatalogModel {
  id: string;
  name: string;
  contextWindow?: number;
  source: ModelCatalogSource;
  existsInLocal: boolean;
  existsInServer: boolean;
}

export interface ModelCatalogProvider {
  id: string;
  name: string;
  models: ModelCatalogModel[];
  source: ModelCatalogSource;
  existsInLocal: boolean;
  existsInServer: boolean;
}

export interface ModelCatalog {
  providers: ModelCatalogProvider[];
  defaults: Record<string, string>;
}
```

## 核心逻辑

### 带注释 JSON 解析

`stripJsonComments(text)` 用状态机逐字符扫描文本，删除：

- `//` 行注释
- `/* ... */` 块注释

同时它会正确保留字符串字面量里的 `/`、`\"` 和转义状态。

`parseOpencodeConfigText(text)` 只是先调用 `stripJsonComments()`，再执行 `JSON.parse()`。

### 模型子集提取与清洗

模型子集只覆盖以下键：

- `model`
- `small_model`
- `provider`
- `enabled_providers`
- `disabled_providers`

对应函数分工如下：

| 导出 | 作用 |
|------|------|
| `extractModelConfig(config)` | 从完整 `OpencodeConfig` 中摘出模型相关字段，并做基础类型过滤 |
| `cleanupModelConfig(subset)` | 去掉空字符串、空数组和空对象，数组去重并 trim |
| `applyModelConfig(config, subset)` | 先删掉原配置中的模型相关键，再把清洗后的子集并回去 |

其中 `provider` 会通过 `JSON.parse(JSON.stringify(...))` 深拷贝，避免调用方共享对象引用。

### 从本地配置构建 catalog

`buildCatalogFromConfig(subset, source)` 会把 `provider` 映射转成 `ModelCatalog`：

- 只有 `provider` 和 `provider.models` 为对象时才会参与构建
- provider / model 的 `name` 为空时回退到各自 id
- `contextWindow` 取 `modelConfig.limit?.context`
- `defaults` 只从 `subset.model` 解析默认 provider/model

### 合并本地与服务端 catalog

`mergeCatalogs(server, local)` 的合并顺序是“先复制服务端，再叠加本地”：

- 服务端独有条目保留 `source: 'server'`
- 本地独有 provider/model 会以 `source: 'local'` 补入
- 两边同时存在的 provider/model 会变成 `source: 'merge'`
- provider 和 model 最终都按 `name.localeCompare()` 排序
- `defaults` 采用 `{ ...server.defaults, ...local.defaults }`，本地默认值覆盖同 provider 的服务端默认值

### 模型引用解析

`parseModelReference(value)` 只识别 `provider/model` 这种最简单的格式：

- 斜杠前后都必须有内容
- 返回值会对两侧做 `trim()`
- 其他格式返回 `null`

## 关键导出

| 导出 | 说明 |
|------|------|
| `OPENCODE_SCHEMA_URL` | `OpencodeConfigManager.write()` 写 schema 时复用的常量 |
| `isRecord(value)` | 非数组对象类型守卫 |
| `stripJsonComments(text)` | 删除 JSON 文本注释 |
| `parseOpencodeConfigText(text)` | 解析 OpenCode 配置文本 |
| `extractModelConfig(config)` | 提取模型字段子集 |
| `applyModelConfig(config, subset)` | 用模型子集回写完整配置 |
| `cleanupModelConfig(subset)` | 清洗模型子集 |
| `buildCatalogFromConfig(subset, source)` | 从本地 / 服务端风格数据构建 catalog |
| `mergeCatalogs(server, local)` | 合并 catalog 并标记存在性 |
| `parseModelReference(value)` | 解析 `provider/model` 引用字符串 |

## 与其他模块的交互

- `ModelConfigService` 是这个模块最主要的运行时消费方。
- `OpencodeConfigManager` 和 `PluginManagementService` 只拿它的配置文本解析能力，不使用 catalog 合并逻辑。
- `ServerManager` 也依赖 `parseOpencodeConfigText()`，因此修改注释剥离规则会影响服务端配置读取。

## 注意事项

- `parseOpencodeConfigText()` 本身不做错误兜底，JSON 非法时会直接抛异常，是否捕获由调用方决定。
- `buildCatalogFromConfig()` 不会从 `enabled_providers` / `disabled_providers` 推导 provider 列表；catalog 只来自 `provider` 映射和 `model` 默认值。
- `parseModelReference()` 只按第一个 `/` 切分，不做更复杂的 provider/model 语法校验。
