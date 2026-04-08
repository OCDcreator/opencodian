# ModelConfigService

> **源码**: `src/core/config/ModelConfigService.ts`
> **状态**: [REVIEW]

## 概述

`ModelConfigService` 是“模型目录解析层”。它把三种信息拼到一起：

- 当前项目 `.opencode` 配置里的 provider/model 定义
- OpenCode 服务端返回的当前项目运行时 provider 列表、当前作用域解析配置，以及继承层配置
- 插件侧的可用性过滤条件，例如 `disabledModelRefs`

它不直接维护 UI，也不直接写整个配置文件，而是负责给上层返回一个既能表达“基础事实”，又能表达“当前可选状态”的模型 catalog bundle。

## 核心类型

```typescript
export interface ModelCatalogBundle {
  local: ModelCatalog;
  server: ModelCatalog;
  baseEffective: ModelCatalog;
  effective: ModelCatalog;
  currentEnabledProviderIds: string[];
  serverConfig: OpencodeModelConfigSubset;
  effectiveProviderConfig: ProviderAvailabilityConfig;
}
```

- `local`: 仅来自当前项目 `.opencode` 配置。
- `server`: 以当前项目目录作用域下的 runtime provider 集合为主。实现上直接采用 `config.providers()` 返回的目录作用域 provider/model 列表；如果当前 scoped config 明确禁用了某个 provider，才补一个 `server-disabled` 占位供禁用视图使用。
- `baseEffective`: 依 `modelSourceMode` 解析后的基础目录，不应用插件侧模型禁用过滤。
- `effective`: 在 `baseEffective` 之上再应用“当前 scoped server 可用性 + 当前项目 provider 开关 + 插件侧 `disabledModelRefs`”后的最终目录。
- `currentEnabledProviderIds`: 当前作用域下真正视为“provider 已启用”的 provider ID 列表；设置页用它避免把服务端当前不可用的 provider 误显示成绿色启用。
- `serverConfig`: 插件使用的“继承层 provider 配置”。本地模式优先来自本机磁盘配置，远程模式回退到服务端默认作用域 `config.get()`；它用于标注服务端禁用状态和 provider 开关继承值。
- `effectiveProviderConfig`: 以 `serverConfig` 为继承基线，再叠加当前项目 `.opencode/opencode.json` 的 provider 可用性覆盖；本地数组按字段替换继承数组。

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
- `getServerCatalog()`：并发读取 `getAvailableModels({ includeDirectory: true })`、`getResolvedModelConfig({ includeDirectory: true })` 与默认作用域 `getResolvedModelConfig({ includeDirectory: false })`。其中：
  - 目录作用域下的 runtime provider/model 列表直接来自 `config.providers()`
  - 不再把 `provider.list()` 当成 `opencode models` / 设置页服务器目录的等价数据源
  - 不再把 `config.get().provider` 整包当成“服务器目录”
  - 本地模式不会把“无 `directory` 的 `/config`”直接当成全局配置，而是优先读取本机 `XDG_CONFIG_HOME/opencode`、`~/.opencode` 与 managed 目录中的继承配置
  - 远程模式才把“无 `directory` 的 `/config`”当成默认作用域兜底
  - 最后只给“当前 scoped config 里仍然禁用、并且 runtime 当前没有返回”的 provider 补占位和禁用来源

### 解析“基础目录”与“最终目录”

`getCatalogs(mode, disabledModelRefs = [])` 的核心逻辑是：

1. 并发读取当前项目模型子集、当前项目作用域下的运行时 provider 列表、当前作用域解析配置，以及继承层配置
2. 生成 `local` 与 `server`
3. 按 `mode` 解析 `baseEffective`
4. 先按当前 scoped server 状态与当前项目 provider 开关收敛出 `currentEnabledProviderIds`
5. 再对 `baseEffective` 应用模型级过滤，并只保留 `currentEnabledProviderIds` 对应的 provider，得到 `effective`

这一步是最近文档最容易过期的地方。现在服务显式区分：

- `baseEffective`: 用于保留完整 provider/model 元数据，即使某项当前不可选也仍可显示
- `effective`: 真正允许聊天发送、标题生成和设置默认值解析的过滤后目录

过滤条件包括：

- 当前 scoped server config 对 provider 的最终允许状态
- 当前项目配置里的 `enabled_providers` / `disabled_providers`
- 插件设置里的 `disabledModelRefs`

provider 开关继承规则依然保留在 `effectiveProviderConfig` 里，按字段继承 / 替换：

- 当前项目有 `enabled_providers` 时替换服务器 `enabled_providers`，否则继承服务器值
- 当前项目有 `disabled_providers` 时替换服务器 `disabled_providers`，否则继承服务器值
- `disabledModelRefs` 仍然只在插件侧过滤模型，不写入 `.opencode/opencode.json`

### 服务端可用性校验

`isModelAvailableOnServer()` 仍然只回答“服务端目录里是否存在这个 `provider/model`”，不考虑插件侧过滤，也不考虑当前 `modelSourceMode`。

`testProviderAvailability(providerId)` 则是设置页的逐 provider 探针。它会重新读取：

- 当前项目本地覆盖
- 当前 vault 作用域下的 scoped server config
- 继承层 provider 配置
- directory-scoped runtime provider 结果
- 合并后的 server catalog

如果当前 provider 在“最终可用 provider 配置”里仍然允许使用，并且还能选出一个测试模型，服务还会额外调用 `OpenCodeService.probeProviderResponse(providerId, modelId)` 发起一次最小真实请求。也就是说，这个探针现在不再只是“看目录里有没有 / runtime 里有没有”，而是尽量回答“这个 provider 现在到底能不能真发出去”。

然后把结果归类成：

