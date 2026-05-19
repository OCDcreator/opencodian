# Multi-Agent Foundation Spec

> **状态**: `[DRAFT]`
> **前置依赖**: 无（是 multi-agent-board.md 的前置 spec）
> **关联 spec**: `docs/requirements/multi-agent-board.md`

## 概述

OpenCodian 当前的基座 agent 只有 OpenCode。本 spec 定义如何将基座从单一 OpenCode 扩展为支持多 agent（Claude Code、Codex、Copilot、Pi），为后续的编排层和看板奠定基础。

## 文件结构

```
docs/requirements/multi-agent-foundation/
├── README.md                  # 本文件 — 索引和总览
├── 01-agent-ecosystem.md      # Agent 生态调研 — 4 个 agent 的 SDK 能力对比
├── 02-architecture.md         # 架构设计 — Core + Capability Pattern
├── 03-opencode-adapter.md     # OpenCode adapter — 从现有代码抽取
├── 04-claude-code-adapter.md  # Claude Code adapter — 接入设计
├── 05-codex-adapter.md        # Codex adapter — 接入设计
├── 06-copilot-adapter.md      # Copilot adapter — 接入设计
├── 07-pi-adapter.md           # Pi adapter — 接入设计
└── 08-phased-rollback.md      # 分阶段实施计划和回滚策略
```

## 核心设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 架构模式 | Core + Capability | 每个能力是可选接口，支持优雅降级和渐进开发 |
| 接入模式 | 混合（每个 agent 用其 SDK 原生模式） | 4 个 SDK 的进程模型各不相同，统一接口但保留各自通信方式 |
| 用户交互 | 单 agent 会话切换 | 用户选择 agent，新会话用该 agent，旧会话保留 |
| 功能范围 | SDK 暴露的全部能力 | 每个 agent 的特有能力通过独有 capability 接口暴露 |
| 类型策略 | 强类型依赖 | 编译时检查，SDK 升级时改对应 adapter |
| 开发策略 | 先抽象 OpenCode，再扩展 | 风险最低，现有功能不 break |
| 事件类型 | 复用已有 StreamChunk | StreamChunk 已是传输无关的，不建新类型 |
| 目录结构 | 扩展已有 src/core/agents/ | 不新建 src/core/agent/，扩展现有 7 文件模块 |

## 关键现状（必读）

- `SurfaceAgent` 已存在（15 字段）— 扩展 `backend` 字段，不重定义
- `StreamChunk` 已是传输无关的 — 新 adapter 翻译到 StreamChunk 即可
- `Conversation.acpSessionId` 已预留 — 复用已有字段
- `src/core/acp/` 已有 agent 通信协议胚胎 — 复用概念
- `toolIdentity` 已有 `source: 'claudian' | 'codex'` — 新增 source 值
- `OpenCodeStreamEvent.properties.agent` 已存在 — 后端协议已多 agent 感知
- `openCodeService` 在 26 个文件中有 128 次调用 — 迁移规模大，需分批

## 阶段规划

| 阶段 | 目标 | 依赖 |
|------|------|------|
| Phase 0 | 抽象 OpenCode — 定义接口 + OpenCodeAdapter | 无 |
| Phase 1 | 接入第二个 agent（推荐 Claude Code） | Phase 0 |
| Phase 2 | 接入 Codex + Copilot | Phase 0 |
| Phase 3 | 接入 Pi | Phase 0 |
| Phase 4 | Agent 选择器 UI + 会话归属 | Phase 1-3 |
| Phase 5 | 与 multi-agent-board.md 的编排层对接 | Phase 4 |

## 与 multi-agent-board.md 的关系

本 spec 产出的 `AgentService` 接口体系是 board spec 中 `AgentAdapter` 的具体实现基础。当本 spec 完成后，board spec 的 Phase 0b（内部互联与 adapter 基线）可以直接复用这里的 adapter。
