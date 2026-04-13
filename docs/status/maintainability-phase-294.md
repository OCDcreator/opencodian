# 可维护性改进：第二百九十四阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-293.md`
> **推进的 master-plan lane**: P2 `question / todo / background task` wiring 与 post-sync/activation 协调（visible post-sync state writeback host 拆分）

本轮继续遵循 master plan 与 lane map 的 P2 首查入口，复审 `OpenCodianView` question/todo/background-task host wiring、`QuestionTodoBackgroundTaskRefreshHostAdapter`、`PostSyncQuestionTodoRefreshFacade` 与相关 visible/background post-sync coordinator 之后，选择一个高价值且低风险的单一职责切片：**把 visible conversation post-sync state writeback 的 host 与 coordinator 装配从 `QuestionTodoBackgroundTaskRefreshHostAdapter` 中拆出，交给新的 `VisibleConversationPostSyncStateHostAdapter`。**

这样 `QuestionTodoBackgroundTaskRefreshViewHostAdapter` 不再继续夹带 current-conversation revert-state / fingerprint 写回 pass-through，visible state commit 的 host assembly 也不再作为 generic question/todo/background refresh host bundle 的一部分暴露，让 `QuestionTodoBackgroundTaskRefreshHostAdapter` 更聚焦在 question/todo refresh、activation refresh bridge 与 background handoff wiring。

## 1. 本轮范围

- `src/features/chat/services/VisibleConversationPostSyncStateHostAdapter.ts`
  - 新增 dedicated host adapter，负责从共享的 question/todo/background-task view host 派生 `VisibleConversationPostSyncStateCoordinator` 所需 host，并统一装配 visible state-commit coordinator
- `src/features/chat/services/QuestionTodoBackgroundTaskRefreshHostAdapter.ts`
  - `QuestionTodoBackgroundTaskRefreshViewHostAdapterHost` 与 `QuestionTodoBackgroundTaskRefreshViewHost` 删除 visible writeback pass-through
  - refresh host bundle 删除已迁出的 `visibleConversationPostSyncStateCoordinatorHost`
  - service 装配改为接收外部注入的 visible state coordinator，自身收窄到 activation refresh bridge、question/todo refresh 与 background handoff wiring
- `src/features/chat/OpenCodianView.ts`
  - shared question/todo/background-task view host 现在先交给 `VisibleConversationPostSyncStateHostAdapter` 装配 visible state coordinator，再注入 refresh-side service bundle
- `tests/unit/features/chat/VisibleConversationPostSyncStateHostAdapter.test.ts`
  - 新增 adapter 测试，覆盖 visible state host 派生与 coordinator wiring
- `tests/unit/features/chat/QuestionTodoBackgroundTaskRefreshHostAdapter.test.ts`
  - 删除已迁出的 visible writeback host 断言，并改为验证 refresh service bundle 会调用注入的 visible state coordinator
- `docs/modules/features/chat/services/VisibleConversationPostSyncStateHostAdapter.md`
  - 新增模块文档，记录新的 visible state writeback host 边界
- `docs/modules/features/chat/services/QuestionTodoBackgroundTaskRefreshHostAdapter.md`
- `docs/modules/features/chat/services/VisibleConversationPostSyncStateCoordinator.md`
- `docs/modules/features/chat/services/VisibleConversationPostSyncCoordinator.md`
  - 同步记录 visible state host 装配职责已迁出

## 2. 变更文件

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/services/QuestionTodoBackgroundTaskRefreshHostAdapter.ts`
- `src/features/chat/services/VisibleConversationPostSyncStateHostAdapter.ts`
- `tests/unit/features/chat/QuestionTodoBackgroundTaskRefreshHostAdapter.test.ts`
- `tests/unit/features/chat/VisibleConversationPostSyncStateHostAdapter.test.ts`
- `docs/modules/features/chat/services/QuestionTodoBackgroundTaskRefreshHostAdapter.md`
- `docs/modules/features/chat/services/VisibleConversationPostSyncCoordinator.md`
- `docs/modules/features/chat/services/VisibleConversationPostSyncStateCoordinator.md`
- `docs/modules/features/chat/services/VisibleConversationPostSyncStateHostAdapter.md`
- `docs/status/maintainability-phase-294.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- tests/unit/features/chat/VisibleConversationPostSyncStateHostAdapter.test.ts tests/unit/features/chat/QuestionTodoBackgroundTaskRefreshHostAdapter.test.ts tests/unit/features/chat/VisibleConversationPostSyncCoordinator.test.ts tests/unit/features/chat/VisibleConversationPostSyncStateCoordinator.test.ts`
- `npm run build`

本轮 build 生成的 `BUILD_ID`：

- `autopilot-maintainability.202604131308`

本轮未执行全量 `npm test`。

原因：attempt `292` 不可被 `5` 整除，且改动未命中仓库约定的高风险路径。

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且用户未显式要求部署，因此按仓库规则在成功 build 后停止于构建验证。

## 5. 下一步建议

下一轮建议先复审 P2 `QuestionTodoBackgroundTaskRefreshViewHostAdapter` 是否还保留只服务于 background handoff 的低风险 pass-through；如果这一带已没有同等级切口，则按 lane map 转向 P1 的 activation / sync runtime bridge host assembly。

一句话总结第二百九十四阶段本轮：

> 第二百九十四阶段把 visible conversation post-sync state writeback host 从 generic question/todo/background refresh adapter 中拆出，让 `QuestionTodoBackgroundTaskRefreshHostAdapter` 与 `VisibleConversationPostSyncStateCoordinator` 的边界更单一。
