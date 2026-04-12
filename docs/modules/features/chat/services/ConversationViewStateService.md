# ConversationViewStateService

> **源码**: `src/features/chat/services/ConversationViewStateService.ts`
> **状态**: [REVIEW]

## 概述

`ConversationViewStateService` 负责 `OpenCodianView` 里一条最难读的装载主链路：tab 初始化、persisted tab restore、tab 激活，以及 conversation hydration 装载编排。

它不接管聊天视图的 DOM 所有权，也不直接依赖插件实例；而是通过 `ConversationViewStateHost` 回调向 `OpenCodianView` 请求：

- conversation / tab 数据访问
- tab/pane activation 分支所需的 render host 回调
- active-tab conversation/session 写回（现在经由 `runtime/TabConversationStateBridge.ts`）
- 消息重渲

loaded-conversation 切换前的 cleanup 与 hydration preflight shell，现在通过 `runtime/ConversationTransitionBridge.ts` 单独承接；其中消息容器的 rehydrating class / scroll-restore shell，则继续通过 `runtime/ConversationHydrationRenderBridge.ts` 提供底层 scroll/class bridge，而 conversation resolve / server-sync 判定则进一步交给 `runtime/ConversationLoadRuntimeBridge.ts`。

## 公开接口

```typescript
export interface LoadConversationOptions {
  forceServerSync?: boolean;
  preserveScrollPosition?: boolean;
}

export interface ConversationViewStateHost {
  // 省略若干 host 回调
}

export class ConversationViewStateService {
  initializeFirstTab(): Promise<void>;
  restorePersistedTabs(): string | null;
  activateTab(tabId: string): Promise<void>;
  loadConversation(id: string, options?: LoadConversationOptions): Promise<void>;
}
```

## 关键行为

### 初始 tab 装载

- 先 `loadConversations()`
- 再尝试 restore persisted tabs
- restore 失败时重置持久化 tab state 并立即 flush
- 如果没有 persisted tab，则复用首个已有 conversation；仍然没有时才新建 conversation

### tab 激活编排

- tab 激活入口现在先委托 `runtime/TabViewActivationBridge.ts` 统一处理 pane 切换、focus preview、question dock 和 todo dock 预刷新
- streaming tab 走快速路径，不触发完整 conversation reload
- 普通 conversation tab 统一转入 `loadConversation(..., { preserveScrollPosition: true })`
- streaming / empty-tab 分支的后续 dock / selector / context identity / send button 刷新顺序，以及 loaded conversation 的 post-render background-task indicator / dock/status/question/todo outcome 和 hydration 尾段的 composer/model/context usage 写回，也通过 `TabViewActivationBridge` 统一编排

### conversation hydration

- 切换前先通过 `ConversationTransitionBridge` 处理旧 conversation 的标题生成与背景任务指示器清理
- loaded conversation 的 resolve / reload retry 与是否触发 `load-conversation` server sync，现在先委托给 `ConversationLoadRuntimeBridge`
- 装载时仍保留 hydration lifecycle 的 `finally` 保护，但 begin/end shell 已通过 `ConversationTransitionBridge` 收束
- scroll restore 的 snapshot / restore 与 `is-rehydrating` class shell 现在通过 `ConversationHydrationRenderBridge` 复用 `ScrollManager`，保持 bottom / anchor / distance 语义
- loaded conversation 的 `currentConversation` / active-tab conversation / session reset 写回现在先委托给 `TabConversationStateBridge`
- loaded conversation 在消息重渲后的 background-task indicator、todo dock、question dock、status / pending question / session todo refresh，现在先转交给 `TabViewActivationBridge`
- hydrate 尾段的 composer layout、model selector 与 context usage snapshot 刷新同样转交给 `TabViewActivationBridge`

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 仍保留真实 UI render、插件服务装配、tab runtime 状态、scroll metrics 和后台同步实现
- `ConversationViewStateService` 只负责决定“何时 restore / 激活 / hydrate / 刷新”，不再逐项写入 active-tab conversation/session state，也不再直接触发 pane activation 预刷新、loaded-conversation 的 conversation resolve / server-sync 判定、preflight cleanup / hydration shell、post-render background-task indicator / dock/status/question/todo outcome、streaming/empty activation outcome UI 回调，或 hydration 尾段的 composer/model/context usage 写回
- 这样后续继续拆 model selector 或消息区重渲时，可以沿着更清晰的 host 边界继续推进，而不必再把装载主链路塞回 view
