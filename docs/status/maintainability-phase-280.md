# 可维护性改进：第二百八十阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-279.md`
> **推进的 master-plan lane**: P2 `question / todo / background task` wiring 与 post-sync/activation 协调（background post-sync execution seam）

本轮继续遵循 master plan 与 lane map 的 P2 首查入口，选择一个高价值且低风险的单一职责切片：**把 signal/background-tab 使用的 background post-sync question/todo refresh 执行链从 `PostSyncQuestionTodoRefreshFacade` 抽到独立的 `BackgroundConversationPostSyncRefreshExecutor`。**

这样 `PostSyncQuestionTodoRefreshFacade` 收窄为 visible-conversation 的 post-sync refresh 入口；`BackgroundTaskPostSyncCoordinator` 也不再通过同一个 facade surface 同时路由 visible 与 background source，而是把 background-only 执行顺序显式交给新的 executor。

## 1. 本轮范围

- `src/features/chat/services/BackgroundConversationPostSyncRefreshExecutor.ts`
  - 新增 background-only post-sync execution seam
  - 保留原有顺序：pending-question refresh → background-task rebuild hook → todo/status refresh → completion notice / stream-like writeback
  - 只暴露 signal/background-tab 需要的窄入口，不再混入 visible source
- `src/features/chat/services/PostSyncQuestionTodoRefreshFacade.ts`
  - 删除 signal/background-tab refresh entry
  - 收窄为 visible conversation 的 plan handoff + post-sync question/todo refresh facade
- `src/features/chat/services/BackgroundTaskPostSyncCoordinator.ts`
  - 改为分别依赖 visible facade 与 background executor
  - visible/background source routing 不再共用同一 facade port
- `src/features/chat/services/QuestionTodoBackgroundTaskRefreshHostAdapter.ts`
  - 更新 shared service bundle 装配
  - 在现有 builder/status coordinator/refresh port 上串起新的 background executor
- 测试
  - 新增 `tests/unit/features/chat/BackgroundConversationPostSyncRefreshExecutor.test.ts`
  - 更新 visible facade 与 background coordinator focused tests，覆盖新的分离边界
- 直接相关文档
  - 新增 `docs/modules/features/chat/services/BackgroundConversationPostSyncRefreshExecutor.md`
  - 更新 post-sync facade / background coordinator / refresh host adapter 文档，明确 visible facade 与 background executor 的新职责

## 2. 变更文件

- `src/features/chat/services/BackgroundConversationPostSyncRefreshExecutor.ts`
- `src/features/chat/services/BackgroundTaskPostSyncCoordinator.ts`
- `src/features/chat/services/PostSyncQuestionTodoRefreshFacade.ts`
- `src/features/chat/services/QuestionTodoBackgroundTaskRefreshHostAdapter.ts`
- `tests/unit/features/chat/BackgroundConversationPostSyncRefreshExecutor.test.ts`
- `tests/unit/features/chat/BackgroundTaskPostSyncCoordinator.test.ts`
- `tests/unit/features/chat/PostSyncQuestionTodoRefreshFacade.test.ts`
- `docs/modules/features/chat/services/BackgroundConversationPostSyncRefreshExecutor.md`
- `docs/modules/features/chat/services/BackgroundTaskPostSyncCoordinator.md`
- `docs/modules/features/chat/services/PostSyncQuestionTodoRefreshFacade.md`
- `docs/modules/features/chat/services/QuestionTodoBackgroundTaskRefreshHostAdapter.md`
- `docs/status/maintainability-phase-280.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- BackgroundConversationPostSyncRefreshExecutor PostSyncQuestionTodoRefreshFacade BackgroundTaskPostSyncCoordinator QuestionTodoBackgroundTaskRefreshHostAdapter`
- `npm run build`

本轮 build 生成的 `BUILD_ID`：

- `autopilot-maintainability.202604131031`

本轮未执行全量 `npm test` 的原因：

- attempt `277` 不能被 `5` 整除
- 改动未命中仓库规则要求补跑全量测试的高风险路径（`src/main.ts`、`src/core/`、`automation/`、`package.json`、`package-lock.json`、`manifest.json`、`styles.css`、`esbuild.config.mjs`）

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且用户未显式要求部署，因此按仓库规则在成功 build 后停止于构建验证。

## 5. 下一步建议

下一轮可继续留在高优先级 P2，优先考虑把 visible-conversation 的 post-sync refresh + state-commit handoff 再收窄成更独立的 visible seam，进一步减轻 `BackgroundTaskPostSyncCoordinator` 同时承接 visible refresh routing 与 visible state outcome commit 的职责。

一句话总结第二百八十阶段本轮：

> 第二百八十阶段把 signal/background-tab 的 post-sync question/todo/background-task 执行链从 `PostSyncQuestionTodoRefreshFacade` 抽到新的 `BackgroundConversationPostSyncRefreshExecutor`，显式拆开 visible 与 background 的 post-sync refresh entry surface。
