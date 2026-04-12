# QuestionRuntimeHostAdapter

> **源码**: `src/features/chat/services/QuestionRuntimeHostAdapter.ts`
> **状态**: [REVIEW]

## 概述

`QuestionRuntimeHostAdapter` 把 `OpenCodianView` 里原本分散的 question runtime host factory 与 service instantiation 收束到一个模块，专门负责：

- 从单一 `QuestionRuntimeViewHost` 派生 `QuestionInlineCardRenderer`、`QuestionResolutionCoordinator`、`QuestionDockCoordinator` 与 `QuestionPostResolutionRuntimeFacade` 所需的 host 回调
- 顺序装配 inline question card、resolved-question runtime、上方 question dock、post-resolution runtime facade，以及 `QuestionResolutionFlowCoordinator` 五个协作模块，避免 view 继续维护多段 `create*Host()` 和散落的 resolve flow instantiation
- 让 `QuestionDockCoordinator` 的 resolved-state callback 直接回连到共享的 `QuestionResolutionCoordinator`，保持 dock resolve 与 inline fallback 共用同一份 question-resolution state bridge
- 让 dock 与 inline resolve 后的 status/sync follow-up 统一经由 `QuestionPostResolutionRuntimeFacade` 执行，而不是继续把这段运行时收尾逻辑散落在多个 coordinator 里

当前这份 `QuestionRuntimeViewHost` 通常先由 `QuestionRuntimeViewHostAdapter` 准备：view 自己只保留较通用的 tab/runtime host，question 专属的 dock/settings/API/status bridge 则在 adapter 里组合；其中 tab attention 与 question resolve 后的 sync follow-up 也优先复用已有 `TabRuntimeStateBridge` / `ConversationSyncBridge` 稳定 port。

它不负责 question request 的服务端数据获取、resolved card DOM 内容拼装，或 question dock 的真正 DOM 渲染；这些仍分别留给 `OpenCodeService`、`QuestionResolutionCardRenderer` 与 `QuestionDock`。

## 公开接口

```typescript
export interface QuestionRuntimeState
  extends QuestionDockCoordinatorRuntimeState,
    QuestionInlineCardRuntimeState,
    QuestionResolutionCoordinatorRuntimeState {}

export interface QuestionRuntimeViewHost {
  getActiveTabId(): TabId | null;
  getTabRuntimeState(tabId: TabId | null): QuestionRuntimeState | null;
  ensureTabRuntimeState(tabId: TabId | null): QuestionRuntimeState | null;
  getCurrentConversationSessionId(): string | null | undefined;
  getSessionIdForTab(tabId: TabId | null): string | null | undefined;
  getQuestionDock(): Pick<QuestionDock, 'render'> | null;
  getQuestionDisplayMode(): QuestionDisplayMode;
  shouldUseAboveInputQuestionDock(): boolean;
  shouldRenderQuestionResolutionCards(): boolean;
  keepQuestionCardPinnedToBottom(tabId: TabId | null): void;
  setTabNeedsAttention(tabId: TabId | null, needsAttention: boolean): void;
  getPendingQuestions(): Promise<QuestionRequest[]>;
  replyToQuestion(requestId: string, answers: string[][]): Promise<void>;
  rejectQuestion(requestId: string): Promise<void>;
  refreshTabSessionStatus(...): Promise<unknown>;
  startConversationSyncLoop(): void;
  syncVisibleConversationInBackground(): Promise<void>;
}

export function createQuestionRuntimeHosts(...): QuestionRuntimeHosts;
export function createQuestionRuntimeServices(...): QuestionRuntimeServices;
```

## 关键行为

- `createQuestionRuntimeHosts()` 从同一份 view host 派生 inline-card、resolution、dock 与 post-resolution runtime 四组 host，避免 `OpenCodianView` 继续为 question 子链维护多段闭包工厂
- `createQuestionRuntimeServices()` 顺序实例化 `QuestionInlineCardRenderer` → `QuestionResolutionCoordinator` → `QuestionPostResolutionRuntimeFacade` → `QuestionDockCoordinator` → `QuestionResolutionFlowCoordinator`，保留原来的协作依赖关系，并把 inline resolve flow 也收束回同一份 runtime bundle
- dock resolve 时的 `applyResolvedQuestionState()` 不再由 view 单独转发，而是通过 adapter 直接映射到共享 `QuestionResolutionCoordinator`
- dock 与 inline resolve 成功后的 runtime follow-up 也不再分别内嵌在 coordinator 中，而是统一走 `QuestionPostResolutionRuntimeFacade.followUpAfterResolution()`
- send pipeline 触发 question request 时，`OpenCodianView` 也不再持有 `showQuestionDialog()`；现在直接经由 bundle 中的 `QuestionResolutionFlowCoordinator`
- `getQuestionDock()` / `shouldUseAboveInputQuestionDock()` 这组 dock host 能力现在通常由 `QuestionDockSlotCoordinator` 代持，因此 adapter 只消费 dock port，不再要求 view 本身继续管理 slot lifecycle
- `shouldRenderQuestionResolutionCards()`、`setTabNeedsAttention()` 与 dock resolve 后的 sync follow-up 现在也通常由 adapter 从 settings / `TabRuntimeStateBridge` / `ConversationSyncBridge` 组合进来，因此 view host 进一步缩窄到 runtime-state / session / scroll pin 读取
- `OpenCodianView` 的 background-task post-sync refresh host 与 tab conversation state bridge 现在也直接经由同一份 question runtime bundle 调用 pending-question refresh / clear，不再额外经过 view forwarding 方法

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 现在只提供一份更窄的 `QuestionRuntimeViewHostAdapterHost`，再由 `QuestionRuntimeViewHostAdapter` 组合成 `QuestionRuntimeViewHost`；dock slot/gate 相关 host 细节则继续委托给 `QuestionDockSlotCoordinator`，attention/sync follow-up 则优先委托给现成 runtime bridge
- `QuestionDockCoordinator` 继续负责 pending-question queue、dock callbacks 与 resolved request cleanup；resolve 后的 runtime follow-up 改由共享 facade 接管
- `QuestionInlineCardRenderer`、`QuestionResolutionCoordinator` 与 `QuestionResolutionFlowCoordinator` 继续分别负责 inline question card、resolved question runtime 与 dock-or-inline resolve orchestration；adapter 只负责共享装配
