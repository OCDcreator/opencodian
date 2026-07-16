# capabilityLabBackendTabs

> **源码**: `src/features/settings/capabilityLabBackendTabs.ts`
> **状态**: [REVIEW]

## 概述

Capability Lab backend tabs 的 descriptor-driven DOM controller。它只负责标签导航、ARIA、选择状态、首次挂载与缓存，不知道 Claude Code、OpenCode 或 Codex 的具体内容。

## 公开接口

- `createCapabilityLabBackendTabs(options)`: 按 descriptor 顺序创建 tablist、三个稳定 tabpanel shell 和 controller。
- `CapabilityLabBackendTabDescriptor`: 定义 `id`、本地化 label、可见状态读取和 panel renderer。
- `CapabilityLabBackendTabRenderContext`: 提供 `refreshState()` 与 `isCurrent()`，供异步 renderer 拒绝 disposed/detached generation 的更新。
- `CapabilityLabBackendTabsController`: 提供 `activate()`、`refreshState()`、`getActiveId()` 和 `dispose()`。

## 选择与持久化

初始选择顺序是：合法 persisted id → 当前 `activeBackend` → descriptor 第一项。生产 descriptor 第一项固定为 Claude Code。点击或 Enter/Space 激活时调用 `onPersist(id)`，只更新 `capabilityLabSelectedBackend`，不修改 `activeBackend`、enabled backends、实验 gate 或运行时配置。

## 可访问性与生命周期

- tablist 使用 `role="tablist"` 和本地化 accessible label。
- tab 使用 `role="tab"`、`aria-selected`、`aria-controls` 和 roving `tabindex`。
- panel 使用 `role="tabpanel"`、`aria-labelledby`、稳定 id 和原生 `hidden`。
- ArrowLeft/ArrowRight/Home/End 只移动焦点；Enter/Space 和 pointer 才激活。
- panel 首次激活时调用 renderer，成功后设置 `data-capability-panel-mounted="true"`；切换回来复用已挂载 DOM。
- focus-only 导航不会触发 renderer，也不会启动 Claude 自动读取。
- `dispose()` 移除事件和 root；detached root/panel 让 render context 变为 stale。

## 样式合同

稳定 selectors 是 `[data-capability-backend-tablist]`、`[data-capability-backend-tab]` 和 `[data-capability-backend-panel]`。rail 为固定 13px、单行 underline tabs；320px 窄容器只允许 rail 自身横向滚动，页面和 backend workspace 不得横向溢出。rail 使用 `space-sm` 内边距和 scroll padding，确保滚动到首尾 tab 后外置 focus ring 四边仍完整可见。除 rail 外，只有 `.opencodian-capability-lab-table-shell` 可以拥有 `overflow-x: auto`。
