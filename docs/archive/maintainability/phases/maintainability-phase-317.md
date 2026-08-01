# 可维护性改进：第三百一十七阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-316.md`
> **推进的 master-plan lane**: P2 `question / todo / background task`
> **完成的 roadmap queue item**: `R2 - Question dock 生命周期协调`

本轮严格执行 roadmap 的第一个 `[NEXT]` 项：`R2 - Question dock 生命周期协调`。切口只围绕 question dock lifecycle：pending requests、waiters、draft answers、active group/index、pending refresh hydration、active/background writeback，以及 submit/reject 后的 resolved-state / follow-up。目标是让 question dock 的主要 runtime map 读写不再散落在一串薄 facade 里，而是回到一个较厚的 lifecycle owner。

本轮把原来的主链路：

- `QuestionRuntimeHostAdapter -> QuestionDockCoordinator -> QuestionDockQueueRuntimeFacade / QuestionDockRefreshFacade / QuestionDockWritebackFacade / QuestionResolutionApplyFacade / QuestionResolutionWritebackFacade -> runtime/writeback/follow-up`

收束为：

- `QuestionRuntimeHostAdapter -> QuestionDockCoordinator -> QuestionResolutionExecutionFacade / QuestionResolutionCoordinator / QuestionPostResolutionRuntimeFacade`

这样 `QuestionDockCoordinator` 现在直接拥有 request hydration、queue waiter、draft/active selection map 初始化与清理、resolved-id suppression、active/background dock writeback，以及 dock/inline 共用的 `applyResolutionAction()` 后处理入口。

本轮刻意**没有**触碰 `QuestionDock.ts` UI markup、`OpenCodeService.replyToQuestion/rejectQuestion` API、stream routing、settings/core、todo dock 或 background-task notice 逻辑。

## 1. 本轮范围

- `src/features/chat/services/QuestionDockCoordinator.ts`
  - 并入 pending refresh、waiter queue、runtime map pruning、attention/render writeback、resolved-state writeback 与 post-resolution follow-up orchestration
  - 新增共享 `applyResolutionAction()`，供 dock submit/reject 与 inline fallback 共用
- `src/features/chat/services/QuestionResolutionFlowCoordinator.ts`
  - inline fallback 拿到 execution action 后改为回调 `QuestionDockCoordinator.applyResolutionAction()`
- `src/features/chat/services/QuestionRuntimeHostAdapter.ts`
  - 移除六个薄 facade 的装配层级，直接把较厚的 dock lifecycle host 注入 `QuestionDockCoordinator`
- 删除薄 facade / runtime seam：
  - `src/features/chat/services/QuestionDockQueueRuntimeFacade.ts`
  - `src/features/chat/services/QuestionDockRefreshFacade.ts`
  - `src/features/chat/services/QuestionDockWritebackFacade.ts`
  - `src/features/chat/services/QuestionPendingRefreshRuntimeFacade.ts`
  - `src/features/chat/services/QuestionResolutionApplyFacade.ts`
  - `src/features/chat/services/QuestionResolutionWritebackFacade.ts`
- Tests
  - 更新 `QuestionDockCoordinator`、`QuestionRuntimeHostAdapter`、`QuestionResolutionFlowCoordinator` focused coverage
  - 删除旧薄 facade 的单测，改由 coordinator 覆盖 hydration、writeback 与 shared apply flow
- Docs
  - 更新直接相关 `docs/modules/features/chat/services/**` 模块边界
  - 删除已并回 coordinator 的六个 obsolete module docs
- Roadmap
  - 将 `R2` 标记为 `[DONE]`
  - 将 `R3 - Session todo refresh/status 收束` 提升为新的 `[NEXT]`

## 2. 变更文件

