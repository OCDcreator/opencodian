# 可维护性改进：第二百六十九阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-268.md`
> **推进的 master-plan lane**: P2 `question / todo / background task` wiring 与 post-sync/activation 协调（question post-resolution writeback facade）

本轮继续遵循 master plan 与 lane map 的 P2 首查入口，选择一个高价值且低风险的单一职责切片：**把 question dock 与 inline fallback 共用的 post-resolution writeback 顺序，从分散在两个 coordinator 里的 resolved-state follow-up 收束到独立的 `QuestionResolutionWritebackFacade`。**

这样 resolved-request suppression、resolved card runtime 写回、dock 的 after-state writeback，以及后续的 status/sync follow-up 不再分别散落在 `QuestionDockCoordinator` 和 `QuestionResolutionFlowCoordinator` 中；`QuestionRuntimeHostAdapter` 现在只需要装配一条共享 writeback seam，两个 coordinator 各自只保留自己的交互编排职责。

## 1. 本轮范围

- `src/features/chat/services/QuestionResolutionWritebackFacade.ts`
  - 新增共享 writeback facade，统一 question 回答/拒绝后的 resolved-id suppression、resolved state bridge 与 post-resolution runtime follow-up
  - 提供可选 `afterStateApplied` 钩子，保留上方 dock 先移除 pending request 再做 follow-up 的既有顺序
- `src/features/chat/services/QuestionDockCoordinator.ts`
  - 改为经由 `QuestionResolutionWritebackFacade` 处理 dock submit/reject 后的 resolved-state 写回
  - 删除 coordinator 内联的 resolved-id 标记与独立 post-resolution follow-up 串接
- `src/features/chat/services/QuestionResolutionFlowCoordinator.ts`
  - 改为依赖单一的 `resolutionWriteback` port
  - 删除 inline fallback 分支里分散的 suppression / resolved-state / follow-up 三口组合
- `src/features/chat/services/QuestionRuntimeHostAdapter.ts`
  - 在 question runtime bundle 内新增 `QuestionResolutionWritebackFacade` 装配
  - 缩窄 `QuestionDockCoordinatorHost` 与 `createQuestionRuntimeHosts()`，不再为 dock host 暴露多余的 resolved-state callback
- 测试
  - 新增 `tests/unit/features/chat/QuestionResolutionWritebackFacade.test.ts`
  - 更新 `tests/unit/features/chat/QuestionDockCoordinator.test.ts`
  - 更新 `tests/unit/features/chat/QuestionRuntimeHostAdapter.test.ts`
- 直接相关文档
  - 新增 `docs/modules/features/chat/services/QuestionResolutionWritebackFacade.md`
  - 更新 `docs/modules/features/chat/services/QuestionDockCoordinator.md`
  - 更新 `docs/modules/features/chat/services/QuestionResolutionFlowCoordinator.md`
  - 更新 `docs/modules/features/chat/services/QuestionRuntimeHostAdapter.md`
  - 更新 `docs/modules/features/chat/services/QuestionPendingRefreshRuntimeFacade.md`
  - 更新 `docs/modules/features/chat/services/QuestionPostResolutionRuntimeFacade.md`

## 2. 变更文件

- `src/features/chat/services/QuestionResolutionWritebackFacade.ts`
- `src/features/chat/services/QuestionDockCoordinator.ts`
- `src/features/chat/services/QuestionResolutionFlowCoordinator.ts`
- `src/features/chat/services/QuestionRuntimeHostAdapter.ts`
- `tests/unit/features/chat/QuestionResolutionWritebackFacade.test.ts`
- `tests/unit/features/chat/QuestionDockCoordinator.test.ts`
- `tests/unit/features/chat/QuestionRuntimeHostAdapter.test.ts`
- `docs/modules/features/chat/services/QuestionResolutionWritebackFacade.md`
- `docs/modules/features/chat/services/QuestionDockCoordinator.md`
- `docs/modules/features/chat/services/QuestionResolutionFlowCoordinator.md`
- `docs/modules/features/chat/services/QuestionRuntimeHostAdapter.md`
- `docs/modules/features/chat/services/QuestionPendingRefreshRuntimeFacade.md`
- `docs/modules/features/chat/services/QuestionPostResolutionRuntimeFacade.md`
- `docs/status/maintainability-phase-269.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- QuestionResolutionWritebackFacade QuestionDockCoordinator QuestionRuntimeHostAdapter`
- `npm run build`

本轮未执行完整 `npm test`。

原因：

- attempt `264` 不可被 `5` 整除
- 改动未命中仓库约定的 full-test 高风险路径（`src/main.ts`、`src/core/`、`automation/`、`package.json`、`package-lock.json`、`manifest.json`、`styles.css`、`esbuild.config.mjs`）

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且用户未显式要求部署，因此按仓库规则在成功 build 后停止于构建验证。

## 5. 下一步建议

下一轮继续留在高优先级 P2：沿 question/todo/background-task 首查入口继续挑一个共享写回 seam，优先考虑把 pending-question refresh 完成后的 attention/render writeback，进一步从 `QuestionDockCoordinator` 下沉到 dedicated facade / adapter，而不是回到低收益的 helper 细拆。

一句话总结第二百六十九阶段本轮：

> 第二百六十九阶段新增 `QuestionResolutionWritebackFacade`，把 question dock 与 inline fallback 共用的 post-resolution suppression / resolved-state / follow-up 顺序收束成一条共享 writeback seam。
