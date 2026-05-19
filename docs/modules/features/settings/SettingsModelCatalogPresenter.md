# SettingsModelCatalogPresenter

> **源码**: `src/features/settings/SettingsModelCatalogPresenter.ts`
> **状态**: [REVIEW]

## 概述

`SettingsModelCatalogPresenter` 是 settings/model 目录展示的厚 owner。它把原本散落在 `OpenCodianSettings.ts` 里的 provider accordion、search、catalog summary card、bulk toggle、provider probe badge/detail 和过滤状态收束到一个专门 presenter；现在外层的 section lifecycle 则由 `SettingsModelSection.ts` 持有，让主设置页回到“owner 装配 + callback bridge”的角色。

这个 presenter 的职责边界刻意偏向 **presentation state + semantic events**。provider availability 的纯描述规则已经下沉到 `SettingsModelCatalogAvailability.ts`，presenter 只消费这些 descriptor 来组装 DOM：

- 持有当前激活的 catalog tab、provider 展开态、搜索词、`仅看已禁用` / `仅看已启用` 过滤状态
- 根据 `ModelCatalogStateService` 提供的 `ModelCatalogState` 渲染 provider/model availability 视图
- 展示 provider probe loading / success / error / catalog-only 等 badge 与 detail（文案/class 由 `SettingsModelCatalogAvailability.ts` 计算）
- 展示 provider directory 的 connected/listed 辅助 summary 与 provider 行诊断 badge，但不把 listed outside catalog provider 渲染成可操作行
- 发出 provider/model availability semantic toggle 事件，真正的 settings 写回由 `SettingsModelSection` 提供 callback

## 核心逻辑

### 目录展示状态机收束

`render()` 会把以下原先由 `OpenCodianSettings` 直接铺开的状态机集中起来：

- 搜索输入与搜索历史增强
- provider accordion 的展开 / 折叠
- project / server / effective / disabled 四张目录摘要卡的当前选中状态
- provider/model 级过滤和空态文案
- provider probe 结果缓存与重渲染

这样 `SettingsModelSection` 只需要负责 catalog host、refresh/save orchestration 与周边工具区，而不再直接持有大段 catalog UI DOM 组装和状态切换分支。

当前 owner 内部又按 render lifecycle 拆成了几段稳定阶段：catalog summary、search/filter/bulk controls、provider accordion header/actions，以及 expanded model list + bulk model toggles。2026-04-24 起，availability 内容不再额外创建一层 `.opencodian-model-toggle-block` inner shell，而是直接渲染进 `SettingsModelSection` 提供的外层 block body，这样 classic / tabbed 两种模式都不会出现“外层 block 再包一层大卡片”的双层容器感；2026-05-18 起，catalog summary 与 search/filter/bulk controls 默认展开，catalog bulk provider actions 不再单独生成顶部信息条，而是跟搜索与筛选 controls 同行渲染，并靠 `.opencodian-model-catalog-actions-buttons` 推到行末。外层 management stack 现在提供统一主节奏，catalog summary、controls 与 provider list 之间不再依赖额外 actions 卡片制造间距。当前 provider 列表继续使用单一 `.opencodian-model-toggle-provider-list` 作为原生滚动容器，presenter 在重渲染时会同时保留 provider 列表自身的 `scrollTop` 和外层 settings scroll host 的 `scrollTop`，避免展开 provider 后整个设置页突然跳回顶部。这样后续继续收束时，优先在 presenter 内沿这些生命周期 helper 延伸，而不是把 catalog availability 语义重新摊回调用方。

`render()` 的 DOM 阶段只保留后续确实需要读取的节点引用；catalog overview 这类一次性区块按副作用渲染，避免为未消费的中间容器制造额外 owner state。

### provider / model availability 表达

presenter 会把 `ModelCatalogState` 里的几层 availability 信号叠加到 UI 上，并把纯展示推导委托给 `SettingsModelCatalogAvailability.ts`：

- `displayCatalogs` / `providerStatusCatalogs` 对 provider 当前目录、disabled placeholder 与 disabled scope 的表达
- `currentEnabledProviderIds` 对 provider 当前是否真的进入有效目录的判断
- `disabledModelRefs` 对 model 级禁用的表达
- `ModelCatalogStateService.probeProvider()` 结果对 provider probe badge/detail 的表达
- `providerDirectoryStatuses` 对 `provider.list()` listed / connected 诊断状态的表达；这只影响 summary 与诊断 badge，不进入搜索结果、bulk action provider IDs 或 model toggle 集合

它只负责**呈现**这些状态；并不改 `ModelConfigService` 的 merge 规则，也不改变 provider availability 语义。若后续要新增 availability 文案、badge class、placeholder reason 或 disabled-scope 优先级，应先扩展 `SettingsModelCatalogAvailability.ts`，避免把纯 descriptor 逻辑重新塞回 presenter。

## 关键方法

| 方法 | 说明 |
|------|------|
| `setPreferredCatalogTab()` | 按当前 `modelSourceMode` 选择默认 catalog tab |
| `render()` | 根据当前 `ModelCatalogState` 与 presenter state 重建 model catalog 管理区 |
| `getDisplayCatalogForMode()` | 从 `ModelCatalogState.displayCatalogs` 读取 local / server / effective / disabled 展示视图 |
| `getCatalogModelCount()` | 统计某个 catalog 中 provider 下 model 总数 |

## 与其他模块的交互

- `SettingsModelSection.ts`: 提供 host seam，包括 inline-code 文案、provider icon 渲染、provider/model toggle 写回 callback，以及 refresh/save orchestration
- `SettingsModelCatalogAvailability.ts`: 计算 provider availability status、probe badge/detail、summary、placeholder reason 与 provider model preview 文案
- `ModelCatalogStateService.ts`: 提供目录状态、provider/model availability 写回和 provider probe
- `searchInputEnhancer.ts`: 为 model availability search 输入框提供历史记录与清空按钮
- `ProviderIconService`: 通过 host callback 复用现有 provider icon fallback 顺序，不在 presenter 内重新实现图标解析

## 注意事项

- 这个 presenter 只发出 semantic toggle 事件；不要把 `.opencode` 写回、插件 settings 保存、workspace modal launch 或 icon cache lifecycle 塞进来。
- provider probe 结果缓存属于 UI state，可以随着 settings tab 生命周期存在，但不应写回持久化配置。
- 如果后续要继续推进该 lane，优先继续扩展 `SettingsModelSection` 或 `ModelCatalogStateService` 这类 owner/core state API，而不是把新的 merge/filter 规则继续堆进 presenter。
