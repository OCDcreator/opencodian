# CodexAppServerClientTypes

> **源码**: `src/core/agents/backend/CodexAppServerClientTypes.ts`
> **状态**: [RUNTIME_ADJUNCT]

> **P1 grouped skills readback（2026-07-24）**: `AppServerSkill` 除既有 name/description/path/enabled/scope 外，防御式保留 `source`、`shortDescription`、`interface`、`dependencies`；`AppServerSkillGroup` 以 `{ cwd: string | null, skills, errors }` 保留每个 cwd 分组，`AppServerSkillError` 保留服务端的 path/message。`AppServerListSkillsOptions` 仍为 cwd?/forceReload?。

> **新增类型（2026-07-24）**: `AppServerThreadEffectiveSettings` —— `thread/start`/`thread/resume` 响应中**服务端确认**的有效设置，形状对齐 Codex 0.144.1 生成的 bindings：`sandbox` 为判别对象 `AppServerSandboxPolicy`（`dangerFullAccess` / `readOnly` / `workspaceWrite` / 未知 type），`activePermissionProfile` 为 `AppServerEffectivePermissionProfile`（`{ id, extends? }`），`approvalPolicy` 为 `AppServerApprovalPolicyEffective`（已知标量或粒度对象），外加 model/modelProvider/cwd/runtimeWorkspaceRoots/instructionSources/approvalsReviewer/reasoningEffort。这是 runtime 证据轴的载体：缺失字段意为 `unavailable`（旧版 app-server 不回显），**非**请求侧值的伪回读。插件 UI 策略仍限 `inherit|untrusted|on-request|never`，与运行时证据的更宽形状分离。

## 概述

从 `CodexAppServerClient` 拆出的纯类型模块，集中存放 Codex app-server 的所有 wire shapes（`export interface` / `export type`）。`CodexAppServerClient.ts` 通过 `export *` 重新导出这些类型，保持 `import { ... } from './CodexAppServerClient'` 的向后兼容。

## 职责

- 定义 app-server JSON-RPC 路由的请求/响应 wire 类型（thread、model、permission、account、MCP、review、thread-goal 等）
- 定义实验主聊天的 `AppServerThreadStartOptions`、`AppServerThreadResumeOptions`、`AppServerTurnStartOptions` 与 `AppServerThreadNotification`
- 定义 `AppServerThreadTokenUsageUpdatedNotification`：`total` 是累计权威 token，`last` 是当前回合 token，`modelContextWindow` 是 Context Ring 分母
- 定义 `thread/compact/start` 的 ACK-only outcome：0.144.1 的精确 `{}` 仅为 `accepted`，`unavailable`、`invalid-thread`、`failed`、`malformed`、`timed-out` 保持可区分；该 wire 结果绝不表示运行时压缩完成
- 定义 `AppServerItem` union（verified against real Codex app-server output）
- 定义 `skills/list` 的扁平 skill metadata 以及供设置页使用的 cwd/error 分组 readback 类型
- 定义 `hooks/list` 的 cwd 分组、HookMetadata（`key`/`eventName`/`handlerType` 为必需身份字段，其余字段可选）、错误和 `available|empty|unavailable|failed|malformed` 只读 readback outcome 类型
- 定义 `AppServerServerRequestHandler`（服务端发起 JSON-RPC 请求的 handler 签名，供 `CodexAppServerTransport` 使用）

## 维护约束

- 纯类型模块，无运行时代码，无副作用
- 新增 app-server route 的 wire shape 时在此文件追加，而不是回填到 `CodexAppServerClient.ts`
- `CodexAppServerClient.ts` 的 `export *` 会自动透传新增类型，无需同步修改

> **新增（2026-07-30）**: `CodexAppServerWireObserver` —— app-server 线流量观察者契约（全部方法可选）。`onRequest` / `onResponse` / `onNotification` / `onServerRequest` / `onServerReply` 对应客户端与服务端发起的 JSON-RPC 各分支，`onConnection` 覆盖连接状态机（starting / ws-url / connected / closed / error / initialized / stopped）。`CodexAppServerTransport` 经 `notifyObserver` 包裹调用，observer 抛错绝不影响 RPC 主路径。该接口是 Codex 会话 trace 的权威 wire 契约：`CodexWireTraceBridge`（`diagnostics/CodexWireTraceBridge.ts`）实现此接口，把线记录翻译为 `CodexWireRecord` 注入 `CodexSessionTraceService`；Task 5 的本地临时声明已在 Task 7 收敛到此权威定义。
