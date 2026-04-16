# 可维护性改进：第二百二十七阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-226.md`
> **推进的 master-plan lane**: P2 `question / todo / background task`（question dock queue runtime facade）

本轮继续遵循 master plan 与 lane map，先按 P2 首查顺序检查 `OpenCodianView` 的 question/todo/background-task host wiring，再对照 `QuestionTodoStatusRefreshCoordinator`、`PostSyncQuestionTodoRefreshFacade`、`BackgroundTaskPostSyncCoordinator` 与现有 host adapter/facade 分工。最终选择的单一切片是：**把 `QuestionDockCoordinator` 中剩余的 dock waiter、pending request 入队/出队，以及对应 draft/group/index runtime map 维护抽成 `QuestionDockQueueRuntimeFacade`。**

这次改动保持 question API refresh、above-input dock render、inline fallback resolution、post-resolution status/sync follow-up、active/background tab attention 与 pending-refresh suppression 行为不变；变化点只在于把 dock queue runtime map 的直接读写集中到一个更明确的 facade，继续减少 question coordinator 对 tab runtime 细节的持有。

## 1. 本轮范围

- `src/features/chat/services/QuestionDockQueueRuntimeFacade.ts`
  - 新增 dock queue runtime facade，统一负责 waiter 创建/复用、pending request 入队、draft answer normalization、active group/index 初始化，以及 request 移除时的 waiter resolve 与 runtime map 清理
- `src/features/chat/services/QuestionDockCoordinator.ts`
  - 删除 coordinator 内展开的 waiter/enqueue/remove runtime map 操作，改为委托给 `QuestionDockQueueRuntimeFacade`
  - 保留 pending-question API fetch/session filter、dock render callbacks、attention 决策、reply/reject 调用、resolved state bridge 与 post-resolution follow-up
  - 进一步缩窄 `QuestionDockCoordinatorHost`，不再直接需要 `ensureTabRuntimeState()`
- `src/features/chat/services/QuestionRuntimeHostAdapter.ts`
  - 从共享 `QuestionRuntimeViewHost` 派生 dock-queue runtime host，并在 question runtime bundle 中集中装配新 facade
- `src/features/chat/services/QuestionPendingRefreshRuntimeFacade.ts`
  - 将 waiter map runtime type 对齐到 dock queue facade 的 deferred request 类型；refresh facade 仍只在 refresh/clear 时读取或清理 waiter 集合
- 测试
  - 新增 `tests/unit/features/chat/QuestionDockQueueRuntimeFacade.test.ts`
  - 更新 `tests/unit/features/chat/QuestionDockCoordinator.test.ts`
  - 更新 `tests/unit/features/chat/QuestionRuntimeHostAdapter.test.ts`
- 直接相关文档
  - 新增 `docs/modules/features/chat/services/QuestionDockQueueRuntimeFacade.md`
  - 更新 `docs/modules/features/chat/services/QuestionDockCoordinator.md`
  - 更新 `docs/modules/features/chat/services/QuestionRuntimeHostAdapter.md`
  - 更新 `docs/modules/features/chat/services/QuestionPendingRefreshRuntimeFacade.md`

## 2. 变更文件

- `src/features/chat/services/QuestionDockQueueRuntimeFacade.ts`
- `src/features/chat/services/QuestionDockCoordinator.ts`
- `src/features/chat/services/QuestionRuntimeHostAdapter.ts`
- `src/features/chat/services/QuestionPendingRefreshRuntimeFacade.ts`
- `tests/unit/features/chat/QuestionDockQueueRuntimeFacade.test.ts`
- `tests/unit/features/chat/QuestionDockCoordinator.test.ts`
- `tests/unit/features/chat/QuestionRuntimeHostAdapter.test.ts`
- `docs/modules/features/chat/services/QuestionDockQueueRuntimeFacade.md`
- `docs/modules/features/chat/services/QuestionDockCoordinator.md`
- `docs/modules/features/chat/services/QuestionRuntimeHostAdapter.md`
- `docs/modules/features/chat/services/QuestionPendingRefreshRuntimeFacade.md`
- `docs/status/maintainability-phase-227.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- QuestionDockQueueRuntimeFacade QuestionDockCoordinator QuestionRuntimeHostAdapter`
- `npm run build`

本轮未执行全量 `npm test`：attempt `222` 不是 5 的倍数，且改动未命中仓库规则列出的高风险路径（如 `src/main.ts`、`src/core/`、`automation/`、`package.json`、`manifest.json`、`styles.css` 或 build pipeline 文件）。

本轮构建 `BUILD_ID`：

- `autopilot-maintainability.202604130128`

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且 `npm run build` 后没有留下 tracked `styles.css` 变更，因此按仓库规则在成功 build 后停止于构建验证。

## 5. 下一步建议

P2 question 子链里，pending refresh runtime map、post-resolution runtime follow-up 与 dock queue waiter/enqueue/remove runtime map 维护已经分别收束到 dedicated facade。**下一轮建议继续在 P2 内评估 inline fallback 对 `QuestionDockCoordinator.markQuestionRequestResolved()` 的依赖，是否适合收窄为更小的 resolved-request port；或者复审 `QuestionDockCoordinator` 剩余的 draft answer sanitize / active group callback 是否仍有可独立下沉的低风险边界。**

一句话总结第二百二十七阶段本轮：

> 第二百二十七阶段新增 `QuestionDockQueueRuntimeFacade`，让上方 question dock 的 waiter 与 pending queue runtime 维护从 dock coordinator 中独立出来，继续推进 master plan 的 P2 ownership 迁移。
