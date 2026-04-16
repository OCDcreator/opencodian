# 可维护性改进：第一百六十九阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-168.md`
> **推进的 master-plan lane**: P2 `question / todo / background task 链路`

本轮继续遵循 master plan 的高优先级 P2，没有回到 paused 的 `ConversationRenderService` / `TrailingAssistantPatch*` helper-fragmentation lane。实际切片是：**把 hidden signal sync / background-tab sync 完成后的 background-task post-sync orchestration，从 `OpenCodianView` 下沉到新的 `BackgroundTaskPostSyncCoordinator`。**

这次改动没有改变 background task segment/timeline 推导、inline panel DOM 渲染、completion notice 内容/fingerprint 规则，或 visible active conversation background sync 的渲染分支；`OpenCodianView` 现在只保留 conversation sync 发起、timeline/inline 渲染与 host bridge，后台同步后的 question refresh、todo/status refresh、completion notice queue/flush 与 attention 标记改由 dedicated coordinator 承接。

## 1. 本轮范围

- `src/features/chat/services/BackgroundTaskPostSyncCoordinator.ts`
  - 新增 `BackgroundTaskPostSyncCoordinatorHost` 与 post-sync orchestration coordinator
  - 统一 hidden signal sync / background-tab sync 完成后的 authoritative mark、pending question refresh、todo/status refresh、completion notice queue/flush 与 tab attention 判定
- `src/features/chat/OpenCodianView.ts`
  - 新增 `backgroundTaskPostSyncCoordinator` 装配与 host bridge
  - `syncConversationFromSignal()` 与 `syncBackgroundTaskTabsInBackground()` 改为委托 coordinator 承接 post-sync orchestration
  - 保留 background task timeline 推导、inline panel DOM 渲染与 completion segment 收集在 view
- `tests/unit/features/chat/BackgroundTaskPostSyncCoordinator.test.ts`
  - 新增 direct unit tests，覆盖 signal-sync post-refresh、unchanged sync skip、background-tab sync attention/todo refresh
- 直接相关文档
  - `docs/modules/features/chat/OpenCodianView.md`
  - `docs/modules/features/chat/services/BackgroundTaskLiveSignalCoordinator.md`
  - `docs/modules/features/chat/services/BackgroundTaskCompletionNoticeService.md`
  - `docs/modules/features/chat/services/BackgroundTaskPostSyncCoordinator.md`

## 2. 变更文件

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/services/BackgroundTaskPostSyncCoordinator.ts`
- `tests/unit/features/chat/BackgroundTaskPostSyncCoordinator.test.ts`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/features/chat/services/BackgroundTaskLiveSignalCoordinator.md`
- `docs/modules/features/chat/services/BackgroundTaskCompletionNoticeService.md`
- `docs/modules/features/chat/services/BackgroundTaskPostSyncCoordinator.md`
- `docs/status/maintainability-phase-169.md`

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

- `autopilot-maintainability.202604121313`

## 5. 下一步建议

下一轮仍建议优先沿 master plan 的 P2 前进。更高价值的后续切片是把 active visible conversation background sync 完成后的 question/todo/background-task post-sync 分支，从 `OpenCodianView.syncVisibleConversationInBackground()` 迁到这个 coordinator 或其相邻 dedicated module，同时继续保留 `applySyncedConversationUpdate()` 与实际 DOM/render 路径在 view；不要回到 trailing-assistant helper 链，除非测试、构建或正确性问题直接要求。

一句话总结第一百六十九阶段本轮：

> 第一百六十九阶段把 hidden signal/background-tab sync 后的 background-task post-sync orchestration 从 `OpenCodianView` 下沉到 `BackgroundTaskPostSyncCoordinator`，推进了 master plan 的 P2 `question / todo / background task` ownership 迁移。
