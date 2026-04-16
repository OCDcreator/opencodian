# 可维护性改进：第四百三十九阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-438.md`
> **推进的 master-plan lane**: Maintainability / question todo runtime
> **完成的 roadmap queue item**: `R104 - QuestionTodo status/refresh runtime seam`

本轮严格执行 roadmap 的首个 `[NEXT]` 项：`R104 - QuestionTodo status/refresh runtime seam`。范围限定在 question/todo shared refresh seam、直接相关单元测试、直接相关模块文档与 maintainability 状态文档；没有提前进入 `R105` 的 stale-notice residual，也没有扩散到 `OpenCodeService`、settings 或其他 batch 4 lane。

## 1. 本轮范围

- 把 activation/open 侧的 supplemental status/question/todo refresh 回并到 `QuestionTodoStatusRefreshCoordinator`，让 activation 与 post-sync 共用同一个 refresh owner。
- 移除额外的 `QuestionTodoActivationRefreshBridge`，改由 `QuestionTodoActivationRefreshCoordinator`、background-task runtime service bundle 与相关 host adapter 直接复用共享的 status refresh seam。
- 保留 todo refresh trigger、activation timing、background-task notice / handoff 语义；只收缩 activation refresh 与 post-sync refresh 之间的 residual bridge。
- 同步更新直接相关测试、模块文档与 maintainability 状态文档，并把 roadmap 顺序推进到 `R105`。

## 2. 本轮改动

- `QuestionTodoStatusRefreshCoordinator` 新增 `refreshAfterActivation()`，统一持有 activation/open 与 post-sync 共用的 status/question/todo supplemental refresh。
- `QuestionTodoActivationRefreshCoordinator` 改为直接依赖共享 status refresh seam；dock render/writeback 顺序保持不变。
- `QuestionTodoBackgroundTaskRefreshHostAdapter` 与 `QuestionTodoBackgroundTaskRuntimeServiceBundle` 不再装配或传递独立 activation bridge，而是把同一份 `QuestionTodoStatusRefreshCoordinator` 直接交给 activation-side wiring 与 background handoff。
- 删除薄桥接文件 `src/features/chat/services/QuestionTodoActivationRefreshBridge.ts`，并把对应断言收口到 `QuestionTodoStatusRefreshCoordinator` 的测试与模块文档里。

## 3. 验证

- `npm test -- QuestionTodoStatusRefreshCoordinator QuestionTodoActivationRefreshCoordinator QuestionTodoBackgroundTaskActivationHostAdapter QuestionTodoBackgroundTaskRefreshHostAdapter QuestionTodoBackgroundTaskRuntimeServiceBundle`
- `npm test`
- `BUILD_ID=autopilot-maintainability.$(date +%Y%m%d%H%M) npm run build`

验证结果：

- targeted `npm test -- QuestionTodoStatusRefreshCoordinator QuestionTodoActivationRefreshCoordinator QuestionTodoBackgroundTaskActivationHostAdapter QuestionTodoBackgroundTaskRefreshHostAdapter QuestionTodoBackgroundTaskRuntimeServiceBundle`：通过，`5` 个 suites / `14` 个 tests 全部通过，用时 `0.812 s`
- `npm test`：通过，`276 passed, 276 total` suites；`1152 passed, 1152 total` tests；用时 `2.771 s`
- `npm run build`：通过，`BUILD_ID` 为 `autopilot-maintainability.202604152308`

## 4. 部署

- 本轮修改位于 `src/features/chat/services/`、`tests/unit/features/chat/`、`docs/modules/` 与 maintainability 状态文档，未命中仓库约定的 Test Vault 强制部署路径。
- 未执行 Test Vault 部署；最近一次已验证部署仍为 `R64` 的 `autopilot-maintainability.202604150602`。

## 5. 文件变更

- `src/features/chat/services/QuestionTodoStatusRefreshCoordinator.ts`
- `src/features/chat/services/QuestionTodoActivationRefreshCoordinator.ts`
- `src/features/chat/services/QuestionTodoBackgroundTaskRefreshHostAdapter.ts`
- `src/features/chat/services/QuestionTodoBackgroundTaskActivationHostAdapter.ts`
- `src/features/chat/services/QuestionTodoBackgroundTaskRuntimeServiceBundle.ts`
- `src/features/chat/services/QuestionTodoActivationRefreshBridge.ts`
- `tests/unit/features/chat/QuestionTodoStatusRefreshCoordinator.test.ts`
- `tests/unit/features/chat/QuestionTodoActivationRefreshCoordinator.test.ts`
- `tests/unit/features/chat/QuestionTodoBackgroundTaskActivationHostAdapter.test.ts`
- `tests/unit/features/chat/QuestionTodoBackgroundTaskRefreshHostAdapter.test.ts`
- `tests/unit/features/chat/QuestionTodoBackgroundTaskRuntimeServiceBundle.test.ts`
- `tests/unit/features/chat/QuestionTodoActivationRefreshBridge.test.ts`
- `docs/modules/features/chat/services/QuestionTodoStatusRefreshCoordinator.md`
- `docs/modules/features/chat/services/QuestionTodoActivationRefreshCoordinator.md`
- `docs/modules/features/chat/services/QuestionTodoBackgroundTaskRefreshHostAdapter.md`
- `docs/modules/features/chat/services/QuestionTodoBackgroundTaskActivationHostAdapter.md`
- `docs/modules/features/chat/services/QuestionTodoBackgroundTaskRuntimeServiceBundle.md`
- `docs/modules/features/chat/services/PostSyncQuestionTodoRefreshHostAdapter.md`
- `docs/modules/features/chat/services/VisibleConversationPostSyncStateHostAdapter.md`
- `docs/modules/features/chat/services/BackgroundConversationPostSyncHandoffHostAdapter.md`
- `docs/modules/features/chat/services/QuestionTodoActivationRefreshBridge.md`
- `docs/status/maintainability-master-plan.md`
- `docs/status/maintainability-round-roadmap.md`
- `docs/status/maintainability-lane-map.md`
- `docs/status/maintainability-phase-439.md`

## 6. 队列推进

- `docs/status/maintainability-round-roadmap.md` 已将 `R104` 标记为 `[DONE]`。
- 下一项 `R105 - SessionTodoStateService stale-notice residual seam` 已提升为新的 `[NEXT]`。
- `docs/status/maintainability-master-plan.md` 与 `docs/status/maintainability-lane-map.md` 已同步刷新当前 `[NEXT]`、最近验证与 batch 4 的剩余热点入口。

## 7. 下一步

- 下一推荐切片：`R105 - SessionTodoStateService stale-notice residual seam`
- 从 `src/features/chat/services/SessionTodoStateService.ts` 与 `tests/unit/features/chat/SessionTodoStateService.test.ts` 入手，继续收束 stale snapshot fingerprint、suppression visibility、persisted stale restore 与 append-target residual，同时保持 stale notice 显示时机与 append-dedupe 语义不变。

一句话总结第四百三十九阶段本轮：

> 第四百三十九阶段完成 `R104`，把 activation/open 与 post-sync 共用的 question/todo supplemental refresh 回并到 `QuestionTodoStatusRefreshCoordinator`，移除独立 activation bridge，并让 background-task runtime bundle 直接复用同一条 status/refresh seam。
