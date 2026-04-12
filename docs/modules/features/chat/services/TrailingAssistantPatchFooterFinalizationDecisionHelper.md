# TrailingAssistantPatchFooterFinalizationDecisionHelper

> **源码**: `src/features/chat/services/TrailingAssistantPatchFooterFinalizationDecisionHelper.ts`
> **状态**: [REVIEW]

## 概述

`TrailingAssistantPatchFooterFinalizationDecisionHelper` 把 trailing-assistant patch 里“previous / next body signature → shouldFinalizeFooterOnly” 这段纯判定从 `ConversationRenderService` 抽成了独立 helper：

- 接收已经由 `TrailingAssistantPatchFooterFinalizationDecisionSourceContractHelper` 从 execution-tail context + host getter 读取好的前后正文签名字符串
- 只根据签名是否相等返回 `shouldFinalizeFooterOnly`
- 让 `ConversationRenderService` 退出正文签名相等性判断本身，只保留 host getter wiring 职责

它不读取 `ChatMessage`、不接触 execution-tail planning-context，也不执行 DOM 副作用；只负责一个布尔决策。

## 公开接口

```typescript
export type TrailingAssistantPatchFooterFinalizationDecisionSource = {
  previousBodySignature: string;
  nextBodySignature: string;
};

export function shouldFinalizeTrailingAssistantFooterOnly(
  source: TrailingAssistantPatchFooterFinalizationDecisionSource,
): boolean;
```

## 与其他模块的关系

- `TrailingAssistantPatchFooterFinalizationDecisionSourceContractHelper` 现在先通过 execution-tail planning-context 与 `host.assistantTailRender.getBodySignature()` 读取前后正文签名，再把字符串交给这里比较
- `ConversationRenderService` 现在只负责把 host getter 传给 source-contract helper，并消费这里返回的布尔决策
- `TrailingAssistantPatchExecutionTailPlanningContextHelper` 继续提供 `previousTailMessage` / `nextTailMessage` 给 service 读取签名
- `TrailingAssistantPatchExecutionTailExecutionPlanHelper` 继续消费这里产出的 `shouldFinalizeFooterOnly`，把它与 execution-tail planning-context 一起映射为最终 `executionPlan`
- `TrailingAssistantPatchExecutionPlanHelper` 仍只负责最底层的 `finalize-footer` / `rerender-content` shape 装配
