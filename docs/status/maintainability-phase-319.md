# 可维护性改进：第三百一十九阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-318.md`
> **推进的 master-plan lane**: P2 `question / todo / background task`
> **完成的 roadmap queue item**: `R4 - Background task notice pipeline`

本轮严格执行 roadmap 的第一个 `[NEXT]` 项：`R4 - Background task notice pipeline`。上一轮已经把 background-task 的 segment 收集与 queue/flush 编排分别收束到 `BackgroundTaskTimelineService` 和 `BackgroundTaskIndicatorCoordinator`，因此本轮只完成这条切口剩余的 ownership 收口：把 `queuedBackgroundTaskCompletionNotices` 从 `OpenCodianView.TabRuntimeState` 里移除，改由 `BackgroundTaskCompletionNoticeService` 在内部按 tab runtime 自行维护 queued notice state，并补齐 completion fingerprint 的 focused coverage。这样 `OpenCodianView` 不再持有 completion notice queue 细节；view/runtime 现在只保留 streaming 与 timeline 所需状态，completion notice 的 queue/fingerprint/flush 全部落在专门 owner 内部。

本轮把原先残留的 ownership 关系：

- `OpenCodianView.TabRuntimeState -> queuedBackgroundTaskCompletionNotices -> BackgroundTaskCompletionNoticeService -> PersistentAssistantNoticeService`

继续收束为：

- `BackgroundTaskIndicatorCoordinator -> BackgroundTaskCompletionNoticeService (internal queued state keyed by tab runtime) -> PersistentAssistantNoticeService`

也就是说，主调用链不再需要经过 `OpenCodianView` runtime 上那段 completion queue state；notice 队列细节与 fingerprint 去重现在完全由 dedicated service 持有，`OpenCodianView` 只再暴露现有的 tab runtime / conversation host。

本轮刻意**没有**触碰 general message renderer、stream chunk parser、send pipeline、`BackgroundTaskNoticeStateService` 的 stale-warning 语义，也没有改动 question dock、session todo、settings/core。

## 1. 本轮范围

- 更新 `src/features/chat/services/BackgroundTaskCompletionNoticeService.ts`
  - 移除对 `TabRuntimeState.queuedBackgroundTaskCompletionNotices` 的依赖
  - 改为在 service 内部按 tab runtime 维护 queued completion notice state
  - 保留现有 queue / flush / fingerprint / persisted dedupe 行为
- 更新 `src/features/chat/OpenCodianView.ts`
  - 从 `TabRuntimeState` 中删除 `queuedBackgroundTaskCompletionNotices`
  - 保留 background-task timeline / streaming 所需 runtime 字段，view 不再持有 notice queue 细节
- 更新 focused tests
  - `tests/unit/features/chat/BackgroundTaskCompletionNoticeService.test.ts`
  - `tests/unit/features/chat/backgroundTaskTimeline.test.ts`
  - 新增覆盖：streaming 期间 service 内部保留 queued notices，stream 结束后再 flush；以及 sorted task fingerprint dedupe
- 更新直接相关 docs/modules
  - `docs/modules/features/chat/services/BackgroundTaskCompletionNoticeService.md`
  - `docs/modules/features/chat/OpenCodianView.md`
- 更新状态文档
  - `docs/status/maintainability-round-roadmap.md`
  - `docs/status/maintainability-phase-319.md`

## 2. 变更文件

- Code
  - `src/features/chat/services/BackgroundTaskCompletionNoticeService.ts`
  - `src/features/chat/OpenCodianView.ts`
- Tests
  - `tests/unit/features/chat/BackgroundTaskCompletionNoticeService.test.ts`
  - `tests/unit/features/chat/backgroundTaskTimeline.test.ts`
- Docs
  - `docs/modules/features/chat/services/BackgroundTaskCompletionNoticeService.md`
  - `docs/modules/features/chat/OpenCodianView.md`
- Status
  - `docs/status/maintainability-round-roadmap.md`
  - `docs/status/maintainability-phase-319.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- tests/unit/features/chat/BackgroundTaskCompletionNoticeService.test.ts tests/unit/features/chat/BackgroundTaskIndicatorCoordinator.test.ts tests/unit/features/chat/backgroundTaskTimeline.test.ts`
- `npm test`
- `npm run build`

本轮 build 生成的 `BUILD_ID`：

- `autopilot-maintainability.202604131847`

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且用户未显式要求部署，因此按规则在成功 build 后停止于构建验证。

## 5. 下一步建议

下一轮应按 roadmap 推进新的 `[NEXT]` 项：`R5 - P2 event orchestrator`。建议从 `subscribeToSessionTodoUpdates`、`subscribeToSessionStatusUpdates`、`subscribeToSessionSyncEvents` 以及 `BackgroundTaskLiveSignalCoordinator` 的 signal routing / scheduling seam 开始，把订阅与调度编排继续从 `OpenCodianView` 收束到单一 dispatcher/coordinator。

一句话总结第三百一十九阶段本轮：

> 第三百一十九阶段把 background-task completion notice 的 queued state 从 `OpenCodianView` runtime 移到 `BackgroundTaskCompletionNoticeService` 内部，并补齐 sorted fingerprint dedupe 覆盖，完成了 roadmap 的 `R4 - Background task notice pipeline`。
