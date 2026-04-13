# QuestionRuntimeViewHostAdapter

> **源码**: `src/features/chat/services/QuestionRuntimeViewHostAdapter.ts`
> **状态**: [REVIEW]

## 概述

`QuestionRuntimeViewHostAdapter` 负责把 question runtime 所需的 dock/settings/API/tab-attention 端口组合成 `QuestionRuntimeHostAdapter` 所需的 `QuestionRuntimeViewHost`。

现在这层 adapter 通常由 `QuestionRuntimeViewHostFactory` 喂入：late-bound 的 question runtime 依赖先在 factory 里从 `OpenCodianView` 收口，再交给 adapter 做最终 host 适配。

当前这层 adapter 也会直接复用已有稳定 runtime port：question resolution-card gate 直接读取设置，tab attention 写回直接委托 `TabRuntimeStateBridge`；question resolve 后的 sync/status follow-up 已迁到 `QuestionPostResolutionRuntimeHostAdapter`，因此 view 自己只需要继续暴露更窄的 tab/runtime 读取与 scroll pin 能力。

## 公开接口

```typescript
export interface QuestionRuntimeViewHostAdapterHost {
  getActiveTabId(): TabId | null;
  getTabRuntimeState(tabId: TabId | null): QuestionRuntimeState | null;
  ensureTabRuntimeState(tabId: TabId | null): QuestionRuntimeState | null;
  getCurrentConversationSessionId(): string | null | undefined;
  getSessionIdForTab(tabId: TabId | null): string | null | undefined;
  keepQuestionCardPinnedToBottom(tabId: TabId | null): void;
}

export function createQuestionRuntimeViewHostAdapter(...): QuestionRuntimeViewHost;
```

## 关键行为

- 透传 view 自己拥有的 tab/runtime 能力，例如 active tab、runtime state 与 scroll pin
- 从 `QuestionDockSlotCoordinator` 读取当前 dock instance 与 above-input gate，而不是让 view 重新展开这组桥接
- 从设置读取 `questionDisplayMode` 与 `showAnsweredQuestionCards`，让 resolution-card gate 也不再回到 view
- 从 OpenCode question API 读取 pending question fetch、reply/reject 能力
- 直接复用 `TabRuntimeStateBridge.setNeedsAttention()` 写回 tab attention，而不是让 view 再包一层

## 与其它模块的边界

- `QuestionRuntimeViewHostFactory` 负责把 `OpenCodianView` 的 late-bound question runtime 依赖先收束到一份 shared host，再调用本 adapter
- `QuestionPostResolutionRuntimeHostAdapter` 负责 question resolve 之后的 status refresh / sync follow-up host，本模块不再承接这组后处理端口
- `OpenCodianView` 只提供更窄的 `QuestionRuntimeViewHostFactoryHost` / `QuestionRuntimeViewHostAdapterHost` 能力，不再在构造函数里直接拼 `QuestionRuntimeViewHost`
- `QuestionRuntimeHostAdapter` 继续负责真正的 question runtime bundle 装配；本模块只负责准备它消费的通用 question runtime host
- `QuestionDockSlotCoordinator` 继续拥有 slot lifecycle / render trigger；本模块只消费它暴露的 dock/gate port
