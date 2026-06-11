# AgentAdapterWiring

> **源码**: `src/core/agents/backend/AgentAdapterWiring.ts`
> **状态**: [STABLE]
> **Updated**: 2026-06-09 Checkpoint 4 — Codex now public, accepts `codexSettings`

## 概述

`AgentAdapterWiring.ts` 负责将所有 agent adapter（包括隐藏后端）注册到 `AgentServiceRegistry`。从 `main.ts` 中提取出来以遵循 owner-guard 约束：不在 thick-owner 入口文件中增长运行时注册逻辑。

## 职责

- 接受已构造的 user-facing adapters 数组，逐个注册到 registry
- 当 `vaultPath` 可用时，注册 `CodexAdapter`（已加入 `IMPLEMENTED_AGENT_BACKENDS`，用户可见）
- 通过 `resolveCodexBinaryPath()` 解析 Codex CLI 二进制绝对路径，作为 `codexPathOverride` 传入适配器
- 接受 `codexSettings` 参数（`CodexBackendSettings`），将 `apiKey` 透传给适配器
- 调用方仍需调用 `registry.setEnabledBackends()` 来激活用户可见后端

## 维护约束

- 公开注册：Codex adapter 已加入 `IMPLEMENTED_AGENT_BACKENDS`，用户可在 UI 选择和配置
- `resolveCodexBinaryPath()` 必须在 wiring 阶段解析绝对路径：Obsidian 插件 `__filename` 不指向插件目录，SDK 的 `require.resolve` 链会失败，因此必须显式解析
- `resolveCodexBinaryPath()` 的 platform/arch → target triple 映射必须与 SDK 源码中的 `PLATFORM_PACKAGE_BY_TARGET` 保持一致
- 新增隐藏后端时在此函数中追加注册逻辑，不要回到 `main.ts`
- adapter 的构造（需要 plugin context）仍在调用方完成，此模块只负责注册和路径解析
