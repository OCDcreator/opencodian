# 可维护性改进：第三百六十六阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-365.md`
> **推进的 master-plan lane**: Warning cleanup / chat background-task hotspot
> **完成的 roadmap queue item**: `W14 - BackgroundTaskTimelineService collectSegments trim`

本轮严格执行 roadmap 的首个 `[NEXT]` 项：`W14 - BackgroundTaskTimelineService collectSegments trim`。范围只处理 `src/features/chat/services/BackgroundTaskTimelineService.ts` 中 `collectSegments` 的复杂度 warning，并同步推进 maintainability 状态文档到下一队列项 `W15`；没有扩展到 `OpenCodianView`、completion notice queue、live signal routing、question/todo runtime ownership，或 conversation hydration 的 authoritative sync gate 行为。

## 1. 本轮范围

- 在 `src/features/chat/services/BackgroundTaskTimelineService.ts` 内将 `collectSegments` 收束为现有 owner 内的私有 helper 链，拆分出 segment collection state、task tool launch collection、completion reminder matching、runtime state merge 与 segment finalize 流程。
- 保持既有 background-task timeline 顺序：先从持久化消息收集 search-mode anchors、task launches 与 delayed completion reminders，再合并 runtime active segment、pending/completed 状态，最后按 anchor timestamp 排序。
- 未修改 `tests/unit/features/chat/BackgroundTaskTimelineService.test.ts` 或 `tests/unit/features/chat/backgroundTaskTimeline.test.ts`，因为现有 tests 已覆盖 launches、completion reminders、suppressed inline segments、hydration runtime restore 与 persisted notice dedupe；本轮没有模块边界变化，也没有读取或更新 `docs/modules/**`。

## 2. Warning cleanup 收益

- `collectSegments` 的 `complexity` warning 已移除；`BackgroundTaskTimelineService` 当前仅剩既有文件级 `max-lines` warning。
- full lint 已确认仓库基线从 `0 errors / 92 warnings` 降为 `0 errors / 91 warnings`。
- 本轮保持 background-task hydration、suppression、runtime launch/completion merge、delayed completion reminder matching 与 all-tasks-complete pending 清空语义不变。

## 3. 队列推进

- 将 `docs/status/maintainability-master-plan.md`、`docs/status/maintainability-round-roadmap.md` 与 `docs/status/maintainability-lane-map.md` 同步更新为 `W14` 已完成。
- 按 roadmap 队列规则把 `W15 - Warning cleanup checkpoint` 提升为新的 `[NEXT]`。
- 当前没有后续 `[QUEUED]`；`W15` 完成后若无人追加 queue item，必须重新写回“当前没有可自动执行的 `[NEXT]`”并等待人工确认。

## 4. 验证

- Focused:
  - `npm test -- tests/unit/features/chat/BackgroundTaskTimelineService.test.ts tests/unit/features/chat/backgroundTaskTimeline.test.ts`
  - `npx eslint src/features/chat/services/BackgroundTaskTimelineService.ts tests/unit/features/chat/BackgroundTaskTimelineService.test.ts tests/unit/features/chat/backgroundTaskTimeline.test.ts`
- Metrics:
  - `npm run lint`：通过，`0 errors / 91 warnings`
- Full:
  - `npm test`：通过，`251 passed, 251 total` suites；`1071 passed, 1071 total` tests
  - `npm run build`：通过，`BUILD_ID` 为 `autopilot-maintainability.202604141919`

## 5. 部署

- 本轮修改了 `src/features/chat/services/BackgroundTaskTimelineService.ts` 与 maintainability 状态文档，未命中本仓库约定的 Test Vault 部署路径。
- 因此未执行 Test Vault 部署；`dist/main.js` 仅作为 build 产物验证。

## 6. 文件变更

- `src/features/chat/services/BackgroundTaskTimelineService.ts`
- `docs/status/maintainability-master-plan.md`
- `docs/status/maintainability-round-roadmap.md`
- `docs/status/maintainability-lane-map.md`
- `docs/status/maintainability-phase-366.md`

## 7. 下一步

- 当前可自动执行的 `[NEXT]` 是 `W15 - Warning cleanup checkpoint`。
- 下一轮应只复盘 `W12-W14` 的 warning 收益，并在没有人工追加 queue item 时把 roadmap 明确停回“当前没有可自动执行的 `[NEXT]`”状态。

一句话总结第三百六十六阶段本轮：

> 第三百六十六阶段在 `BackgroundTaskTimelineService` 现有 owner 内收掉了 `collectSegments` 的 `complexity` warning，把 lint 基线降到 `0 errors / 91 warnings`，并将自动队列推进到 `W15 - Warning cleanup checkpoint`。
