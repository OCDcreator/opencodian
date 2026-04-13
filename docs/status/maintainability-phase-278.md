# 可维护性改进：第二百七十八阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-277.md`
> **推进的 master-plan lane**: P2 `question / todo / background task` wiring 与 post-sync/activation 协调（post-sync session/policy plan seam）

本轮继续遵循 master plan 与 lane map 的 P2 首查入口，选择一个高价值且低风险的单一职责切片：**把 visible/background question post-sync 的 session-id 配对与 todo/status force-refresh policy 从 `PostSyncQuestionTodoRefreshFacade` / `BackgroundTaskPostSyncCoordinator` 抽到独立的 `PostSyncQuestionTodoRefreshPlanBuilder`。**

这样 `BackgroundTaskPostSyncCoordinator` 只按 sync 来源调用 source-specific refresh method，不再构造低层 `todoStatusRefreshPolicy`；`PostSyncQuestionTodoRefreshFacade` 只保留 pending-question → background-task rebuild → todo/status refresh → writeback 的执行顺序，不再同时持有 session/policy 选择规则。

## 1. 本轮范围

- `src/features/chat/services/PostSyncQuestionTodoRefreshPlanBuilder.ts`
  - 新增 post-sync question/todo refresh plan seam
  - visible sync 继续把 pending-question session 与当前活动 conversation 的 todo/status session 配对
  - signal sync 使用 background conversation session，并通过 `tabHasBackgroundTask` 决定是否强制 todo/status refresh
  - background-tab sync 使用 background conversation session，并固定强制 todo/status refresh
- `src/features/chat/services/PostSyncQuestionTodoRefreshFacade.ts`
  - 删除 facade 内部的 current-session 查询与 source policy 到 force-boolean 映射
  - 改为消费 plan builder，并暴露 signal/background-tab source-specific background refresh method
  - 保留 background-task rebuild hook 与 completion/stream-like writeback 的既有顺序
- `src/features/chat/services/BackgroundTaskPostSyncCoordinator.ts`
  - 删除 `todoStatusRefreshPolicy` 对象组装
  - signal/background-tab 分支只调用 source-specific facade method，并继续持有 authoritative mark 与 attention 判定
- `src/features/chat/services/QuestionTodoBackgroundTaskRefreshHostAdapter.ts`
  - 在 shared refresh service bundle 中装配 `PostSyncQuestionTodoRefreshPlanBuilder`
  - 把当前 conversation session host 从 facade host 改为 plan-builder host
- 测试
  - 新增 `tests/unit/features/chat/PostSyncQuestionTodoRefreshPlanBuilder.test.ts`
  - 更新 facade、coordinator 与 host-adapter focused tests，覆盖新 source-specific refresh seam
- 直接相关文档
  - 新增 `docs/modules/features/chat/services/PostSyncQuestionTodoRefreshPlanBuilder.md`
  - 更新 `PostSyncQuestionTodoRefreshFacade`、`BackgroundTaskPostSyncCoordinator` 与 `QuestionTodoBackgroundTaskRefreshHostAdapter` 模块文档

## 2. 变更文件

- `src/features/chat/services/PostSyncQuestionTodoRefreshPlanBuilder.ts`
- `src/features/chat/services/PostSyncQuestionTodoRefreshFacade.ts`
- `src/features/chat/services/BackgroundTaskPostSyncCoordinator.ts`
- `src/features/chat/services/QuestionTodoBackgroundTaskRefreshHostAdapter.ts`
- `tests/unit/features/chat/PostSyncQuestionTodoRefreshPlanBuilder.test.ts`
- `tests/unit/features/chat/PostSyncQuestionTodoRefreshFacade.test.ts`
- `tests/unit/features/chat/BackgroundTaskPostSyncCoordinator.test.ts`
- `tests/unit/features/chat/QuestionTodoBackgroundTaskRefreshHostAdapter.test.ts`
- `docs/modules/features/chat/services/PostSyncQuestionTodoRefreshPlanBuilder.md`
- `docs/modules/features/chat/services/PostSyncQuestionTodoRefreshFacade.md`
- `docs/modules/features/chat/services/BackgroundTaskPostSyncCoordinator.md`
- `docs/modules/features/chat/services/QuestionTodoBackgroundTaskRefreshHostAdapter.md`
- `docs/status/maintainability-phase-278.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- PostSyncQuestionTodoRefreshPlanBuilder PostSyncQuestionTodoRefreshFacade BackgroundTaskPostSyncCoordinator QuestionTodoBackgroundTaskRefreshHostAdapter`
- `npm run build`

本轮 build 生成的 `BUILD_ID`：

- `autopilot-maintainability.202604130956`

本轮未执行全量 `npm test` 的原因：

- attempt `274` 不能被 `5` 整除
- 改动未命中仓库规则要求补跑全量测试的高风险路径（`src/main.ts`、`src/core/`、`automation/`、`package.json`、`package-lock.json`、`manifest.json`、`styles.css`、`esbuild.config.mjs`）

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且用户未显式要求部署，因此按仓库规则在成功 build 后停止于构建验证。

## 5. 下一步建议

下一轮可继续留在高优先级 P2，优先考虑把 post-sync question/todo/background-task 链路里剩余的 background-task writeback/rebuild hook 入口进一步收束为更窄的 execution port，或转向 activation/post-sync 之间仍共享但未完全显式化的 question/todo refresh handoff。

一句话总结第二百七十八阶段本轮：

> 第二百七十八阶段把 post-sync question/todo refresh 的 visible/background session 配对与 source force-refresh policy 从 facade/coordinator 下沉到新的 `PostSyncQuestionTodoRefreshPlanBuilder`。
