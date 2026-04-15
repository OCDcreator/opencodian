# 可维护性改进：第四百四十一阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-440.md`
> **推进的 master-plan lane**: Maintainability / question dock runtime
> **完成的 roadmap queue item**: `R106 - QuestionDockCoordinator pending-resolution residual seam`

本轮严格执行 roadmap 的首个 `[NEXT]` 项：`R106 - QuestionDockCoordinator pending-resolution residual seam`。范围限定在 `QuestionDockCoordinator` 的 pending-question runtime seam、直接相关单元测试与 maintainability 状态文档；没有提前进入 `R107` checkpoint，也没有扩散到 `OpenCodeService`、settings 或其他 batch 5 lane。

## 1. 本轮范围

- 收束 `QuestionDockCoordinator` 内 pending request enqueue / refresh / remove 的 shared commit/writeback 残余分支。
- 把 question resolution 成功后的 dock-specific pending cleanup follow-up 收回到 coordinator 自己的 resolution-apply 上下文，而不再在 action handler 内临时拼接 cleanup callback。
- 保留 pending dock visibility、resolution semantics、draft answer persistence、active-tab gating，以及 active/background attention/render 写回语义。
- 保持 owner 边界留在现有 `QuestionDockCoordinator` 内部，没有新增薄 helper / adapter / factory，也没有改动 `docs/modules/**`。

## 2. 本轮改动

- `src/features/chat/services/QuestionDockCoordinator.ts` 新增 `commitPendingQuestionRequests()`，让 refresh、enqueue 与 remove 共用同一条 pending-request lifecycle：集中处理 merged request apply、presentation-state prune、removed waiter cleanup 与 active/background writeback。
- `QuestionDockCoordinator` 新增 `createResolutionApplyFollowUp()`，把 `removePendingRequestId` 形式的 question-dock resolution cleanup 统一接入 `applyResolutionAction()`，减少 `handleQuestionDockAction()` 内联的 pending cleanup 分支。
- `tests/unit/features/chat/QuestionDockCoordinator.test.ts` 补充 background resolution cleanup 覆盖，并加强 active submit case 对 draft/group/index 清理与 attention writeback 的断言，确认 shared pending writeback path 在前后台 tab 都保持语义不变。

## 3. 验证

- `npm test -- QuestionDockCoordinator`
- `npm test`
- `BUILD_ID=autopilot-maintainability.$(date +%Y%m%d%H%M) npm run build`

验证结果：

- targeted `npm test -- QuestionDockCoordinator`：通过，`1` 个 suite / `6` 个 tests 全部通过，用时 `0.348 s`
- `npm test`：通过，`276 passed, 276 total` suites；`1154 passed, 1154 total` tests；用时 `2.799 s`
- `npm run build`：通过，`BUILD_ID` 为 `autopilot-maintainability.202604152336`

## 4. 部署

- 本轮修改位于 `src/features/chat/services/`、`tests/unit/features/chat/` 与 maintainability 状态文档，未命中仓库约定的 Test Vault 强制部署路径。
- 未执行 Test Vault 部署；最近一次已验证部署仍为 `R64` 的 `autopilot-maintainability.202604150602`。

## 5. 文件变更

- `src/features/chat/services/QuestionDockCoordinator.ts`
- `tests/unit/features/chat/QuestionDockCoordinator.test.ts`
- `docs/status/maintainability-master-plan.md`
- `docs/status/maintainability-round-roadmap.md`
- `docs/status/maintainability-lane-map.md`
- `docs/status/maintainability-phase-441.md`

## 6. 队列推进

- `docs/status/maintainability-round-roadmap.md` 已将 `R106` 标记为 `[DONE]`。
- 下一项 `R107 - Checkpoint after question/todo seams` 已提升为新的 `[NEXT]`。
- `docs/status/maintainability-master-plan.md` 与 `docs/status/maintainability-lane-map.md` 已同步刷新当前 `[NEXT]`、最近验证与 checkpoint 后的热点入口。

## 7. 下一步

- 下一推荐切片：`R107 - Checkpoint after question/todo seams`
- 从 `docs/status/maintainability-master-plan.md`、`docs/status/maintainability-round-roadmap.md` 与本轮 `phase-441` 总结入手，复盘 `R103-R106` 的 question / todo / background-task seam 收益，再决定回到 `OpenCodeService` residual 的具体入口。

一句话总结第四百四十一阶段本轮：

> 第四百四十一阶段完成 `R106`，把 question dock 的 pending request commit/writeback、resolution cleanup follow-up 与 active/background attention/render 写回收进同一条 runtime seam。
