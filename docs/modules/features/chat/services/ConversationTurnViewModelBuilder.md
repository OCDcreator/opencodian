# ConversationTurnViewModelBuilder

> **源码**: `src/features/chat/services/ConversationTurnViewModelBuilder.ts`
> **状态**: [REVIEW]

## 概述

`ConversationTurnViewModelBuilder` 把 OpenCode canonical `session/message/part` graph 组装成 chat render 层可以消费的 turn view-model：

- 以 user message 作为 turn 边界
- 把直到下一个 user message 前的 assistant message 收集到同一个 turn
- 保留每条 message 的 canonical part 列表，不再依赖 loose text chunk 作为渲染事实
- 在 turn 上汇总 assistant error / interrupted 状态，方便 render 层继续沿用现有 footer 与状态样式
- 提供 `buildCanonicalRenderInput()` 作为稳定 canonical render projection seam，一次返回 turn view-model 与兼容的 `ChatMessage[]` 输入

它不直接访问 DOM，也不调用 `OpenCodeService`；具体的 OpenCode message/part 到 `ChatMessage` 映射仍由调用方注入 hydrator，避免 chat service 重新实现 OpenCode normalization。

## 公开接口

```typescript
export interface OpenCodeNormalizedError {
  message: string;
  name?: string;
}

export interface ConversationTurnViewModel {
  userMessageID: string;
  userInfo: OpenCodeCanonicalMessageInfo;
  userParts: OpenCodeCanonicalPart[];
  assistantMessages: OpenCodeCanonicalMessageInfo[];
  assistantPartsByMessageID: Record<string, OpenCodeCanonicalPart[]>;
  interrupted: boolean;
  error: OpenCodeNormalizedError | null;
}

export interface ConversationCanonicalRenderInput {
  turns: ConversationTurnViewModel[];
  messages: ChatMessage[];
}

export type ConversationTurnMessageHydrator = (
  info: OpenCodeCanonicalMessageInfo,
  parts: OpenCodeCanonicalPart[],
) => ChatMessage;

export class ConversationTurnViewModelBuilder {
  buildCanonicalRenderInput(
    sessionState: OpenCodeCanonicalSessionState,
    hydrateMessage: ConversationTurnMessageHydrator,
  ): ConversationCanonicalRenderInput;
  buildTurns(sessionState: OpenCodeCanonicalSessionState): ConversationTurnViewModel[];
  buildRenderMessages(
    turns: ConversationTurnViewModel[],
    hydrateMessage: ConversationTurnMessageHydrator,
  ): ChatMessage[];
}
```

## 关键行为

- `buildTurns()` 只信任 `OpenCodeCanonicalSessionState.messages` 与 `partsByMessageID`，按 canonical message order 从 user message 开始切分 turn
- assistant message 会保留原始 `info` 和 `parts`，因此 tool-first、reasoning-first、text-late delta 后的结构都不会被压平成纯文本
- assistant `error` 会被归一成 `{ name?, message }`；错误名或消息中包含 abort / cancel / interrupt 语义时，turn 会标记为 `interrupted`
- part-level `status` 或 `state.status` 出现 abort / cancel / interrupt 语义时，同样会把 turn 标记为 `interrupted`
- `buildCanonicalRenderInput()` 先生成 turn，再复用同一个 turn 集合 hydrate 出稳定的 canonical render `ChatMessage[]`；这样 live canonical state、reload snapshot 和 authoritative sync projection 共用同一份输入组装逻辑
- `buildCanonicalRenderInput()` 不会因为当前 canonical snapshot 里暂时还没有 user turn 就丢掉 assistant-only message；这保证 stream-error notice replacement、assistant-first reload 和类似早期 cache 场景仍能得到可见 render input
- `buildRenderMessages()` 只负责把 turn 顺序转回现有 `ChatMessage[]`，让 `ConversationRenderService` 可以继续复用 OpenCodian 的 DOM/CSS shell、assistant card、footer 和 markdown renderer

## 与 `ConversationRenderService` 的边界

- builder 是纯数据转换 owner，不决定 append / tail patch / full rerender 策略
- render service 和 authoritative reload coordinator 都会从 canonical graph/raw snapshot 构造 `OpenCodeCanonicalSessionState`，再调用 builder 生成同一份 canonical render input
- OpenCode-specific hydration 由 render service 注入，仍复用 `OpenCodeService.hydrateOpenCodeMessage()` 的 normalization、tool identity 和 OMO compatibility 规则
- 现阶段 render service 会把 turn view-model hydrate 回 `ChatMessage[]` 兼容输入；后续 slice 可以逐步把 DOM helper 的输入进一步收窄到 turn / part 层
