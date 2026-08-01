# 可维护性改进：第一百七十一阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-170.md`
> **推进的 master-plan lane**: P1 `OpenCodianView` 中剩余的核心 ownership 迁移（sync orchestration）

本轮继续优先遵循 master plan 的 P1，没有回到 paused 的 `ConversationRenderService` / `TrailingAssistantPatch*` helper-fragmentation lane。实际切片是：**把 `syncVisibleConversationInBackground()` 剩余的 visible-sync outcome state-commit 分支继续下沉到 `BackgroundTaskPostSyncCoordinator`，让 coordinator 在 active conversation 仍匹配时统一提交 `currentConversationRevertState` 与 active-tab sync fingerprint，而 `OpenCodianView` 只保留 `applySyncedConversationUpdate()` / `renderBackgroundTaskIndicatorIfNeeded()` 这类真正依赖 DOM/render host 的路径。**

这次改动没有改变 visible/background sync 的 question refresh、todo/status refresh、completion notice queue/flush、attention 标记或 background task timeline 推导，也没有改变 `applySyncedConversationUpdate()` 的增量渲染策略；只是把 visible active-conversation sync 完成后的状态提交职责继续从 view 挪到了既有 coordinator。

## 1. 本轮范围

- `src/features/chat/services/BackgroundTaskPostSyncCoordinator.ts`
  - 为 visible sync 增加 `revertState` 输入与当前 conversation state-commit host bridge
  - 在 coordinator 内统一提交 `currentConversationRevertState`
  - 仅在 `syncResult.changed === true` 时提交 active-tab `lastConversationSyncFingerprint`
- `src/features/chat/OpenCodianView.ts`
  - 扩展 `BackgroundTaskPostSyncCoordinator` host，暴露 revert-state 与 tab fingerprint setter
  - `syncVisibleConversationInBackground()` 改为只消费 coordinator 回传的 render plan，并保留 DOM/render 分支
- `tests/unit/features/chat/BackgroundTaskPostSyncCoordinator.test.ts`
  - 更新 visible sync 覆盖，验证 apply path 的 revert/fingerprint state commit
  - 新增 unchanged visible sync 仍提交 revert state、但不更新 fingerprint 的覆盖
- 直接相关文档
  - `docs/modules/features/chat/OpenCodianView.md`
  - `docs/modules/features/chat/services/BackgroundTaskPostSyncCoordinator.md`

## 2. 变更文件

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/services/BackgroundTaskPostSyncCoordinator.ts`
- `tests/unit/features/chat/BackgroundTaskPostSyncCoordinator.test.ts`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/features/chat/services/BackgroundTaskPostSyncCoordinator.md`
- `docs/status/maintainability-phase-171.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- BackgroundTaskPostSyncCoordinator`
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

- `autopilot-maintainability.202604121331`

## 5. 下一步建议

下一轮如果继续沿 master plan 的 P1 前进，较高价值的相邻切片是把 `syncConversationFromSignal()`、`syncVisibleConversationInBackground()` 和 `syncBackgroundTaskTabsInBackground()` 之间仍重复的 sync-entry guard / runtime flag 生命周期与 per-tab fingerprint baseline 判定继续收束到更明确的 conversation-sync runtime coordinator，而不是回到 trailing-assistant helper 链。

一句话总结第一百七十一阶段本轮：

> 第一百七十一阶段把 visible-conversation background sync 的 outcome state-commit 分支从 `OpenCodianView` 下沉到 `BackgroundTaskPostSyncCoordinator`，继续推进了 master plan 的 P1 `OpenCodianView` sync orchestration ownership 迁移。
