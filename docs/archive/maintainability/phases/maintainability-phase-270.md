# 可维护性改进：第二百七十阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-269.md`
> **推进的 master-plan lane**: P2 `question / todo / background task` wiring 与 post-sync/activation 协调（pending-question refresh attention/render writeback facade）

本轮继续遵循 master plan 与 lane map 的 P2 首查入口，选择一个高价值且低风险的单一职责切片：**把 pending-question refresh 完成后的 attention/render writeback，从 `QuestionDockCoordinator` 中下沉到独立的 `QuestionPendingRefreshWritebackFacade`。**

这样 active/background tab 在 pending-question clear/refresh 之后的 `needsAttention` 写回、active dock 重绘时机，不再继续散落在 `QuestionDockCoordinator` 的 refresh/clear 分支里；`QuestionPendingRefreshRuntimeFacade` 只保留 runtime merge/prune，`QuestionDockCoordinator` 则进一步缩窄到 fetch / session filter / dock callbacks / resolution orchestration。

## 1. 本轮范围

- `src/features/chat/services/QuestionPendingRefreshWritebackFacade.ts`
  - 新增专用 writeback facade，统一处理 pending-question clear/refresh 完成后的 active/background tab attention 与 dock render 写回
- `src/features/chat/services/QuestionDockCoordinator.ts`
  - 改为把 refresh/clear 之后的 attention/render 决策委托给 `QuestionPendingRefreshWritebackFacade`
  - 保留 fetch、session filter、dock callback 与 resolution flow
- `src/features/chat/services/QuestionRuntimeHostAdapter.ts`
  - 在 question runtime bundle 中新增 `QuestionPendingRefreshWritebackFacade` 装配
  - 让 facade 的 `renderQuestionDock()` 回连 `QuestionDockCoordinator.render()`
- 测试
  - 新增 `tests/unit/features/chat/QuestionPendingRefreshWritebackFacade.test.ts`
  - 更新 `tests/unit/features/chat/QuestionDockCoordinator.test.ts`
  - 修复邻接的 `tests/unit/features/chat/QuestionResolutionFlowCoordinator.test.ts`，使其匹配现有共享 `QuestionResolutionWritebackFacade` 端口，恢复 full-suite 通过
- 直接相关文档
  - 新增 `docs/modules/features/chat/services/QuestionPendingRefreshWritebackFacade.md`
  - 更新 `docs/modules/features/chat/services/QuestionDockCoordinator.md`
  - 更新 `docs/modules/features/chat/services/QuestionRuntimeHostAdapter.md`
  - 更新 `docs/modules/features/chat/services/QuestionPendingRefreshRuntimeFacade.md`
  - 更新 `docs/modules/features/chat/services/QuestionDockQueueRuntimeFacade.md`

## 2. 变更文件

- `src/features/chat/services/QuestionPendingRefreshWritebackFacade.ts`
- `src/features/chat/services/QuestionDockCoordinator.ts`
- `src/features/chat/services/QuestionRuntimeHostAdapter.ts`
- `tests/unit/features/chat/QuestionPendingRefreshWritebackFacade.test.ts`
- `tests/unit/features/chat/QuestionDockCoordinator.test.ts`
- `tests/unit/features/chat/QuestionResolutionFlowCoordinator.test.ts`
- `docs/modules/features/chat/services/QuestionPendingRefreshWritebackFacade.md`
- `docs/modules/features/chat/services/QuestionDockCoordinator.md`
- `docs/modules/features/chat/services/QuestionRuntimeHostAdapter.md`
- `docs/modules/features/chat/services/QuestionPendingRefreshRuntimeFacade.md`
- `docs/modules/features/chat/services/QuestionDockQueueRuntimeFacade.md`
- `docs/status/maintainability-phase-270.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- QuestionPendingRefreshWritebackFacade QuestionDockCoordinator QuestionRuntimeHostAdapter`
- `npm test -- QuestionPendingRefreshWritebackFacade QuestionDockCoordinator QuestionRuntimeHostAdapter QuestionResolutionFlowCoordinator`
- `npm test`
- `npm run build`

本轮额外执行过一次失败的 `npm test`，随后做了一次聚焦修复：

- 失败原因：`tests/unit/features/chat/QuestionResolutionFlowCoordinator.test.ts` 仍断言旧的 resolution ports，未跟上既有的 `QuestionResolutionWritebackFacade` 接口
- 处理方式：仅更新该 suite 的 mocked ports 与断言，不改动产品代码行为

执行完整 `npm test` 的原因：

- attempt `265` 可被 `5` 整除，因此按仓库规则必须执行 full test

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且用户未显式要求部署，因此按仓库规则在成功 build 后停止于构建验证。

## 5. 下一步建议

下一轮可继续留在高优先级 P2，优先考虑把 `QuestionDockCoordinator` 中 queue enqueue/remove 之后仍残留的轻量 attention/render writeback，也进一步收束到 dedicated facade / adapter，让 dock UI writeback seam 与 refresh writeback seam 保持一致。

一句话总结第二百七十阶段本轮：

> 第二百七十阶段新增 `QuestionPendingRefreshWritebackFacade`，把 pending-question refresh 完成后的 active/background attention 与 dock render 写回，从 `QuestionDockCoordinator` 中拆到共享的独立 writeback seam。
