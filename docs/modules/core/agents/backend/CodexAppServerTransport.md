# CodexAppServerTransport

> **源码**: `src/core/agents/backend/CodexAppServerTransport.ts`
> **状态**: [RUNTIME_ADJUNCT]

## 概述

从 `CodexAppServerClient` 拆出的基类，负责 Codex app-server 的进程生命周期与 JSON-RPC 2.0 plumbing。`CodexAppServerClient extends CodexAppServerTransport` 并在此基类之上添加类型化的 app-server API wrapper。

## 职责

- `start()` / `doStart()` / `waitForWsUrl()`: 启动 `codex app-server --listen ws://127.0.0.1:0` 子进程，从 stdout/stderr 扫描 WebSocket URL，连接并初始化 JSON-RPC 会话
- `stop()`: 关闭 WebSocket，终止子进程，清理 pending requests
- `handleMessage()`: JSON-RPC 三路分发（普通响应 / 通知 / 服务端请求），此前服务端请求被误当响应并静默丢弃，现已修正
- `handleServerRequest()` / `sendServerRequestReply()`: 服务端发起 JSON-RPC 请求（带 `method`+`id`）的 dispatch + JSON-RPC 回写（成功回 `result`，缺 handler 回 `-32601`，handler 抛错回 `-32603`）
- `request()`（protected）: 客户端发起 JSON-RPC 请求，带可选超时
- `addNotificationHandler()` / `removeNotificationHandler()`: 通用 JSON-RPC 通知订阅
- `registerServerRequestHandler()` / `unregisterServerRequestHandler()`: 服务端请求 handler 注册表

## 维护约束

- 仅拥有传输层职责（进程 + JSON-RPC），不包含任何 app-server route 的类型化 wrapper（那些在 `CodexAppServerClient`）
- `request()` 为 `protected` 以便子类调用；其余 transport 字段同样为 `protected`
- 内部 `JsonRpcRequest` / `JsonRpcInbound` 接口不导出，仅在本文件内使用
