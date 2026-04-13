# 可维护性改进：第二百九十三阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-292.md`
> **推进的 master-plan lane**: P2 `question / todo / background task` wiring 与 post-sync/activation 协调（visible post-sync question/todo host 拆分）

本轮继续遵循 master plan 与 lane map 的 P2 首查入口，复审 `QuestionTodoBackgroundTaskRefreshHostAdapter` 与 `PostSyncQuestionTodoRefreshFacade` 一带的 host 装配，并选择一个高价值且低风险的单一职责切片：**把 visible question/todo post-sync refresh 的 host 与 service 装配从 `QuestionTodoBackgroundTaskRefreshHostAdapter` 中拆出，交给新的 `PostSyncQuestionTodoRefreshHostAdapter`。**

这样 `QuestionTodoBackgroundTaskRefreshHostAdapter` 不再继续同时承载 activation refresh、visible post-sync refresh、background handoff 三层装配；`QuestionTodoStatusRefreshCoordinator` 与 `PostSyncQuestionTodoRefreshPlanBuilder` 的 host 也不再作为 generic background-task refresh host bundle 的一部分暴露，让 visible question/todo post-sync refresh 更接近独立模块边界。

## 1. 本轮范围

- `src/features/chat/services/PostSyncQuestionTodoRefreshHostAdapter.ts`
  - 新增 dedicated host adapter，负责从共享 view host 派生 `QuestionTodoStatusRefreshCoordinator` 与 `PostSyncQuestionTodoRefreshPlanBuilder` 所需 host，并统一装配 visible post-sync refresh service bundle
- `src/features/chat/services/QuestionTodoBackgroundTaskRefreshHostAdapter.ts`
  - `QuestionTodoBackgroundTaskRefreshViewHost` 改为复用 `PostSyncQuestionTodoRefreshViewHost`
  - generic background-task refresh host bundle 删除已迁出的 `questionTodoStatusRefreshHost` 与 `postSyncQuestionTodoRefreshPlanBuilderHost`
  - service 装配改为复用新的 `createPostSyncQuestionTodoRefreshServices()`，自身收窄到 activation host、background-task writeback host、visible state-commit host 与 background handoff host
- `tests/unit/features/chat/PostSyncQuestionTodoRefreshHostAdapter.test.ts`
  - 新增 adapter 测试，覆盖 post-sync host 派生与 visible refresh service wiring
- `tests/unit/features/chat/QuestionTodoBackgroundTaskRefreshHostAdapter.test.ts`
  - 删除已迁出的 visible post-sync host 断言，保留 activation/background handoff host 与整体 bundle wiring 验证
- `docs/modules/features/chat/services/PostSyncQuestionTodoRefreshHostAdapter.md`
  - 新增模块文档，记录新的 post-sync host 边界
- `docs/modules/features/chat/services/QuestionTodoBackgroundTaskRefreshHostAdapter.md`
- `docs/modules/features/chat/services/PostSyncQuestionTodoRefreshFacade.md`
- `docs/modules/features/chat/services/QuestionTodoStatusRefreshCoordinator.md`
  - 同步记录新的 host 装配职责归属

## 2. 变更文件

- `src/features/chat/services/PostSyncQuestionTodoRefreshHostAdapter.ts`
- `src/features/chat/services/QuestionTodoBackgroundTaskRefreshHostAdapter.ts`
- `tests/unit/features/chat/PostSyncQuestionTodoRefreshHostAdapter.test.ts`
- `tests/unit/features/chat/QuestionTodoBackgroundTaskRefreshHostAdapter.test.ts`
- `docs/modules/features/chat/services/PostSyncQuestionTodoRefreshHostAdapter.md`
- `docs/modules/features/chat/services/QuestionTodoBackgroundTaskRefreshHostAdapter.md`
- `docs/modules/features/chat/services/PostSyncQuestionTodoRefreshFacade.md`
- `docs/modules/features/chat/services/QuestionTodoStatusRefreshCoordinator.md`
- `docs/status/maintainability-phase-293.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- tests/unit/features/chat/PostSyncQuestionTodoRefreshHostAdapter.test.ts tests/unit/features/chat/QuestionTodoBackgroundTaskRefreshHostAdapter.test.ts tests/unit/features/chat/PostSyncQuestionTodoRefreshFacade.test.ts tests/unit/features/chat/PostSyncQuestionTodoRefreshPlanBuilder.test.ts tests/unit/features/chat/QuestionTodoStatusRefreshCoordinator.test.ts`
- `npm run build`

本轮 build 生成的 `BUILD_ID`：

- `autopilot-maintainability.202604131255`

本轮未执行全量 `npm test`。

原因：attempt `291` 不可被 `5` 整除，且改动未命中仓库约定的高风险路径。

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且用户未显式要求部署，因此按仓库规则在成功 build 后停止于构建验证。

## 5. 下一步建议

下一轮建议先复审 P2 `QuestionTodoBackgroundTaskRefreshViewHostAdapter` 是否还保留只服务于 background handoff / visible state writeback 的低风险 pass-through；如果这一带已没有同等级切口，则按 lane map 转向 P1 的 activation / sync runtime bridge host assembly。

一句话总结第二百九十三阶段本轮：

> 第二百九十三阶段把 visible question/todo post-sync refresh 的 host 与 service 装配从 generic background-task refresh adapter 中拆出，让 `QuestionTodoBackgroundTaskRefreshHostAdapter` 与 `PostSyncQuestionTodoRefreshFacade` 的边界更单一。
