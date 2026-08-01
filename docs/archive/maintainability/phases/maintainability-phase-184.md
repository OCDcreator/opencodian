# 可维护性改进：第一百八十四阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-183.md`
> **推进的 master-plan lane**: P2 `question / todo / background task` 链路（background-task live-indicator runtime ownership）

本轮继续遵循 master plan 的 P2，优先削弱 `OpenCodianView` 在 background-task runtime 判定上的 ownership，没有回到 paused 的 `ConversationRenderService` / `TrailingAssistantPatch*` helper-fragmentation lane。实际切片是：**把 `hasTabBackgroundTaskIndicator()` 这一组 pending launch / session status / grace-period 运行态判定从 `OpenCodianView` 迁到 `BackgroundTaskLiveSignalCoordinator`，并让 `BackgroundTaskStreamTriggerCoordinator` 与 tab stream-like badge 同步共用这条 dedicated runtime 边界。**

这次改动没有改变 background-task launch/timeline 写回、authoritative-sync gate、stale downgrade、search-mode placeholder，或 primary-stream finalize 的 waiting/reset 语义；只是把“这个 tab 现在是否仍算 background-task running”的 runtime 规则收束到现有的 live-signal coordinator，让 `OpenCodianView` 进一步退回 host wiring。

## 1. 本轮范围

- `src/features/chat/services/BackgroundTaskLiveSignalCoordinator.ts`
  - 新增 `hasIndicator()`，统一承接 background-task indicator 的 live/grace-period 运行态判定
  - 把 grace-period 计时逻辑内聚回 live-signal coordinator，并让 stale reconcile 复用同一份 started-at 语义
- `src/features/chat/runtime/BackgroundTaskStreamTriggerCoordinator.ts`
  - 改为直接复用 `BackgroundTaskLiveSignalCoordinator` 的 gate / indicator 判定，而不是继续回调 `OpenCodianView` 私有 helper
- `src/features/chat/OpenCodianView.ts`
  - 移除 `hasTabBackgroundTaskIndicator()`、`isBackgroundTaskGracePeriodActive()` 与仅供该链路使用的 `isTabSessionLive()`
  - tab stream-like badge 同步改为直接查询 `BackgroundTaskLiveSignalCoordinator.hasIndicator()`
- 测试
  - `tests/unit/features/chat/BackgroundTaskLiveSignalCoordinator.test.ts`
  - `tests/unit/features/chat/BackgroundTaskStreamTriggerCoordinator.test.ts`
- 直接相关文档
  - `docs/modules/features/chat/OpenCodianView.md`
  - `docs/modules/features/chat/runtime/BackgroundTaskStreamTriggerCoordinator.md`
  - `docs/modules/features/chat/services/BackgroundTaskLiveSignalCoordinator.md`

## 2. 变更文件

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/runtime/BackgroundTaskStreamTriggerCoordinator.ts`
- `src/features/chat/services/BackgroundTaskLiveSignalCoordinator.ts`
- `tests/unit/features/chat/BackgroundTaskLiveSignalCoordinator.test.ts`
- `tests/unit/features/chat/BackgroundTaskStreamTriggerCoordinator.test.ts`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/features/chat/runtime/BackgroundTaskStreamTriggerCoordinator.md`
- `docs/modules/features/chat/services/BackgroundTaskLiveSignalCoordinator.md`
- `docs/status/maintainability-phase-184.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- BackgroundTaskLiveSignalCoordinator BackgroundTaskStreamTriggerCoordinator`
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

- `autopilot-maintainability.202604121620`

## 5. 下一步建议

下一轮如果继续沿 master plan 的 P2 收缩 `OpenCodianView` ownership，较高价值的相邻切片是把 **tab stream-like / background-task badge 同步这一组 `tabManager` 装配与 UI bridge** 再向 dedicated runtime bridge 收束，让 view 不再同时持有 background-task indicator 判定与 tab badge 写回的最后一层装配。

一句话总结第一百八十四阶段本轮：

> 第一百八十四阶段把 background-task indicator 的 live/grace-period 运行态判定从 `OpenCodianView` 迁到 `BackgroundTaskLiveSignalCoordinator`，并让 stream-trigger finalize 与 tab badge 同步共用这条 runtime 边界，推进了 master plan 的 P2 `question / todo / background task` ownership 迁移。
