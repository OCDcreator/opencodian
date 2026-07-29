# OpenCodeSdkFacade

> 2026-07-29: SDK namespace calls record path, duration, outcome and inferred session correlation through the optional trace port.

> **源码**: `src/core/opencode/OpenCodeSdkFacade.ts`
> **状态**: [REVIEW]

## 概述

`OpenCodeSdkFacade` 是覆盖 OpenCode SDK v2 全 namespace 的薄包装层。它不改变 SDK 的 namespace 结构，只统一做三件事：

- 以当前 `baseUrl` / 认证头 / `directory` 作用域创建客户端
- 提供不含连接或认证原文的内存代次，供 capability discovery 判断已缓存的服务端证据是否仍对应当前连接
- 兼容 unwrap 直接数据与 `{ data }` 形状
- 把非标准错误统一归一化成 `Error`
- 在 `app.skills()` 结果上附带同一 app namespace 的 `app.agents()` promise sidecar，供 chat composer catalog 在不加厚 view host 的情况下复用 runtime agent truth
- 对外导出共享的 structured-error message helper 与 `OpenCodeServiceDiagnostics`，供 `OpenCodeService` 的 prompt/health/probe/logging follow-up 复用同一套错误整形口径

当前 façade 覆盖的 namespace 与 OpenCode OpenAPI 对齐，包括 `app`、`auth`、`command`、`config`、`event`、`experimental`、`file`、`find`、`formatter`、`global`、`instance`、`lsp`、`mcp`、`part`、`path`、`permission`、`project`、`provider`、`pty`、`question`、`session`、`tool`、`tui`、`v2`、`vcs`、`worktree`。

## 核心逻辑

- 顶层与嵌套 namespace 都通过递归 `Proxy` 暴露，例如 `global.syncEvent.subscribe()`、`mcp.auth.start()`、`provider.oauth.callback()`。
- 每次方法调用都会重新解析当前客户端实例，因此 `OpenCodeService` 更新 `baseUrl`、认证或 `directory` 后不需要重建整个 façade。
- `getConnectionSignature()` 仅返回 opaque 内存代次；连接身份仅在 facade 私有内存中比较，URL、directory 和所有认证 header 的大小写无关 salted fingerprint 均不会被返回、持久化或记录到日志。每次 SDK 调用也会观察该身份，因而异步 probe 中经过临时连接后即使回到原配置，也不会把混合 evidence 当作原连接结果缓存。任何有效 endpoint、directory 或认证变化都会令 capability coordinator 下次读取时重建 presence-only snapshot。
- `extractSdkErrorMessage()` / `describeSdkError()` 与 `normalizeSdkError()` 共用同一套 message/status 解析规则；`OpenCodeServiceDiagnostics` 也直接复用这套 helper，而不是在 service/local owner 里重复定义。
- `OpenCodeAppCatalogSidecar.getAttachedOpenCodeAppAgents()` 只读取 façade 在 `app.skills()` 返回值上附带的不可枚举 sidecar；如果 `app.agents()` 失败，sidecar promise 会安全回退为空数组，不影响原始 skills 结果。
- `OpenCodeServiceDiagnostics` 额外集中处理 transient connectivity suppression、assistant finalization debug payload 与 probe/assistant error 文本；它仍然使用 `OpenCodeService` logger 名称，避免改变现有日志来源标签。
- `subscribeSessionEvents(signal)` 集中 session event stream 的 namespace 调用与 stream 解包，使 service 只装配 streaming runtime callback；trace-scoped façade 仍通过同一 options provider 注入 run context。
- façade 本身不承担产品语义；像工具目录缓存、MCP 状态缓存、事件总线和 legacy fallback 仍由 `OpenCodeService` 负责。

## 与其他模块的交互

- `OpenCodeService` 通过公开的 `sdk` 属性暴露这层 façade。
- 测试可以注入自定义 `clientFactory`，验证 namespace 是否完整、错误是否归一化、嵌套 namespace 是否可调用。

## 注意事项

- 这层的目标是“SDK 全接口接入”，不是“每个接口都立即有独立 UI”。
- `tool.list()` 只代表 OpenCode registry 工具，不包含 MCP 工具；MCP 仍需结合 `mcp.status` 和运行时观察处理。
