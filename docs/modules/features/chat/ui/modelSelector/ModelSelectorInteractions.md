# ModelSelectorInteractions

> **源码**: `src/features/chat/ui/modelSelector/ModelSelectorInteractions.ts`
> **状态**: [REVIEW]

## 概述

`ModelSelectorInteractions` 把 model selector 列表的 DOM 交互抽成轻量 helper：

- 组装 / 解析 `provider::model` option value
- 键盘导航高亮
- 按值高亮单个 option
- 选择当前高亮项
- 将当前模型滚动到可见区域

## 公开接口

```typescript
export function buildModelOptionValue(provider: string, model: string): ModelSelectorOptionValue;
export function parseModelOptionValue(value: string | null | undefined): ModelSelectorSelection | null;
export function navigateModelList(scrollContainer: HTMLElement, direction: 1 | -1): string | null;
export function highlightModelOption(scrollContainer: HTMLElement, value: string): boolean;
export function selectHighlightedModel(
  scrollContainer: HTMLElement,
  onSelect: (provider: string, model: string) => void,
): boolean;
export function scrollToCurrentModel(
  scrollContainer: HTMLElement,
  currentSelection: ModelSelectorSelection | null,
): boolean;
```

## 注意事项

- helper 只操作传入容器，不缓存外部状态
- model dropdown 的水平边界计算已由相邻的 `AnchoredOverlayLayoutController` 统一负责
- `navigateModelList()` 保持原有边界夹紧语义，不做循环导航
- `selectHighlightedModel()` 只负责解析与回调；调用方只会在 current-tab override 成功时关闭 card 并恢复 Composer focus
