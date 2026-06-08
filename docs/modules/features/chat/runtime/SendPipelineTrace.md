# SendPipelineTrace

> **源码**: `src/features/chat/runtime/SendPipelineTrace.ts`
> **状态**: [REVIEW]

## 概述

`SendPipelineTrace` 是发送链路的调试追踪器。它把 trace id、raw/rendered chunk 统计、首屏/增量文本 checkpoint 与 `StreamController` 快照统一打到同一条 assistant finalization debug 日志里。

## 公开接口

```typescript
export class SendPipelineTrace {
  noteRawChunk(chunk): void;
  noteRenderedChunk(chunk): void;
  logProgress(chunk, options): void;
  logStage(stage, payload?): void;
  snapshotStreamController(): Record<string, unknown>;
}
```

## 关键行为

- 为一次发送生成稳定 `traceId`
- 分别统计 raw stream chunk 与 rendered chunk 数量
- 保存最近一条 raw / rendered text chunk 的长度与 preview
- 对文本增长日志做节流，避免长回复时 debug 日志爆炸
- 在任意 stage 里补齐 conversation/session/user message/runtime 状态上下文
- session identity 通过 `getConversationBackendSessionId()` 解析，旧 OpenCode conversation 和只带 `backendSessionId` 的新 backend conversation 都能保留 trace continuity

## 为什么单独存在

- `StreamChunkRouter` 负责流程控制，不再背负大段调试拼装代码
- `StreamLocalFinalizer` 与后续 `MessageFinalizationService` 可以复用同一条 trace logger，保持一次发送的日志连续
- 单测可以只断言阶段行为，不需要耦合具体日志字段拼接

## 注意事项

- progress 日志的节流阈值同时受“时间间隔”和“文本增长量”控制。
- 新增可渲染 chunk 类型时，要评估是否需要在 `getProgressLogPayload()` 里增加新的 reason。
