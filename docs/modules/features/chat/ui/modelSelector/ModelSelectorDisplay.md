# ModelSelectorDisplay

> **源码**: `src/features/chat/ui/modelSelector/ModelSelectorDisplay.ts`
> **状态**: [REVIEW]

## 概述

`ModelSelectorDisplay` 负责把当前 model selector 的状态推导成 trigger 所需的展示数据：

- trigger 文本
- tooltip title
- icon label
- `is-unavailable` / `is-unconfigured` class 所需布尔值

它只返回 display state，不直接操作 DOM，也不处理 provider icon 的异步解析。

## 公开接口

```typescript
export function buildModelSelectorDisplayState(
  options: BuildModelSelectorDisplayStateOptions,
): ModelSelectorDisplayState;
```

## 注意事项

- empty catalog 时，title 可回退到调用方传入的 unavailable empty-state 文案
- 已知 metadata 优先于裸 provider/model id
- provider icon 的真实渲染仍由 `OpenCodianView.updateModelSelectorIcon()` 完成
