# backend/diagnostics/CodexWireTraceBridge

> **源码**: `src/core/agents/backend/diagnostics/CodexWireTraceBridge.ts`
> **状态**: [REVIEW]

## 概述

把 Codex app-server 传输层的原始线流量翻译为 `CodexWireRecord` 并注入 `CodexSessionTraceService.recordWireEvent` 的薄桥。六个回调分别对应 JSON-RPC 线事件：`onRequest`（out/request，从 params 提取 threadId）、`onResponse`（in/response，带 ok 与 durationMs，错误文本作为 payload）、`onNotification`（in/notification）、`onServerRequest` / `onServerReply`（server 发起的反向请求与插件应答）、`onConnection`（连接状态机事件，state 作为 method）。`byteSize` 用 `JSON.stringify` 长度估算字节数（失败时计 0），`threadIdOf` 只从 params 顶层读取 `threadId` 字符串。桥内当前本地定义并导出 `CodexAppServerWireObserver` 接口作为 Task 7 正式契约的临时占位（全部方法可选），Task 7 在 `CodexAppServerClientTypes` 落地权威定义时需与此处对齐并删除本地声明。

## 导入关系

```text
上游: ./types（CodexWireRecord）, ./CodexSessionTraceService（type-only 循环引用，运行时由 service 构造桥）
下游: 后续 Task 7（CodexAppServerTransport 挂接 observer）
```

## 注意事项

- `CodexAppServerWireObserver` 的本地定义是有意的临时偏差：任务边界禁止修改 `CodexAppServerClientTypes.ts`，Task 7 负责收敛；不要把本地接口再 re-export 到更上层 barrel 之外的公共 API 文档中当作最终契约。
- 桥与 service 存在构造期循环引用（service 持有 `wireBridge`，桥回调 service），通过 type-only import 保持编译期解耦。
