# 可维护性改进：第四百三十六阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-435.md`
> **推进的 master-plan lane**: Maintainability / chat background runtime
> **完成的 roadmap queue item**: `R101 - BackgroundTaskStreamTriggerCoordinator runtime seam`

本轮严格执行 roadmap 的首个 `[NEXT]` 项：`R101 - BackgroundTaskStreamTriggerCoordinator runtime seam`。范围限定在 background task stream trigger host assembly、直接相关测试与状态文档；没有进入 `R102` 的 checkpoint 复盘，也没有扩散到 `OpenCodeService`、settings 或其他 question/todo lane。

## 1. 本轮范围

- 把 `BackgroundTaskStreamTriggerCoordinator` 所需的 active-tab / session lookup、todo snapshot/refresh 与 reset-indicator host assembly 从 `OpenCodianView` 继续下沉到 `QuestionTodoBackgroundTaskRuntimeServiceBundle`。
- 保留 `BackgroundTaskStreamTriggerCoordinator` 既有的 trigger start/end、todo refresh、waiting-for-follow-up 与 indicator reset 语义，不改变 foreground runner 或 completion notice 行为。
- 更新 service-bundle / runtime-view-host focused 单元测试，覆盖新的 stream-trigger host 回传与 late-bound session todo bridge。
- 同步更新直接相关 module docs 与 maintainability 状态文档，记录新的 stream-trigger host seam，并把 roadmap 推进到 `R102`。

## 2. 本轮改动

- `QuestionTodoBackgroundTaskRuntimeServiceBundle` 现在除了 shared question/todo/background-task view hosts 外，还会组装并回传 `backgroundTaskStreamTriggerViewHost`，把 active tab、session lookup 与 session todo bridge 一起收束到 bundle 内。
- `OpenCodianView` 不再维护专用的 `createBackgroundTaskStreamTriggerCoordinatorHost()`；conversation runtime 直接复用 service bundle 回传的 stream-trigger host 来构造 `BackgroundTaskStreamTriggerCoordinator`。
- `QuestionTodoBackgroundTaskRuntimeViewHosts.test.ts` 新增 stream-trigger host 断言，覆盖 session todo snapshot、todo refresh、active-tab/session lookup 与 reset indicator 的 late-bound wiring。
- 直接相关模块文档同步说明：stream-trigger host assembly 现在属于 `QuestionTodoBackgroundTaskRuntimeServiceBundle`，`BackgroundTaskStreamTriggerCoordinator` 只消费该 host，不再依赖 view 本地桥接。

## 3. 验证

- `npm test -- --runTestsByPath tests/unit/features/chat/BackgroundTaskStreamTriggerCoordinator.test.ts tests/unit/features/chat/QuestionTodoBackgroundTaskRuntimeServiceBundle.test.ts tests/unit/features/chat/QuestionTodoBackgroundTaskRuntimeViewHosts.test.ts`
- `npm test`
- `BUILD_ID=autopilot-maintainability.$(date +%Y%m%d%H%M) npm run build`

验证结果：

- targeted `npm test -- --runTestsByPath tests/unit/features/chat/BackgroundTaskStreamTriggerCoordinator.test.ts tests/unit/features/chat/QuestionTodoBackgroundTaskRuntimeServiceBundle.test.ts tests/unit/features/chat/QuestionTodoBackgroundTaskRuntimeViewHosts.test.ts`：通过，`3` 个 suites / `8` 个 tests 全部通过，用时 `0.709 s`
- `npm test`：通过，`277 passed, 277 total` suites；`1151 passed, 1151 total` tests；用时 `4.92 s`
- `npm run build`：通过，`BUILD_ID` 为 `autopilot-maintainability.202604152206`

## 4. 部署

- 本轮修改位于 `src/features/chat/`、`tests/unit/features/chat/`、`docs/modules/` 与 maintainability 状态文档，未命中仓库约定的 Test Vault 强制部署路径。
- 未执行 Test Vault 部署；最近一次已验证部署仍为 `R64` 的 `autopilot-maintainability.202604150602`。

## 5. 文件变更

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/services/QuestionTodoBackgroundTaskRuntimeServiceBundle.ts`
- `tests/unit/features/chat/QuestionTodoBackgroundTaskRuntimeServiceBundle.test.ts`
- `tests/unit/features/chat/QuestionTodoBackgroundTaskRuntimeViewHosts.test.ts`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/features/chat/runtime/BackgroundTaskStreamTriggerCoordinator.md`
- `docs/modules/features/chat/services/QuestionTodoBackgroundTaskRuntimeServiceBundle.md`
- `docs/status/maintainability-master-plan.md`
- `docs/status/maintainability-round-roadmap.md`
- `docs/status/maintainability-lane-map.md`
- `docs/status/maintainability-phase-436.md`

## 6. 队列推进

- `docs/status/maintainability-round-roadmap.md` 已将 `R101` 标记为 `[DONE]`。
- 下一项 `R102 - Checkpoint after chat services seams` 已提升为新的 `[NEXT]`。
- `docs/status/maintainability-master-plan.md` 与 `docs/status/maintainability-lane-map.md` 已同步刷新当前 `[NEXT]`、最近验证与 checkpoint 前的热点入口。

## 7. 下一步

- 下一推荐切片：`R102 - Checkpoint after chat services seams`
- 先复盘 `R98-R101` 对 chat services residual 的收束收益与 remaining hotspots，再按 roadmap 顺序进入 `R103 - QuestionResolutionFlowCoordinator post-resolution seam`。

一句话总结第四百三十六阶段本轮：

> 第四百三十六阶段完成 `R101`，把 background-task stream trigger 所需的 active-tab/session todo host assembly 并回 `QuestionTodoBackgroundTaskRuntimeServiceBundle`，让 `OpenCodianView` 只消费 bundle 回传的 stream-trigger runtime seam。
