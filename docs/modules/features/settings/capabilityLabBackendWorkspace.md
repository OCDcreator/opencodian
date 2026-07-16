# capabilityLabBackendWorkspace

> **源码**: `src/features/settings/capabilityLabBackendWorkspace.ts`
> **状态**: [REVIEW]

## 概述

Capability Lab 的 backend workspace DOM owner。它被各 backend tabpanel 复用，统一创建语义 `section`、唯一标题、可见状态和扁平内容容器；未来 backend 只需提供 descriptor 与 renderer，无需修改共享 workspace 类型。

## 导出

- `createCapabilityLabBackendWorkspace(options)`: 创建带 `data-capability-backend`、`data-backend-state`、`data-section-block` 和 `aria-labelledby` 的 backend section，返回根节点和内容节点。
- `updateCapabilityLabBackendState(workspaceEl, state, stateLabel)`: OpenCode safe refresh 后更新 workspace 状态和可见状态文案。
- `CapabilityLabBackendId`: 任意 descriptor backend `string`；原值写入 `data-capability-backend`，生成 DOM id 时会转为小写安全片段。
- `CapabilityLabBackendState`: `available | empty | unconfigured | unknown`。

## 约束

- helper 只拥有 DOM 结构，不读取 adapter、SDK snapshot 或设置。
- backend 原始 id 保留在数据属性中；`aria-labelledby` 目标 id 仅包含字母、数字、`_` 与 `-`，避免未来 descriptor id 破坏 DOM 引用。
- backend workspace 必须由对应 backend tabpanel 直接拥有，tabpanel 外不再渲染完整 workspace。
- 禁止 backend workspace 嵌套；每条 backend 分支只能有一个完整视觉 surface owner。
- OpenCode safe refresh 只调用 `updateCapabilityLabBackendState()` 更新当前 workspace，不创建第二个 workspace，也不替换 tablist。
