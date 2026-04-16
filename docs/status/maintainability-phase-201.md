# 可维护性改进：第二百零一阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-200.md`
> **推进的 master-plan lane**: P2 `question / todo / background task` 链路（background-task stale follow-up host-routing 收束）

本轮先按 master plan 复审，继续优先推进高优先级的 P2 `question / todo / background task` ownership，而没有回到已暂停的 `ConversationRenderService` / `TrailingAssistantPatch*` helper-fragmentation lane。实际切片是：**把 `BackgroundTaskLiveSignalCoordinator` 对 session todo stale reconcile、pending background-task launch 查询，以及 stopped notice 追加的依赖，从 `OpenCodianView` 的 host wrapper 改成直接组合 `SessionTodoStateService`、`BackgroundTaskTimelineService` 与 `BackgroundTaskNoticeStateService`，让 view 只保留 tab runtime / session status / stream-like UI reset 这类更薄的 host bridge。**

这次改动没有改变 background-task grace period、authoritative-sync gate、stopped notice 内容、todo stale suppression 规则，或 indicator reset 的触发语义；只是把这一组原本仍需要经由 `OpenCodianView` 转发的 stale follow-up routing 收束回 background-task live-signal coordinator 自身。

## 1. 本轮范围

- `src/features/chat/services/BackgroundTaskLiveSignalCoordinator.ts`
  - 直接组合 `SessionTodoStateService`、`BackgroundTaskTimelineService` 与 `BackgroundTaskNoticeStateService`
  - 精简 host 接口，只保留 tab runtime、session status、stream-like UI sync 与 indicator reset 这类 view-level bridge
- `src/features/chat/OpenCodianView.ts`
  - 移除 `hasIncompleteTabSessionTodos()`、`reconcileStaleSessionTodoState()`、`appendBackgroundTaskStoppedNotice()`、`getPendingBackgroundTaskLaunches()` 这一组只服务于 live-signal coordinator 的 wrapper
  - 调整 background-task service 的装配顺序与 wiring
- 测试
  - 更新 `tests/unit/features/chat/BackgroundTaskLiveSignalCoordinator.test.ts`
  - 更新 `tests/unit/features/chat/backgroundTaskHydrationState.test.ts`
  - 更新 `tests/unit/features/chat/staleSessionTodoState.test.ts`
- 直接相关文档
  - `docs/modules/features/chat/OpenCodianView.md`
  - `docs/modules/features/chat/services/SessionTodoStateService.md`
  - `docs/modules/features/chat/services/BackgroundTaskLiveSignalCoordinator.md`
  - `docs/modules/features/chat/services/BackgroundTaskNoticeStateService.md`

## 2. 变更文件

- `src/features/chat/services/BackgroundTaskLiveSignalCoordinator.ts`
- `src/features/chat/OpenCodianView.ts`
- `tests/unit/features/chat/BackgroundTaskLiveSignalCoordinator.test.ts`
- `tests/unit/features/chat/backgroundTaskHydrationState.test.ts`
- `tests/unit/features/chat/staleSessionTodoState.test.ts`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/features/chat/services/SessionTodoStateService.md`
- `docs/modules/features/chat/services/BackgroundTaskLiveSignalCoordinator.md`
- `docs/modules/features/chat/services/BackgroundTaskNoticeStateService.md`
- `docs/status/maintainability-phase-201.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- BackgroundTaskLiveSignalCoordinator backgroundTaskHydrationState staleSessionTodoState`
- `npm test`
- `npm run build`

补充检查：

- 通过 `rg -n "autopilot-maintainability\\.202604121959" /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/main.js` 校验部署产物已更新到本轮最新 `BUILD_ID`

## 4. 部署结果

`npm run build` 成功后，已按仓库约定部署到 Test Vault：

- 复制 `dist/main.js`
- 复制 `dist/manifest.json`
- 复制 `dist/styles.css`

部署目标：

- `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian`

本轮未改动 bundled assets，因此未复制 `dist/assets/`。

已校验 Test Vault 中的 `main.js` 包含本轮最新 `BUILD_ID`：

- `autopilot-maintainability.202604121959`

## 5. 下一步建议

本轮完成后，background-task stale follow-up 的 todo/notice/timeline 路由已经不再经过 `OpenCodianView`；**下一轮建议继续沿 master plan 的 P2，优先审查 `BackgroundTaskIndicatorCoordinator` 与 `OpenCodianView` 之间仍保留的 `reconcileBackgroundTaskStateFromLiveSignals()` / `syncTabStreamLikeState()` / indicator render host bridge，继续把 background-task foreground follow-up 的 runtime/UI ownership 从主 view 收束出去。**

一句话总结第二百零一阶段本轮：

> 第二百零一阶段把 background-task stale follow-up 对 session todo、pending launch 和 stopped notice 的 routing 从 `OpenCodianView` 收束回 `BackgroundTaskLiveSignalCoordinator` 直接组合的 dedicated services，推进了 master plan 的 P2 `question / todo / background task` ownership 迁移。
