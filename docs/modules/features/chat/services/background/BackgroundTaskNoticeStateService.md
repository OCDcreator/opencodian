# BackgroundTaskNoticeStateService

> **源码**: `src/features/chat/services/background/BackgroundTaskNoticeStateService.ts`
> **状态**: [REVIEW]

## 概述

`BackgroundTaskNoticeStateService` 把 `OpenCodianView` 里 background task notice 的状态机独立出来，专门负责：

- 构造 stopped/stale warning notice 的稳定 fingerprint/content
- 协调每个 tab 的 `backgroundTaskSuppressedFingerprint` 与 `backgroundTaskStaleNoticeFingerprint`
- 在 reload / hydration 后根据已持久化 notice 恢复 suppression
- 在当前前台会话仍匹配时去重并追加持久化 stopped/stale notice
- 维护 completion notice 的 queued state、fingerprint/content、streaming 后延迟 flush 与 persisted dedupe

它不负责 background task timeline 推导、inline panel 渲染，也不接管 `BackgroundTaskTimelineService` / `BackgroundTaskInlinePanelRenderer` / `BackgroundTaskIndicatorCoordinator` / `OpenCodianView` 的 sync / hydration 时机判断。

## 公开接口

```typescript
export interface BackgroundTaskNoticeStateServiceHost {
  getTabRuntimeState(tabId: TabId | null): BackgroundTaskNoticeStateRuntime | null;
  getActiveTabId(): TabId | null;
  getSessionIdForTab(tabId: TabId | null): string | null;
  getCurrentConversation(): Conversation | null;
  hasMatchingPersistentAssistantNoticeMessage(...): boolean;
  appendPersistentAssistantNoticeMessage(...): Promise<void>;
}

export class BackgroundTaskNoticeStateService {
  buildStoppedNoticeContent(...): string;
  isPendingLaunchSetSuppressed(...): boolean;
  handleStoppedPendingLaunches(...): Promise<void>;
  queueNotices(...): void;
  flushQueuedNotices(...): Promise<void>;
}
```

## 关键行为

### stopped/stale notice fingerprint

- `buildStoppedNoticeContent()` 先按显示 ID + description 排序，再生成统一 markdown；同一组 pending task 会得到稳定 fingerprint
- 这里的 fingerprint 继续直接复用 notice content，这样 persisted dedupe 与 runtime suppression 可以共享同一份键
- **Backend-aware session identity**: 在匹配当前 tab 的 session id 与 conversation 时，使用 `getConversationBackendSessionId()` 而不是直接比较 `conversation.openCodeSessionId`，以兼容非 OpenCode backend。

### suppression 恢复与去重

- `isPendingLaunchSetSuppressed()` 先检查 runtime fingerprint；若未命中，再检查 conversation 历史里是否已有同一条 warning notice
- 命中持久化 notice 时，服务会把 suppression 状态恢复回当前 tab runtime，避免 reload 后重复渲染 inline stale 段或重复写 notice
- `handleStoppedPendingLaunches()` 仍保留原来的“先写 suppression，再决定是否真的追加 notice”顺序，因此后台 tab 也会先隐藏已判定为 stopped 的 segment；真正的 persisted append 现由 `PersistentAssistantNoticeService` 执行

### completion notice queue / flush

2026-11-09：DSH native job terminal events 复用同一 completion queue。`sourceReminderIds` 使用稳定 session+job identity，重建 owner/加载持久化 conversation 后仍去重；其 nativeStatus 区分 completed/failed/killed，文案使用 `chat.dsh.jobs.*`。事件携带的本地 `isCurrent` 不持久化，flush 与 PersistentAssistantNoticeService 保存前后都检查旧 client-generation/conversation lease。原生 job 完成不发送模型消息，也不改 foreground session.status。

flush 按 conversation 串行，保存中的 queued snapshot 与可继续接收新事件的 live queue 分开；只移除已处理事件，保留 await 期间新增的 job。并发 tab/重复事件按 source fingerprint 去重。保存失败保留队列重试；streaming 期间不落盘，保存中重新 streaming 时不确认完成。失效代际队列丢弃，等待新连接的权威列表重建。

- `queueNotices()` 以 `conversationId + anchorKey` 为粒度合并 completion reminder，把多个 source reminder 和 task 列表折叠进同一个 queued notice；tab runtime 被复用时不把原会话的队列写入新会话。
- queued state 继续挂在 service 内部的 runtime-keyed `WeakMap` 上，不重新放回 `OpenCodianView` 或 `TabRuntimeState`
- `flushQueuedNotices()` 只在 tab 不再 streaming 时落盘，保持 primary stream 期间不插入额外 notice 的既有顺序
- flush 可携带 `isCurrent` lease，在每个 notice await 前后校验，避免旧 conversation 的 notice 落入新 tab。
- completion persisted dedupe 同时检查 source reminder id 与 `anchorKey + allComplete + sorted taskIds` fingerprint，避免 reload / repeated queue pass 重复写 notice

## 与 `OpenCodianView` 的边界

- `BackgroundTaskTimelineService` 负责 background task 的 launch/completion timeline 推导
- `BackgroundTaskInlinePanelRenderer` 负责 inline panel DOM 渲染
- `BackgroundTaskIndicatorCoordinator` 负责 completion notice queue/flush 触发顺序
- `PersistentAssistantNoticeService` 负责 persisted notice 的落盘与可见/隐藏 tab 后续动作；本服务负责 stale 与 completion notice 的 content/fingerprint/dedupe 时机
- `BackgroundTaskLiveSignalCoordinator` 现在会直接在 stale settle 路径里调用本服务，不再经由 `OpenCodianView` 转发 `appendBackgroundTaskStoppedNotice()`
- `OpenCodianView` 负责 hydration gate 与其余上层 host bridge
- `BackgroundTaskNoticeStateService` 同时负责 stopped/stale notice 与 completion notice 的 content、fingerprint、persisted dedupe 和 per-runtime queue/suppression state 协调
- 这样 P2 `question / todo / background task` lane 可以继续从 view 迁出更清晰的 background-task ownership，而不是把 notice 细节继续留在主视图里

## 目录定位（2026-10-23）

- 源码位置：`src/features/chat/services/background/BackgroundTaskNoticeStateService.ts`。
- 原位置：`src/features/chat/services/BackgroundTaskNoticeStateService.ts`；文件名、导出接口与业务职责保持不变。
