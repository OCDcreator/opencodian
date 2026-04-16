# 可维护性改进：第二百七十二阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-271.md`
> **推进的 master-plan lane**: P2 `question / todo / background task` wiring 与 post-sync/activation 协调（question dock pending refresh facade）

本轮继续遵循 master plan 与 lane map 的 P2 首查入口，选择一个高价值且低风险的单一职责切片：**把 `QuestionDockCoordinator` 中剩余的 pending-question fetch / session-filter refresh orchestration 下沉到 dedicated `QuestionDockRefreshFacade`。**

这样 `QuestionDockCoordinator` 不再直接承担 pending-question 拉取、session 过滤、runtime merge/prune 与 refresh/clear writeback；question runtime bundle 也显式装配出独立的 refresh host/facade，coordinator 进一步收窄到 dock render、queue callbacks 与 resolution assembly。

## 1. 本轮范围

- `src/features/chat/services/QuestionDockRefreshFacade.ts`
  - 新增 dedicated refresh facade，统一处理 pending-question fetch、session 过滤、refresh 失败回退，以及 refresh/clear 后的 runtime + writeback 协调
- `src/features/chat/services/QuestionDockCoordinator.ts`
  - 把 `clearPendingQuestionsForTab()` / `refreshPendingQuestionsForTab()` 改为转交 `QuestionDockRefreshFacade`
  - host 依赖收窄，不再直接持有 `getSessionIdForTab()` 与 `getPendingQuestions()`
- `src/features/chat/services/QuestionRuntimeHostAdapter.ts`
  - 新增 `dockRefreshHost`
  - 装配 `QuestionDockRefreshFacade`，把 pending-refresh runtime 与 dock writeback 串成共享 refresh seam
- 测试
  - 新增 `tests/unit/features/chat/QuestionDockRefreshFacade.test.ts`
  - 更新 `tests/unit/features/chat/QuestionDockCoordinator.test.ts`
  - 更新 `tests/unit/features/chat/QuestionRuntimeHostAdapter.test.ts`
- 直接相关文档
  - 新增 `docs/modules/features/chat/services/QuestionDockRefreshFacade.md`
  - 更新 `docs/modules/features/chat/services/QuestionDockCoordinator.md`
  - 更新 `docs/modules/features/chat/services/QuestionRuntimeHostAdapter.md`
  - 更新 `docs/modules/features/chat/services/QuestionPendingRefreshRuntimeFacade.md`
  - 更新 `docs/modules/features/chat/services/QuestionDockWritebackFacade.md`

## 2. 变更文件

- `src/features/chat/services/QuestionDockRefreshFacade.ts`
- `src/features/chat/services/QuestionDockCoordinator.ts`
- `src/features/chat/services/QuestionRuntimeHostAdapter.ts`
- `tests/unit/features/chat/QuestionDockRefreshFacade.test.ts`
- `tests/unit/features/chat/QuestionDockCoordinator.test.ts`
- `tests/unit/features/chat/QuestionRuntimeHostAdapter.test.ts`
- `docs/modules/features/chat/services/QuestionDockRefreshFacade.md`
- `docs/modules/features/chat/services/QuestionDockCoordinator.md`
- `docs/modules/features/chat/services/QuestionRuntimeHostAdapter.md`
- `docs/modules/features/chat/services/QuestionPendingRefreshRuntimeFacade.md`
- `docs/modules/features/chat/services/QuestionDockWritebackFacade.md`
- `docs/status/maintainability-phase-272.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- QuestionDockRefreshFacade QuestionDockCoordinator QuestionRuntimeHostAdapter`
- `npm run build`

本轮未执行 `npm test` 全量套件。

原因：

- attempt `267` 不能被 `5` 整除
- 改动未命中仓库约定的 full-test 高风险路径（`src/main.ts`、`src/core/`、`automation/`、`package.json`、`package-lock.json`、`manifest.json`、`styles.css`、`esbuild.config.mjs`）

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且用户未显式要求部署，因此按仓库规则在成功 build 后停止于构建验证。

## 5. 下一步建议

下一轮可继续留在高优先级 P2，优先考虑把 `QuestionDockCoordinator` 中剩余的 active-request 选择与 session-match 空 dock 回退判断下沉到 dedicated render-state seam，让 coordinator 更接近纯 callbacks + resolution assembly。

一句话总结第二百七十二阶段本轮：

> 第二百七十二阶段把 question dock 的 pending-question fetch / session-filter refresh orchestration 从 `QuestionDockCoordinator` 下沉到独立的 `QuestionDockRefreshFacade`。
