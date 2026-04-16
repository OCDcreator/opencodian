# 可维护性改进：第一百八十二阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-181.md`
> **推进的 master-plan lane**: P2 `question / todo / background task` 链路（background-task indicator orchestration ownership）

本轮继续遵循 master plan 的 P2，优先削弱 `OpenCodianView` 在 background-task 相邻链路上的 ownership，没有回到 paused 的 `ConversationRenderService` / `TrailingAssistantPatch*` helper-fragmentation lane。实际切片是：**新增 `BackgroundTaskIndicatorCoordinator`，把 `renderBackgroundTaskIndicatorIfNeeded()` 中原本内联的 live-signal reconcile、inline panel render、completion notice queue/flush，以及 tab stream-like sync 编排迁到 dedicated runtime coordinator。**

这次改动没有改变 background-task timeline 推导、inline panel DOM 生命周期、completion notice 内容/去重规则，或 post-sync / live-signal 的既有职责边界；只是把仍集中在 view 内的一段 background-task render orchestration 收束到单独模块，并让 post-sync host 改为复用同一个 completion-notice refresh 入口。

## 1. 本轮范围

- `src/features/chat/runtime/BackgroundTaskIndicatorCoordinator.ts`
  - 新增 dedicated runtime coordinator，统一持有 background-task indicator 的 live-signal reconcile → inline render → completion notice refresh → stream-like sync 顺序
  - 暴露 `renderIfNeeded()` 与 `queueAndFlushCompletionNotices()` 两个入口，分别服务 view render path 和 post-sync refresh path
- `src/features/chat/OpenCodianView.ts`
  - 用 `BackgroundTaskIndicatorCoordinator` 替换 `renderBackgroundTaskIndicatorIfNeeded()` 里的内联 orchestration
  - 移除 view 内部的 completion notice queue/flush wrapper，把 post-sync host 改为复用 coordinator
- `src/features/chat/services/BackgroundTaskPostSyncCoordinator.ts`
  - host contract 从分散的 `queue...` / `flush...` 改成单一的 `refreshBackgroundTaskCompletionNotices(...)`
- 测试
  - `tests/unit/features/chat/BackgroundTaskIndicatorCoordinator.test.ts`
  - `tests/unit/features/chat/BackgroundTaskPostSyncCoordinator.test.ts`
  - `tests/unit/features/chat/backgroundTaskTimeline.test.ts`
- 直接相关文档
  - `docs/modules/features/chat/OpenCodianView.md`
  - `docs/modules/features/chat/runtime/BackgroundTaskIndicatorCoordinator.md`
  - `docs/modules/features/chat/runtime/BackgroundTaskInlinePanelRenderer.md`
  - `docs/modules/features/chat/services/BackgroundTaskPostSyncCoordinator.md`
  - `docs/modules/features/chat/services/BackgroundTaskCompletionNoticeService.md`
  - `docs/modules/features/chat/services/BackgroundTaskLiveSignalCoordinator.md`
  - `docs/modules/features/chat/services/BackgroundTaskNoticeStateService.md`
  - `docs/modules/features/chat/services/BackgroundTaskTimelineService.md`
  - `docs/modules/README.md`

## 2. 变更文件

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/runtime/BackgroundTaskIndicatorCoordinator.ts`
- `src/features/chat/services/BackgroundTaskPostSyncCoordinator.ts`
- `tests/unit/features/chat/BackgroundTaskIndicatorCoordinator.test.ts`
- `tests/unit/features/chat/BackgroundTaskPostSyncCoordinator.test.ts`
- `tests/unit/features/chat/backgroundTaskTimeline.test.ts`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/features/chat/runtime/BackgroundTaskIndicatorCoordinator.md`
- `docs/modules/features/chat/runtime/BackgroundTaskInlinePanelRenderer.md`
- `docs/modules/features/chat/services/BackgroundTaskPostSyncCoordinator.md`
- `docs/modules/features/chat/services/BackgroundTaskCompletionNoticeService.md`
- `docs/modules/features/chat/services/BackgroundTaskLiveSignalCoordinator.md`
- `docs/modules/features/chat/services/BackgroundTaskNoticeStateService.md`
- `docs/modules/features/chat/services/BackgroundTaskTimelineService.md`
- `docs/modules/README.md`
- `docs/status/maintainability-phase-182.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- BackgroundTaskIndicatorCoordinator`
- `npm test -- BackgroundTaskPostSyncCoordinator`
- `npm test -- backgroundTaskTimeline`
- `npm test`
- `npm run build`

## 4. 部署结果

`npm run build` 成功后，已按仓库约定部署到 Test Vault：

- 复制 `dist/main.js`
- 复制 `dist/manifest.json`
- 复制 `dist/styles.css`

部署目标：

- `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian`

本轮未改动 bundled assets，因此未复制 `dist/assets/`。

已校验 Test Vault 中的 `main.js` 包含本轮最新 `BUILD_ID`：

- `autopilot-maintainability.202604121551`

## 5. 下一步建议

下一轮如果继续沿 master plan 的 P2 收缩 `OpenCodianView` ownership，较高价值的相邻切片是把 **background-task tool-call start/end 与 primary-stream finalize 的 runtime 状态迁移** 再向 dedicated coordinator 收束，优先处理 `handleStreamingToolCallStart()` / `handleStreamingToolCallEnd()` / `finalizeBackgroundTaskIndicatorAfterPrimaryStream()` 这一组触发入口，而不是回到 trailing-assistant helper 链。

一句话总结第一百八十二阶段本轮：

> 第一百八十二阶段新增 `BackgroundTaskIndicatorCoordinator`，把 background-task indicator 的 render/queue/flush orchestration 从 `OpenCodianView` 迁到 dedicated runtime coordinator，并让 post-sync completion-notice refresh 复用同一条边界，推进了 master plan 的 P2 `question / todo / background task` ownership 迁移。
