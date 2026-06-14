# CodexAppServerClientTypes

> **源码**: `src/core/agents/backend/CodexAppServerClientTypes.ts`
> **状态**: [RUNTIME_ADJUNCT]

## 概述

从 `CodexAppServerClient` 拆出的纯类型模块，集中存放 Codex app-server 的所有 wire shapes（`export interface` / `export type`）。`CodexAppServerClient.ts` 通过 `export *` 重新导出这些类型，保持 `import { ... } from './CodexAppServerClient'` 的向后兼容。

## 职责

- 定义 app-server JSON-RPC 路由的请求/响应 wire 类型（thread、model、permission、account、MCP、review、thread-goal 等）
- 定义 `AppServerItem` union（verified against real Codex app-server output）
- 定义 `AppServerServerRequestHandler`（服务端发起 JSON-RPC 请求的 handler 签名，供 `CodexAppServerTransport` 使用）

## 维护约束

- 纯类型模块，无运行时代码，无副作用
- 新增 app-server route 的 wire shape 时在此文件追加，而不是回填到 `CodexAppServerClient.ts`
- `CodexAppServerClient.ts` 的 `export *` 会自动透传新增类型，无需同步修改
