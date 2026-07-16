# capabilityLabBackendWorkspace

> **源码**: `src/features/settings/capabilityLabBackendWorkspace.ts`
> **状态**: [REVIEW]

## 概述

Capability Lab 的 backend workspace DOM owner。它被 Claude Code、OpenCode、Codex 三个 tabpanel 复用，统一创建语义 `section`、唯一标题、可见状态和扁平内容容器。

## 导出

- `createCapabilityLabBackendWorkspace(options)`: 创建带 `data-capability-backend`、`data-backend-state`、`data-section-block` 和 `aria-labelledby` 的 backend section，返回根节点和内容节点。
- `updateCapabilityLabBackendState(workspaceEl, state, stateLabel)`: OpenCode safe refresh 后更新 workspace 状态和可见状态文案。
- `CapabilityLabBackendId`: `claude-code | opencode | codex`。
- `CapabilityLabBackendState`: `available | empty | unconfigured | unknown`。

## 约束

- helper 只拥有 DOM 结构，不读取 adapter、SDK snapshot 或设置。
- backend workspace 必须由对应 backend tabpanel 直接拥有，tabpanel 外不再渲染完整 workspace。
- 禁止 backend workspace 嵌套；每条 backend 分支只能有一个完整视觉 surface owner。
- OpenCode safe refresh 只调用 `updateCapabilityLabBackendState()` 更新当前 workspace，不创建第二个 workspace，也不替换 tablist。
