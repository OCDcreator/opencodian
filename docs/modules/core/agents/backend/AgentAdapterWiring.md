# AgentAdapterWiring

> **源码**: `src/core/agents/backend/AgentAdapterWiring.ts`
> **状态**: [STABLE]
> **Updated**: 2026-06-09 Checkpoint 4 — Codex now public, accepts `codexSettings`
> **Updated**: 2026-07-24 — Codex adapter construction now forwards `approvalPolicy` from `CodexBackendSettings` (default `inherit`)
> **Updated**: 2026-07-28 — Codex now resolves only a user-installed CLI via `CodexCliResolver`; plugin-private runtime binaries are no longer considered.
> **Updated（2026-07-30）**: 新增可选入参 `codexTracePort?: CodexTracePort`（来自 `diagnostics/types.ts`）。设置后透传给 `CodexAdapter` 的 `tracePort`，使会话/回合生命周期与 app-server 线流量经 try/catch 守卫流入 `CodexSessionTraceService`；缺省时（既有调用方）adapter 不插桩任何 trace，行为不变。

## 概述

`AgentAdapterWiring.ts` 负责将所有 agent adapter（包括隐藏后端）注册到 `AgentServiceRegistry`。从 `main.ts` 中提取出来以遵循 owner-guard 约束：不在 thick-owner 入口文件中增长运行时注册逻辑。

## 职责

- 接受已构造的 user-facing adapters 数组，逐个注册到 registry
- 当 `vaultPath` 可用时，注册 `CodexAdapter`（已加入 `IMPLEMENTED_AGENT_BACKENDS`，用户可见）
- 通过 `resolveCodexCli()` 按显式设置 → GUI PATH / Windows npm shim 的顺序解析用户安装的 CLI，并把解析结果与绝对路径传入适配器
- 接受 `codexSettings` 参数（`CodexBackendSettings`），将 `apiKey` 透传给适配器
- 调用方仍需调用 `registry.setEnabledBackends()` 来激活用户可见后端

## 维护约束

- 公开注册：Codex adapter 已加入 `IMPLEMENTED_AGENT_BACKENDS`，用户可在 UI 选择和配置
- `CodexCliResolver` 的显式无效路径不得静默回退；空路径才允许自动发现
- Windows 的 npm `codex.cmd` 不能直接交给 SDK spawn；必须验证 npm 全局包布局并定位同包 native `codex.exe`
- 不得从插件目录或发布包的 `node_modules` 解析 Codex 原生二进制
- 为保持入口层 bootstrap 调用形状兼容，`pluginDir` 可继续传入但在本模块中被刻意忽略
- 新增隐藏后端时在此函数中追加注册逻辑，不要回到 `main.ts`
- adapter 的构造（需要 plugin context）仍在调用方完成，此模块只负责注册和路径解析
