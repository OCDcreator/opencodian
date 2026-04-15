# ConversationTrailingAssistantPatchPlanner

> **源码**: `src/features/chat/services/ConversationTrailingAssistantPatchPlanner.ts`
> **状态**: [REVIEW]

## 概述

`ConversationTrailingAssistantPatchPlanner` 把尾部 assistant patch 的 preflight 判定从 `ConversationRenderService` 中拆成独立 owner：

- 校验当前 tab/container 是否仍匹配
- 取得 rendered message sequence 并保证数量一致
- 比较非尾部 visual signature，发现 mismatch 时返回可记录的失败 payload
- 确认前后 tail 都仍是普通 assistant message
- 解析现有尾部 assistant DOM、content element 与 parent element
- 组装 success planning context，供 success-plan helper 链继续计算 execution/tail state/debug plans

它不执行 DOM patch，也不写 debug log；失败/成功结果会回到 `ConversationRenderService.patchTrailingAssistantRender()` 统一处理。

## 公开接口

```typescript
export type TrailingAssistantPatchPlanningContext = {
  previousTailMessage: ChatMessage;
  nextTailMessage: ChatMessage;
  patchTarget: {
    messageEl: HTMLElement;
    contentEl: HTMLElement;
  };
  parentEl: HTMLElement;
  runtime: ConversationRenderRuntimeState | null;
  shouldStickToBottom: boolean;
};

export class TrailingAssistantPatchPlanningDelegate {
  resolvePreflight(
    previousMessages: ChatMessage[],
    nextMessages: ChatMessage[],
    tabId: TabId | null,
  ): TrailingAssistantPatchPreflight;
}
```

## 关键行为

- `missing-container-or-inactive-tab` 仍表示当前 view/container 不适合 patch，调用方会回退 full rerender
- rendered message 数量为零或前后数量不同仍返回 `rendered-message-count-mismatch`
- non-tail mismatch 继续携带 `mismatchIndex`，用于 skipped debug payload
- `tail-message-not-mergeable-assistant` 继续携带 previous/next tail summary，不改变 diagnostics shape
- DOM target 解析仍排除 `.opencodian-message--notice`，只选择最后一个普通 assistant element

## 与 `ConversationRenderService` 的边界

- planner 只负责 patch 是否安全以及 success planning context 组装
- service 仍负责 skipped/completion debug logging、success plan 构造、turn-body scope、execution plan 执行与 tail state apply
- assistant body signature、footer finalize 与 body rerender 仍通过 `ConversationAssistantTailRenderPort` 回到 view host
