# ConversationSessionTabResolver

> **源码**: `src/features/chat/services/ConversationSessionTabResolver.ts`
> **状态**: [REVIEW]

## 概述

`ConversationSessionTabResolver` 把 session signal 共享的 **session→tab 匹配** 与 **active-tab fallback** 收束到一个独立模块，专门负责：

- 读取当前 tab / conversation lookup seam，并按 `openCodeSessionId` 找到所有匹配 tab
- 当没有现成 tab 命中、但当前活动 conversation 仍指向同一 session 时，回退到 active tab
- 让 `ConversationSyncEventAdapter` 与 `ConversationSessionLiveSignalAdapter` 复用同一份匹配规则，而不是各自维护平行实现

它不负责 session signal 的订阅生命周期，也不负责 sync 调度或 todo/status 写回；这些行为仍分别由上层 adapter 持有。

## 公开接口

```typescript
export interface ConversationSessionTabResolverHost {
  getAllTabs(): readonly TabData[];
  getConversations(): readonly Conversation[];
  getCurrentConversation(): Conversation | null;
  getActiveTabId(): TabId | null;
}

export interface ConversationSessionTabResolutionPort {
  resolveMatchedTabIds(sessionId: string): TabId[];
}

export class ConversationSessionTabResolver {
  constructor(host: ConversationSessionTabResolverHost);
  resolveMatchedTabIds(sessionId: string): TabId[];
}
```

## 边界

- `ConversationSyncEventLiveSignalHostAdapter` 继续提供共享 lookup seam
- `ConversationSessionSignalRuntime` 负责创建并共享同一份 `ConversationSessionTabResolver`
- `ConversationSessionTabResolver` 负责把 lookup seam 解释成 “这个 session 当前对应哪些 tab”
- `ConversationSyncEventAdapter` 继续专注于 sync-event subscription 与调度
- `ConversationSessionLiveSignalAdapter` 继续专注于 live-signal subscription、runtime writeback 与 background-task reconcile
