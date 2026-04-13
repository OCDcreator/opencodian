# 可维护性改进：第二百八十八阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-287.md`
> **推进的 master-plan lane**: P2 `question / todo / background task` wiring 与 post-sync/activation 协调（hidden/background post-sync direct-handoff seam）

本轮继续遵循 master plan 与 lane map 的 P2 首查入口，选择一个高价值且低风险的单一职责切片：**让 `ConversationSyncBackgroundPostSyncRouter` 直接依赖 `BackgroundConversationPostSyncHandoffCoordinator`，并删除只剩转发职责的 `BackgroundTaskPostSyncCoordinator` 薄层。**

这样 hidden signal sync / background-tab sync 的 post-sync option shaping、fingerprint writeback 与 handoff 调用都落在明确的 router → handoff seam 上；`QuestionTodoBackgroundTaskRefreshHostAdapter` 也直接返回 visible 与 hidden/background 两条 coordinator seam，避免 conversation sync wiring 再绕经一个没有独立业务规则的 pass-through coordinator。

## 1. 本轮范围

- `src/features/chat/services/ConversationSyncBackgroundPostSyncRouter.ts`
  - 改为直接消费 `BackgroundConversationPostSyncHandoffCoordinator` 的 narrowed port
  - post-sync result / signal/background-tab option types 直接来自 `BackgroundConversationPostSyncHandoffCoordinator`
- `src/features/chat/services/QuestionTodoBackgroundTaskRefreshHostAdapter.ts`
  - service bundle 删除 `BackgroundTaskPostSyncCoordinator` 实例化
  - 直接返回 `backgroundConversationPostSyncHandoffCoordinator`，供 conversation sync background router 消费
- `src/features/chat/services/ConversationSyncHostAdapter.ts` + `src/features/chat/OpenCodianView.ts`
  - conversation sync service wiring 改为传入 direct handoff coordinator
  - `OpenCodianView` 的构造期 wiring 不再命名或持有 `backgroundTaskPostSyncCoordinator`
- 测试
  - 删除 pass-through coordinator focused suite
  - 更新 `ConversationSyncBackgroundPostSyncRouter` 与 `QuestionTodoBackgroundTaskRefreshHostAdapter` coverage，验证 direct handoff seam 仍保留 signal/background-tab 行为
- 直接相关文档
  - 删除 `BackgroundTaskPostSyncCoordinator` 模块文档
  - 更新 conversation sync、question/todo/background-task post-sync、runtime/indicator 相邻模块文档，清理已删除 seam 的当前架构引用
  - 更新 lane map 的 P2 首查入口，指向当前存在的 `BackgroundConversationPostSyncHandoffCoordinator`

## 2. 变更文件

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/services/ConversationSyncBackgroundPostSyncRouter.ts`
- `src/features/chat/services/ConversationSyncHostAdapter.ts`
- `src/features/chat/services/QuestionTodoBackgroundTaskRefreshHostAdapter.ts`
- `src/features/chat/services/BackgroundTaskPostSyncCoordinator.ts`（删除）
- `tests/unit/features/chat/ConversationSyncBackgroundPostSyncRouter.test.ts`
- `tests/unit/features/chat/QuestionTodoBackgroundTaskRefreshHostAdapter.test.ts`
- `tests/unit/features/chat/BackgroundTaskPostSyncCoordinator.test.ts`（删除）
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/features/chat/runtime/BackgroundTaskIndicatorCoordinator.md`
- `docs/modules/features/chat/runtime/TabRuntimeStateBridge.md`
- `docs/modules/features/chat/services/BackgroundConversationAttentionCoordinator.md`
- `docs/modules/features/chat/services/BackgroundConversationPostSyncHandoffCoordinator.md`
- `docs/modules/features/chat/services/BackgroundConversationPostSyncRefreshExecutor.md`
- `docs/modules/features/chat/services/BackgroundConversationSignalSyncStateCoordinator.md`
- `docs/modules/features/chat/services/BackgroundTaskCompletionNoticeService.md`
- `docs/modules/features/chat/services/BackgroundTaskLiveSignalCoordinator.md`
- `docs/modules/features/chat/services/BackgroundTaskPostSyncCoordinator.md`（删除）
- `docs/modules/features/chat/services/BackgroundTaskTimelineService.md`
- `docs/modules/features/chat/services/ConversationSyncBackgroundPostSyncRouter.md`
- `docs/modules/features/chat/services/ConversationSyncBridge.md`
- `docs/modules/features/chat/services/ConversationSyncHostAdapter.md`
- `docs/modules/features/chat/services/ConversationSyncOrchestrationService.md`
- `docs/modules/features/chat/services/ConversationSyncRuntimeCoordinator.md`
- `docs/modules/features/chat/services/PostSyncQuestionTodoRefreshFacade.md`
- `docs/modules/features/chat/services/PostSyncQuestionTodoRefreshPlanBuilder.md`
- `docs/modules/features/chat/services/QuestionDockCoordinator.md`
- `docs/modules/features/chat/services/QuestionTodoBackgroundTaskRefreshHostAdapter.md`
- `docs/modules/features/chat/services/QuestionTodoStatusRefreshCoordinator.md`
- `docs/modules/features/chat/services/SessionTodoStatusRefreshService.md`
- `docs/modules/features/chat/services/VisibleConversationPostSyncCoordinator.md`
- `docs/status/maintainability-lane-map.md`
- `docs/status/maintainability-phase-288.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- ConversationSyncBackgroundPostSyncRouter QuestionTodoBackgroundTaskRefreshHostAdapter ConversationSyncHostAdapter BackgroundConversationPostSyncHandoffCoordinator`
- `npm run build`

本轮 build 生成的 `BUILD_ID`：

- `autopilot-maintainability.202604131207`

本轮未执行全量 `npm test`。

原因：attempt `286` 不能被 `5` 整除，且改动未命中仓库规则中要求全量测试的 high-risk 路径（`src/main.ts`、`src/core/`、`automation/`、`package.json`、`package-lock.json`、`manifest.json`、`styles.css` 或 `esbuild.config.mjs`）。

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且用户未显式要求部署，因此按仓库规则在成功 build 后停止于构建验证。

## 5. 下一步建议

下一轮建议继续从更新后的 P2 首查入口出发，先复审 `OpenCodianView` 里 question/todo/background-task 的 remaining host factory 与 runtime follow-up wiring；如果 post-sync seam 已无同等级 pass-through，可转向 question resolution / todo stale notice / background-task follow-up 中仍由 view 持有的协调逻辑，而不是继续拆已足够窄的 router/handoff 边界。

一句话总结第二百八十八阶段本轮：

> 第二百八十八阶段让 `ConversationSyncBackgroundPostSyncRouter` 直接接入 `BackgroundConversationPostSyncHandoffCoordinator`，删除 `BackgroundTaskPostSyncCoordinator` pass-through layer，并把 P2 post-sync 文档与 lane map 更新到新的 visible/background direct seam。
