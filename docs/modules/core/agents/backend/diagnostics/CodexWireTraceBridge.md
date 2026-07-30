# backend/diagnostics/CodexWireTraceBridge

> **源码**: `src/core/agents/backend/diagnostics/CodexWireTraceBridge.ts`
> **状态**: [REVIEW]

## 概述

把 Codex app-server 传输层的原始线流量翻译为 `CodexWireRecord` 并注入 `CodexSessionTraceService.recordWireEvent` 的薄桥。六个回调分别对应 JSON-RPC 线事件：`onRequest`（out/request，从 params 提取 threadId）、`onResponse`（in/response，带 ok 与 durationMs，错误文本作为 payload）、`onNotification`（in/notification）、`onServerRequest` / `onServerReply`（server 发起的反向请求与插件应答）、`onConnection`（连接状态机事件，state 作为 method）。客户端 request 与 server request 分别维护 id→threadId 映射，并在 response/reply 后立即删除；`closed`、`error`、`stopped` 等终态连接事件也会清空两张映射，避免迟到 response/reply 错误关联并错误 drain 已结束会话的 ring buffer。双向 JSON-RPC 的 id 不会相互碰撞，错误 response 也只会回溯所属会话。`byteSize` 用 UTF-8 字节数估算（失败时计 0），`threadIdOf` 只从 params 顶层读取 `threadId` 字符串。

## 导入关系

```text
上游: ./types（CodexWireRecord）, ./CodexSessionTraceService（type-only 循环引用，运行时由 service 构造桥）
下游: 后续 Task 7（CodexAppServerTransport 挂接 observer）
```

## 注意事项

- `CodexAppServerWireObserver` 的权威定义在 `CodexAppServerClientTypes.ts`；bridge 只 type-only 导入它，避免本地契约漂移。
- `onServiceOutput` 每个 chunk 动态检查 trace 开关：disabled 返回 `false` 让 transport 保持 legacy stderr 行为，enabled 返回 `true` 并将内容交给 service 的脱敏路径。
- 桥与 service 存在构造期循环引用（service 持有 `wireBridge`，桥回调 service），通过 type-only import 保持编译期解耦。
