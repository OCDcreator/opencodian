# modelSelectorStickyHeaders

> **源码**: `src/features/chat/ui/modelSelectorStickyHeaders.ts`
> **状态**: [REVIEW]

## 概述

模型选择下拉里的 provider header 需要在滚动时切换 `data-stuck`。这个 helper 模块负责：

- 根据 `scrollTop` 和 header / container 的矩形关系更新 stuck 状态
- 绑定滚动监听并返回 cleanup

它取代了之前写在 DOM 私有属性 `_stuckHandler` 上的临时监听器方案，让清理责任回到 `OpenCodianView` 自身。

## 公开接口

```typescript
export function syncModelSelectorStickyHeaders(
  scrollContainer: HTMLElement,
  headers: readonly HTMLElement[],
): void;

export function bindModelSelectorStickyHeaders(
  scrollContainer: HTMLElement,
  headers: readonly HTMLElement[],
): () => void;
```

## 注意事项

- helper 本身不缓存 header；调用方重渲染列表后应重新绑定
- cleanup 是幂等的，可在 view 关闭或列表重建前重复调用
