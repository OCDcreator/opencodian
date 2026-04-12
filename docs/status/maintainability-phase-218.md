# 可维护性改进：第二百一十八阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-217.md`
> **推进的 master-plan lane**: P2 `question / todo / background task`（post-sync refresh facade）

本轮继续先按 master plan 复审，仍优先选择能直接削弱 `OpenCodianView` question/todo/background-task ownership 的 P2 切口，没有回到已暂停的 `ConversationRenderService` / `TrailingAssistantPatch*` helper-fragmentation lane。实际切片是：**新增 `PostSyncQuestionTodoRefreshFacade`，把 visible/signal/background sync 之后仍散落在 `BackgroundTaskPostSyncCoordinator` 与 `OpenCodianView` host 装配里的 question/todo/background-task refresh 组合收尾，下沉到共享 facade。**

这次改动没有改变现有语义：`QuestionTodoStatusRefreshCoordinator` 仍负责 activation/post-sync 的 pending-question + todo/status refresh 顺序与 runtime gate，`BackgroundTaskPostSyncCoordinator` 仍负责 authoritative mark、attention 与 visible sync 的 active-conversation match/state-commit 判定。变化点只是把两者之间剩余的 current-session 配对、background-task rebuild hook、completion notice refresh 与 tab stream-like follow-up 收束到 dedicated facade，让 `OpenCodianView` 不再同时组装这几段 post-sync refresh bridge。

## 1. 本轮范围

- `src/features/chat/services/PostSyncQuestionTodoRefreshFacade.ts`
  - 新增共享 facade，统一承接 visible background sync 的 question/todo session 配对，以及 signal/background sync 的 rebuild/completion/stream-like post-sync refresh follow-up
- `src/features/chat/services/BackgroundTaskPostSyncCoordinator.ts`
  - 改为依赖 facade，而不再直接拼接 question/todo refresh 与 background-task refresh host 回调
  - host surface 收缩为 authoritative mark、attention 与 visible sync state-commit 判定
- `src/features/chat/OpenCodianView.ts`
  - 新增 `createPostSyncQuestionTodoRefreshFacadeHost()`
  - 精简 `createBackgroundTaskPostSyncCoordinatorHost()`，把 post-sync refresh bridge 从 view host 装配里迁走
- 测试
  - 新增 `tests/unit/features/chat/PostSyncQuestionTodoRefreshFacade.test.ts`
  - 更新 `tests/unit/features/chat/BackgroundTaskPostSyncCoordinator.test.ts`
- 直接相关文档
  - 新增 `docs/modules/features/chat/services/PostSyncQuestionTodoRefreshFacade.md`
  - 更新 `docs/modules/features/chat/services/BackgroundTaskPostSyncCoordinator.md`
  - 更新 `docs/modules/features/chat/services/QuestionTodoStatusRefreshCoordinator.md`
  - 更新 `docs/modules/features/chat/OpenCodianView.md`

## 2. 变更文件

- `src/features/chat/services/PostSyncQuestionTodoRefreshFacade.ts`
- `src/features/chat/services/BackgroundTaskPostSyncCoordinator.ts`
- `src/features/chat/OpenCodianView.ts`
- `tests/unit/features/chat/PostSyncQuestionTodoRefreshFacade.test.ts`
- `tests/unit/features/chat/BackgroundTaskPostSyncCoordinator.test.ts`
- `docs/modules/features/chat/services/PostSyncQuestionTodoRefreshFacade.md`
- `docs/modules/features/chat/services/BackgroundTaskPostSyncCoordinator.md`
- `docs/modules/features/chat/services/QuestionTodoStatusRefreshCoordinator.md`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/status/maintainability-phase-218.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- BackgroundTaskPostSyncCoordinator PostSyncQuestionTodoRefreshFacade QuestionTodoStatusRefreshCoordinator`
- `npm test`
- `npm run build`

补充检查：

- `rg -n "autopilot-maintainability\\.202604122333" /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/main.js`

## 4. 部署结果

`npm run build` 成功后，已按仓库约定部署到 Test Vault：

- 复制 `dist/main.js`
- 复制 `dist/manifest.json`
- 复制 `dist/styles.css`

部署目标：

- `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian`

本轮未改动 bundled assets，因此未复制 `dist/assets/`。

已校验 Test Vault 中的 `main.js` 包含本轮最新 `BUILD_ID`：

- `autopilot-maintainability.202604122333`

## 5. 下一步建议

post-sync refresh facade 迁出后，`OpenCodianView` 在 P2 子链上还剩 question/todo/background-task 协调对象的 host 创建与装配分散。**下一轮建议继续留在 P2，但把 `QuestionTodoStatusRefreshCoordinator` + `PostSyncQuestionTodoRefreshFacade` + `BackgroundTaskPostSyncCoordinator` 的剩余 host factory 收束成 dedicated host adapter/service bundle，进一步减少 view 直接持有的 question/todo/background-task wiring。**

一句话总结第二百一十八阶段本轮：

> 第二百一十八阶段新增 `PostSyncQuestionTodoRefreshFacade` 收束 background sync 之后的 question/todo/background-task 组合 refresh 边界，推进了 master plan 的 P2 `question / todo / background task` ownership 迁移。
