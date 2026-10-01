# CodexElicitationBridge

> **源码**: `src/core/agents/backend/CodexElicitationBridge.ts`
> **状态**: [REVIEW]
> **新增**: 2026-09-30 — Codex 0.159.0 `mcpServer/elicitation/request` 桥接（form/url 两种渲染模式 + wire param 类型 + host seam），镜像 `ClaudeCodeElicitationBridge` 模式；按 3+ 复用阈值规则不抽公共 helper（当前仅 2 个 consumer）。

## 概述

Codex app-server 的 MCP elicitation 桥。把 server→client 的 `mcpServer/elicitation/request` 请求转成 OpenCodian 既有 question-card UI，再把用户选择回写为 JSON-RPC reply（`{action, content?}`）。与 Claude elicitation bridge 相同的分层：builder 纯函数（可单测）+ 可变的 host context + 惰性读取的 factory。

## 职责

- 定义 wire 类型：`CodexMcpElicitationWireParams` discriminated union（`form` / `url` / `openai-form` 三模式，公共字段 `serverName`/`threadId`/`turnId?`），以及 form 模式的 `CodexElicitationFormSchema` / `CodexElicitationPropertySchema`（覆盖 0.159.0 schema dump 的 enum / oneOf / anyOf / items 变体）
- `isCodexElicitationWireParams` 窄化 runtime guard（JSON-RPC params 不带类型抵达）
- `buildCodexElicitationQuestionRequest(formParams)` — form 模式：每个 schema property 一个 `custom: true` 自由文本 prompt；enum/oneOf → options；`type: 'array'` → `multiple: true`；无 properties 时回退单个 Accept/Decline 确认卡
- `buildCodexElicitationUrlQuestionRequest(urlParams)` — url 模式确认卡（Accept 携带 url description / Decline）
- `buildCodexElicitationContent(questionRequest, answers, source)` — 把 inline-card answers 按 `requestedSchema` 回填为结构化 content（number/integer → Number、boolean → true/false 词表、multiple → string[]）；回退卡的 Decline 选择产出空 content
- `isCodexElicitationDecline` — 检测回退卡 Decline 选择（adapter 据此把 accept 改判为 decline）
- host seam：`CodexElicitationCardRenderer`（UI 回调接口）、`CodexElicitationHostContext`（结构性兼容 plugin 的 `CodexApprovalHostContext`）、`CodexElicitationBridgeHost` + `createCodexElicitationBridgeHost(getContext)`（惰性读取 context，renderer 缺失时返回 null，adapter 降级为 cancel）

## 维护约束

- `openai/form` / `openaiForm` 模式不渲染：adapter 记录 trace + warn 后回复 `{action:'decline'}`，让 MCP server 应用默认行为
- url 模式由 adapter 负责 `window.open(url, '_blank')`（Obsidian 惯例，无 obsidian API 依赖），bridge 只构建确认卡
- 与 Claude bridge 保持镜像但不共享 helper：两处 consumer 低于仓库 3+ 抽象阈值；修改一边时同步检查另一边
- builder 为纯函数，不触碰 DOM / obsidian API；所有 UI 经由 host context 的 renderer
