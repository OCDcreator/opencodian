# OpenCodeSdkFacade

> **源码**: `src/core/opencode/OpenCodeSdkFacade.ts`
> **状态**: [REVIEW]

## 概述

`OpenCodeSdkFacade` 是覆盖 OpenCode SDK v2 全 namespace 的薄包装层。它不改变 SDK 的 namespace 结构，只统一做三件事：

- 以当前 `baseUrl` / 认证头 / `directory` 作用域创建客户端
- 兼容 unwrap 直接数据与 `{ data }` 形状
- 把非标准错误统一归一化成 `Error`
- 对外导出共享的 structured-error message helper，供 `OpenCodeService` 的 prompt/health/probe follow-up 复用同一套错误整形口径

当前 façade 覆盖的 namespace 与 OpenCode OpenAPI 对齐，包括 `app`、`auth`、`command`、`config`、`event`、`experimental`、`file`、`find`、`formatter`、`global`、`instance`、`lsp`、`mcp`、`part`、`path`、`permission`、`project`、`provider`、`pty`、`question`、`session`、`tool`、`tui`、`vcs`、`worktree`。

## 核心逻辑

- 顶层与嵌套 namespace 都通过递归 `Proxy` 暴露，例如 `global.syncEvent.subscribe()`、`mcp.auth.start()`、`provider.oauth.callback()`。
- 每次方法调用都会重新解析当前客户端实例，因此 `OpenCodeService` 更新 `baseUrl`、认证或 `directory` 后不需要重建整个 façade。
- `extractSdkErrorMessage()` / `describeSdkError()` 与 `normalizeSdkError()` 共用同一套 message/status 解析规则；service-local follow-up 现在也通过这组 helper 复用相同口径，而不是各自手写一份。
- façade 本身不承担产品语义；像工具目录缓存、MCP 状态缓存、事件总线和 legacy fallback 仍由 `OpenCodeService` 负责。

## 与其他模块的交互

- `OpenCodeService` 通过公开的 `sdk` 属性暴露这层 façade。
- 测试可以注入自定义 `clientFactory`，验证 namespace 是否完整、错误是否归一化、嵌套 namespace 是否可调用。

## 注意事项

- 这层的目标是“SDK 全接口接入”，不是“每个接口都立即有独立 UI”。
- `tool.list()` 只代表 OpenCode registry 工具，不包含 MCP 工具；MCP 仍需结合 `mcp.status` 和运行时观察处理。
