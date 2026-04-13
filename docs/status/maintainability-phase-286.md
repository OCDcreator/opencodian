# 可维护性改进：第二百八十六阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-285.md`
> **推进的 master-plan lane**: P2 `question / todo / background task` wiring 与 post-sync/activation 协调（visible background sync post-sync coordinator seam）

本轮继续遵循 master plan 与 lane map 的 P2 首查入口，选择一个高价值且低风险的单一职责切片：**把 `BackgroundTaskPostSyncCoordinator` 里 visible conversation 的 refresh/commit 协调抽到新的 `VisibleConversationPostSyncCoordinator`。**

这样 `BackgroundTaskPostSyncCoordinator` 进一步收窄为 visible/background post-sync route seam；visible question/todo refresh 与 current-conversation state-commit 的固定顺序统一落到 dedicated coordinator，hidden signal/background-tab handoff 则继续留在原有 background seam。

## 1. 本轮范围

- `src/features/chat/services/VisibleConversationPostSyncCoordinator.ts`
  - 新增 visible background sync post-sync coordinator
  - 集中 `PostSyncQuestionTodoRefreshFacade` 与 `VisibleConversationPostSyncStateCoordinator` 的调用顺序
  - 统一返回 visible sync 的 apply/indicator outcome
- `src/features/chat/services/BackgroundTaskPostSyncCoordinator.ts`
  - 删除 visible refresh/state-commit 组合细节
  - 改为只路由 visible seam 与 hidden/background handoff seam
- `src/features/chat/services/QuestionTodoBackgroundTaskRefreshHostAdapter.ts`
  - 在 refresh service bundle 中新增 `VisibleConversationPostSyncCoordinator`
  - 由 host adapter 统一装配 visible seam 与 background seam
- 测试
  - 新增 `tests/unit/features/chat/VisibleConversationPostSyncCoordinator.test.ts`
  - 更新 `tests/unit/features/chat/BackgroundTaskPostSyncCoordinator.test.ts`，改为覆盖 visible delegation + hidden handoff delegation
  - 保留 `QuestionTodoBackgroundTaskRefreshHostAdapter` 与 `ConversationSyncVisiblePostSyncRouter` focused coverage，验证装配与 router 行为不变
- 直接相关文档
  - 新增 `docs/modules/features/chat/services/VisibleConversationPostSyncCoordinator.md`
  - 更新 `BackgroundTaskPostSyncCoordinator`、`QuestionTodoBackgroundTaskRefreshHostAdapter`、`VisibleConversationPostSyncStateCoordinator` 与 `PostSyncQuestionTodoRefreshFacade` 文档，明确新的 visible seam 边界

## 2. 变更文件

- `src/features/chat/services/VisibleConversationPostSyncCoordinator.ts`
- `src/features/chat/services/BackgroundTaskPostSyncCoordinator.ts`
- `src/features/chat/services/QuestionTodoBackgroundTaskRefreshHostAdapter.ts`
- `tests/unit/features/chat/VisibleConversationPostSyncCoordinator.test.ts`
- `tests/unit/features/chat/BackgroundTaskPostSyncCoordinator.test.ts`
- `docs/modules/features/chat/services/VisibleConversationPostSyncCoordinator.md`
- `docs/modules/features/chat/services/BackgroundTaskPostSyncCoordinator.md`
- `docs/modules/features/chat/services/QuestionTodoBackgroundTaskRefreshHostAdapter.md`
- `docs/modules/features/chat/services/VisibleConversationPostSyncStateCoordinator.md`
- `docs/modules/features/chat/services/PostSyncQuestionTodoRefreshFacade.md`
- `docs/status/maintainability-phase-286.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- VisibleConversationPostSyncCoordinator BackgroundTaskPostSyncCoordinator QuestionTodoBackgroundTaskRefreshHostAdapter ConversationSyncVisiblePostSyncRouter`
- `npm run build`

本轮 build 生成的 `BUILD_ID`：

- `autopilot-maintainability.202604131145`

本轮未执行全量 `npm test` 的原因：

- attempt `284` 不可被 `5` 整除，且改动未命中仓库规则定义的高风险路径

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且用户未显式要求部署，因此按仓库规则在成功 build 后停止于构建验证。

## 5. 下一步建议

下一轮如继续留在高优先级 P2，可优先考虑让 `ConversationSyncVisiblePostSyncRouter` 直接依赖 `VisibleConversationPostSyncCoordinator`，进一步把 `BackgroundTaskPostSyncCoordinator` 收窄成 hidden signal/background-tab 的 post-sync router。

一句话总结第二百八十六阶段本轮：

> 第二百八十六阶段新增 `VisibleConversationPostSyncCoordinator`，把 `BackgroundTaskPostSyncCoordinator` 里的 visible refresh/state-commit 调用顺序迁出，让 background-task post-sync 的 visible/background 两条路径都落到更对称、可单测的 dedicated seam。
