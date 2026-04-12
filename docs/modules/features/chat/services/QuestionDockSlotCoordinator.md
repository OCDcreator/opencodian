# QuestionDockSlotCoordinator

> **源码**: `src/features/chat/services/QuestionDockSlotCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`QuestionDockSlotCoordinator` 把 `OpenCodianView` 里原本直接持有的 **question dock slot DOM 生命周期、`QuestionDock` 实例，以及显式 render trigger** 收束到一个小而专职的模块，专门负责：

- 在输入区构建时创建 `opencodian-question-dock-slot` 与 `QuestionDock`
- 在 view locale/activation/question UI 刷新时，提供统一的 `render()` 入口把重绘触发回 question runtime bundle
- 在 view 关闭时销毁自己拥有的 slot 与 dock，并保留 `questionCardPosition` 设置门控查询

它不负责 pending-question 队列、draft answer、resolved follow-up 或真实的 dock render state 计算；这些业务职责仍由 `QuestionDockCoordinator` 承接。

## 公开接口

```typescript
export interface QuestionDockSlotCoordinatorHost {
  shouldUseAboveInputQuestionDock(): boolean;
}

export class QuestionDockSlotCoordinator {
  attach(parentEl: HTMLElement): void;
  render(): void;
  destroy(): void;
  getQuestionDock(): Pick<QuestionDock, 'render'> | null;
  shouldUseAboveInputQuestionDock(): boolean;
}
```

## 关键行为

- `attach()` 会先清理旧实例，再创建专属 slot / dock，并立即触发一次 render，避免 `OpenCodianView` 在输入区构建时继续手动写 mount + render 三连
- `render()` 只在 dock 已挂载时触发上游 render callback，把 locale refresh、tab activation 与 question UI refresh 的 render trigger 统一集中
- `destroy()` 同时清理 `QuestionDock` 自身根节点与外层 slot，保证 view close 后不会残留空挂载点

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 现在不再直接保存 `questionDockMountEl` / `questionDock` 字段，也不再单独维护 `renderQuestionDock()`
- `QuestionRuntimeHostAdapter` 仍消费 `getQuestionDock()` / `shouldUseAboveInputQuestionDock()` 这类 host 能力，但这些能力现在通常由本 coordinator 代持
- `QuestionDockCoordinator` 继续负责 question dock 的 runtime/business orchestration，本模块只负责 UI slot ownership
