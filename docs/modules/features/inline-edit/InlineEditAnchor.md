# InlineEditAnchor

> **源码**: `src/features/inline-edit/InlineEditAnchor.ts`
> **状态**: [REVIEW]

## 概述

单个行内编辑的锚点构造，从 `InlineEditController` 抽出的纯函数（docs/requirements/inline-edit.md §7.2 + flowtext-parity R-A6）。四种形态：selection（选区范围 + 精确快照）、cursor-inline / cursor-inbetween（光标位 + 行内前后文）、document（整篇：`from 0` 到 `doc.length`，快照为全文——脏检查因此天然覆盖整篇）。快照一律走 `doc.sliceString`，**不用** `editor.getSelection()`（行尾归一化会破坏脏检查）。

`rebuildAnchorForMode` 服务面板顶部的形态切换（R-A6）：`selection` 重读当前选区且选区为空时拒绝（`null`）；`document` 重取全文快照。

## 公开接口

```typescript
buildInlineEditAnchor(state, { notePath, forcedMode?: 'document' }): InlineEditAnchor | null
rebuildAnchorForMode(state, notePath, mode): InlineEditAnchor | null
```

## 依赖

- 仅 `@codemirror/state` 类型 + `./InlineEditTypes`

## 维护约束

- 快照必须始终来自 CM6 文档（§7.4 fail-stop 规则）；失败返回 `null` 由调用方提示并中止。
