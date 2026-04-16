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

它不持有聊天视图的 DOM 根状态，也不直接依赖插件实例；所有真实渲染、scroll runtime、background-task UI 和调试日志都通过 `ConversationRenderHost` 回调回到 `OpenCodianView`。其中 persisted assistant shell / pseudo-stream footer / streaming-shell state 收尾由嵌套的 `ConversationAssistantShellRenderPort` 提供，assistant tail 相关的正文签名、正文重渲与 persisted footer 收尾则进一步收束在 `ConversationAssistantTailRenderPort`。

基础 render contract、消息/伪流式 assistant 渲染 delegate 与 synced append apply delegate 已拆到 `ConversationRenderRuntime`；尾部 assistant patch 的 tab/container、rendered sequence、signature 与 DOM target preflight 已拆到 `ConversationTrailingAssistantPatchPlanner`。`ConversationRenderService` 本身因此只保留 full rerender 与 trailing-assistant patch execution/logging 这两条高层控制流。

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
- 进入 hydration 前先抓取 scroll snapshot，并复用 `ScrollManager` 恢复 bottom / distance / anchor 语义
- 重渲后继续刷新 background-task indicator、pane metrics 和 composer layout

### 增量同步

- `getIncrementalRenderedMessageUpdate()` 先判断是否还能沿用现有 rendered message 前缀
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
- `TrailingAssistantPatchPreflight` 现在只表达“是否允许 patch”，成功后只返回独立的 `planningContext`；执行计划、turn-body scope、tail state 与 completion debug 改由 `buildTrailingAssistantPatchSuccessPlan()` 基于这份窄输入统一组装
- `buildTrailingAssistantPatchSuccessPlan()` 现在只把已验证的 success planning-context 与 host `assistantTailRender` / `summarizeChatMessageForDebug()` 交给 `TrailingAssistantPatchSuccessPlanningContextPlanSourceContractHelper.buildTrailingAssistantPatchSuccessPlanningContextPlanSourceContract()`，再把稳定 source contract 继续委托给 `TrailingAssistantPatchSuccessPlanningContextPlanHelper.buildTrailingAssistantPatchSuccessPlanFromPlanningContext()`；service 不再承载最后一层 host callback adapter wiring
- success planning-context plan 编排阶段里，execution/tail 路径会先通过 `TrailingAssistantPatchExecutionTailPlanningContextHelper.buildTrailingAssistantPatchExecutionTailPlanningContext()` 收束共享 contract，再整体委托 `TrailingAssistantPatchExecutionTailChildPlansHelper.buildTrailingAssistantPatchExecutionTailPlanPartsFromExecutionTailPlanningContext()` 串联 footer-finalization decision、`executionPlan` 与 `tailOutcomePlans`；turn-body scope 路径则继续由 `TrailingAssistantPatchSuccessChildPlansHelper` 内部委托 `TrailingAssistantPatchTurnBodyScopePlanHelper.buildTrailingAssistantPatchTurnBodyScopePlan()` 完成 input assembly、restore-target 默认值与最终 plan shape 收口，最后再复用 `TrailingAssistantPatchSuccessPlanHelper.buildTrailingAssistantPatchSuccessPlanFromParts()` 统一收口 success-plan
- execution-tail child-plans 现在会先由纯 `TrailingAssistantPatchExecutionTailChildPlansHelper` 收口：helper 内部先通过 `TrailingAssistantPatchFooterFinalizationExecutionTailDecisionHelper.shouldFinalizeTrailingAssistantFooterOnlyFromExecutionTailPlanningContext()` 生成 `shouldFinalizeFooterOnly`，再分别委托 `TrailingAssistantPatchExecutionTailExecutionPlanHelper.buildTrailingAssistantPatchExecutionPlanFromExecutionTailPlanningContext()` 与 `TrailingAssistantPatchTailOutcomeExecutionTailPlanHelper.buildTrailingAssistantPatchTailOutcomePlansFromExecutionTailPlanningContext()`，最后复用 `TrailingAssistantPatchExecutionTailPlanPartsHelper.buildTrailingAssistantPatchExecutionTailPlanParts()` 返回稳定的 execution/tail plan-parts
- 最终 `TrailingAssistantPatchSuccessPlan` 的返回结构会先经 `TrailingAssistantPatchSuccessChildPlansHelper` 串联 child-plans assembly，再由 `TrailingAssistantPatchSuccessPlanHelper` 统一收口，避免 success-plan builder 继续手工展开 `tailOutcomePlans` 与 turn-body scope 字段；`executionPlan` 自身的 finalize/rerender shape 则已另交给纯 `TrailingAssistantPatchExecutionPlanHelper`
- `successPlan` 内部会继续预先把“只 finalize footer / 重渲正文 content”的执行决策收敛成 `executionPlan`，但 success planning-context 到 execution-tail context、布尔决策、execution-plan、tail-outcome plan-parts 与 turn-body scope source 的纯 orchestration 现在由 `TrailingAssistantPatchSuccessPlanningContextPlanHelper` 串联；service 只注入 host callbacks，并把最终 `executionPlan` 直接交给 `executeTrailingAssistantPatch()`
- `successPlan` 也会继续在纯 helper 内把 turn-body scope 切换/恢复依赖的 runtime 与目标节点预计算成 `turnBodyScopePlan`，再交给 `TrailingAssistantPatchTurnBodyScopeHelper.withTrailingAssistantTurnBodyScope()` 执行，避免 service 继续承载 scope-plan 细节，且不需要让副作用 helper 回读 preflight verdict 或零散 DOM 字段
- patch 执行期间对 render runtime 的 `currentTurnBodyEl` 暂时切换与恢复，现由独立的 `TrailingAssistantPatchTurnBodyScopeHelper` 收口，避免主流程继续承载 DOM 上下文细节
- 真正执行 patch 时，“只 finalize footer / 重渲正文 content”分支由独立 execution-plan helper 收口；正文签名比较本身则已由纯 decision helper 承接
- patch 成功后的 completion debug 日志继续走共享的 `TrailingAssistantPatchDebugLogCoordinator`；分支私有的 completion payload inputs / payloadPlan 适配也已迁到独立的 `TrailingAssistantPatchDebugPayloadHelper`
- patch skipped 分支也沿用同一条 coordinator，并把 rendered-count 统计与 skipped payload 适配下沉到 `TrailingAssistantPatchDebugPayloadHelper`
- completion / skipped 两条路径最后剩下的 logging-context builder 已迁到 `TrailingAssistantPatchDebugLoggingContextHelper`，对应的 log-plan builder 与最终日志发送包装也已分别抽到 `TrailingAssistantPatchDebugLogPlanHelper` 和 `TrailingAssistantPatchDebugLogEmitterHelper`
- service 现在只在失败/成功点构造 logging context，并把最终 debug logging 发送交给 emitter helper
- assistant 正文签名不变时复用已有正文，只重做 persisted footer 收尾
- patch 成功后的 message dataset 刷新、动画禁用与按需 scroll-to-bottom，现会先通过 `TrailingAssistantPatchTailStateTailOutcomePlanHelper` 串联 tail-state planning-context 与最终 `tailStatePlan` 预计算，再交给独立的 `TrailingAssistantPatchTailStateApplierHelper`，让 service 更接近只保留 patch 控制流
- assistant 正文签名计算、正文重渲和 footer finalization 现在统一通过 `host.assistantTailRender` 这组更小的 port 完成
- 缺失尾部 DOM、内容节点或前缀签名失配时，立即返回 `false` 让上层回退到 full rerender

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 现在主要保留 `renderAssistantMessageBody()` / `renderUserMessageContent()` / `renderContentBlock()` 这类 leaf renderer，以及 empty-notice 文案、copy/footer、markdown 与 tab runtime host seam
- `OpenCodianView` 会先组装 `ConversationAssistantShellRenderPort` 与 `ConversationAssistantTailRenderPort`，再把它们作为 `ConversationRenderHost` 的子边界传给 service
- `ConversationRenderService` 现在同时负责决定“何时整段重渲、何时 patch 尾部、何时仅追加、何时直接重画单条 user/assistant shell”
- persisted assistant shell / notice / footer 装配已经下沉到 `AssistantShellViewHostAdapter`，所以这里的 tail port 只关心正文重渲与 footer finalization
- 这样消息区编排逻辑首次拥有独立单测边界，而不用把 assistant renderer 一起打散
