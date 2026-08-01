# 可维护性改进：第一百七十阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-169.md`
> **推进的 master-plan lane**: P1 `OpenCodianView` 中剩余的核心 ownership 迁移（sync orchestration）

本轮优先遵循 master plan 的 P1，没有回到 paused 的 `ConversationRenderService` / `TrailingAssistantPatch*` helper-fragmentation lane。实际切片是：**把 active visible-conversation background sync 完成后的 post-refresh orchestration，从 `OpenCodianView.syncVisibleConversationInBackground()` 继续下沉到 `BackgroundTaskPostSyncCoordinator`，让 coordinator 统一接手 question refresh、todo/status live refresh 和 active-conversation match 判定，再把 render plan 回传给 view。**

这次改动没有改变 `applySyncedConversationUpdate()` / `renderBackgroundTaskIndicatorIfNeeded()` 的 DOM/render 路径，没有改变 hidden signal/background-tab sync 的 completion notice queue/flush 或 attention 标记，也没有改变 background task timeline 推导与 todo/status refresh gate 规则；`OpenCodianView` 现在只保留 visible sync 的 `currentConversationRevertState` / sync fingerprint 更新，以及真正依赖当前 host 的 render 分支。

## 1. 本轮范围

- `src/features/chat/services/BackgroundTaskPostSyncCoordinator.ts`
  - 扩展 coordinator host，读取当前 active conversation id/session
  - 新增 `handleVisibleConversationSyncComplete()`，统一处理 visible background sync 后的 question refresh、todo/status refresh 与 active-conversation match 判定
  - 返回 `shouldApplySyncedConversationUpdate` / `shouldRenderBackgroundTaskIndicator` render plan，继续把 DOM/render 留在 view
- `src/features/chat/OpenCodianView.ts`
  - `syncVisibleConversationInBackground()` 改为委托 `BackgroundTaskPostSyncCoordinator`
  - 只保留 revert state、last sync fingerprint 与 `applySyncedConversationUpdate()` / `renderBackgroundTaskIndicatorIfNeeded()` 分支
- `tests/unit/features/chat/BackgroundTaskPostSyncCoordinator.test.ts`
  - 新增 visible current-conversation apply path 与 switched-conversation indicator path 覆盖
- 直接相关文档
  - `docs/modules/features/chat/OpenCodianView.md`
  - `docs/modules/features/chat/services/BackgroundTaskPostSyncCoordinator.md`

## 2. 变更文件

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/services/BackgroundTaskPostSyncCoordinator.ts`
- `tests/unit/features/chat/BackgroundTaskPostSyncCoordinator.test.ts`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/features/chat/services/BackgroundTaskPostSyncCoordinator.md`
- `docs/status/maintainability-phase-170.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- BackgroundTaskPostSyncCoordinator`
- `npm test`
- `npm run build`
- `git diff --check`

## 4. 部署结果

`npm run build` 成功后，已按仓库约定部署到 Test Vault：

- 复制 `dist/main.js`
- 复制 `dist/manifest.json`
- 复制 `dist/styles.css`

部署目标：

- `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian`

本轮未改动 bundled assets，因此未复制 `dist/assets/`。

已校验 Test Vault 中的 `main.js` 包含本轮最新 `BUILD_ID`：

- `autopilot-maintainability.202604121323`

## 5. 下一步建议

下一轮仍应优先沿 master plan 的 P1 前进。较高价值的相邻切片是把 `syncVisibleConversationInBackground()` 剩余的 sync-outcome state commit（例如 revert/fingerprint 分支决策）继续收束到一个更明确的 visible-conversation sync coordinator / runtime helper，同时继续把 `applySyncedConversationUpdate()` 和 `renderBackgroundTaskIndicatorIfNeeded()` 留在 `OpenCodianView`；如果要继续 P2，也应只选能进一步削弱 view ownership 的 question/todo/background-task 上层编排切口，不要回到 trailing-assistant helper 链。

一句话总结第一百七十阶段本轮：

> 第一百七十阶段把 active visible-conversation background sync 后的 post-refresh orchestration 从 `OpenCodianView` 下沉到 `BackgroundTaskPostSyncCoordinator`，推进了 master plan 的 P1 `OpenCodianView` sync orchestration ownership 迁移。
