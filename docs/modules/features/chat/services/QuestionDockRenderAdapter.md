# QuestionDockRenderAdapter

> **源码**: `src/features/chat/services/QuestionDockRenderAdapter.ts`
> **状态**: [REVIEW]

## 概述

`QuestionDockRenderAdapter` 是上方 question dock 的渲染适配 helper，负责把 `QuestionDockRenderStateFacade` 解析出的 active request/runtime 组装成 `QuestionDock` 需要的 render state 与 callbacks。它把 dock callback composition 从 coordinator 中拆出，让 coordinator 更专注于 dock callbacks 与 resolve orchestration。

## 公开接口

```typescript
export interface QuestionDockRenderActions {
  rerender(): void;
  submit(): void;
  reject(): void;
}

export interface QuestionDockRenderPayload {
  state: QuestionDockRenderState;
  callbacks: QuestionDockCallbacks;
}

export function createEmptyQuestionDockRenderPayload(...): QuestionDockRenderPayload;
export function createQuestionDockRenderPayload(...): QuestionDockRenderPayload;
```

## 关键行为

- `createQuestionDockRenderPayload()` 会复用 `QuestionDockInteractionState` 推导 active group/index 与规范化草稿答案，再输出 `QuestionDock` 所需的 render state
- dock callback 中的 draft answer sanitize、group/question 选择写回继续交给 `QuestionDockInteractionState`，但重绘/submit/reject 的控制流改由调用方通过 `QuestionDockRenderActions` 注入
- `createEmptyQuestionDockRenderPayload()` 统一提供空 dock 所需的 render state 与 inert callbacks，避免 coordinator 重复维护一组 no-op 回调

## 与其他模块的边界

- 上游通常由 `QuestionDockCoordinator` 调用；coordinator 先消费 `QuestionDockRenderStateFacade` 解析出的 active/empty render-state，再把 active request/runtime 交给本 adapter，并在提交/拒绝后执行 resolve follow-up
- 下游依赖 `QuestionDockInteractionState` 维护 runtime map，但不直接触碰 waiter queue、pending refresh suppression、resolved state 或 API 调用
- 本模块不负责真实 DOM 渲染；最终仍由 `QuestionDock.render()` 消费这里产出的 state/callbacks
