# TrailingAssistantPatchDebugLogHelper

> **源码**: `src/features/chat/services/TrailingAssistantPatchDebugLogHelper.ts`
> **状态**: [REVIEW]

## 概述

`TrailingAssistantPatchDebugLogHelper` 把 trailing-assistant completion / skipped debug 现在已经对称的 final-log 末端装配抽成了独立纯 helper：

- 从 `tabId` 与已准备好的 `payloadPlan` 组装 final-log inputs contract
- 把 final-log inputs contract 收束成最终 log-plan contract
- 统一把 `tabId` 注入 payload，并返回固定 shape 的 debug log plan

它不读取 `ConversationRenderHost`、DOM、消息数组或 planning context；只负责共享的 final-log contract / inputs / payload 装配。

## 公开接口

```typescript
export type TrailingAssistantPatchDebugLogPlan<Label extends string> = {
  label: Label;
  payload: Record<string, unknown>;
};

export function buildTrailingAssistantPatchDebugFinalLogPlanFromTabId<
  Label extends string,
  PayloadPlan extends Record<string, unknown>,
>(
  label: Label,
  tabId: TabId | null,
  payloadPlan: PayloadPlan,
): TrailingAssistantPatchDebugLogPlan<Label>;
```

## 与 `ConversationRenderService` 的关系

- `ConversationRenderService` 不再直接计算 completion / skipped payload-plan；这部分已迁到 `TrailingAssistantPatchDebugPayloadHelper`
- `TrailingAssistantPatchDebugLogCoordinator` 仍把 ready `payloadPlan` 交给这里
- 共享的 final-log contract、inputs 与 payload 收口逻辑已经迁到这里
- 这让 service 只再决定“用哪个 label”和“提供哪个 payloadPlan”，不再重复维护对称的末端 debug log 组装
