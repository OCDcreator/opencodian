# ModelCatalogStateService

> **源码**: `src/core/config/ModelCatalogStateService.ts`
> **状态**: [REVIEW]

## 概述

`ModelCatalogStateService` 是 settings/model 目录可用性语义的 core owner。它围绕 `ModelConfigService` 提供稳定的 catalog state API，把原先散落在设置页 presenter 里的几类逻辑收回到配置层：

- 读取 `local/server/baseEffective/effective/currentEnabledProviderIds` 后再派生 `displayCatalogs` / `providerStatusCatalogs`
- 统一 provider 当前启用态、project-disabled、global-disabled 与 disabled placeholder 的表达
- 派生 provider directory / connected 诊断状态，但不把 directory-only provider 加进展示目录
- 收束 provider availability 批量写回和 model availability 的 `disabledModelRefs` 归并
- 继续复用 `ModelConfigService.testProviderAvailability()` 做逐 provider probe
- 仅在 settings state 构建时请求 V2 影子目录比较，并把结果放入不持久化的 `catalogComparison`

这样 settings UI 只消费 `ModelCatalogState`，不再自己重建 `baseEffective` / `effective` / `currentEnabledProviderIds` 的组合语义。

## 公开 API

| 方法 | 说明 |
|------|------|
| `getCatalogState(mode, disabledModelRefs?)` | 读取当前项目配置与 catalog bundle，并返回 settings 侧直接可消费的 `ModelCatalogState` |
| `applyProviderAvailabilityChange({ state, providerIds, enabled })` | 按当前继承配置与已知 provider 集，写回项目 `.opencode` 的 provider availability 覆盖 |
| `applyModelAvailabilityChange({ disabledModelRefs, modelRefs, enabled })` | 归并插件设置里的 `disabledModelRefs`，保留既有持久化语义 |
| `probeProvider(providerId)` | 透传到 `ModelConfigService.testProviderAvailability()` |

## 核心类型

```typescript
export interface ModelCatalogState {
  localModelConfig: OpencodeModelConfigSubset;
  disabledModelRefs: string[];
  catalogs: ModelCatalogBundle;
  displayCatalogs: Record<ModelCatalogStateMode, ModelCatalog>;
  providerStatusCatalogs: Record<ModelCatalogStateMode, ModelCatalog>;
  providerDirectoryStatuses: Record<string, ProviderDirectoryStatus>;
  catalogComparison: ModelCatalogComparison;
}
```

- `displayCatalogs`: settings 目录卡片真正展示的 local / server / effective / disabled 四张视图
- `providerStatusCatalogs`: 与展示视图平行的状态视图；provider/model 会带上当前轮次计算后的 `disabledScopes`
- `providerDirectoryStatuses`: 从 `catalogs.providerDirectory` 派生的只读诊断状态，记录 provider 是否在 `provider.list()` 目录中、是否 connected、directory model 数，以及是否已经存在于 server / effective catalog。它不参与 `displayCatalogs` 构建。
- `disabledModelRefs`: 进入本轮 catalog state API 前已经规范化的插件侧 model disable 集合
- `catalogComparison`: 当前 `server` runtime catalog 与 V2 provider/model list 的只读比较结果；不进入 `ModelCatalogBundle`，也不驱动聊天可用性

## 关键行为

### 目录展示与状态目录分离

service 会同时生成：

- `displayCatalogs.server`：保留当前 runtime / server catalog 的 provider 集合，不因为当前禁用态而删 provider
- `providerStatusCatalogs.server`：在同一集合上叠加 `global` / `project` disabled scope，供 settings UI 决定 badge 与 toggle disable
- `displayCatalogs.disabled`：汇总当前目录里被 provider 或 model availability 排除的项，并补上仅存在于配置层的 disabled placeholder
- `providerDirectoryStatuses`：保留 `provider.list()` 的 connected / listed 信号，供 presenter 渲染辅助 summary 与 badge；只出现在 provider directory 里的 provider 不会出现在 provider 行、批量开关目标或模型开关里

这让 presenter 不再需要自己拼 disabled catalog、server placeholder 或 `currentEnabledProviderIds` 判定。

### provider availability 写回

`applyProviderAvailabilityChange()` 会：

1. 规范化 `providerIds`
2. 读取当前本地 `.opencode` 子集
3. 结合 `state.catalogs.server/local/serverConfig` 推出 `knownProviderIds`
4. 复用 `setProviderEnabled()` 写回 provider availability override

因此 settings host 不再自己拼 `knownProviderIds`、`inherited` 与循环写回逻辑。

### model availability 写回

`applyModelAvailabilityChange()` 只处理插件 settings 里的 `disabledModelRefs`，故意不写 `.opencode/opencode.json`。它会：

- 规范化本次请求里的 `modelRefs`
- 保留历史上已存在的 disabled entry 语义
- 在真正有变更时返回排序后的结果给 host 持久化

## 与其他模块的交互

- `ModelConfigService.ts`: 提供原始 catalog bundle 与 provider probe
- `OpenCodianSettings.ts`: 使用该 service 读取 `ModelCatalogState` 并委托 provider/model availability 写回
- `SettingsModelCatalogPresenter.ts`: 只消费 `ModelCatalogState` 的展示视图与状态视图，不再自行组合 core availability 语义

## 注意事项

- 这个 service 负责“catalog state 语义”，不是 DOM owner；不要把 settings markup、probe badge 文案或搜索状态移进来。
- `baseEffective` 与 filtered `effective` 的区分必须保留；service 只是在其上加一层 settings 可消费的状态视图。
- provider discovery 仍然以 `ModelConfigService` / `config.providers(directory)` 为准；`provider.list()` 只可作为 `providerDirectoryStatuses` 的辅助诊断信号，不要用它扩展 server / effective catalog。
- V2 comparison 不可用时返回 `unavailable`，settings 仍继续使用旧 runtime catalog；不要把它解释为 provider 故障。
