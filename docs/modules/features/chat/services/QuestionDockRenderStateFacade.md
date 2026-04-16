# QuestionDockRenderStateFacade

> **源码**: `src/features/chat/services/QuestionDockRenderStateFacade.ts`
> **状态**: [REVIEW]

## 概述

`QuestionDockRenderStateFacade` 把上方 question dock 的 **render-state 选择** 从 `QuestionDockCoordinator` 中收束出来，专门负责：

- 判断当前设置是否启用 above-input dock
- 读取 active tab 的首个 pending question request
- 比对 active request 的 `sessionId` 与当前 conversation session
- 为 coordinator 返回 `active` / `empty` / `skip` 三种稳定 render-state 结果

它不负责真正的 `QuestionDock` DOM 渲染、render payload callbacks 组装、pending-question refresh、dock queue runtime map 维护、提交/拒绝回答，或 resolve 后的状态收尾；这些仍分别由 `QuestionDock`、`QuestionDockRenderAdapter`、`QuestionDockCoordinator`、`QuestionDockResolutionActionFacade`、`QuestionResolutionExecutionFacade` 与 `QuestionPostResolutionRuntimeFacade` 负责。

## 公开接口

```typescript
export interface QuestionDockRenderStateFacadeHost {
  getActiveTabId(): TabId | null;
  getCurrentConversationSessionId(): string | null | undefined;
  getQuestionDisplayMode(): QuestionDisplayMode;
  shouldUseAboveInputQuestionDock(): boolean;
  getTabRuntimeState(tabId: TabId | null): QuestionDockRenderStateRuntimeState | null;
}

export class QuestionDockRenderStateFacade {
  getActivePendingQuestionRequest(tabId?: TabId | null): QuestionRequest | null;
  resolveRenderState(): QuestionDockResolvedRenderState;
}
```

## 关键行为

- `resolveRenderState()` 会先捕获当前 display mode，确保 disabled / no active tab / no active request / session mismatch 时回退空 dock 仍使用同一份显示模式
- active request 只取目标 tab 的 `pendingQuestionRequests[0]`，保持上方 dock 与原先 coordinator render 入口相同的队列选择语义
- request session 与当前 conversation session 不一致时返回 `empty`，避免把后台 tab 或过期会话的 pending question 渲染到当前 dock
- 如果 active request 选择后 runtime 再次读取失败，则返回 `skip`，让 coordinator 保持原有“不覆盖当前 dock”的竞态保护

## 与 `OpenCodianView` 的边界

- `QuestionRuntimeHostAdapter` 负责从共享 `QuestionRuntimeViewHost` 派生本 facade 所需的 active tab、current session、display mode、dock position 与 runtime state host
- `QuestionDockCoordinator` 拥有 pending-question lifecycle，但只消费本 facade 产出的 render-state 结果，再把 active state 转交 `QuestionDockRenderAdapter` 组装 payload
- `OpenCodianView` 不再需要通过 coordinator 间接持有 session-match dock render gating；它只继续提供 runtime/session/settings 的 host port
