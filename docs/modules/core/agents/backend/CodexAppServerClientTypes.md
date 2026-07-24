# CodexAppServerClientTypes

> **源码**: `src/core/agents/backend/CodexAppServerClientTypes.ts`
> **状态**: [RUNTIME_ADJUNCT]

> **新增类型**: `AppServerSkill`（name/description?/path?/enabled?/scope?）与 `AppServerListSkillsOptions`（cwd?/forceReload?），描述 app-server `skills/list` 只读结果。插件永不写入全局 Codex skills。

> **新增类型（2026-07-24）**: `AppServerThreadEffectiveSettings` —— `thread/start`/`thread/resume` 响应中**服务端确认**的有效设置，形状对齐 Codex 0.144.1 生成的 bindings：`sandbox` 为判别对象 `AppServerSandboxPolicy`（`dangerFullAccess` / `readOnly` / `workspaceWrite` / 未知 type），`activePermissionProfile` 为 `AppServerEffectivePermissionProfile`（`{ id, extends? }`），`approvalPolicy` 为 `AppServerApprovalPolicyEffective`（已知标量或粒度对象），外加 model/modelProvider/cwd/runtimeWorkspaceRoots/instructionSources/approvalsReviewer/reasoningEffort。这是 runtime 证据轴的载体：缺失字段意为 `unavailable`（旧版 app-server 不回显），**非**请求侧值的伪回读。插件 UI 策略仍限 `inherit|untrusted|on-request|never`，与运行时证据的更宽形状分离。

## 概述

从 `CodexAppServerClient` 拆出的纯类型模块，集中存放 Codex app-server 的所有 wire shapes（`export interface` / `export type`）。`CodexAppServerClient.ts` 通过 `export *` 重新导出这些类型，保持 `import { ... } from './CodexAppServerClient'` 的向后兼容。

## 职责

- 定义 app-server JSON-RPC 路由的请求/响应 wire 类型（thread、model、permission、account、MCP、review、thread-goal 等）
- 定义实验主聊天的 `AppServerThreadStartOptions`、`AppServerThreadResumeOptions`、`AppServerTurnStartOptions` 与 `AppServerThreadNotification`
- 定义 `AppServerThreadTokenUsageUpdatedNotification`：`total` 是累计权威 token，`last` 是当前回合 token，`modelContextWindow` 是 Context Ring 分母
- 定义 `AppServerItem` union（verified against real Codex app-server output）
- 定义 `AppServerServerRequestHandler`（服务端发起 JSON-RPC 请求的 handler 签名，供 `CodexAppServerTransport` 使用）

## 维护约束

- 纯类型模块，无运行时代码，无副作用
- 新增 app-server route 的 wire shape 时在此文件追加，而不是回填到 `CodexAppServerClient.ts`
- `CodexAppServerClient.ts` 的 `export *` 会自动透传新增类型，无需同步修改
