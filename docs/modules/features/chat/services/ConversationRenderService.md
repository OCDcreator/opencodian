# ConversationRenderService

> **源码**: `src/features/chat/services/ConversationRenderService.ts`
> **状态**: [REVIEW]

## 概述

`ConversationRenderService` 负责把 `OpenCodianView` 里最密集的一段消息区重渲编排抽成独立 service：

- persisted assistant / user message 的基础渲染入口
- empty-rewind notice 与单条 user body rerender
- synced text assistant 的 pseudo-stream reveal
- conversation 全量重渲
- synced message 的 append-only 增量渲染
- 尾部 assistant render patch
- 无法安全增量时回退 full rerender
- canonical session graph 到 turn view-model 的 render input seam

它不持有聊天视图的 DOM 根状态，也不直接依赖插件实例；所有真实渲染、scroll runtime、background-task UI 和调试日志都通过 `ConversationRenderHost` 回调回到 `OpenCodianView`。其中 persisted assistant shell / pseudo-stream footer / streaming-shell state 收尾由嵌套的 `ConversationAssistantShellRenderPort` 提供，assistant tail 相关的正文签名、正文重渲与 persisted footer 收尾则进一步收束在 `ConversationAssistantTailRenderPort`。canonical session graph 的读取与 OpenCode message hydration 则通过可选的 `ConversationCanonicalRenderSource` 注入，避免 render host 继续扩大。

基础 render contract、消息/伪流式 assistant 渲染 delegate 与 synced append apply delegate 已拆到 `ConversationRenderRuntime`；尾部 assistant patch 的 tab/container、rendered sequence、signature 与 DOM target preflight 已拆到 `ConversationTrailingAssistantPatchPlanner`。canonical turn 组装与 canonical render input 投影都由 `ConversationTurnViewModelBuilder` 承接，`ConversationRenderService` 本身因此只保留 full rerender、synced update 输入选择与 trailing-assistant patch execution/logging 这些高层控制流。

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
  renderMessageBody(
    contentEl: HTMLElement,
    message: ChatMessage,
  ): Promise<void>;
  finalizePersistedFooter(messageEl: HTMLElement, message: ChatMessage): void;
}

export interface ConversationAssistantShellRenderPort {
  renderPersistedMessage(message: ChatMessage): Promise<HTMLElement | void | undefined>;
  createAssistantMessageElement(): {
    messageEl: HTMLElement;
    contentEl: HTMLElement;
  };
  finalizePseudoStreamFooter(
    messageEl: HTMLElement,
    message: Pick<ChatMessage, 'content' | 'timestamp' | 'modelId'>,
  ): void;
  clearStreamingMessageState(): void;
}

export interface ConversationCanonicalRenderSource {
  getCanonicalSessionState(sessionId: string): OpenCodeCanonicalSessionState | null;
  hydrateOpenCodeMessage(
    info: OpenCodeCanonicalMessageInfo,
    parts: OpenCodeCanonicalPart[],
  ): ChatMessage;
}

export class ConversationRenderService {
  renderMessage(message: ChatMessage): Promise<HTMLElement | void | undefined>;
  renderMessages(messages: ChatMessage[]): Promise<void>;
  rerenderSingleUserMessage(
    previousMessageId: string,
    message: ChatMessage,
  ): Promise<void>;
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

