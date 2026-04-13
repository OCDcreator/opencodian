# 可维护性改进：第二百九十五阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-294.md`
> **推进的 master-plan lane**: P2 `question / todo / background task` wiring 与 post-sync/activation 协调（background handoff host assembly 拆分）

本轮继续遵循 master plan 与 lane map 的 P2 首查入口，复审 `OpenCodianView` question/todo/background-task host wiring、`QuestionTodoBackgroundTaskRefreshHostAdapter`、`PostSyncQuestionTodoRefreshFacade`、`BackgroundConversationPostSyncHandoffCoordinator` 与相关 background post-sync executor 之后，选择一个高价值且低风险的单一职责切片：**把 signal/background-tab post-sync handoff 所需的 late-bound background writeback host assembly 从 `QuestionTodoBackgroundTaskRefreshHostAdapter` 中拆出，交给新的 `BackgroundConversationPostSyncHandoffHostAdapter`。**

这样 `QuestionTodoBackgroundTaskRefreshViewHostAdapter` 不再继续夹带只服务于 background handoff 的 completion-flush / authoritative-sync / tab-attention pass-through，question/todo refresh host 与 background handoff host 也不再共享同一层 late-bound adapter surface，让 refresh-side adapter 更聚焦在 activation/visible question-todo refresh，而 background signal/background-tab follow-up 则收口到 dedicated handoff host bundle。

## 1. 本轮范围

- `src/features/chat/services/BackgroundConversationPostSyncHandoffHostAdapter.ts`
  - 新增 dedicated host adapter，负责从 shared question/todo/background-task view host 派生 background handoff view host、handoff hosts 与 service bundle
- `src/features/chat/services/QuestionTodoBackgroundTaskRefreshHostAdapter.ts`
  - `QuestionTodoBackgroundTaskRefreshViewHostAdapterHost` 与 `QuestionTodoBackgroundTaskRefreshViewHost` 删除 background-only writeback pass-through
  - refresh host bundle 收窄为 activation refresh host，background handoff service 装配改为委托新的 handoff adapter
- `src/features/chat/OpenCodianView.ts`
  - shared question/todo/background-task view host 现在分别交给 question/todo refresh adapter 与新的 background handoff adapter，再注入 refresh-side service bundle
- `tests/unit/features/chat/BackgroundConversationPostSyncHandoffHostAdapter.test.ts`
  - 新增 adapter 测试，覆盖 dedicated handoff view host 派生、host wiring 与 signal-sync service bundle 装配
- `tests/unit/features/chat/QuestionTodoBackgroundTaskRefreshHostAdapter.test.ts`
  - 删除已迁出的 background handoff pass-through 断言，并改为验证 refresh adapter 仅承接 question/todo refresh surface
- `docs/modules/features/chat/services/BackgroundConversationPostSyncHandoffHostAdapter.md`
  - 新增模块文档，记录新的 background handoff host assembly 边界
- `docs/modules/features/chat/services/QuestionTodoBackgroundTaskRefreshHostAdapter.md`
- `docs/modules/features/chat/services/BackgroundConversationPostSyncHandoffCoordinator.md`
  - 同步记录 background handoff host 装配职责已迁出

## 2. 变更文件

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/services/BackgroundConversationPostSyncHandoffHostAdapter.ts`
- `src/features/chat/services/QuestionTodoBackgroundTaskRefreshHostAdapter.ts`
- `tests/unit/features/chat/BackgroundConversationPostSyncHandoffHostAdapter.test.ts`
- `tests/unit/features/chat/QuestionTodoBackgroundTaskRefreshHostAdapter.test.ts`
- `docs/modules/features/chat/services/BackgroundConversationPostSyncHandoffHostAdapter.md`
- `docs/modules/features/chat/services/BackgroundConversationPostSyncHandoffCoordinator.md`
- `docs/modules/features/chat/services/QuestionTodoBackgroundTaskRefreshHostAdapter.md`
- `docs/status/maintainability-phase-295.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- tests/unit/features/chat/BackgroundConversationPostSyncHandoffHostAdapter.test.ts tests/unit/features/chat/QuestionTodoBackgroundTaskRefreshHostAdapter.test.ts tests/unit/features/chat/BackgroundConversationPostSyncHandoffCoordinator.test.ts tests/unit/features/chat/BackgroundConversationPostSyncRefreshExecutor.test.ts tests/unit/features/chat/VisibleConversationPostSyncCoordinator.test.ts`
- `npm run build`

本轮 build 生成的 `BUILD_ID`：

- `autopilot-maintainability.202604131319`

本轮未执行全量 `npm test`。

原因：attempt `293` 不可被 `5` 整除，且改动未命中仓库约定的高风险路径。

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且用户未显式要求部署，因此按仓库规则在成功 build 后停止于构建验证。

## 5. 下一步建议

下一轮建议按 lane map 切到 P1，复审 `OpenCodianView` 里的 activation / sync runtime bridge host assembly，优先寻找可沿用 host-adapter 模式下沉的单一职责切口。

一句话总结第二百九十五阶段本轮：

> 第二百九十五阶段把 background post-sync handoff host 从 `QuestionTodoBackgroundTaskRefreshHostAdapter` 中拆出，让 question/todo refresh adapter 与 background handoff adapter 的职责边界更单一。
