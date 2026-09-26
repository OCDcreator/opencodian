# BackgroundTaskInlinePanelRenderer
> 2026-09-25（ZCode 进程重连）：原生任务读取失败时把当前 running 卡片暂时显示为 `interrupted`，同时保留每 3 秒一次的活动标签读回。此前失败分支取消轮询，重连后即使原生 `session/backgroundTaskRead` 已返回确定终态，卡片仍停在“连接中断”。现在重新读回同会话的确定终态后替换卡片；跨标签/会话租约仍由现有检查约束。
> 2026-09-25 (FA880 ZCode): The inline renderer adds a native background-task list under the active ZCode transcript. It shows taskId, native status, and a Cancel task button only for running/cancellable jobs. A one-second read refresh follows running jobs; a lost connection marks their last visible state interrupted rather than leaving a spinner. Cancel uses the original sessionId/taskId and verifies terminal native readback.
> Follow-up: `watchNativeTasks` starts at ZCode conversation activation even when the first native task list is empty, then polls only the active tab. This makes a later Bash task appear without a manual render call.
> The timeline clear callback re-arms this watch for the original ZCode tab when a new turn resets legacy inline panels; `disposeNativeTaskWatch` stops all timers when the chat view closes.
> 2026-09-25 cross-tab fix: native task reads resolve the canonical conversation for their tab instead of trusting an activation's captured conversation. A late read whose session no longer owns the tab cannot replace the panel; the next active-tab poll re-reads the current session. This keeps task IDs and cancel buttons on their original ZCode tab.
> 2026-09-25 card hierarchy correction: each native task row now uses the shared notice card anatomy: status icon, description title, separate native status badge, selectable monospace task ID, and an action footer only while cancellable. Failed/interrupted states keep distinct text and icons, and only a running icon animates. This replaces the former single concatenated text span that inherited only the common outer border.
> After FA880 reconnect exposed overlapping reads and a transport protocol failure, the watch admits one read per tab and polls every three seconds. A failed read preserves an interrupted row and continues bounded polling so a later native terminal readback can refresh that row without tab re-activation.
> 2026-09-25 native recovery: a later successful read replaces the interrupted row with a verified persisted `completed`/`failed` or neutral `stopped` terminal status when ZCode wrote a matching task notification. A launch without an ending becomes non-cancellable `unknown`; the card never claims completion from the mere existence of a Bash launch or output path.

> **源码**: `src/features/chat/runtime/BackgroundTaskInlinePanelRenderer.ts`
> **状态**: [REVIEW]

## 概述

`BackgroundTaskInlinePanelRenderer` 是 background-task lane 的 inline notice DOM renderer。它把 `OpenCodianView` 里仍然成块耦合的 inline panel 创建、挂载、复用、清理与 Markdown 渲染，从主 view 中抽成独立 runtime helper。

## 公开接口

- `render()`：根据 `BackgroundTaskTimelineService.collectInlineSegments()` 的结果，更新当前 tab 下各个 anchor 的 inline panel
- `clear()`：移除当前 tab 已挂载的 background-task inline panel，并清空 active indicator element 引用
- `BackgroundTaskInlinePanelRendererHost`：只暴露当前 tab、runtime 容器查询，以及 Markdown 渲染这三个 DOM renderer 真正需要的能力

## 设计目的

- 让 `OpenCodianView` 不再直接维护 background-task inline panel 的 DOM 创建、位置挂载与 stale panel 清理细节
- 让 `BackgroundTaskTimelineService` 继续只负责 timeline segment / inline copy 推导，而不是重新拿回 DOM 责任
- 让 active indicator element 的附着与清理逻辑可以脱离大视图类做更小范围的单测

## 注意事项

- 这个模块只负责 inline panel DOM 生命周期，不负责 timeline 推导、suppression、completion notice queue 或 stale 判定
- copy 文案继续来自 `BackgroundTaskTimelineService.getInlineCopy()`；不要在 renderer 内重新拼装 background-task 文案
- authoritative-sync gate、stopped/stale notice、completion notice queue/flush，仍分别由 `BackgroundTaskLiveSignalCoordinator`、`BackgroundTaskNoticeStateService` 与 `BackgroundTaskIndicatorCoordinator` 负责
- `OpenCodianView` 仍保留 background-task service bundle 的 host wiring；`renderBackgroundTaskIndicatorIfNeeded()` 的 render/queue/flush 顺序现在由 `BackgroundTaskIndicatorCoordinator` 承接
- `render()` 可接收 `isCurrent` lease；Markdown、晚到的 detail/tasks 渲染及每个 segment 的 DOM 提交前后都必须通过该 lease。若 panel 已在 await 前创建而 lease 失效，会同步从 runtime map 和 DOM 移除，旧会话切换后不留下空/半成品壳
- 每个 runtime 维护单调递增的 render generation；重叠 render 只允许最新 generation 复用/提交 panel，旧 generation 在 await 返回后不会误删新 render 正在使用的同一 anchor panel
