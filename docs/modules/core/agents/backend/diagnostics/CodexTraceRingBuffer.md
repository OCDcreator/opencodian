# backend/diagnostics/CodexTraceRingBuffer

> **源码**: `src/core/agents/backend/diagnostics/CodexTraceRingBuffer.ts`
> **状态**: [REVIEW]

## 概述

Codex 线协议的按 thread 分 lane 的环形缓冲，为追溯式（retroactive）深度捕获暂存原始 `CodexWireRecord`。`record(threadId, entry)` 把条目压入对应 lane（`threadId` 为 `undefined` 时进共享 lane），随后执行两级驱逐：lane 内超出 `perThreadBytes`（默认 5MB）时从队首逐出最老条目，全局超出 `totalBytes`（默认 20MB）时按各 lane 队首 `recordedAt` 找全局最老条目逐出。`drain(threadId)` 返回该 thread lane 与共享 lane 的全部条目（按 `recordedAt` 升序）并清除这两条 lane；不传 threadId 时清空全部 lane。`sizeBytes()` 返回当前全局字节数。缓冲只进不出，直到 trace service 因 response 错误、turn 异常终结或看门狗 warning 触发 `flushRingBuffer` 才 drain 并落成 `wire.retroactive` 深度事件。

## 导入关系

```text
上游: ./types（CodexWireRecord）
下游: ./CodexSessionTraceService（唯一消费者）
```

## 注意事项

- 驱逐以 `record.bytes`（调用方声明的线字节数）记账，不做实际序列化测量；bytes 由 `CodexWireTraceBridge` 的 `byteSize` 估算。
- lane 被 drain 后从 Map 中删除，`total` 通过重新累加剩余 laneBytes 重建，避免长期漂移。