  // 静态 tooltip / copy-button 工具（已从 OpenCodianView 迁入）
  static readonly COPY_ICON: string;
  static attachCopyButtonBehavior(copyBtn: HTMLElement, content: string): void;
  static setTooltipLabel(
    buttonEl: HTMLElement,
    label: string,
    position?: 'bottom' | 'top' | 'right',
  ): void;
  static attachTooltipLabel(buttonEl: HTMLElement, label: string): void;
}
```

## 关键行为

### 基础消息渲染

- assistant persisted shell 直接复用 `AssistantShellViewHostAdapter`，避免 view 再持有顶层 assistant render/update 分支
- user message shell / footer 仍通过 host callback 回到 view，但 render service 现在统一掌握“何时创建 frame、何时重绘 content/footer”
- 空 conversation 且存在 revert state 时，会通过 host 提供的 notice message source 渲染空白 rewind notice
- persisted user/assistant render、single-user rerender、以及 synced assistant pseudo-stream reveal 现在先经由 service 内部的 message-render delegate，再落回 host ports 执行真实 DOM 更新
- 基础消息 render delegate 与 synced append apply delegate 现在位于 `ConversationRenderRuntime`，service 只委托这些 runtime owner

### 全量重渲

- 只在当前活动 conversation 仍匹配、且消息容器存在时执行
- 如果当前 session 已有 canonical state，会直接调用 `ConversationTurnViewModelBuilder.buildCanonicalRenderInput()` 生成稳定的 canonical render `ChatMessage[]`
- canonical state 一旦可用，就直接成为 full rerender 与 synced update 的唯一 render 输入；`conversation.messages` 只在 canonical 缺失时才作为临时 fallback
- 进入 hydration 前先抓取 scroll snapshot，并复用 `ScrollManager` 恢复 bottom / distance / anchor 语义
- 重渲后继续刷新 background-task indicator、pane metrics 和 composer layout

### 增量同步

- `getIncrementalRenderedMessageUpdate()` 先判断是否还能沿用现有 rendered message 前缀
- synced update 有 canonical state 时，会先把 next render input 解析为 canonical turn hydrate 结果，再进入现有 append / tail patch 判定；不再把 fallback `ChatMessage[]` 与 canonical 输出 merge 成并行 truth
- append-only 时只渲染新增消息，不重跑整段历史
- 纯文本 assistant append 继续直接在 service 内走 pseudo-stream reveal，而不是回到 view 再分支
- synced update 的“增量判断 → optional tail patch → append render → indicator/scroll follow-up”现在由 `ConversationRenderRuntime` 的 apply delegate 串起来，service 公开入口只保留高层委托与 full-rerender fallback

### 尾部 assistant patch

- 只有“rendered message 数量不变、非尾部 visual signature 完全一致、尾部仍是普通 assistant”时才允许 patch
- patch preflight 现在由 `ConversationTrailingAssistantPatchPlanner` 独立承接，service 只消费 success planning context 或 skipped reason/payload
- patch 前的 `missing-container-or-inactive-tab` tab/container 预检、rendered message 收集与数量校验、non-tail signature mismatch 判定与失败 payload 组装，以及尾部 DOM 目标解析，先由更细的独立 helper 收口，再进入真正的 patch 执行
- preflight 里 `tail-message-not-mergeable-assistant` 的 rendered tail 选择与最终失败 contract 也已抽到独立 helper；previous / next tail summary 现在直接在单一 failure-plan helper 内一次性收束成最终 reason + payload
- preflight 里的 `missing-existing-tail-element` / `missing-tail-content-element` DOM target 失败结果也统一由 target failure helper 装配，让 target resolver 只负责查找现有尾部 message/content 节点
- `resolveTrailingAssistantPatchTargets()` 的成功态 `{ existingTailMessageEl, existingContentEl, parentEl }` 现在也统一由小型 target success helper 装配，让 resolver 更接近只负责 DOM 查询与分支选择
- preflight 成功分支现在会先把 tail messages、`patchTarget` 与 `parentEl` 收束成更窄的 planning-context input helper，再与独立的 planning-environment helper 一起交给 success planning-context helper 装配成 `planningContext`，让主 builder 更接近只负责组合既有 contract
- preflight 成功分支里的 `existingTailMessageEl`、`existingContentEl` 与 `parentEl` 现在会先组装成更窄的 `patchTarget` contract，再与 runtime/scroll 派生值一起汇总到 `planningContext`，避免成功态结果继续暴露零散 DOM 字段
- `TrailingAssistantPatchPreflight` 现在只表达“是否允许 patch”，成功后只返回独立的 `planningContext`；执行计划、turn-body scope、tail state 与 completion debug 改由 coarse bundle 基于这份窄输入统一组装
- `trailingAssistantPatchExecution.ts` 现在承接 success-plan 组装、execution-tail context、footer-finalization decision、`executionPlan`、turn-body scope plan / runtime 切换，以及 patch 成功后的 tail-state apply；service 只注入 host callbacks 并执行返回的 plan
- `trailingAssistantPatchPlanning.ts` 集中承接 tail-state planning、tail-outcome planning、completion-debug summary/context/plan，以及 `tailOutcomePlans` 聚合，不再让 execution path import 一串单用途 helper
- `trailingAssistantPatchDebug.ts` 集中承接 completion / skipped logging context、payload shaping、shared log-plan coordination 与最终 emitter；service 仍只在失败/成功点构造高层上下文并触发发送
- `trailingAssistantPatchTypes.ts` 统一声明 planning / execution / debug 三个 bundle 共用的 plan、context 与 payload contract，避免重新引入 type-only helper 碎片
- assistant 正文签名不变时复用已有正文，只重做 persisted footer 收尾
- patch 成功后的 message dataset 刷新、动画禁用与按需 scroll-to-bottom 仍由预先构建的 `tailStatePlan` 驱动，但执行副作用已收口在 `trailingAssistantPatchExecution.ts`
- assistant 正文签名计算、正文重渲和 footer finalization 现在统一通过 `host.assistantTailRender` 这组更小的 port 完成
- 缺失尾部 DOM、内容节点或前缀签名失配时，立即返回 `false` 让上层回退到 full rerender

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 现在主要保留 `renderAssistantMessageBody()` / `renderUserMessageContent()` / `renderContentBlock()` 这类 leaf renderer，以及 empty-notice 文案、copy/footer、markdown 与 tab runtime host seam
- `OpenCodianView` 会先组装 `ConversationAssistantShellRenderPort` 与 `ConversationAssistantTailRenderPort`，再把它们作为 `ConversationRenderHost` 的子边界传给 service
- `OpenCodianView` 另外注入 `ConversationCanonicalRenderSource`，让 service 能读取 `OpenCodeService.getCanonicalSessionState()` 并复用 `hydrateOpenCodeMessage()`，但不把 OpenCode service 直接塞进 DOM host
- 这条 canonical render input 路径现在也与 authoritative reload coordinator 对齐，避免 reload/sync 再走一套独立 hydrate 顺序
- `ConversationRenderService` 现在同时负责决定“何时整段重渲、何时 patch 尾部、何时仅追加、何时直接重画单条 user/assistant shell”
- persisted assistant shell / notice / footer 装配已经下沉到 `AssistantShellViewHostAdapter`，所以这里的 tail port 只关心正文重渲与 footer finalization
- 这样消息区编排逻辑首次拥有独立单测边界，而不用把 assistant renderer 一起打散
