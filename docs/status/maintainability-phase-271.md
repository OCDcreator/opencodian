# 可维护性改进：第二百七十一阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-270.md`
> **推进的 master-plan lane**: P2 `question / todo / background task` wiring 与 post-sync/activation 协调（question dock queue attention/render writeback facade）

本轮继续遵循 master plan 与 lane map 的 P2 首查入口，选择一个高价值且低风险的单一职责切片：**把 `QuestionDockCoordinator` 中 queue enqueue/remove 后残留的 attention/render writeback，与上一轮的 pending-refresh writeback 合并成统一的 `QuestionDockWritebackFacade` seam。**

这样 dock queue 的 active/background UI 写回不再继续散落在 coordinator 的 enqueue/remove 分支里；`QuestionDockCoordinator` 进一步收窄到 fetch / session filter / dock callbacks / resolution orchestration，而 `QuestionRuntimeHostAdapter` 则统一装配 queue + refresh 共用的 dock writeback facade。

## 1. 本轮范围

- `src/features/chat/services/QuestionDockWritebackFacade.ts`
  - 由上一轮的 pending-refresh writeback seam 演进为统一的 dock writeback facade
  - 新增 queue enqueue/remove 的 active/background attention 与 dock render 写回
- `src/features/chat/services/QuestionDockCoordinator.ts`
  - 把 queue enqueue/remove 后的 attention/render 决策委托给 `QuestionDockWritebackFacade`
  - resolution flow 的 pending-request removal 也复用同一条 writeback seam
- `src/features/chat/services/QuestionRuntimeHostAdapter.ts`
  - 改为装配 `QuestionDockWritebackFacade`
  - 保持 late-bound `renderQuestionDock()` 回连 `QuestionDockCoordinator.render()`
- 测试
  - 新增并更新 `tests/unit/features/chat/QuestionDockWritebackFacade.test.ts`
  - 更新 `tests/unit/features/chat/QuestionDockCoordinator.test.ts`
- 直接相关文档
  - 新增 `docs/modules/features/chat/services/QuestionDockWritebackFacade.md`
  - 更新 `docs/modules/features/chat/services/QuestionDockCoordinator.md`
  - 更新 `docs/modules/features/chat/services/QuestionRuntimeHostAdapter.md`
  - 更新 `docs/modules/features/chat/services/QuestionPendingRefreshRuntimeFacade.md`
  - 更新 `docs/modules/features/chat/services/QuestionDockQueueRuntimeFacade.md`

## 2. 变更文件

- `src/features/chat/services/QuestionDockWritebackFacade.ts`
- `src/features/chat/services/QuestionDockCoordinator.ts`
- `src/features/chat/services/QuestionRuntimeHostAdapter.ts`
- `tests/unit/features/chat/QuestionDockWritebackFacade.test.ts`
- `tests/unit/features/chat/QuestionDockCoordinator.test.ts`
- `docs/modules/features/chat/services/QuestionDockWritebackFacade.md`
- `docs/modules/features/chat/services/QuestionDockCoordinator.md`
- `docs/modules/features/chat/services/QuestionRuntimeHostAdapter.md`
- `docs/modules/features/chat/services/QuestionPendingRefreshRuntimeFacade.md`
- `docs/modules/features/chat/services/QuestionDockQueueRuntimeFacade.md`
- `docs/status/maintainability-phase-271.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- QuestionDockWritebackFacade QuestionDockCoordinator QuestionRuntimeHostAdapter`
- `npm run build`

本轮未执行 `npm test` 全量套件。

原因：

- attempt `266` 不能被 `5` 整除
- 改动未命中仓库约定的 full-test 高风险路径（`src/main.ts`、`src/core/`、`automation/`、`package.json`、`package-lock.json`、`manifest.json`、`styles.css`、`esbuild.config.mjs`）

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且用户未显式要求部署，因此按仓库规则在成功 build 后停止于构建验证。

## 5. 下一步建议

下一轮可继续留在高优先级 P2，优先考虑把 `QuestionDockCoordinator` 中剩余的 pending-question fetch / session-filter refresh orchestration 再下沉到 dedicated refresh facade，让 dock coordinator 更接近纯 callbacks + resolution assembly。

一句话总结第二百七十一阶段本轮：

> 第二百七十一阶段把 question dock queue enqueue/remove 的 active/background attention 与 dock render 写回，和既有 pending-refresh writeback 收束到统一的 `QuestionDockWritebackFacade` seam。
