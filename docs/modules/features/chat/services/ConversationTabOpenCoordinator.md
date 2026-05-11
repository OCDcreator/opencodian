# ConversationTabOpenCoordinator

> **源码**: `src/features/chat/services/ConversationTabOpenCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`ConversationTabOpenCoordinator` 把 `OpenCodianView` 里“新建会话”入口的 **new-tab / current-tab open-or-reuse 决策** 收束成独立 coordinator。

它不负责真正的 active-conversation 写回，也不直接管理消息区 shell；这些继续交给 `ConversationViewStateService` 和 `runtime/TabConversationActivationBridge.ts`。这个模块只承接：

- 是否还能创建新 tab
- 当前 tab 是否因 streaming 而禁止替换
- 创建 conversation 后应走 `activateTab()` 还是 `openConversationInCurrentTab()`
- 成功 / 阻塞 / 错误 notice 的统一决策

## 公开接口

```typescript
export interface ConversationTabOpenHost {
  getTabManager(): ConversationTabOpenTabManager | null;
  getMaxTabs(): number;
  isActiveTabStreaming(): boolean;
  createConversation(): Promise<Conversation>;
  createConversationFromSession(
    sessionId: string,
    initial?: Pick<Conversation, 'title'>,
  ): Promise<Conversation>;
  deleteConversation(conversationId: string): Promise<void>;
  showNotice(message: string): void;
}

export interface ConversationTabOpenPort {
  activateTab(tabId: TabId): Promise<void>;
  openConversationInCurrentTab(conversation: Conversation): void;
  syncActiveTabConversation(conversation: Conversation): void;
  loadConversation(id: string, options?: { forceServerSync?: boolean }): Promise<void>;
}

export class ConversationTabOpenCoordinator {
  createConversationInNewTab(): Promise<void>;
  createConversationInCurrentTab(): Promise<void>;
  buildTaskToolSessionTitle(sessionId: string, toolCall?: Pick<ToolCallInfo, 'input'> | null): string;
  openTaskToolSession(sessionId: string, toolCall?: Pick<ToolCallInfo, 'input'> | null): Promise<void>;
}
```

## 关键行为

- `createConversationInNewTab()` 先检查 `TabManager.canCreateTab()`，超限时统一走 `chat.tab.maxReached` notice
- new-tab 路径创建 conversation 后，继续复用 `ConversationViewStateService.activateTab()` 完成 tab 激活
- `createConversationInCurrentTab()` 先检查前台 tab 是否仍在 streaming；忙碌时统一走 `chat.tab.newBlockedWhileStreaming`
- current-tab 路径创建 conversation 后，继续复用 `TabConversationActivationBridge.openConversation()` 完成 active-pane shell reset 和 activation outcome
- 两条入口共享同一套错误消息归一化与 success notice 决策
- `buildTaskToolSessionTitle()` 从 tool call input 提取 description / subagent_type 生成子会话标题，优先 description，其次 subagent_type，最后回退 sessionId
- `openTaskToolSession()` 承接 assistant shell 和 child session tree 的 "Open" 按钮入口：先检查 max-tabs，再通过 `createConversationFromSession()` 创建 conversation，有 tabManager 时用当前 active tab 作为 `parentTabId` 创建 child tab 并 activate，无 tabManager 时回退到 `syncActiveTabConversation()` + `loadConversation()`；创建失败时统一显示 notice

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 现在只保留“新建会话”按钮、命令和其它调用点的 wrapper，并提供 host/port 装配
- `ConversationTabOpenCoordinator` 统一承接 new-tab / current-tab 的 open/reuse/notice 决策，不再让 view 自己内联判断 max-tabs、streaming block 和 error notice
- 这次切口继续推进 master plan 的 P1 `tab / pane / conversation activation 与 sync orchestration` lane：把会话打开入口的分支决策从主集成点迁到 dedicated coordinator
