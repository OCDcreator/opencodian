# CodexAppServerTransport

> **源码**: `src/core/agents/backend/CodexAppServerTransport.ts`
> **状态**: [RUNTIME_ADJUNCT]

> **更新**: 构造函数新增可选 `workingDirectory`；`doStart` 的 `spawn` 在提供时以此作为 `cwd` 启动 owned app-server 进程，使项目级资源(`.agents/skills`、`.codex/agents`)相对 vault 解析。未提供时继承插件进程 cwd（向后兼容）。
> **更新**: Node `ws` 现在作为声明的直接依赖静态打进 `main.js`；transport 不再从插件目录动态 require `node_modules/ws`。
> **更新（2026-07-30）**: 构造函数新增可选 `wireObserver?: CodexAppServerWireObserver`（类型定义在 `CodexAppServerClientTypes.ts`）。设置后，transport 在 JSON-RPC 与连接生命周期的关键点（`onRequest` / `onResponse` / `onNotification` / `onServerRequest` / `onServerReply` / `onConnection`）调用对应回调，供 Codex 会话 trace 的 `CodexWireTraceBridge` 把线流量翻译为 `CodexWireRecord` 注入 trace service。请求超时时也会先以 `ok: false` 调用 `onResponse`，再 reject，确保 observer 能释放 id 关联并记录异常。`onServiceOutput` 按 chunk 动态返回是否已安全接管：trace disabled 时恢复 legacy stderr 行为，enabled 时不会把 raw stderr 写 console；包括属性 getter 在内的 observer 异常仅输出安全 generic 标记，绝不记录异常 message。其余 observer 调用经 `notifyObserver` 包裹，绝不影响 RPC 主路径。Codex adapter 在构造 transport 时通过 `tracePort.wireBridge` 注入 observer。

## 概述

从 `CodexAppServerClient` 拆出的基类，负责 Codex app-server 的进程生命周期与 JSON-RPC 2.0 plumbing。`CodexAppServerClient extends CodexAppServerTransport` 并在此基类之上添加类型化的 app-server API wrapper。

## 职责

- `start()` / `doStart()` / `waitForWsUrl()`: 启动 `codex app-server --listen ws://127.0.0.1:0` 子进程，从 stdout/stderr 扫描 WebSocket URL，连接并初始化 JSON-RPC 会话
- initialize 声明 `experimentalApi: true` 与 `requestAttestation: false`；此协商是否成功决定 Codex adapter 是否能启用真实会话上下文能力
- `stop()`: 关闭 WebSocket，终止子进程，清理 pending requests
- `handleMessage()`: JSON-RPC 三路分发（普通响应 / 通知 / 服务端请求），此前服务端请求被误当响应并静默丢弃，现已修正
- `handleServerRequest()` / `sendServerRequestReply()`: 服务端发起 JSON-RPC 请求（带 `method`+`id`）的 dispatch + JSON-RPC 回写（成功回 `result`，缺 handler 回 `-32601`，handler 抛错回 `-32603`）
- `request()`（protected）: 客户端发起 JSON-RPC 请求，带可选超时
- WebSocket transport 使用静态 `ws` import，避免三件套发布时依赖未声明的 plugin-local package
- `addNotificationHandler()` / `removeNotificationHandler()`: 通用 JSON-RPC 通知订阅
- `registerServerRequestHandler()` / `unregisterServerRequestHandler()`: 服务端请求 handler 注册表

## 维护约束

- 仅拥有传输层职责（进程 + JSON-RPC），不包含任何 app-server route 的类型化 wrapper（那些在 `CodexAppServerClient`）
- `request()` 为 `protected` 以便子类调用；其余 transport 字段同样为 `protected`
- 内部 `JsonRpcRequest` / `JsonRpcInbound` 接口不导出，仅在本文件内使用
