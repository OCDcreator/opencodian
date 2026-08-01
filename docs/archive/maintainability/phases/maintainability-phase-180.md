# 可维护性改进：第一百八十阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-179.md`
> **推进的 master-plan lane**: P2 `question / todo / background task` 链路（background-task timeline / runtime ownership）

本轮继续遵循 master plan 的 P2，优先削弱 `OpenCodianView` 在 background task 相邻链路上的 ownership，没有回到 paused 的 `ConversationRenderService` / `TrailingAssistantPatch*` helper-fragmentation lane。实际切片是：**新增 `BackgroundTaskTimelineService`，把 background task 的 timeline segment 推导、conversation→runtime rebuild、pending matching、inline copy 组装，以及 completion segment / diagnostics 快照从 `OpenCodianView` 迁走。**

这次改动没有改变 background task 的 live-signal gate、stale notice suppression、completion notice 落盘、post-sync orchestration，或 inline panel 的 DOM 呈现语义；只是把仍集中在 view 内的 background-task runtime/timeline 计算边界收束到 dedicated service，继续降低 `OpenCodianView` 的运行时 ownership。

## 1. 本轮范围

- `src/features/chat/services/BackgroundTaskTimelineService.ts`
  - 新增 dedicated service，统一持有 search-mode user injection、task tool block、system reminder 到 segment timeline 的推导
  - 集中处理 launch/completion merge、pending matching、conversation→runtime rebuild、inline copy 组装，以及 diagnostics 快照
- `src/features/chat/OpenCodianView.ts`
  - 用 `BackgroundTaskTimelineService` 替换内联的 background-task timeline/runtime 逻辑
  - 保留 view 侧的 inline panel DOM 渲染、notice host bridge 与 reset 行为
- `tests/unit/features/chat/BackgroundTaskTimelineService.test.ts`
  - 覆盖 timeline segment 的 launch/completion/pending 聚合
  - 覆盖 suppression 后仅保留 preparing search-mode segment 的 inline 收集
  - 覆盖 hydration 场景下的 conversation→runtime rebuild 与 authoritative-sync gate 重挂
- 直接相关文档
  - `docs/modules/features/chat/OpenCodianView.md`
  - `docs/modules/features/chat/services/BackgroundTaskTimelineService.md`
  - `docs/modules/features/chat/services/BackgroundTaskPostSyncCoordinator.md`
  - `docs/modules/features/chat/services/BackgroundTaskNoticeStateService.md`
  - `docs/modules/features/chat/services/BackgroundTaskCompletionNoticeService.md`
  - `docs/modules/features/chat/services/BackgroundTaskLiveSignalCoordinator.md`

## 2. 变更文件

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/services/BackgroundTaskTimelineService.ts`
- `tests/unit/features/chat/BackgroundTaskTimelineService.test.ts`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/features/chat/services/BackgroundTaskTimelineService.md`
- `docs/modules/features/chat/services/BackgroundTaskPostSyncCoordinator.md`
- `docs/modules/features/chat/services/BackgroundTaskNoticeStateService.md`
- `docs/modules/features/chat/services/BackgroundTaskCompletionNoticeService.md`
- `docs/modules/features/chat/services/BackgroundTaskLiveSignalCoordinator.md`
- `docs/status/maintainability-phase-180.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- BackgroundTaskTimelineService`
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

- `autopilot-maintainability.202604121526`

## 5. 下一步建议

下一轮如果继续沿 master plan 的 P2 收缩 `OpenCodianView` ownership，较高价值的相邻切片是把 **background-task inline panel 的 DOM render bridge 与 active indicator attachment** 再向 dedicated renderer/host 收束，优先审查 `renderInlineBackgroundTaskPanels()` 与 panel mount lifecycle，而不是回到 trailing-assistant helper 链。

一句话总结第一百八十阶段本轮：

> 第一百八十阶段新增 `BackgroundTaskTimelineService`，把 background task 的 timeline/runtime 计算、conversation→runtime rebuild 与 inline copy 组装从 `OpenCodianView` 下沉到 dedicated service，推进了 master plan 的 P2 `question / todo / background task` ownership 迁移。
