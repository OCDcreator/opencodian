# SettingsModelCatalogAvailability

> **源码**: `src/features/settings/SettingsModelCatalogAvailability.ts`
> **状态**: [REVIEW]

## 概述

`SettingsModelCatalogAvailability` 是 settings/model catalog 的 availability presentation owner。它集中计算 provider/model 可用性展示所需的纯描述结果：状态 class、状态文案、server-disabled 约束 badge、probe badge/detail、provider directory summary/badge、disabled scope 优先级、空目录 placeholder reason，以及 provider model 预览文本。

这个模块只消费 `ModelCatalogStateService` / `ModelConfigService` 已经产出的 `ModelCatalogProvider` 与 `ProviderAvailabilityProbe` 数据，不读取或写回 `.opencode` 配置，也不改变 local/server/effective/disabled 目录合并语义。

## 核心逻辑

- `getProviderPrimaryDisabledReason()`：当 provider 未启用且同时存在 project/global disabled scope 时，优先把 project disabled 作为用户可操作的主原因。
- `getProviderAvailabilityStatusClass()` / `getProviderAvailabilityStatusLabel()`：把 provider enabled、disabled model count、server catalog mode 与 disabled scopes 映射成稳定 badge class 与文案。
- `getProviderServerConstraintBadge()`：在 effective/disabled 视图中单独表达 inherited server-disabled 约束，避免把 server default disabled 与 project disabled 混为一谈。
- `getProviderAvailabilityProbeBadge()` / `describeProviderAvailabilityProbe()`：把 provider probe 运行态、错误态与 ready 结果转换成 badge/detail 展示描述。
- `describeProviderDirectorySummary()` / `getProviderDirectoryBadge()`：把 `provider.list()` 的 listed / connected 辅助状态转换成设置页 summary 与 provider 行诊断 badge；它们只描述诊断信号，不改变 provider/model 可选性，也不把 listed outside catalog 的 provider 变成可操作项。
- `describeModelCatalogComparison()`：把 V2 影子比较转换成 match/drift/unavailable 中性状态行；drift 只输出双方独有数量，不暴露完整 ID。
- `describeModelAvailabilitySummary()`、`describeProviderModels()`、`getCatalogPlaceholderReason()`：为 provider header 与空模型列表提供 summary / preview / placeholder reason。

## 与其他模块的交互

- `SettingsModelCatalogPresenter.ts`: 负责 DOM 渲染、搜索/展开/滚动状态、probe 触发和 provider/model toggle 事件；调用本模块拿展示描述。
- `ModelCatalogStateService.ts`: 提供 catalog state 和 probe API，本模块不直接调用它。
- `ModelConfigService.ts`: 继续拥有 model catalog merge、server/local/effective config 语义和 provider probe 数据来源。
- `SettingsModelSection.ts`: 继续是 settings shell、refresh/save orchestration 与 callback bridge，不承接 availability 语义。

## 注意事项

- 不要在这里新增 settings 写回、provider probe 调用、DOM 操作或缓存生命周期；这些属于 presenter / section / service owner。
- 如果新增 availability 状态，优先扩展这里的纯 descriptor 函数，再让 presenter 消费结果。
- 保持 project disabled 优先于 global/server disabled 的展示规则，避免把可由项目配置修复的问题误报成服务器目录硬限制。
