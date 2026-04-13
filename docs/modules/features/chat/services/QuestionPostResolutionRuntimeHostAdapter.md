# QuestionPostResolutionRuntimeHostAdapter

> **源码**: `src/features/chat/services/QuestionPostResolutionRuntimeHostAdapter.ts`
> **状态**: [REVIEW]

## 概述

`QuestionPostResolutionRuntimeHostAdapter` 负责把 question resolve 之后需要的 **session-status refresh** 与 **conversation sync follow-up** 组装成 `QuestionPostResolutionRuntimeFacade` 可消费的独立 host。

这次切片把这组后处理端口从通用 `QuestionRuntimeViewHost` / `QuestionRuntimeViewHostFactory` 中拆出来，让 question runtime 的通用 host 只保留 dock、settings、question API 与 tab-attention wiring，而把 resolve 成功后的运行时收尾固定到单独 adapter。

## 公开接口

```typescript
export interface QuestionPostResolutionRuntimeViewHost {
  getActiveTabId(): TabId | null;
  getTabRuntimeState(tabId: TabId | null): { isStreaming: boolean } | null;
  getSessionIdForTab(tabId: TabId | null): string | null | undefined;
}

export function createQuestionPostResolutionRuntimeHostAdapter(
  dependencies: QuestionPostResolutionRuntimeHostAdapterDependencies,
): QuestionPostResolutionRuntimeFacadeHost;
```

## 关键行为

- 透传 active tab、tab runtime state 与 tab session id，供 `QuestionPostResolutionRuntimeFacade` 判断 follow-up 是否继续执行
- 复用 `SessionTodoCoordinator.refreshTabSessionStatus()` 作为 question resolve 之后的状态刷新端口
- 复用 `ConversationSyncBridge.startConversationSyncLoop()` / `syncVisibleConversationInBackground()` 作为 question resolve 之后的 sync follow-up 端口
- 让 `OpenCodianView` 在 question runtime 装配时显式区分“通用 question host”和“post-resolution follow-up host”，减少单一 host 的职责堆叠

## 与其它模块的边界

- `QuestionRuntimeViewHostFactory` / `QuestionRuntimeViewHostAdapter` 继续负责通用 question runtime host，本模块不接管 dock、settings、question API 或 tab-attention
- `QuestionRuntimeHostAdapter` 只消费本模块产出的 `QuestionPostResolutionRuntimeFacadeHost`，并把它接入 question runtime bundle
- `QuestionPostResolutionRuntimeFacade` 继续负责真正的 follow-up 编排，本模块只负责准备它所需的 host
