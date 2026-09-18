# InlineEditModeSwitch

> **源码**: `src/features/inline-edit/InlineEditModeSwitch.ts`
> **状态**: [REVIEW]

## 概述

行内悬浮面板顶部的「选区 / 光标 / 整篇」分段切换（flowtext-parity R-A6），从 `InlineEditInputOverlay` 抽出以守住 overlay 行数上限。互斥语义：点击分段回调 `onModeChange`，控制器仅在输入相位且会话未启动时换锚（`rebuildAnchorForMode`，见 `InlineEditAnchor`）。「光标」一段同时覆盖 cursor-inline / cursor-inbetween，具体形态由锚点按行内容推导。只有一个可选形态时整行隐藏。

同时承载按形态区分的输入框 placeholder 文案与 `inlineEditModeOptions`（选区需要非空选区，整篇受 `inlineEditDocumentModeEnabled` 门控）。

## 公开接口

```typescript
buildInlineEditModeRow(root, { onModeChange }): { element; sync(state) }
inlineEditModeOptions(state, documentEnabled): readonly InlineEditMode[]
placeholderForMode(mode): string
```

## 依赖

- `../../i18n`、`./InlineEditTypes`
