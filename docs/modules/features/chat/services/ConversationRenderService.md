# ConversationRenderService

> **源码**: `src/features/chat/services/ConversationRenderService.ts`
> **状态**: [REVIEW]

## 概述

`ConversationRenderService` 负责把 `OpenCodianView` 里最密集的一段消息区重渲编排抽成独立 service：

- conversation 全量重渲
- synced message 的 append-only 增量渲染
- 尾部 assistant render patch
- 无法安全增量时回退 full rerender

它不持有聊天视图的 DOM 根状态，也不直接依赖插件实例；所有真实渲染、scroll runtime、background-task UI 和调试日志都通过 `ConversationRenderHost` 回调回到 `OpenCodianView`。其中 assistant tail 相关的正文签名、正文重渲与 persisted footer 收尾，进一步收束在嵌套的 `ConversationAssistantTailRenderPort`。

## 公开接口

```typescript
export interface IncrementalRenderedMessageUpdate {
  appendedRenderedMessages: ChatMessage[];
  patchTrailingAssistant: boolean;
}

export function getIncrementalRenderedMessageUpdate(
  options: IncrementalRenderedMessageUpdateOptions,
): IncrementalRenderedMessageUpdate | null;

export interface ConversationAssistantTailRenderPort {
  getBodySignature(message: ChatMessage): string;
  renderMessageContent(
    messageEl: HTMLElement,
    contentEl: HTMLElement,
    message: ChatMessage,
  ): Promise<void>;
  finalizePersistedFooter(messageEl: HTMLElement, message: ChatMessage): void;
}

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
- patch 前的 `missing-container-or-inactive-tab` tab/container 预检、rendered message 收集与数量校验、non-tail signature mismatch 判定与失败 payload 组装，以及尾部 DOM 目标解析，先由更细的独立 helper 收口，再进入真正的 patch 执行
- preflight 里 `tail-message-not-mergeable-assistant` 的 tail summary payload 组装也已抽到独立 helper，让 preflight 更贴近“判定失败原因 + 返回结果”的骨架
- patch 执行期间对 render runtime 的 `currentTurnBodyEl` 暂时切换与恢复，也由独立 scope helper 收口，避免主流程继续承载 DOM 上下文细节
- 真正执行 patch 时，assistant 正文签名比较与“只 finalize footer / 重渲正文 content”分支也由独立 helper 收口
- patch 成功后的 completion debug payload 组装也已抽到独立 helper，让主流程只保留“记录完成日志”这一层 orchestration
- patch skipped 分支里的 debug payload 组装同样已抽到独立 helper，主流程不再内联拼接 reason、rendered count 与附加 tail summary
- assistant 正文签名不变时复用已有正文，只重做 persisted footer 收尾
- patch 成功后的 message dataset 刷新、动画禁用与按需 scroll-to-bottom，也由更窄的 tail-apply helper 收口
- assistant 正文签名计算、正文重渲和 footer finalization 现在统一通过 `host.assistantTailRender` 这组更小的 port 完成
- 缺失尾部 DOM、内容节点或前缀签名失配时，立即返回 `false` 让上层回退到 full rerender

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 仍保留 `renderMessage()`、`renderMessages()`、`renderAssistantMessageContent()`、pseudo-stream reveal 和 tab runtime 所有权
- `OpenCodianView` 会先组装 `ConversationAssistantTailRenderPort`，再把它作为 `ConversationRenderHost` 的 assistant-tail 子边界传给 service
- `ConversationRenderService` 只负责决定“何时整段重渲、何时 patch 尾部、何时仅追加”
- 这样消息区编排逻辑首次拥有独立单测边界，而不用把 assistant renderer 一起打散
