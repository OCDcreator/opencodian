# 可维护性改进：第三百一十八阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-317.md`
> **推进的 master-plan lane**: P2 `question / todo / background task`
> **完成的 roadmap queue item**: `R3 - Session todo refresh/status 收束`

本轮严格执行 roadmap 的第一个 `[NEXT]` 项：`R3 - Session todo refresh/status 收束`。切口只围绕 session todo 的 refresh/status/runtime seam：把原先分散在 `SessionTodoRuntimeFacade`、`SessionTodoStatusRefreshService`、`SessionTodoHostAdapter`、`OpenCodianView` 与相邻 P2 host adapter 里的 todo refresh、status refresh、stream/live update、tab reset、dock render trigger 收束回一个较厚的 `SessionTodoCoordinator`。目标是让 `OpenCodianView` 与相邻 wiring 只消费 coordinator API，而不是继续分别持有 state/dock/refresh/runtime 四条并行入口。

本轮把原来的主链路：

- `OpenCodianView -> SessionTodoHostAdapter -> SessionTodoStateService / SessionTodoDockCoordinator / SessionTodoStatusRefreshService / SessionTodoRuntimeFacade`

收束为：

- `OpenCodianView -> SessionTodoHostAdapter -> SessionTodoCoordinator -> SessionTodoStateService / SessionTodoDockCoordinator`

同时把 `QuestionTodoBackgroundTaskRefreshHostAdapter`、`QuestionTodoBackgroundTaskActivationHostAdapter`、`QuestionTodoBackgroundTaskRuntimeServiceBundle`、`QuestionPostResolutionRuntimeHostAdapter`、background-task stream/live-signal host wiring 对 session todo 的依赖，也统一改成 coordinator port。这样 todo 初始同步、live update、streaming snapshot、stale suppression 与 dock render trigger 现在都经过同一个 session todo owner；`OpenCodianView` 不再直接装配或调用独立的 refresh/runtime facade。

本轮刻意**没有**触碰 `SessionTodoDock.ts` UI markup、question dock 交互行为、background-task notice pipeline、`ConversationViewStateService`、send pipeline、settings/core。

## 1. 本轮范围

- 新增 `src/features/chat/services/SessionTodoCoordinator.ts`
  - 并入 session todo/status 主动 refresh、request-id stale guard、stream/live update、streaming todo snapshot、tab reset，以及 dock attach/render/update/destroy 的统一入口
  - 内部继续复用 `SessionTodoStateService` 的状态机与 `SessionTodoDockCoordinator` 的 DOM/session 选择边界
- 更新 `src/features/chat/services/SessionTodoHostAdapter.ts`
  - 从返回四段 service bundle 改成只返回 `SessionTodoCoordinator`
- 更新 `src/features/chat/OpenCodianView.ts`
  - 改为只持有 `sessionTodoCoordinator`
  - `QuestionTodoBackgroundTaskRuntimeServiceBundleHost`、question post-resolution、background-task stream/live-signal、tab activation、message finalization 与 foreground-busy 判定都改为走 coordinator API
- 更新 P2 相关 host adapter / bundle
  - `src/features/chat/services/QuestionTodoBackgroundTaskRefreshHostAdapter.ts`
  - `src/features/chat/services/QuestionTodoBackgroundTaskActivationHostAdapter.ts`
  - `src/features/chat/services/QuestionTodoBackgroundTaskRuntimeServiceBundle.ts`
  - 这些模块现在共享单一 `getSessionTodoCoordinator()`，不再分别暴露 state/status-refresh/dock 三条 session todo seam
- 删除 obsolete session todo seam
  - `src/features/chat/services/SessionTodoRuntimeFacade.ts`
  - `src/features/chat/services/SessionTodoStatusRefreshService.ts`
- Tests
  - 新增 `tests/unit/features/chat/SessionTodoCoordinator.test.ts`
  - 更新 session todo host / runtime-bundle / activation-refresh / hydration focused coverage
  - 删除旧 facade / refresh service focused tests
- Docs
  - 新增 `docs/modules/features/chat/services/SessionTodoCoordinator.md`
  - 更新直接相关 session todo / question-todo / background-task / view docs
  - 删除 obsolete module docs：`SessionTodoRuntimeFacade.md`、`SessionTodoStatusRefreshService.md`
- Roadmap
  - 将 `R3` 标记为 `[DONE]`
  - 将 `R4 - Background task notice pipeline` 提升为新的 `[NEXT]`

## 2. 变更文件

