# 可维护性改进：第三百二十阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-319.md`
> **推进的 master-plan lane**: P2 `question / todo / background task`
> **完成的 roadmap queue item**: `R5 - P2 event orchestrator`

本轮严格执行 roadmap 的第一个 `[NEXT]` 项：`R5 - P2 event orchestrator`。本轮没有再给 session signal 补新的 provider / factory / adapter，而是按 roadmap 允许边界把 `subscribeToSessionTodoUpdates`、`subscribeToSessionStatusUpdates`、`subscribeToSessionSyncEvents` 以及对应的 session→tab 路由、todo/status writeback、background-task reconcile、signal sync 调度全部并回 `ConversationSessionSignalRuntime`。这样 `OpenCodianView` 的 session-signal 入口只剩一份 host assembly；原先那条 `OpenCodianView -> ConversationSessionSignalRuntimeHostProvider -> ConversationSessionSignalRuntimeViewHostFactory -> ConversationSyncEventLiveSignalHostAdapter -> ConversationSyncEventAdapter / ConversationSessionLiveSignalAdapter` 的调用链，本轮收束为 `OpenCodianView -> ConversationSessionSignalRuntime -> ConversationSessionTabResolver + SessionTodoCoordinator / ConversationSyncOrchestrationService / BackgroundTaskLiveSignalCoordinator`。

这次切口直接减少了 5 个中间转发 seam：`ConversationSessionSignalRuntimeHostProvider.ts`、`ConversationSessionSignalRuntimeViewHostFactory.ts`、`ConversationSyncEventLiveSignalHostAdapter.ts`、`ConversationSyncEventAdapter.ts`、`ConversationSessionLiveSignalAdapter.ts`。`OpenCodianView` 现在不再为 session signal 维护多段 host regrouping，也不再绕经多层 adapter 才能把 signal 落到 todo/status/sync 调度；reconcile/schedule 逻辑继续留在 runtime/service owner 内，view 只负责装配 host 和持有 lifecycle。

本轮刻意**没有**触碰 question dock UI、session todo 主动刷新语义、background-task inline/completion notice 渲染、conversation sync bridge/orchestration 的 debounce 规则，也没有改动 settings/core 路径。

## 1. 本轮范围

- 更新 `src/features/chat/services/ConversationSessionSignalRuntime.ts`
  - 直接持有 sync/todo/status 三条 listener 生命周期
  - 直接复用 `ConversationSessionTabResolver` 做 session→tab 匹配与 active-tab fallback
  - 直接路由 sync signal 到 `scheduleConversationSyncFromSignal`
  - 直接路由 todo/status live signal 到 `SessionTodoCoordinator`，并在每次 live update 后触发 `BackgroundTaskLiveSignalCoordinator`
- 更新 `src/features/chat/OpenCodianView.ts`
  - 删除 session-signal provider/factory host 组装链
  - 只保留 `ConversationSessionSignalRuntimeHost` 装配入口
- 更新 focused tests
  - `tests/unit/features/chat/ConversationSessionSignalRuntime.test.ts`
  - 删除已并回 runtime 的薄 seam tests
- 更新直接相关 docs/modules
  - `docs/modules/features/chat/services/ConversationSessionSignalRuntime.md`
  - `docs/modules/features/chat/services/ConversationSessionTabResolver.md`
  - `docs/modules/features/chat/services/BackgroundTaskLiveSignalCoordinator.md`
  - `docs/modules/features/chat/services/ConversationSyncBridgePortProvider.md`
  - `docs/modules/features/chat/services/ConversationSyncOrchestrationService.md`
  - `docs/modules/features/chat/services/SessionTodoStateService.md`
  - `docs/modules/features/chat/OpenCodianView.md`
  - 删除已移除模块对应文档
- 更新状态文档
  - `docs/status/maintainability-round-roadmap.md`
  - `docs/status/maintainability-phase-320.md`

## 2. 变更文件

- Code
  - `src/features/chat/OpenCodianView.ts`
  - `src/features/chat/services/ConversationSessionSignalRuntime.ts`
  - 删除：
    - `src/features/chat/services/ConversationSessionLiveSignalAdapter.ts`
    - `src/features/chat/services/ConversationSyncEventAdapter.ts`
    - `src/features/chat/services/ConversationSyncEventLiveSignalHostAdapter.ts`
    - `src/features/chat/services/ConversationSessionSignalRuntimeHostProvider.ts`
    - `src/features/chat/services/ConversationSessionSignalRuntimeViewHostFactory.ts`
- Tests
  - `tests/unit/features/chat/ConversationSessionSignalRuntime.test.ts`
  - 删除：
    - `tests/unit/features/chat/ConversationSessionLiveSignalAdapter.test.ts`
    - `tests/unit/features/chat/ConversationSyncEventAdapter.test.ts`
    - `tests/unit/features/chat/ConversationSyncEventLiveSignalHostAdapter.test.ts`
    - `tests/unit/features/chat/ConversationSessionSignalRuntimeHostProvider.test.ts`
    - `tests/unit/features/chat/ConversationSessionSignalRuntimeViewHostFactory.test.ts`
- Docs
  - `docs/modules/features/chat/OpenCodianView.md`
  - `docs/modules/features/chat/services/BackgroundTaskLiveSignalCoordinator.md`
  - `docs/modules/features/chat/services/ConversationSessionSignalRuntime.md`
  - `docs/modules/features/chat/services/ConversationSessionTabResolver.md`
  - `docs/modules/features/chat/services/ConversationSyncBridgePortProvider.md`
  - `docs/modules/features/chat/services/ConversationSyncOrchestrationService.md`
  - `docs/modules/features/chat/services/SessionTodoStateService.md`
  - 删除：
    - `docs/modules/features/chat/services/ConversationSessionLiveSignalAdapter.md`
    - `docs/modules/features/chat/services/ConversationSyncEventAdapter.md`
    - `docs/modules/features/chat/services/ConversationSyncEventLiveSignalHostAdapter.md`
    - `docs/modules/features/chat/services/ConversationSessionSignalRuntimeHostProvider.md`
    - `docs/modules/features/chat/services/ConversationSessionSignalRuntimeViewHostFactory.md`
- Status
  - `docs/status/maintainability-round-roadmap.md`
  - `docs/status/maintainability-phase-320.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- tests/unit/features/chat/ConversationSessionSignalRuntime.test.ts tests/unit/features/chat/ConversationSessionTabResolver.test.ts tests/unit/features/chat/BackgroundTaskLiveSignalCoordinator.test.ts`
- `npm test`
- `npm run build`

本轮 build 生成的 `BUILD_ID`：

- `autopilot-maintainability.202604131858`

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且用户未显式要求部署，因此按规则在成功 build 后停止于构建验证。

## 5. 下一步建议

下一轮应按 roadmap 推进新的 `[NEXT]` 项：`R6 - P2 集成测试与文档回收`。建议围绕 question dock、todo refresh、background-task notice 这几条已经抽出的 owner，补齐 focused coverage 并确认 P2 文档只保留当前有效边界，不再遗留旧 seam 说明。

一句话总结第三百二十阶段本轮：

> 第三百二十阶段把 session sync/todo/status 的订阅、路由、writeback 与 background-task live reconcile 并回 `ConversationSessionSignalRuntime`，删掉 5 个薄 session-signal seam，完成了 roadmap 的 `R5 - P2 event orchestrator`。
