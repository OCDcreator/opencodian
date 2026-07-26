# ContextCompactionActionController

> **源码**: `src/features/chat/ui/ContextCompactionActionController.ts`
> **状态**: [REVIEW]

## 概述

`ContextCompactionActionController` 是 `ContextDetailModal` 底部 Codex foreground compaction action 的交互 owner。它将高风险状态机与 modal 的 context usage 展示分开：根据 coordinator 的当前 identity/availability 构建扁平 action row，处理一次确认、requesting、ACK accepted、runtime verified、timeout、failure 与 stale 结果，并统一维护按钮 disabled、`role=status`、`aria-live`、`aria-atomic`、`aria-busy` 与 focus-safe 状态。

## 核心接口

`ContextDetailModalCompactionCoordinator` 由 `ActiveTabContextUsageCoordinator` 实现：

- `getForegroundCompactionControl()` 提供 `visible`、session/thread/title 与四态 availability
- `compactForegroundThread(options?)` 精确接收 coordinator 已 fencing 的请求，并通过 `onAccepted` 暴露 ACK（不是 success）

`ContextCompactionActionController.render(containerEl)` 仅在 `visible=true` 时追加 action row；每次 render/dispose 都推进 surface generation，旧请求的 ACK 或结果不能写入关闭后重建的 modal surface。`dispose()` 清理 in-flight 引用；重建时的 disabled/busy 状态始终来自 coordinator 的 authoritative availability，而不是旧 surface 的 accepted/success 状态。它不访问 backend adapter、conversation storage 或 token state。

## 状态与无障碍

- `available` 才启用按钮； `unavailable`、`invalid-thread`、`busy` 明确展示禁用原因。
- target thread id 使用 monospace、`user-select:text` 与 `overflow-wrap:anywhere`，因此完整 id 在 346px 窄宽也不会产生横溢。
- 确认文案和按钮 accessible name 都包含精确 thread id；取消不调用 coordinator。点击时会把显示时的 tab/session/thread expected identity 传回 coordinator，防止先切 tab 后把同一按钮误发往新线程。
- ACK 只显示“已受理，等待权威验证”；`verified` 仅在结果全部 authoritative evidence 字段成立时显示成功。
- timeout（含 acknowledged）、failed、malformed、unavailable、invalid、busy 与 stale 各自使用诚实文案；`timeout-accepted` 使用中性的 `is-pending-verification` 警示样式，不伪装成 error 或 success；late stale 结果不会刷新 UI 成功状态。
- status 统一 `role=status`、`aria-live=polite`、`aria-atomic=true`；requesting/accepted 与初始 busy 设置 `aria-busy=true`。Button 使用原生 `<button type="button">`、显式 `aria-label` 与 disabled/focus-visible 语义。

## 关系

`ContextDetailModal` 仅持有 controller，并在 `onOpen`/`onClose` 调用 `render`/`dispose`；`dispose()` 会清除当前 surface 的 in-flight 引用，`isClosed` 与 surface-generation fences 共同阻止 late result 写入重建后的 surface；`ActiveTabContextUsageCoordinator` 持有 tab/session stale identity、后端精确 session dispatch 与 verified 后 `refreshFromServer()`，保证此模块不合成 token usage。
