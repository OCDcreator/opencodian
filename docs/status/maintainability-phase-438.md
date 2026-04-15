# 可维护性改进：第四百三十八阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-437.md`
> **推进的 master-plan lane**: Maintainability / question runtime
> **完成的 roadmap queue item**: `R103 - QuestionResolutionFlowCoordinator post-resolution seam`

本轮严格执行 roadmap 的首个 `[NEXT]` 项：`R103 - QuestionResolutionFlowCoordinator post-resolution seam`。范围限定在 question resolution 的 shared execution/apply lifecycle、直接相关测试、直接相关模块文档与 maintainability 状态文档；没有提前进入 `R104` 的 todo refresh seam，也没有扩散到 `OpenCodeService`、settings 或其他 batch 4 lane。

## 1. 本轮范围

- 把 question resolution 的 execute、resolved-id 标记、resolved-card apply 与 post-resolution follow-up 从 `QuestionDockCoordinator` 的共享后处理骨架中继续收束到 `QuestionResolutionExecutionFacade`。
- 让 `QuestionResolutionFlowCoordinator` 在 inline fallback 下直接复用共享 execution/apply seam，不再为了 post-resolution lifecycle 回跳 dock owner。
- 保留 resolution action shape、resolved card renderer、background follow-up 与 answered-card 语义；`QuestionDockCoordinator` 只保留 pending dock cleanup 上下文与 queue/runtime 责任。
- 同步更新直接相关单元测试、模块文档与 maintainability 状态文档，并把 roadmap 顺序推进到 `R104`。

## 2. 本轮改动

- `QuestionResolutionExecutionFacade` 新增 `executeAndApply()` 与共享 lifecycle port，统一承接 reply/reject 执行成功后的 resolved-id 标记、`QuestionResolutionCoordinator` writeback，以及 `QuestionPostResolutionRuntimeFacade` follow-up。
- `QuestionResolutionFlowCoordinator` 现在只负责 dock-or-inline orchestration；当 dock 未接管时，它会直接把 inline action 交给共享 execution facade，而不是再依赖 `QuestionDockCoordinator` 持有 post-resolution 细节。
- `QuestionDockCoordinator` 退回 question dock queue/runtime owner：resolved-id 标记、resolved-card apply 与 status/sync follow-up 已下沉到 execution facade，它只补充可选 pending-request cleanup 回调。
- `QuestionRuntimeHostAdapter` 现在显式组装这条 shared execution/apply seam，把 resolved-id 标记、`QuestionResolutionCoordinator` 与 `QuestionPostResolutionRuntimeFacade` 一起注入 `QuestionResolutionExecutionFacade`。
- 直接相关测试与模块文档同步刷新，覆盖新的 shared execution lifecycle 与 flow/dock wiring。

## 3. 验证

- `npm test -- QuestionResolutionExecutionFacade QuestionDockCoordinator QuestionRuntimeHostAdapter QuestionResolutionFlowCoordinator`
- `npm test`
- `BUILD_ID=autopilot-maintainability.$(date +%Y%m%d%H%M) npm run build`

验证结果：

- targeted `npm test -- QuestionResolutionExecutionFacade QuestionDockCoordinator QuestionRuntimeHostAdapter QuestionResolutionFlowCoordinator`：通过，`4` 个 suites / `18` 个 tests 全部通过，用时 `0.575 s`
- `npm test`：通过，`277 passed, 277 total` suites；`1153 passed, 1153 total` tests；用时 `5.303 s`
- `npm run build`：通过，`BUILD_ID` 为 `autopilot-maintainability.202604152236`

## 4. 部署

- 本轮修改位于 `src/features/chat/services/`、`tests/unit/features/chat/`、`docs/modules/` 与 maintainability 状态文档，未命中仓库约定的 Test Vault 强制部署路径。
- 未执行 Test Vault 部署；最近一次已验证部署仍为 `R64` 的 `autopilot-maintainability.202604150602`。

## 5. 文件变更

- `src/features/chat/services/QuestionResolutionExecutionFacade.ts`
- `src/features/chat/services/QuestionResolutionFlowCoordinator.ts`
- `src/features/chat/services/QuestionDockCoordinator.ts`
- `src/features/chat/services/QuestionRuntimeHostAdapter.ts`
- `tests/unit/features/chat/QuestionResolutionExecutionFacade.test.ts`
- `tests/unit/features/chat/QuestionResolutionFlowCoordinator.test.ts`
- `tests/unit/features/chat/QuestionDockCoordinator.test.ts`
- `docs/modules/features/chat/services/QuestionResolutionExecutionFacade.md`
- `docs/modules/features/chat/services/QuestionResolutionFlowCoordinator.md`
- `docs/modules/features/chat/services/QuestionDockCoordinator.md`
- `docs/modules/features/chat/services/QuestionRuntimeHostAdapter.md`
- `docs/status/maintainability-master-plan.md`
- `docs/status/maintainability-round-roadmap.md`
- `docs/status/maintainability-lane-map.md`
- `docs/status/maintainability-phase-438.md`

## 6. 队列推进

- `docs/status/maintainability-round-roadmap.md` 已将 `R103` 标记为 `[DONE]`。
- 下一项 `R104 - QuestionTodo status/refresh runtime seam` 已提升为新的 `[NEXT]`。
- `docs/status/maintainability-master-plan.md` 与 `docs/status/maintainability-lane-map.md` 已同步刷新当前 `[NEXT]`、最近验证与 batch 4 的剩余热点入口。

## 7. 下一步

- 下一推荐切片：`R104 - QuestionTodo status/refresh runtime seam`
- 从 `src/features/chat/services/QuestionTodoStatusRefreshCoordinator.ts` 与 `src/features/chat/services/QuestionTodoActivationRefreshCoordinator.ts` 入手，继续收束 todo refresh、activation refresh、post-sync refresh plan 与 background-task runtime 的残余桥接，同时保持 refresh trigger、activation timing 与 notice 语义不变。

一句话总结第四百三十八阶段本轮：

> 第四百三十八阶段完成 `R103`，把 question resolution 的 shared execute/apply/follow-up skeleton 收束到 `QuestionResolutionExecutionFacade`，让 flow 与 dock 复用同一条 post-resolution lifecycle seam。
