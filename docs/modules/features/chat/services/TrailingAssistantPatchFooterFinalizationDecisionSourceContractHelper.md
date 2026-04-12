# TrailingAssistantPatchFooterFinalizationDecisionSourceContractHelper

> **源码**: `src/features/chat/services/TrailingAssistantPatchFooterFinalizationDecisionSourceContractHelper.ts`
> **状态**: [REVIEW]

## 概述

`TrailingAssistantPatchFooterFinalizationDecisionSourceContractHelper` 把 trailing-assistant finalize-footer 决策前的 source 读取从 `ConversationRenderService` 抽成了独立 helper：

- 接收 execution-tail planning-context 与一个 `getBodySignature()` getter
- 只读取 `previousTailMessage` / `nextTailMessage` 的正文签名，并装配成 `TrailingAssistantPatchFooterFinalizationDecisionSource`
- 让 `ConversationRenderService` 不再手工读取前后 tail body signature 字符串

它不比较签名、不生成 execution plan，也不执行 DOM 副作用；只负责“execution-tail context → footer-finalization decision source” 这层纯 contract 收束。

## 公开接口

```typescript
export type TrailingAssistantPatchFooterFinalizationDecisionBodySignatureGetter = (
  message: ChatMessage,
) => string;

export type TrailingAssistantPatchFooterFinalizationDecisionSourceContractParts = {
  planningContext: TrailingAssistantPatchExecutionTailPlanningContext;
  getBodySignature: TrailingAssistantPatchFooterFinalizationDecisionBodySignatureGetter;
};

export function buildTrailingAssistantPatchFooterFinalizationDecisionSourceContract(
  parts: TrailingAssistantPatchFooterFinalizationDecisionSourceContractParts,
): TrailingAssistantPatchFooterFinalizationDecisionSource;
```

## 与其他模块的关系

- `ConversationRenderService` 现在把 execution-tail planning-context 与 `host.assistantTailRender.getBodySignature()` 交给这里，不再手工读取前后正文签名
- `TrailingAssistantPatchFooterFinalizationDecisionHelper` 继续消费这里返回的 source，并纯比较前后正文签名是否相等
- `TrailingAssistantPatchExecutionTailPlanningContextHelper` 继续提供这里读取所需的 `previousTailMessage` / `nextTailMessage`
