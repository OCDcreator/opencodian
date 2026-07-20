# ModelSelectorRenderer

> **源码**: `src/features/chat/ui/modelSelector/ModelSelectorRenderer.ts`
> **状态**: [REVIEW]

## 概述

`ModelSelectorRenderer` 负责 model selector 下拉列表的纯 DOM 渲染编排：

- loading / empty state
- provider 分组与 option 列表
- selected / highlighted class 应用
- option click / hover 回调挂接
- configured-only badge、tooltip、`aria-disabled` 与禁用事件语义
- sticky header cleanup 的重绑入口

它不持有 `OpenCodianView`、`plugin` 或 tab 状态；调用方只传当前 catalog、filter、selection 与回调。

## 公开接口

```typescript
export function renderModelList(options: RenderModelListOptions): RenderModelListResult;
```

## 注意事项

- 每次重渲都会先执行 `previousStickyHeadersCleanup`
- provider header 的 stuck 监听仍复用 `ui/modelSelectorStickyHeaders.ts`
- 本模块只负责列表区；trigger、搜索框、dropdown 开关仍由 `OpenCodianView` 持有
- provider header 现在包含 provider icon，通过 `ProviderIconService.createIconElement()` 同步获取 Lobehub CDN 图标，失败时静默跳过（header 仅显示文本）
- configured-only option 仍留在 effective 列表中，但不会获得 hover highlight、click callback 或预置 keyboard highlight。