- Code
  - `src/features/chat/OpenCodianView.ts`
  - `src/features/chat/services/SessionTodoCoordinator.ts`
  - `src/features/chat/services/SessionTodoHostAdapter.ts`
  - `src/features/chat/services/BackgroundTaskLiveSignalCoordinator.ts`
  - `src/features/chat/services/QuestionTodoBackgroundTaskRefreshHostAdapter.ts`
  - `src/features/chat/services/QuestionTodoBackgroundTaskActivationHostAdapter.ts`
  - `src/features/chat/services/QuestionTodoBackgroundTaskRuntimeServiceBundle.ts`
  - 删除：`src/features/chat/services/SessionTodoRuntimeFacade.ts`
  - 删除：`src/features/chat/services/SessionTodoStatusRefreshService.ts`
- Tests
  - `tests/unit/features/chat/SessionTodoCoordinator.test.ts`
  - `tests/unit/features/chat/SessionTodoHostAdapter.test.ts`
  - `tests/unit/features/chat/QuestionTodoBackgroundTaskActivationHostAdapter.test.ts`
  - `tests/unit/features/chat/QuestionTodoBackgroundTaskRefreshHostAdapter.test.ts`
  - `tests/unit/features/chat/QuestionTodoBackgroundTaskRuntimeServiceBundle.test.ts`
  - `tests/unit/features/chat/QuestionTodoBackgroundTaskRuntimeViewHosts.test.ts`
  - `tests/unit/features/chat/backgroundTaskHydrationState.test.ts`
  - 删除：`tests/unit/features/chat/SessionTodoRuntimeFacade.test.ts`
  - 删除：`tests/unit/features/chat/SessionTodoStatusRefreshService.test.ts`
- Docs
  - `docs/modules/features/chat/OpenCodianView.md`
  - `docs/modules/features/chat/runtime/BackgroundTaskStreamTriggerCoordinator.md`
  - `docs/modules/features/chat/runtime/TabConversationStateBridge.md`
  - `docs/modules/features/chat/services/QuestionPostResolutionRuntimeFacade.md`
  - `docs/modules/features/chat/services/QuestionPostResolutionRuntimeHostAdapter.md`
  - `docs/modules/features/chat/services/QuestionRuntimeHostAdapter.md`
  - `docs/modules/features/chat/services/QuestionTodoActivationRefreshBridge.md`
  - `docs/modules/features/chat/services/QuestionTodoBackgroundTaskActivationHostAdapter.md`
  - `docs/modules/features/chat/services/QuestionTodoBackgroundTaskRefreshHostAdapter.md`
  - `docs/modules/features/chat/services/QuestionTodoBackgroundTaskRuntimeServiceBundle.md`
  - `docs/modules/features/chat/services/QuestionTodoStatusRefreshCoordinator.md`
  - `docs/modules/features/chat/services/SessionTodoCoordinator.md`
  - `docs/modules/features/chat/services/SessionTodoDockCoordinator.md`
  - `docs/modules/features/chat/services/SessionTodoHostAdapter.md`
  - `docs/modules/features/chat/services/SessionTodoStateService.md`
  - 删除：`docs/modules/features/chat/services/SessionTodoRuntimeFacade.md`
  - 删除：`docs/modules/features/chat/services/SessionTodoStatusRefreshService.md`
- Status
  - `docs/status/maintainability-round-roadmap.md`
  - `docs/status/maintainability-phase-318.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- tests/unit/features/chat/SessionTodoCoordinator.test.ts tests/unit/features/chat/SessionTodoHostAdapter.test.ts tests/unit/features/chat/QuestionTodoBackgroundTaskRefreshHostAdapter.test.ts tests/unit/features/chat/QuestionTodoBackgroundTaskRuntimeViewHosts.test.ts tests/unit/features/chat/QuestionTodoBackgroundTaskRuntimeServiceBundle.test.ts tests/unit/features/chat/QuestionTodoBackgroundTaskActivationHostAdapter.test.ts tests/unit/features/chat/BackgroundTaskLiveSignalCoordinator.test.ts tests/unit/features/chat/backgroundTaskHydrationState.test.ts`
- `npm test`
- `npm run build`

本轮 build 生成的 `BUILD_ID`：

- `autopilot-maintainability.202604131836`

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且用户未显式要求部署，因此按规则在成功 build 后停止于构建验证。

## 5. 下一步建议

下一轮应按 roadmap 推进新的 `[NEXT]` 项：`R4 - Background task notice pipeline`。建议从 `collectBackgroundTaskSegments`、completion notice queue/flush、fingerprint runtime，以及 `PersistentAssistantNoticeService` / `BackgroundTaskNoticeStateService` / `BackgroundTaskCompletionNoticeService` 的现有 ownership 入口开始，把 notice queue 细节从 `OpenCodianView` 继续收束到单一厚 owner。

一句话总结第三百一十八阶段本轮：

> 第三百一十八阶段把 session todo 的 refresh/status/runtime 四段 seam 收束成 `SessionTodoCoordinator`，让 `OpenCodianView` 与相邻 P2 host adapter 只再依赖一个 session todo owner，并保持 todo stale suppression 与 dock 行为不变。
