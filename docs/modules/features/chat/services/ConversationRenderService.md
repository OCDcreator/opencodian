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
- preflight 里 `tail-message-not-mergeable-assistant` 的 rendered tail 选择与最终失败 contract 也已抽到独立 helper；previous / next tail summary 现在直接在单一 failure-plan helper 内一次性收束成最终 reason + payload
- preflight 里的 `missing-existing-tail-element` / `missing-tail-content-element` DOM target 失败结果也统一由 target failure helper 装配，让 target resolver 只负责查找现有尾部 message/content 节点
- `resolveTrailingAssistantPatchTargets()` 的成功态 `{ existingTailMessageEl, existingContentEl, parentEl }` 现在也统一由小型 target success helper 装配，让 resolver 更接近只负责 DOM 查询与分支选择
- preflight 成功分支现在会先把 tail messages、`patchTarget` 与 `parentEl` 收束成更窄的 planning-context input helper，再与独立的 planning-environment helper 一起交给 success planning-context helper 装配成 `planningContext`，让主 builder 更接近只负责组合既有 contract
- preflight 成功分支里的 `existingTailMessageEl`、`existingContentEl` 与 `parentEl` 现在会先组装成更窄的 `patchTarget` contract，再与 runtime/scroll 派生值一起汇总到 `planningContext`，避免成功态结果继续暴露零散 DOM 字段
- `TrailingAssistantPatchPreflight` 现在只表达“是否允许 patch”，成功后只返回独立的 `planningContext`；执行计划、turn-body scope、tail state 与 completion debug 改由 `buildTrailingAssistantPatchSuccessPlan()` 基于这份窄输入统一组装
- `buildTrailingAssistantPatchSuccessPlan()` 现在进一步只保留 success-plan 骨架编排：它会先把 turn-body scope 与独立的 execution/tail-outcome contract 收束成 `planParts`，再交给最终 success-plan shape helper 统一返回
- `planParts` 收集阶段里，turn-body scope 会先把 `runtime` 与 `parentEl` 收束成更窄的 input helper，再交给 scope-plan builder；execution plan 与 tail outcome 则会先把 `previousTailMessage`、`nextTailMessage`、`patchTarget` 与 `shouldStickToBottom` 收束成共享 execution/tail input helper，再交给独立 planning-context helper 与顶层 execution/tail-outcome contract builder 统一装配
- `tailOutcomePlans` 在进入 `tailStatePlan` + `completionDebugPlan` 顶层返回前，还会先把 `messageEl`、tail messages 与 stick-to-bottom 状态收束成更窄的 tail-outcome input helper，再交给专用 planning-context helper；随后由独立的 tail-outcome plan-parts helper 预建 `tailStatePlan` 与 `completionDebugPlan`，让顶层 tail-outcome builder 更接近只负责组合预建子计划
- `completionDebugPlan` 进入顶层装配前，也会先把 previous / next tail summary 抽到独立 helper，再只把预建 summary 与 `shouldStickToBottom` 组合成 debug contract，让 tail-outcome helper 更接近只负责装配顶层 tail-state / debug plan
- 最终 `TrailingAssistantPatchSuccessPlan` 的返回结构也已交给独立 helper 统一收口，避免 success-plan builder 继续手工展开 `tailOutcomePlans` 与 turn-body scope 字段
- `successPlan` 内部会继续预先把“只 finalize footer / 重渲正文 content”的执行决策收敛成 `executionPlan`，并直接把它交给 `executeTrailingAssistantPatch()`，让 patch executor 不再读取整份成功态结果或重复承担正文签名比较
- `successPlan` 也会把 turn-body scope 切换/恢复依赖的 runtime 与目标节点预计算成 `turnBodyScopePlan`，让 `withTrailingAssistantTurnBodyScope()` 不再回读 preflight verdict 或零散 DOM 字段
- patch 执行期间对 render runtime 的 `currentTurnBodyEl` 暂时切换与恢复，也由独立 scope helper 收口，避免主流程继续承载 DOM 上下文细节
- 真正执行 patch 时，assistant 正文签名比较与“只 finalize footer / 重渲正文 content”分支也由独立 helper 收口
- patch 成功后的 completion debug 日志现在也会先把 `completionDebugPlan` 与 `tabId` 收束成独立 logging-context helper，再把 `shouldStickToBottom` 与 previous / next tail summary 预收束成 payload-plan，最后交给单一 log-plan helper 组合最终 label/payload；`logTrailingAssistantPatchCompletionDebug()` 因此不再接收零散日志入参
- patch skipped 分支现在会先把 previous / next messages 与 `tabId` 收束成独立 planning context，再由单一 skipped-debug log-plan helper 一次性装配最终 label + payload；`logTrailingAssistantPatchSkippedDebug()` 只负责发送日志，而 rendered count 仍由更小的 count helper 预计算
- assistant 正文签名不变时复用已有正文，只重做 persisted footer 收尾
- patch 成功后的 message dataset 刷新、动画禁用与按需 scroll-to-bottom，现会先预计算成更窄的 `tailStatePlan` 再交给 tail-apply helper，避免这些副作用继续读取整份 `successPlan`
- assistant 正文签名计算、正文重渲和 footer finalization 现在统一通过 `host.assistantTailRender` 这组更小的 port 完成
- 缺失尾部 DOM、内容节点或前缀签名失配时，立即返回 `false` 让上层回退到 full rerender

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 仍保留 `renderMessage()`、`renderMessages()`、`renderAssistantMessageContent()`、pseudo-stream reveal 和 tab runtime 所有权
- `OpenCodianView` 会先组装 `ConversationAssistantTailRenderPort`，再把它作为 `ConversationRenderHost` 的 assistant-tail 子边界传给 service
- `ConversationRenderService` 只负责决定“何时整段重渲、何时 patch 尾部、何时仅追加”
- 这样消息区编排逻辑首次拥有独立单测边界，而不用把 assistant renderer 一起打散
