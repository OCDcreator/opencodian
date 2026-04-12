# 可维护性改进：第二百五十六阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-255.md`
> **推进的 master-plan lane**: P2 `question / todo / background task`（post-sync background-task refresh port 收窄）

本轮继续遵循 lane map 的 P2 首查顺序，从 `OpenCodianView` 里 question/todo/background-task 的 post-sync wiring 命中点入手，再复审 `QuestionTodoStatusRefreshCoordinator`、`PostSyncQuestionTodoRefreshFacade`、`BackgroundTaskPostSyncCoordinator` 与已有的 `QuestionTodoBackgroundTaskRefreshHostAdapter` 模式，没有重新广扫其它 chat runtime 大片上下文。

确认的低风险问题是：虽然上一轮已经把 completion notice + stream-like writeback 从 `PostSyncQuestionTodoRefreshFacade` host 中收拢成 dedicated port，但 facade host 仍同时承担 `getCurrentConversationSessionId()` 和 `syncBackgroundTaskStateFromConversation()`。这样会让 facade host 继续混合“当前会话选择”和“background-task post-sync effect”两类职责，而 background-task rebuild/writeback 其实已经可以收束到同一条 post-sync capability。

因此本轮只做一个窄切片：**把 `syncBackgroundTaskStateFromConversation()` 从 `PostSyncQuestionTodoRefreshFacadeHost` 移到 dedicated `BackgroundTaskPostSyncRefreshPort`，让 facade 的 background conversation refresh 全程通过同一条 background-task post-sync port 完成 rebuild + writeback。** 这样保持了原有顺序：pending-question refresh 之后先 rebuild background-task runtime，再继续 todo/status refresh gate，最后再 flush completion notice 与 stream-like writeback；`BackgroundTaskPostSyncCoordinator` 的 authoritative mark、attention 与 visible sync state-commit 判定语义保持不变。

## 1. 本轮范围

- `src/features/chat/services/PostSyncQuestionTodoRefreshFacade.ts`
  - 新增 `BackgroundTaskPostSyncRefreshPort`
  - 收窄 facade host，只保留 current-session lookup
- `src/features/chat/services/QuestionTodoBackgroundTaskRefreshHostAdapter.ts`
  - 改由 dedicated background-task post-sync refresh port 同时承接 runtime rebuild 与 writeback
  - 更新 service bundle wiring
- 测试
  - 更新 `tests/unit/features/chat/PostSyncQuestionTodoRefreshFacade.test.ts`
  - 更新 `tests/unit/features/chat/QuestionTodoBackgroundTaskRefreshHostAdapter.test.ts`
- 直接相关文档
  - 更新 `docs/modules/features/chat/services/PostSyncQuestionTodoRefreshFacade.md`
  - 更新 `docs/modules/features/chat/services/QuestionTodoBackgroundTaskRefreshHostAdapter.md`

## 2. 变更文件

- `src/features/chat/services/PostSyncQuestionTodoRefreshFacade.ts`
- `src/features/chat/services/QuestionTodoBackgroundTaskRefreshHostAdapter.ts`
- `tests/unit/features/chat/PostSyncQuestionTodoRefreshFacade.test.ts`
- `tests/unit/features/chat/QuestionTodoBackgroundTaskRefreshHostAdapter.test.ts`
- `docs/modules/features/chat/services/PostSyncQuestionTodoRefreshFacade.md`
- `docs/modules/features/chat/services/QuestionTodoBackgroundTaskRefreshHostAdapter.md`
- `docs/status/maintainability-phase-256.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- PostSyncQuestionTodoRefreshFacade QuestionTodoBackgroundTaskRefreshHostAdapter`
- `npm run build`

本轮构建 `BUILD_ID`：

- `autopilot-maintainability.202604130604`

本轮未执行完整 `npm test` 的原因：

- attempt `251` 不可被 `5` 整除，且改动未命中仓库规则要求完整测试的高风险路径（`src/main.ts`、`src/core/`、`automation/`、`package.json`、`package-lock.json`、`manifest.json`、`styles.css`、`esbuild.config.mjs`）

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且用户未显式要求部署，因此按仓库规则在成功 build 后停止于构建验证。

## 5. 下一步建议

下一轮建议继续留在 master-plan 当前高优先级的 P2 `question / todo / background task` lane，沿着同一条 post-sync 首查链路继续复审 `BackgroundTaskPostSyncCoordinator` 与 `PostSyncQuestionTodoRefreshFacade` 交界，优先寻找是否还能把 signal/background-tab 的 `forceTodoStatusRefresh` 判定从 coordinator 的原始布尔选择收束成 facade 内部的 dedicated refresh policy。

一句话总结第二百五十六阶段本轮：

> 第二百五十六阶段把 `PostSyncQuestionTodoRefreshFacade` 剩余的 background-task runtime rebuild 从 facade host 中移到 dedicated post-sync refresh port，让 current-session lookup 与 background-task effect capability 彻底分离，同时保持原有 question/todo/background-task post-sync 顺序不变。
