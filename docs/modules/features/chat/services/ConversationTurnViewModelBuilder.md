# ConversationTurnViewModelBuilder

> **源码**: `src/features/chat/services/ConversationTurnViewModelBuilder.ts`
> **状态**: [REVIEW]

## 概述

`ConversationTurnViewModelBuilder` 把 OpenCode canonical `session/message/part` graph 组装成 chat render 层可以消费的 turn view-model：

- 以 user message 作为 turn 边界
- 优先按 assistant `parentID` 回挂到原始 user turn；缺少 `parentID` 时才退回“直到下一个 user message 前”的顺序归属
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

- `buildTurns()` 先按 canonical message 列表建立 user turn，再在第二遍把 assistant message 挂回对应 turn；这样即使 canonical message 顺序暂时漂移，只要 assistant 仍带着 `parentID`，它也会回到原始 user turn 下
- assistant message 会保留原始 `info` 和 `parts`，因此 tool-first、reasoning-first、text-late delta 后的结构都不会被压平成纯文本
- tool-only assistant message 仍作为带 `contentBlocks` 的可渲染 canonical input 输出，不会为了兼容空正文而补一个空白 text block
- assistant `error` 会被归一成 `{ name?, message }`；错误名或消息中包含 abort / cancel / interrupt 语义时，turn 会标记为 `interrupted`
- part-level `status` 或 `state.status` 出现 abort / cancel / interrupt 语义时，同样会把 turn 标记为 `interrupted`
- `buildCanonicalRenderInput()` 会按原始 canonical message 扫描顺序输出 render input：遇到 user message 时整段展开该 turn，已被 turn 吃掉的 assistant 不再重复输出；assistant-only / orphan message 仍会保留可见输入
- `buildCanonicalRenderInput()` 不会因为当前 canonical snapshot 里暂时还没有 user turn 就丢掉 assistant-only message；这保证 stream-error notice replacement、assistant-first reload 和类似早期 cache 场景仍能得到可见 render input
- `buildRenderMessages()` 只负责把 turn 顺序转回现有 `ChatMessage[]`，让 `ConversationRenderService` 可以继续复用 OpenCodian 的 DOM/CSS shell、assistant card、footer 和 markdown renderer

## 与 `ConversationRenderService` 的边界

- builder 是纯数据转换 owner，不决定 append / tail patch / full rerender 策略
- render service 和 authoritative reload coordinator 都会从 canonical graph/raw snapshot 构造 `OpenCodeCanonicalSessionState`，再调用 builder 生成同一份 canonical render input
- OpenCode-specific hydration 由 render service 注入，仍复用 `OpenCodeService.hydrateOpenCodeMessage()` 的 normalization、tool identity 和 OMO compatibility 规则
- 现阶段 render service 会把 turn view-model hydrate 回 `ChatMessage[]` 兼容输入；后续 slice 可以逐步把 DOM helper 的输入进一步收窄到 turn / part 层
