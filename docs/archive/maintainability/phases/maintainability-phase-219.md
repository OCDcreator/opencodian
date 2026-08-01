# 可维护性改进：第二百一十九阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-218.md`
> **推进的 master-plan lane**: P2 `question / todo / background task`（shared host adapter / service bundle）

本轮继续先按 master plan 复审，仍优先选择能直接削弱 `OpenCodianView` question/todo/background-task ownership 的 P2 切口，没有回到已暂停的 `ConversationRenderService` / `TrailingAssistantPatch*` helper-fragmentation lane。实际切片是：**新增 `QuestionTodoBackgroundTaskRefreshHostAdapter`，把 `QuestionTodoStatusRefreshCoordinator`、`PostSyncQuestionTodoRefreshFacade`、`BackgroundTaskPostSyncCoordinator` 剩余分散在 `OpenCodianView` 构造函数与三段 host factory 里的 wiring 收束到同一个 dedicated adapter/service bundle。**

这次改动没有改变现有语义：`QuestionTodoStatusRefreshCoordinator` 仍负责 activation/post-sync 的 pending-question + todo/status refresh 顺序与 runtime gate，`PostSyncQuestionTodoRefreshFacade` 仍负责 visible/background sync 下的 session 配对、background-task rebuild、completion notice 与 stream-like follow-up，`BackgroundTaskPostSyncCoordinator` 仍负责 authoritative mark、attention 与 visible sync state-commit 判定。变化点只是把三者的 shared host assembly 从 `OpenCodianView` 下沉到统一 adapter，让 view 不再直接维护三段 `create*Host()` factory 与对应的 service instantiation。

## 1. 本轮范围

- `src/features/chat/services/QuestionTodoBackgroundTaskRefreshHostAdapter.ts`
  - 新增 shared host adapter / service bundle，统一从单一 view host 派生三组 host，并顺序装配 `QuestionTodoStatusRefreshCoordinator`、`PostSyncQuestionTodoRefreshFacade`、`BackgroundTaskPostSyncCoordinator`
- `src/features/chat/OpenCodianView.ts`
  - 改为通过 `createQuestionTodoBackgroundTaskRefreshServices()` 获取 question/todo/background-task post-sync bundle
  - 删除分散的 `createQuestionTodoStatusRefreshCoordinatorHost()`、`createPostSyncQuestionTodoRefreshFacadeHost()`、`createBackgroundTaskPostSyncCoordinatorHost()`，改成单一 `createQuestionTodoBackgroundTaskRefreshViewHost()`
- 测试
  - 新增 `tests/unit/features/chat/QuestionTodoBackgroundTaskRefreshHostAdapter.test.ts`
- 直接相关文档
  - 新增 `docs/modules/features/chat/services/QuestionTodoBackgroundTaskRefreshHostAdapter.md`
  - 更新 `docs/modules/features/chat/services/QuestionTodoStatusRefreshCoordinator.md`
  - 更新 `docs/modules/features/chat/services/PostSyncQuestionTodoRefreshFacade.md`
  - 更新 `docs/modules/features/chat/services/BackgroundTaskPostSyncCoordinator.md`
  - 更新 `docs/modules/features/chat/OpenCodianView.md`

## 2. 变更文件

- `src/features/chat/services/QuestionTodoBackgroundTaskRefreshHostAdapter.ts`
- `src/features/chat/OpenCodianView.ts`
- `tests/unit/features/chat/QuestionTodoBackgroundTaskRefreshHostAdapter.test.ts`
- `docs/modules/features/chat/services/QuestionTodoBackgroundTaskRefreshHostAdapter.md`
- `docs/modules/features/chat/services/QuestionTodoStatusRefreshCoordinator.md`
- `docs/modules/features/chat/services/PostSyncQuestionTodoRefreshFacade.md`
- `docs/modules/features/chat/services/BackgroundTaskPostSyncCoordinator.md`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/status/maintainability-phase-219.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- QuestionTodoBackgroundTaskRefreshHostAdapter BackgroundTaskPostSyncCoordinator PostSyncQuestionTodoRefreshFacade QuestionTodoStatusRefreshCoordinator`
- `npm test`
- `npm run build`

补充检查：

- `rg -n "autopilot-maintainability\\.202604122350" /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/main.js`

## 4. 部署结果

`npm run build` 成功后，已按仓库约定部署到 Test Vault：

- 复制 `dist/main.js`
- 复制 `dist/manifest.json`
- 复制 `dist/styles.css`

部署目标：

- `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian`

本轮未改动 bundled assets，因此未复制 `dist/assets/`。

已校验 Test Vault 中的 `main.js` 包含本轮最新 `BUILD_ID`：

- `autopilot-maintainability.202604122350`

## 5. 下一步建议

`QuestionTodoBackgroundTaskRefreshHostAdapter` 迁出后，`OpenCodianView` 在 P2 子链上仍直接持有 question dock / pending-question refresh / resolution 路由的 host bridge。**下一轮建议继续留在 P2，但把 `QuestionDockCoordinator`、pending-question refresh/clear bridge，以及相关 question runtime host 装配收束成 dedicated adapter/service bundle，继续减少 view 直接持有的 question/todo/background-task wiring。**

一句话总结第二百一十九阶段本轮：

> 第二百一十九阶段新增 `QuestionTodoBackgroundTaskRefreshHostAdapter` 收束 question/todo/background-task post-sync 三段共享 wiring，推进了 master plan 的 P2 `question / todo / background task` ownership 迁移。
