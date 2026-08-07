# BackgroundTaskInlinePanelRenderer

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
