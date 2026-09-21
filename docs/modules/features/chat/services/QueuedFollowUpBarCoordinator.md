# QueuedFollowUpBarCoordinator

> **源码**: `src/features/chat/services/QueuedFollowUpBarCoordinator.ts`
> **状态**: [REVIEW]

## 概述

R-F1（advantage-parity）流式中排队消息的可见队列条（composer chips 行上方）：多条 FIFO、逐条撤回、按后端能力如实分流——`turn-steering` 能力（pi 原生 `streamingBehavior:'steer'`，活体实证）显示每条「立即注入」⚡；不支持的后端明示「将在本轮结束后自动发送」；轮次结束/被取消后每条变为「立即发送」➤（队列按需求在取消后保留）。

## 对外 API

```typescript
class QueuedFollowUpBarCoordinator {
  attach(barEl, host): void;   // host: isTabStreaming/hasTurnSteering/onRetract/onSteer/onSendNow
  detach(): void;
  render(items: readonly { content }[]): void;  // 空队列隐藏整条
}
```

## 不变量

- 渲染幂等（全量重绘）；空队列 `is-hidden`。
- 预览折行 120 字符截断 + title 全文。
- 状态文案三态（流式中+可注入 / 流式中+仅排队 / 空闲）——从不假装支持注入。

## 关联模块

- `src/features/chat/OpenCodianView.ts`：attach/三个动作实现（steer 走 `AgentTurnSteeringCapability`，失败保留条目并如实 Notice）。
- `src/features/chat/services/ConversationTabRuntimeCoordinator.ts`：队列真相（`queuedFollowUpSends` FIFO + remove/get）。
