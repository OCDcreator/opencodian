# CodexAppServerTransport
> 2026-09-30（Codex 0.159.0 协议升级）：**WebSocket 断线重连**。意外 close（非 stop()/dispose）时：reject 全部 pending 请求（错误信息 `App-server WebSocket closed unexpectedly; pending request aborted`，绝不悬挂）→ 指数退避重连（1s/2s/4s/8s/16s，最多 5 次尝试，约 31s 预算）→ 复用已存 wsUrl 重新 `connectAndInitialize`（重跑 initialize 握手；server-request handler 注册表从不随 close 清除，自动恢复）→ 成功调用 `onReconnect`、预算耗尽调用 `onReconnectFailed(error)`（fail-closed：此后原始 request 立即拒绝，下一次 `start()` 会完整 respawn 新进程）。`stop()` 设置 `stopRequested`、取消退避 sleep，绝不触发重连。重连期间调用 `start()` 会 await 进行中的 reconnectPromise 而不是 spawn 第二个进程。新增连接状态 `reconnecting`（wire observer）。构造函数 options 新增 `onReconnect?` / `onReconnectFailed?`。JSON-RPC 错误现在把 `code`/`data` 附在 Error 上（message 不变），供 `isAppServerMethodNotFoundError` 等谓词分类。

> **源码**: `src/core/agents/backend/CodexAppServerTransport.ts`

> **源码**: `src/core/agents/backend/CodexAppServerTransport.ts`
> **状态**: [RUNTIME_ADJUNCT]

> 2026-09-21 (advantage-parity R-F7)：传输 options 新增 `getExtraEnv`；spawn env 非空时以 `toPlainStringEnv(process.env)` 为底叠加域 env；导出 `toPlainStringEnv` 供 CodexAdapter 复用。

> **更新**: 构造函数新增可选 `workingDirectory`；`doStart` 的 `spawn` 在提供时以此作为 `cwd` 启动 owned app-server 进程，使项目级资源(`.agents/skills`、`.codex/agents`)相对 vault 解析。未提供时继承插件进程 cwd（向后兼容）。
> **更新**: Node `ws` 现在作为声明的直接依赖静态打进 `main.js`；transport 不再从插件目录动态 require `node_modules/ws`。
> **更新（2026-07-30）**: 构造函数新增可选 `wireObserver?: CodexAppServerWireObserver`（类型定义在 `CodexAppServerClientTypes.ts`）。设置后，transport 在 JSON-RPC 与连接生命周期的关键点（`onRequest` / `onResponse` / `onNotification` / `onServerRequest` / `onServerReply` / `onConnection`）调用对应回调，供 Codex 会话 trace 的 `CodexWireTraceBridge` 把线流量翻译为 `CodexWireRecord` 注入 trace service。请求超时时也会先以 `ok: false` 调用 `onResponse`，再 reject，确保 observer 能释放 id 关联并记录异常。`onServiceOutput` 按 chunk 动态返回是否已安全接管：trace disabled 时恢复 legacy stderr 行为，enabled 时不会把 raw stderr 写 console；包括属性 getter 在内的 observer 异常仅输出安全 generic 标记，绝不记录异常 message。其余 observer 调用经 `notifyObserver` 包裹，绝不影响 RPC 主路径。Codex adapter 在构造 transport 时通过 `tracePort.wireBridge` 注入 observer。

## 概述

从 `CodexAppServerClient` 拆出的基类，负责 Codex app-server 的进程生命周期与 JSON-RPC 2.0 plumbing。`CodexAppServerClient extends CodexAppServerTransport` 并在此基类之上添加类型化的 app-server API wrapper。

## 职责

- `start()` / `doStart()` / `waitForWsUrl()`: 启动 `codex app-server --listen ws://127.0.0.1:0` 子进程，从 stdout/stderr 扫描 WebSocket URL，连接并初始化 JSON-RPC 会话
- `connectAndInitialize(wsUrl, initializeTimeoutMs?)`: 打开 WebSocket、挂 JSON-RPC handlers、重跑 initialize 握手 + `initialized` 通知；初始启动与重连共用（2026-09-30）
- WebSocket reconnect：意外 close 后的指数退避重连、握手重跑、`onReconnect` / `onReconnectFailed` 回调、pending 请求 clear-reject；`stop()` 绝不重连（2026-09-30，详见顶部条目）
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
