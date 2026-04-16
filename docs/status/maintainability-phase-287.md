# 可维护性改进：第二百八十七阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-286.md`
> **推进的 master-plan lane**: P2 `question / todo / background task` wiring 与 post-sync/activation 协调（visible post-sync router direct-dependency seam）

本轮继续遵循 master plan 与 lane map 的 P2 首查入口，选择一个高价值且低风险的单一职责切片：**让 `ConversationSyncVisiblePostSyncRouter` 直接依赖 `VisibleConversationPostSyncCoordinator`，并把 `BackgroundTaskPostSyncCoordinator` 收窄成只处理 hidden/background post-sync 路由。**

这样 visible sync 的 question/todo refresh + current-conversation state-commit 不再绕经 background coordinator；conversation sync wiring 改为显式区分 visible seam 与 hidden/background seam，`BackgroundTaskPostSyncCoordinator` 也不再同时暴露 visible/background 两类入口。

## 1. 本轮范围

- `src/features/chat/services/ConversationSyncVisiblePostSyncRouter.ts`
  - 改为直接依赖 `VisibleConversationPostSyncCoordinator`
  - visible post-sync request shaping 继续保留在 router，但 outcome 决策现在直接落到 dedicated visible seam
- `src/features/chat/services/BackgroundTaskPostSyncCoordinator.ts`
  - 删除 visible sync 入口与相关 type re-export
  - 收窄成只负责 signal/background-tab 的 post-sync handoff delegation
- `src/features/chat/services/QuestionTodoBackgroundTaskRefreshHostAdapter.ts`
  - refresh service bundle 现在同时返回 `VisibleConversationPostSyncCoordinator` 与 `BackgroundTaskPostSyncCoordinator`
  - host adapter 继续统一装配 visible/background 两条 seam，但不再把 visible seam 塞回 background coordinator
- `src/features/chat/services/ConversationSyncHostAdapter.ts` + `src/features/chat/OpenCodianView.ts`
  - conversation sync service wiring 改为分别注入 visible/background post-sync coordinator
  - `OpenCodianView` 不再保留只为 sync wiring 存在的 `backgroundTaskPostSyncCoordinator` 字段
- 测试
  - 更新 `ConversationSyncVisiblePostSyncRouter`、`BackgroundTaskPostSyncCoordinator`、`QuestionTodoBackgroundTaskRefreshHostAdapter` focused coverage
  - 保留 `ConversationSyncHostAdapter`、`ConversationSyncBridge` focused suite 作为分离 visible/background seam 后的回归验证
- 直接相关文档
  - 更新 `ConversationSyncVisiblePostSyncRouter`、`BackgroundTaskPostSyncCoordinator`、`QuestionTodoBackgroundTaskRefreshHostAdapter`、`VisibleConversationPostSyncCoordinator`、`ConversationSyncHostAdapter`、`ConversationSyncBridge` 文档，明确 visible/background post-sync 依赖边界

## 2. 变更文件

- `src/features/chat/services/ConversationSyncVisiblePostSyncRouter.ts`
- `src/features/chat/services/BackgroundTaskPostSyncCoordinator.ts`
- `src/features/chat/services/ConversationSyncBridge.ts`
- `src/features/chat/services/ConversationSyncHostAdapter.ts`
- `src/features/chat/services/QuestionTodoBackgroundTaskRefreshHostAdapter.ts`
- `src/features/chat/OpenCodianView.ts`
- `tests/unit/features/chat/ConversationSyncVisiblePostSyncRouter.test.ts`
- `tests/unit/features/chat/BackgroundTaskPostSyncCoordinator.test.ts`
- `tests/unit/features/chat/QuestionTodoBackgroundTaskRefreshHostAdapter.test.ts`
- `docs/modules/features/chat/services/ConversationSyncVisiblePostSyncRouter.md`
- `docs/modules/features/chat/services/BackgroundTaskPostSyncCoordinator.md`
- `docs/modules/features/chat/services/QuestionTodoBackgroundTaskRefreshHostAdapter.md`
- `docs/modules/features/chat/services/VisibleConversationPostSyncCoordinator.md`
- `docs/modules/features/chat/services/ConversationSyncHostAdapter.md`
- `docs/modules/features/chat/services/ConversationSyncBridge.md`
- `docs/status/maintainability-phase-287.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- ConversationSyncVisiblePostSyncRouter ConversationSyncHostAdapter ConversationSyncBridge BackgroundTaskPostSyncCoordinator QuestionTodoBackgroundTaskRefreshHostAdapter`
- `npm test`
- `npm run build`

本轮 build 生成的 `BUILD_ID`：

- `autopilot-maintainability.202604131155`

本轮执行全量 `npm test` 的原因：

- attempt `285` 可被 `5` 整除，按仓库规则在 targeted tests 通过后补充全量回归

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且用户未显式要求部署，因此按仓库规则在成功 build 后停止于构建验证。

## 5. 下一步建议

下一轮如继续留在高优先级 P2，可评估让 `ConversationSyncBackgroundPostSyncRouter` 直接依赖 `BackgroundConversationPostSyncHandoffCoordinator`，若保持 tests/build 稳定，则可以删除只剩 hidden/background pass-through 的 `BackgroundTaskPostSyncCoordinator` 薄层。

一句话总结第二百八十七阶段本轮：

> 第二百八十七阶段让 `ConversationSyncVisiblePostSyncRouter` 直接接入 `VisibleConversationPostSyncCoordinator`，把 `BackgroundTaskPostSyncCoordinator` 收窄成纯 hidden/background handoff seam，并把 conversation sync wiring 拆成更明确的 visible/background 两条依赖边界。