- `src/features/chat/services/QuestionDockCoordinator.ts`
- `src/features/chat/services/QuestionResolutionFlowCoordinator.ts`
- `src/features/chat/services/QuestionRuntimeHostAdapter.ts`
- `src/features/chat/services/QuestionDockQueueRuntimeFacade.ts`
- `src/features/chat/services/QuestionDockRefreshFacade.ts`
- `src/features/chat/services/QuestionDockWritebackFacade.ts`
- `src/features/chat/services/QuestionPendingRefreshRuntimeFacade.ts`
- `src/features/chat/services/QuestionResolutionApplyFacade.ts`
- `src/features/chat/services/QuestionResolutionWritebackFacade.ts`
- `tests/unit/features/chat/QuestionDockCoordinator.test.ts`
- `tests/unit/features/chat/QuestionResolutionFlowCoordinator.test.ts`
- `tests/unit/features/chat/QuestionRuntimeHostAdapter.test.ts`
- `tests/unit/features/chat/QuestionDockQueueRuntimeFacade.test.ts`
- `tests/unit/features/chat/QuestionDockRefreshFacade.test.ts`
- `tests/unit/features/chat/QuestionDockWritebackFacade.test.ts`
- `tests/unit/features/chat/QuestionPendingRefreshRuntimeFacade.test.ts`
- `tests/unit/features/chat/QuestionResolutionApplyFacade.test.ts`
- `tests/unit/features/chat/QuestionResolutionWritebackFacade.test.ts`
- `docs/modules/features/chat/services/QuestionDockCoordinator.md`
- `docs/modules/features/chat/services/QuestionDockInteractionState.md`
- `docs/modules/features/chat/services/QuestionDockRenderStateFacade.md`
- `docs/modules/features/chat/services/QuestionDockResolutionActionFacade.md`
- `docs/modules/features/chat/services/QuestionInlineResolutionActionFacade.md`
- `docs/modules/features/chat/services/QuestionPostResolutionRuntimeFacade.md`
- `docs/modules/features/chat/services/QuestionResolutionExecutionFacade.md`
- `docs/modules/features/chat/services/QuestionResolutionFlowCoordinator.md`
- `docs/modules/features/chat/services/QuestionRuntimeHostAdapter.md`
- `docs/modules/features/chat/services/QuestionDockQueueRuntimeFacade.md`
- `docs/modules/features/chat/services/QuestionDockRefreshFacade.md`
- `docs/modules/features/chat/services/QuestionDockWritebackFacade.md`
- `docs/modules/features/chat/services/QuestionPendingRefreshRuntimeFacade.md`
- `docs/modules/features/chat/services/QuestionResolutionApplyFacade.md`
- `docs/modules/features/chat/services/QuestionResolutionWritebackFacade.md`
- `docs/status/maintainability-round-roadmap.md`
- `docs/status/maintainability-phase-317.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- tests/unit/features/chat/QuestionDockCoordinator.test.ts tests/unit/features/chat/QuestionRuntimeHostAdapter.test.ts tests/unit/features/chat/QuestionResolutionFlowCoordinator.test.ts tests/unit/features/chat/QuestionDockResolutionActionFacade.test.ts tests/unit/features/chat/QuestionDockRenderStateFacade.test.ts tests/unit/features/chat/QuestionDockInteractionState.test.ts tests/unit/features/chat/QuestionResolutionExecutionFacade.test.ts tests/unit/features/chat/QuestionPostResolutionRuntimeFacade.test.ts`
- `npm test`
- `npm run build`

本轮 build 生成的 `BUILD_ID`：

- `autopilot-maintainability.202604131811`

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且用户未显式要求部署，因此按规则在成功 build 后停止于构建验证。

## 5. 下一步建议

下一轮应按 roadmap 推进新的 `[NEXT]` 项：`R3 - Session todo refresh/status 收束`。建议从 `SessionTodoHostAdapter`、`SessionTodoRuntimeFacade`、`SessionTodoStatusRefreshService`、`SessionTodoStateService` 与 `OpenCodianView` 中 todo update/render trigger 的接线入口开始，把 todo 初始同步、live update 与 stale suppression 收束到统一 coordinator。

一句话总结第三百一十七阶段本轮：

> 第三百一十七阶段把 question dock lifecycle 的六个薄 facade 并回 `QuestionDockCoordinator`，让 request hydration、runtime map 维护与 dock/inline resolve 后处理统一由一个较厚 owner 承接，并保持 question card 行为不变。
