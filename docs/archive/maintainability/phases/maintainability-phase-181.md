# 可维护性改进：第一百八十一阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-180.md`
> **推进的 master-plan lane**: P2 `question / todo / background task` 链路（background-task inline panel DOM ownership）

本轮继续遵循 master plan 的 P2，优先削弱 `OpenCodianView` 在 background task 相邻链路上的 ownership，没有回到 paused 的 `ConversationRenderService` / `TrailingAssistantPatch*` helper-fragmentation lane。实际切片是：**新增 `BackgroundTaskInlinePanelRenderer`，把 background-task inline panel 的 DOM 创建、挂载、复用、清理，以及 active indicator element 附着从 `OpenCodianView` 迁走。**

这次改动没有改变 background-task timeline 推导、suppression 规则、completion notice queue/flush，或 live-signal / hydration gate 行为；只是把仍集中在 view 内的 inline panel DOM lifecycle 收束到 dedicated runtime renderer，继续降低 `OpenCodianView` 的 UI ownership。

## 1. 本轮范围

- `src/features/chat/runtime/BackgroundTaskInlinePanelRenderer.ts`
  - 新增 dedicated runtime renderer，统一持有 background-task inline panel 的 DOM 创建、位置挂载、Markdown 渲染、mount 复用、stale panel 清理，以及 active indicator element 更新
- `src/features/chat/OpenCodianView.ts`
  - 用 `BackgroundTaskInlinePanelRenderer` 替换内联的 background-task panel DOM 实现
  - 保留 background-task helper wiring、render trigger、notice queue/flush 触发与 reset 后续 runtime 清理
- `tests/unit/features/chat/BackgroundTaskInlinePanelRenderer.test.ts`
  - 覆盖 stale panel 移除、active indicator element 更新，以及 `clear()` 的 DOM cleanup
- 直接相关文档
  - `docs/modules/features/chat/OpenCodianView.md`
  - `docs/modules/features/chat/runtime/BackgroundTaskInlinePanelRenderer.md`
  - `docs/modules/features/chat/services/BackgroundTaskTimelineService.md`
  - `docs/modules/features/chat/services/BackgroundTaskLiveSignalCoordinator.md`
  - `docs/modules/features/chat/services/BackgroundTaskPostSyncCoordinator.md`
  - `docs/modules/features/chat/services/BackgroundTaskNoticeStateService.md`
  - `docs/modules/features/chat/services/BackgroundTaskCompletionNoticeService.md`

## 2. 变更文件

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/runtime/BackgroundTaskInlinePanelRenderer.ts`
- `tests/unit/features/chat/BackgroundTaskInlinePanelRenderer.test.ts`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/features/chat/runtime/BackgroundTaskInlinePanelRenderer.md`
- `docs/modules/features/chat/services/BackgroundTaskTimelineService.md`
- `docs/modules/features/chat/services/BackgroundTaskLiveSignalCoordinator.md`
- `docs/modules/features/chat/services/BackgroundTaskPostSyncCoordinator.md`
- `docs/modules/features/chat/services/BackgroundTaskNoticeStateService.md`
- `docs/modules/features/chat/services/BackgroundTaskCompletionNoticeService.md`
- `docs/status/maintainability-phase-181.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- BackgroundTaskInlinePanelRenderer`
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

- `autopilot-maintainability.202604121538`

## 5. 下一步建议

下一轮如果继续沿 master plan 的 P2 收缩 `OpenCodianView` ownership，较高价值的相邻切片是把 **`renderBackgroundTaskIndicatorIfNeeded()` 的 render/queue/flush 上层编排** 再向 dedicated coordinator 收束，优先处理 background-task helper bundle 的触发顺序与 host routing，而不是回到 trailing-assistant helper 链。

一句话总结第一百八十一阶段本轮：

> 第一百八十一阶段新增 `BackgroundTaskInlinePanelRenderer`，把 background-task inline panel 的 DOM 生命周期与 active indicator 附着从 `OpenCodianView` 下沉到 dedicated runtime renderer，推进了 master plan 的 P2 `question / todo / background task` ownership 迁移。