- `available`
- `send_failed`
- `project_disabled`
- `server_disabled`
- `catalog_only`
- `missing`

这让 UI 能区分：

- 当前项目明确禁用
- 服务端明确禁用
- 目录里还在，但没有可测试模型
- 目录和 runtime 看起来都行，但真实发送失败（例如 `401 invalid_api_key`）
- 真实发送成功

## 高频回归点（不要改错）

这块已经反复出错，后续升级 SDK 或整理 provider 目录代码时，请先记住下面 3 条硬规则：

1. **设置页 `服务器目录` 的事实来源只能是 `config.providers(includeDirectory=true)`**
   - 它和 `opencode models` 同源，都是目录作用域下服务端内部 `Provider.list()` 的结果。
   - 不要改成 `provider.list()`。
   - 也不要把 `config.get().provider` 当成服务器目录。

2. **继承层 / 服务端 `disabled_providers` 是硬禁用，不允许被项目本地空数组或“重新启用”覆盖**
   - `服务器目录` = `opencode models` 当前 provider 集合，减去硬性服务端禁用 provider。
   - `当前生效列表` = 上式结果，再叠加当前 scoped config 与项目本地 provider 开关过滤。
   - `当前禁用列表` 仍要保留这些服务端禁用 provider 的占位。

3. **如果插件 UI 的 provider 数量突然远少于 `opencode models`，先怀疑旧的本地 `4096` 进程被继续接管**
   - 典型症状：CLI 有 9 个 provider，但插件只剩 1 个或 3 个。
   - 这时先检查 `ServerManager` 的 managed server 接管链路、`directory` 作用域和 Windows 路径规范化。
   - 不要第一反应去改 `mergeProviderAvailabilityConfig()` 或重新把 `provider.list()` 接回服务器目录。

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
| `testProviderAvailability(providerId)` | 探测当前 vault 作用域下某 provider 的真实可用性；允许时会做一次最小真实发送 |
| `getLocalProviderIds()` | 从本地配置反推出启用 provider 列表 |

## 数据流

```text
OpencodeConfigManager.read()
  -> readLocalModelConfig()
  -> buildCatalogFromConfig()
  -> local

OpenCodeService.getAvailableModels(includeDirectory=true)
  -> current project runtime catalog
  -> defaults supplement

OpenCodeService.getResolvedModelConfig(includeDirectory=true)
  -> scoped current project config
  -> local-mode inherited supplement only

OpenCodeService.getResolvedModelConfig(includeDirectory=false)
  -> remote-mode default-scope inherited fallback only

local disk config (XDG config / ~/.opencode / managed)
  -> local-mode inherited serverConfig

local-mode inherited serverConfig or remote default-scope serverConfig
  -> serverConfig

local + server + modelSourceMode
  -> resolveCatalog()
  -> baseEffective

serverConfig + local provider arrays
  -> effectiveProviderConfig

scopedConfig + local provider arrays
  -> currentEnabledProviderIds

baseEffective + disabledModelRefs + currentEnabledProviderIds
  -> filterCatalog() + provider ID filter
  -> effective
```

## 与其他模块的交互

- `OpenCodianSettings.ts`：同时消费 `baseEffective` 和 `effective`，以便区分“存在但被禁用/不可用”和“完全不存在”。
- `OpenCodianView.ts`：使用 `effective` 约束聊天发送，但需要 `baseEffective` 保留展示元数据。
- `TitleGenerationService.ts`：解析 `aiTitleModel` 时会先在 `baseEffective/effective` 上做 availability-aware 校验；显式配置的标题模型一旦不可用，会直接阻止标题生效。
- `ModelConfigModal.ts` / `ModelConfigJsonModal.ts`：通过它读写本地模型配置。

## 注意事项

- `mode === 'local'` 时也会读取服务端目录，因为返回 bundle 需要完整 `server` 视图。
- `opencode models` CLI 与 `config.providers()` / `getAvailableModels(includeDirectory=true)` 同源，都是目录作用域下服务端内部 `Provider.list()` 的结果；这里不是指 SDK `provider.list()` / `/provider` 路由。设置页服务器目录直接复用这条链路。
- `provider.list()` 对应的是 connect-provider 目录总览，不是 `opencode models` 的一对一替代；不要再用它来扩充设置页服务器目录。
- `getResolvedModelConfig(includeDirectory=false)` 不是“纯全局配置文件内容”。在 OpenCode 服务端里，不带 `directory` 的 `/config` 会落到服务进程默认工作目录；本地模式下如果插件接管了一个旧进程，这个结果甚至可能对应另一个 vault。
- 继承层 `disabled_providers` 现在视为硬性服务端禁用：项目本地空数组或“重新启用”操作都不会把这些 provider 重新算作可用项；`服务器目录` 视图会直接把它们排除，只在 `当前禁用` 视图保留占位。
- 如果 `服务器目录`、`当前生效列表`、`当前禁用列表` 三张卡之间的关系看起来不对，先对照下面这个公式排查：
  - `服务器目录` = `config.providers(directory)` - 服务端硬禁用 provider
  - `当前生效列表` = `服务器目录` ∩ `currentEnabledProviderIds`
  - `当前禁用列表` = 服务端硬禁用占位 + 项目禁用 provider + `disabledModelRefs`
- Windows 下如果 `directory` 传的是反斜杠路径（例如 `C:\vault`），OpenCode 服务端会返回接近全局作用域的结果；插件侧现在会在 transport 层统一规范化成 `C:/vault`。
- `effective` 不是“唯一真实目录”；`baseEffective` 同样重要，尤其是 UI 展示和降级判断。
- 这个服务不决定“选中哪个模型”，它只提供目录与过滤后的事实数据。
