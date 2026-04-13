# TabConversationSyncFingerprintPortProvider

> **源码**: `src/features/chat/services/TabConversationSyncFingerprintPortProvider.ts`
> **状态**: [REVIEW]

## 概述

`TabConversationSyncFingerprintPortProvider` 是一层很薄的 runtime port regrouping seam。它把 `OpenCodianView` 里分散的 conversation-sync fingerprint 计算与 tab-scoped fingerprint 回写能力，收束成一份可复用的 grouped port，供多个聊天 runtime consumer 共享：

- `PersistentAssistantNoticeService` 复用同一份 fingerprint 计算 + tab writeback seam
- `QuestionTodoBackgroundTaskRuntimeServiceBundle` 复用同一份 tab-scoped fingerprint writeback seam
- `OpenCodianView` 不再在多个 host factory 里重复维护 `getTabRuntimeState()` + `lastConversationSyncFingerprint` 的内联回写逻辑

它不负责 sync loop、activation orchestration 或 server pull；这些职责仍保留在 `ConversationSyncBridge`、`TabActivationConversationSyncPortProvider` 与既有 sync/runtime 协调层。

## 公开接口

```typescript
export interface TabConversationSyncFingerprintRuntimePort {
  getConversationSyncFingerprint(messages: ChatMessage[]): string;
  setTabConversationSyncFingerprint(tabId: TabId | null, fingerprint: string): void;
}

export interface TabConversationSyncFingerprintPortProviderHost {
  getConversationSyncFingerprint(messages: ChatMessage[]): string;
  setTabConversationSyncFingerprint(tabId: TabId | null, fingerprint: string): void;
}

export function createTabConversationSyncFingerprintRuntimePort(
  host: TabConversationSyncFingerprintPortProviderHost,
): TabConversationSyncFingerprintRuntimePort;
```

## 边界

- `TabConversationSyncFingerprintPortProvider` 只负责 regrouping，不新增业务逻辑
- `PersistentAssistantNoticeService` 继续掌管 notice append/dedupe/visible-vs-hidden follow-up
- `QuestionTodoBackgroundTaskRuntimeServiceBundle` 继续消费这份 fingerprint runtime port 组装 P2 shared view host
