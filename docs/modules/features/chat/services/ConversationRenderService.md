# ConversationRenderService

> **源码**: `src/features/chat/services/ConversationRenderService.ts`
> **状态**: [REVIEW]

## 概述

`ConversationRenderService` 负责把 `OpenCodianView` 里最密集的一段消息区重渲编排抽成独立 service：

- conversation 全量重渲
- synced message 的 append-only 增量渲染
- 尾部 assistant render patch
- 无法安全增量时回退 full rerender

它不持有聊天视图的 DOM 根状态，也不直接依赖插件实例；所有真实渲染、scroll runtime、background-task UI 和调试日志都通过 `ConversationRenderHost` 回调回到 `OpenCodianView`。

## 公开接口

```typescript
export interface IncrementalRenderedMessageUpdate {
  appendedRenderedMessages: ChatMessage[];
  patchTrailingAssistant: boolean;
}

export function getIncrementalRenderedMessageUpdate(
  options: IncrementalRenderedMessageUpdateOptions,
): IncrementalRenderedMessageUpdate | null;

export class ConversationRenderService {
  rerenderConversationMessages(conversation: Conversation): Promise<void>;
  applySyncedConversationUpdate(
    previousMessages: ChatMessage[],
    nextMessages: ChatMessage[],
  ): Promise<void>;
  patchTrailingAssistantRender(
    previousMessages: ChatMessage[],
    nextMessages: ChatMessage[],
    tabId?: TabId | null,
  ): Promise<boolean>;
}
```

## 关键行为

### 全量重渲

- 只在当前活动 conversation 仍匹配、且消息容器存在时执行
- 进入 hydration 前先抓取 scroll snapshot，并复用 `ScrollManager` 恢复 bottom / distance / anchor 语义
- 重渲后继续刷新 background-task indicator、pane metrics 和 composer layout

### 增量同步

- `getIncrementalRenderedMessageUpdate()` 先判断是否还能沿用现有 rendered message 前缀
- append-only 时只渲染新增消息，不重跑整段历史
- 纯文本 assistant append 继续走 pseudo-stream reveal，而不是直接静态落盘

### 尾部 assistant patch

- 只有“rendered message 数量不变、非尾部 visual signature 完全一致、尾部仍是普通 assistant”时才允许 patch
- 仅时间戳等 metadata 变化时复用已有正文，只刷新 timestamp row
- 缺失尾部 DOM、内容节点或前缀签名失配时，立即返回 `false` 让上层回退到 full rerender

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 仍保留 `renderMessage()`、`renderMessages()`、`renderAssistantMessageContent()`、pseudo-stream reveal 和 tab runtime 所有权
- `ConversationRenderService` 只负责决定“何时整段重渲、何时 patch 尾部、何时仅追加”
- 这样消息区编排逻辑首次拥有独立单测边界，而不用把 assistant renderer 一起打散
