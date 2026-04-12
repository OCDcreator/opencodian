# 可维护性改进：第二百零四阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-203.md`
> **推进的 master-plan lane**: P2 `question / todo / background task` 链路（session todo/status pull-refresh ownership 下沉）

本轮先按 master plan 复审，继续优先推进高优先级的 P2 `question / todo / background task` ownership，而没有回到已暂停的 `ConversationRenderService` / `TrailingAssistantPatch*` helper-fragmentation lane。实际切片是：**把 `OpenCodianView` 内联持有的 session todo/status 主动拉取刷新、request-id stale guard，以及刷新成功后的 foreground background-task reconcile，提取到新的 `SessionTodoStatusRefreshService`，并让 `TabViewActivationBridge`、`BackgroundTaskPostSyncCoordinator`、`BackgroundTaskStreamTriggerCoordinator`、`QuestionDockCoordinator`、`MessageFinalizationService` 与 view 的 open-conversation fast path 统一复用这条边界。**

这次改动没有改变 todo/status API 调用顺序、`todoRequestId` / `statusRequestId` stale-guard 语义、刷新失败时的 notice 行为，或刷新成功后触发 `BackgroundTaskLiveSignalCoordinator` reconcile 的时机；只是把仍然由 view 自己内联维护的主动刷新 ownership 迁到 dedicated service，进一步减轻 `OpenCodianView` 对 session todo/status 刷新链路的集中持有。

## 1. 本轮范围

- `src/features/chat/services/SessionTodoStatusRefreshService.ts`
  - 新增 dedicated refresh service
  - 统一承接 session todo/status 主动拉取、request-id stale guard 与刷新成功后的 foreground reconcile
- `src/features/chat/OpenCodianView.ts`
  - 删除 view 内联的 `refreshTabSessionTodos()` / `refreshTabSessionStatus()` 实现
  - 新增 refresh service host 装配
  - 把 `TabViewActivationBridge`、`BackgroundTaskPostSyncCoordinator`、`BackgroundTaskStreamTriggerCoordinator`、`QuestionDockCoordinator`、`MessageFinalizationService` 与 open-conversation fast path 改为复用 refresh service
- 测试
  - 新增 `tests/unit/features/chat/SessionTodoStatusRefreshService.test.ts`
- 直接相关文档
  - 新增 `docs/modules/features/chat/services/SessionTodoStatusRefreshService.md`
  - 更新 `docs/modules/features/chat/OpenCodianView.md`
  - 更新 `docs/modules/features/chat/services/SessionTodoStateService.md`

## 2. 变更文件

- `src/features/chat/services/SessionTodoStatusRefreshService.ts`
- `src/features/chat/OpenCodianView.ts`
- `tests/unit/features/chat/SessionTodoStatusRefreshService.test.ts`
- `docs/modules/features/chat/services/SessionTodoStatusRefreshService.md`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/features/chat/services/SessionTodoStateService.md`
- `docs/status/maintainability-phase-204.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- SessionTodoStatusRefreshService`
- `npm test`
- `npm run build`

补充检查：

- 通过 `rg -n "autopilot-maintainability\\.202604122032" /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/main.js` 校验部署产物已更新到本轮最新 `BUILD_ID`

## 4. 部署结果

`npm run build` 成功后，已按仓库约定部署到 Test Vault：

- 复制 `dist/main.js`
- 复制 `dist/manifest.json`
- 复制 `dist/styles.css`

部署目标：

- `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian`

本轮未改动 bundled assets，因此未复制 `dist/assets/`。

已校验 Test Vault 中的 `main.js` 包含本轮最新 `BUILD_ID`：

- `autopilot-maintainability.202604122032`

## 5. 下一步建议

本轮完成后，session todo/status 的主动刷新逻辑已经不再内联留在 `OpenCodianView`；**下一轮建议继续沿 master plan 的 P2，把当前仍散落在 `TabViewActivationBridge`、`BackgroundTaskPostSyncCoordinator` 与 `openConversationInCurrentTab()` 里的“status + pending question + todo”成组 post-open/post-sync 刷新顺序，提升为一个 dedicated activation/post-sync refresh coordinator，继续把 view 从这段 question/todo/background-task 收尾编排里抽薄。**

一句话总结第二百零四阶段本轮：

> 第二百零四阶段把 `OpenCodianView` 中 session todo/status 的主动拉取刷新、request-id stale guard 与 foreground reconcile 迁到 `SessionTodoStatusRefreshService`，推进了 master plan 的 P2 `question / todo / background task` ownership 迁移。
