# 可维护性改进：第二百五十五阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-254.md`
> **推进的 master-plan lane**: P2 `question / todo / background task`（post-sync background-task writeback port）

本轮继续遵循 lane map 的 P2 首查顺序，从 `OpenCodianView` 里 question/todo/background-task 的 post-sync wiring 命中点入手，再复审 `QuestionTodoStatusRefreshCoordinator`、`PostSyncQuestionTodoRefreshFacade`、`BackgroundTaskPostSyncCoordinator` 与已有的 `QuestionTodoBackgroundTaskRefreshHostAdapter` / `BackgroundTaskIndicatorCoordinator` 模式，没有重新广扫其它 chat runtime 大片上下文。

确认的低风险问题是：`PostSyncQuestionTodoRefreshFacade` 虽然已经收拢了 pending-question / todo-status refresh 顺序，但它的 host 仍直接暴露 `refreshBackgroundTaskCompletionNotices()` 与 `syncTabStreamLikeState()` 两段 background-task UI writeback。这样会让 facade 继续感知分散的 completion-notice / stream-like effect，而不是依赖一条更窄的 post-sync capability。

因此本轮只做一个窄切片：**把 background-task completion-notice + stream-like writeback 收拢成 dedicated post-sync port，并让 `PostSyncQuestionTodoRefreshFacade` 通过该 port 完成 background conversation refresh 的尾部 effect。** 具体做法是给 `BackgroundTaskIndicatorCoordinator` 增加 `flushCompletionNoticesAndSyncStreamLikeState()`，让 `QuestionTodoBackgroundTaskRefreshHostAdapter` 输出 `BackgroundTaskPostSyncWritebackPort`，并移除 facade host 上原本分散的 completion/writeback 回调。question/todo refresh 顺序、background-task runtime rebuild、attention 与 visible sync 判定语义均保持不变。

## 1. 本轮范围

- `src/features/chat/runtime/BackgroundTaskIndicatorCoordinator.ts`
  - 新增 `flushCompletionNoticesAndSyncStreamLikeState()`
  - 让 render path 与 post-sync path 复用同一条 completion/writeback 编排
- `src/features/chat/services/PostSyncQuestionTodoRefreshFacade.ts`
  - 新增 `BackgroundTaskPostSyncWritebackPort`
  - 收窄 facade host，只保留 current-session lookup 与 background-task state rebuild
- `src/features/chat/services/QuestionTodoBackgroundTaskRefreshHostAdapter.ts`
  - 派生 dedicated background-task post-sync writeback port
  - 删除 view host 上分散的 completion-notice / stream-like host surface
- 测试
  - 更新 `tests/unit/features/chat/PostSyncQuestionTodoRefreshFacade.test.ts`
  - 更新 `tests/unit/features/chat/QuestionTodoBackgroundTaskRefreshHostAdapter.test.ts`
  - 更新 `tests/unit/features/chat/BackgroundTaskIndicatorCoordinator.test.ts`
- 直接相关文档
  - 更新 `docs/modules/features/chat/services/PostSyncQuestionTodoRefreshFacade.md`
  - 更新 `docs/modules/features/chat/services/QuestionTodoBackgroundTaskRefreshHostAdapter.md`
  - 更新 `docs/modules/features/chat/runtime/BackgroundTaskIndicatorCoordinator.md`

## 2. 变更文件

- `src/features/chat/runtime/BackgroundTaskIndicatorCoordinator.ts`
- `src/features/chat/services/PostSyncQuestionTodoRefreshFacade.ts`
- `src/features/chat/services/QuestionTodoBackgroundTaskRefreshHostAdapter.ts`
- `tests/unit/features/chat/PostSyncQuestionTodoRefreshFacade.test.ts`
- `tests/unit/features/chat/QuestionTodoBackgroundTaskRefreshHostAdapter.test.ts`
- `tests/unit/features/chat/BackgroundTaskIndicatorCoordinator.test.ts`
- `docs/modules/features/chat/services/PostSyncQuestionTodoRefreshFacade.md`
- `docs/modules/features/chat/services/QuestionTodoBackgroundTaskRefreshHostAdapter.md`
- `docs/modules/features/chat/runtime/BackgroundTaskIndicatorCoordinator.md`
- `docs/status/maintainability-phase-255.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- PostSyncQuestionTodoRefreshFacade QuestionTodoBackgroundTaskRefreshHostAdapter BackgroundTaskIndicatorCoordinator`
- `npm test`
- `npm run build`

本轮构建 `BUILD_ID`：

- `autopilot-maintainability.202604130556`

本轮执行完整 `npm test` 的原因：

- attempt `250` 可以被 `5` 整除，命中仓库规则中的完整测试条件

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且用户未显式要求部署，因此按仓库规则在成功 build 后停止于构建验证。

## 5. 下一步建议

下一轮建议继续留在 master-plan 当前高优先级的 P2 `question / todo / background task` lane，沿着同一条 post-sync 首查链路继续复审 `BackgroundTaskPostSyncCoordinator` 与 `PostSyncQuestionTodoRefreshFacade` 交界，优先寻找仍可从 facade/coordinator host 中移走、但还没有收敛到 dedicated capability 的 background-task stale-follow-up 或 notice-state writeback seam。

一句话总结第二百五十五阶段本轮：

> 第二百五十五阶段把 background-task completion notice 与 stream-like writeback 收拢成 dedicated post-sync port，让 `PostSyncQuestionTodoRefreshFacade` 不再直接依赖分散的 UI effect host 回调，同时保持原有 question/todo/background-task post-sync 语义不变。
