# 可维护性改进：第二百二十六阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-225.md`
> **推进的 master-plan lane**: P2 `question / todo / background task`（pending-question refresh runtime facade）

本轮继续遵循 master plan 与 lane map，先按 P2 首查顺序检查 `OpenCodianView` 的 question/todo/background-task host wiring，再对照 `QuestionTodoStatusRefreshCoordinator`、`PostSyncQuestionTodoRefreshFacade`、`BackgroundTaskPostSyncCoordinator` 与现有 `QuestionRuntimeHostAdapter` / `QuestionDockCoordinator` 分工。最终选择的单一切片是：**把 pending-question refresh 期间的 resolved-request suppression、waiter-owned request 保活，以及 draft/group/index runtime map 清理，从 `QuestionDockCoordinator` 的 refresh 分支中抽成 `QuestionPendingRefreshRuntimeFacade`。**

这次改动保持现有 question API、上方 dock render、inline fallback resolve、post-resolution status/sync follow-up 与 tab attention 行为不变；变化点只在于把 pending refresh 的 tab runtime map 读写集中到一个更明确的 facade，继续减少 question coordinator 对 runtime map 细节的直接持有。

## 1. 本轮范围

- `src/features/chat/services/QuestionPendingRefreshRuntimeFacade.ts`
  - 新增 pending-question refresh runtime facade，统一负责 resolved-id suppression、waiter-owned request merge、draft answer normalization、stale draft/group/index pruning、clear 与 mark-resolved helper
- `src/features/chat/services/QuestionDockCoordinator.ts`
  - 删除 `refreshPendingQuestionsForTab()` 中展开的 resolved-id / pending queue / draft cleanup 细节，改为委托给 `QuestionPendingRefreshRuntimeFacade`
  - 保留 question API fetch、session filtering、active/background tab attention、dock render callbacks 与 dock resolve flow
- `src/features/chat/services/QuestionRuntimeHostAdapter.ts`
  - 从共享 `QuestionRuntimeViewHost` 派生 `QuestionPendingRefreshRuntimeFacade` 的 runtime host，并在 question runtime bundle 中集中装配新 facade
- 测试
  - 新增 `tests/unit/features/chat/QuestionPendingRefreshRuntimeFacade.test.ts`
  - 更新 `tests/unit/features/chat/QuestionDockCoordinator.test.ts`
  - 更新 `tests/unit/features/chat/QuestionRuntimeHostAdapter.test.ts`
- 直接相关文档
  - 新增 `docs/modules/features/chat/services/QuestionPendingRefreshRuntimeFacade.md`
  - 更新 `docs/modules/features/chat/services/QuestionDockCoordinator.md`
  - 更新 `docs/modules/features/chat/services/QuestionRuntimeHostAdapter.md`

## 2. 变更文件

- `src/features/chat/services/QuestionPendingRefreshRuntimeFacade.ts`
- `src/features/chat/services/QuestionDockCoordinator.ts`
- `src/features/chat/services/QuestionRuntimeHostAdapter.ts`
- `tests/unit/features/chat/QuestionPendingRefreshRuntimeFacade.test.ts`
- `tests/unit/features/chat/QuestionDockCoordinator.test.ts`
- `tests/unit/features/chat/QuestionRuntimeHostAdapter.test.ts`
- `docs/modules/features/chat/services/QuestionPendingRefreshRuntimeFacade.md`
- `docs/modules/features/chat/services/QuestionDockCoordinator.md`
- `docs/modules/features/chat/services/QuestionRuntimeHostAdapter.md`
- `docs/status/maintainability-phase-226.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- QuestionPendingRefreshRuntimeFacade QuestionDockCoordinator QuestionRuntimeHostAdapter`
- `npm run build`

本轮未执行全量 `npm test`：attempt `221` 不是 5 的倍数，且改动未命中仓库规则列出的高风险路径（如 `src/main.ts`、`src/core/`、`automation/`、`package.json`、`manifest.json`、`styles.css` 或 build pipeline 文件）。

本轮构建 `BUILD_ID`：

- `autopilot-maintainability.202604130117`

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且 `npm run build` 后没有留下 tracked `styles.css` 变更，因此按仓库规则在成功 build 后停止于构建验证。

## 5. 下一步建议

P2 question 子链里，post-resolution runtime follow-up 与 pending-question refresh runtime map 维护已经分别收束到 dedicated facade。**下一轮建议继续在 P2 内评估 `QuestionDockCoordinator` 剩余的 waiter / enqueue / remove pending-question queue 操作，是否适合抽成更窄的 dock queue runtime facade，或者先把 inline fallback 对 `QuestionDockCoordinator.markQuestionRequestResolved()` 的依赖收窄为 resolved-request port。**

一句话总结第二百二十六阶段本轮：

> 第二百二十六阶段新增 `QuestionPendingRefreshRuntimeFacade`，让 pending-question refresh 的 resolved-request suppression 与 runtime map pruning 从 dock coordinator 中独立出来，继续推进 master plan 的 P2 ownership 迁移。
