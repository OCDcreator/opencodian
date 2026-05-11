# PersistentAssistantNoticeService

> **源码**: `src/features/chat/services/PersistentAssistantNoticeService.ts`
> **状态**: [REVIEW]

## 概述

`PersistentAssistantNoticeService` 把 `OpenCodianView` 里“把 assistant notice 追加进 conversation 并同步可见/隐藏 tab 后续动作”的共享逻辑独立出来，专门负责：

- 用统一的 `displayStyle: 'notice'` 结构构造持久化 assistant notice message
- 按 `title + content + tone` 扫描 conversation 历史，供 session todo / background task stale / completion notice 做 persisted dedupe
- 在当前可见会话里先渲染 notice，再写入 conversation、更新 sync fingerprint，并触发 hydration/scroll 后续动作
- 在隐藏 tab 会话里只做持久化与 fingerprint 写回，再标记 tab attention

它不决定 notice 何时出现，也不生成 session todo / background task 的 fingerprint 与文案；这些规则仍分别由 `SessionTodoStateService` 与 `BackgroundTaskNoticeStateService` 持有。

## 公开接口

```typescript
export interface PersistentAssistantNoticeServiceHost {
  getCurrentConversation(): Conversation | null;
  getActiveTabId(): TabId | null;
  getConversationSyncRuntime(): TabConversationSyncFingerprintRuntimePort;
  renderAssistantMessage(message: ChatMessage): Promise<void>;
  saveConversation(conversation: Conversation): Promise<void>;
  handleVisibleNoticeMessageAppended(): void;
  setTabNeedsAttention(tabId: TabId | null, needsAttention: boolean): void;
}

export class PersistentAssistantNoticeService {
  hasMatchingMessage(...): boolean;
  appendMessage(...): Promise<void>;
}
```

## 关键行为

### persisted dedupe

- `hasMatchingMessage()` 只检查 assistant notice message，不会把普通 assistant turn 或 inline notice 误当成 persisted dedupe 命中
- dedupe key 保持为 `title + content + tone`，与 session todo stale notice、background-task stale notice 的既有持久化规则一致

### visible / hidden append 路由

- `appendMessage()` 对当前可见会话会先调用 host render，再把 notice 真正 push 进 conversation 并保存，保持现有 UI 出现顺序
- 保存后统一通过 `TabConversationSyncFingerprintRuntimePort` 写回 conversation sync fingerprint；可见会话走 hydration pending-layout / settled-scroll follow-up，隐藏 tab 走 attention 标记
- `noticeActions` 与 `noticeMeta` 会原样透传，供 model-unavailable notice 与 background-task completion notice 继续复用

## 与 `OpenCodianView` 的边界

- `SessionTodoStateService` 与 `BackgroundTaskNoticeStateService` 仍负责各自 notice 的状态机、文案和 dedupe 时机
- `OpenCodianView` 只提供 assistant-message render/save/tab-runtime host bridge，并把 fingerprint 计算与 tab writeback seam 作为 `TabConversationSyncFingerprintRuntimePort` 直接交给本服务；该 port 类型与 question/todo/background-task runtime bundle 共用，避免保留额外 pass-through provider
- 这让 P2 `question / todo / background task` lane 继续把 session todo 与 background task 共用的 persisted-notice ownership 从主 view 迁到 dedicated service
