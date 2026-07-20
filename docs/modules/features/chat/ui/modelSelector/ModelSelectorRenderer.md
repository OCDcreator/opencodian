# ModelSelectorRenderer

> **源码**: `src/features/chat/ui/modelSelector/ModelSelectorRenderer.ts`
> **状态**: [REVIEW]

## 概述

`ModelSelectorRenderer` 负责 model selector 下拉列表的纯 DOM 渲染编排：

- loading / empty state
- provider 分组与 option 列表
- selected / highlighted class、共享 popover option class 与稳定 id、`role="option"` / `aria-selected` / `tabindex="-1"` 应用
- option click / hover 回调挂接
- sticky header cleanup 的重绑入口

它不持有 `OpenCodianView`、`plugin` 或 tab 状态；调用方只传当前 catalog、filter、selection 与回调。

## 公开接口

```typescript
export function renderModelList(options: RenderModelListOptions): RenderModelListResult;
```

## 注意事项

- 每次重渲都会先执行 `previousStickyHeadersCleanup`
- provider header 的 stuck 监听仍复用 `ui/modelSelectorStickyHeaders.ts`
- 本模块只负责列表区；trigger、共享 frame content slot、搜索框与 dropdown 开关仍由 `ChatSelectionControlsCoordinator` 持有
- provider 渲染为语义 `role="group"`，并通过 `aria-labelledby` 引用 heading 中唯一标签 id；heading label 本身不是 `role="option"`
- provider identity 仅在 heading 中渲染一次：一个 provider icon（通过 `ProviderIconService.createIconElement()` 同步获取 Lobehub CDN 图标，失败时静默跳过）加一个紧凑文本标签
- 每个模型 option 位于 heading 下方的 `.opencodian-model-group-options` 布局包装内；模型行保留共享的 22px 前导 slot，但该 slot 保持为空并对辅助技术 `aria-hidden`，以形成视觉父子关系而不破坏 Command 行对齐
- provider icon 不再出现在模型行中；模型 option 仅包含空的前导 slot、弹性文本 slot 和 18px check slot；调用方传入的实例 id prefix 生成稳定 option id，供所属 search combobox 的 `aria-activedescendant` 引用
