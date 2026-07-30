# backend/diagnostics/ClaudeTraceRingBuffer

> **源码**: `src/core/agents/backend/diagnostics/ClaudeTraceRingBuffer.ts`
> **状态**: [REVIEW]

## 概述

Claude SDK 已脱敏消息的按 session 分 lane 环形缓冲，为追溯式（retroactive）深度捕获保存即时前置证据。`record(sessionId, entry)` 把 `ClaudeSdkTraceRecord` 压入对应 lane（未提供 session id 时进入共享 lane），随后按两个上限驱逐：单 lane 默认 5MB、所有 lane 默认 20MB；两者都从最老的 `recordedAt` 条目开始移除。`drain(sessionId)` 返回该 session lane 与共享 lane 的所有条目、按记录时间升序排列并清空它们；不带 session id 时会清空全部 lane。`sizeBytes()` 返回当前全局字节数。

缓冲内容已经由 `ClaudeSessionTraceService` 的 hardened `TraceRedactor` 清洗；它不会自行落盘。服务只在 deep capture 启动、SDK/normalizer 错误、send 失败、看门狗 warning 或异常终结时把 drain 的条目写成 `trace.retroactive` deep 事件。

## 导入关系

```text
上游: ./types（ClaudeSdkTraceRecord）
下游: ./ClaudeSessionTraceService（唯一消费者）
```

## 注意事项

- 容量以调用方写入的 `record.bytes` 记账，字节数由 trace service 从原 SDK message 的 UTF-8 JSON 长度估算；缓存本身不再序列化 payload。
- drain 后会删除对应 Map lane，并从剩余 `laneBytes` 重算 `total`，避免多 lane 清空后的容量漂移。
