# 可维护性改进：第二百二十八阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-227.md`
> **推进的 master-plan lane**: P2 `question / todo / background task`（inline question fallback resolved-request port）

本轮继续遵循 master plan 与 lane map，先按 P2 首查顺序检查 `OpenCodianView` 的 question/todo/background-task host wiring，再对照 `QuestionTodoStatusRefreshCoordinator`、`PostSyncQuestionTodoRefreshFacade`、`BackgroundTaskPostSyncCoordinator` 与现有 host adapter 模式。最终选择的单一切片是：**让 inline question fallback 不再通过 `QuestionDockCoordinator.markQuestionRequestResolved()` 标记 resolved-request suppression，而是直接依赖更小的 pending-refresh runtime port。**

这次改动保持上方 dock 接管、inline card fallback、reply/reject、resolved card state、pending question refresh suppression、post-resolution status/sync follow-up 行为不变；变化点只在于收窄 inline resolve flow 的依赖边界，让 dock coordinator 只暴露 dock 接管能力，resolved-request runtime 写入继续集中在 `QuestionPendingRefreshRuntimeFacade`。

## 1. 本轮范围

- `src/features/chat/services/QuestionResolutionFlowCoordinator.ts`
  - 将 `dockCoordinator` 端口缩窄为只依赖 `waitForDockResolutionIfEnabled()`
  - 新增 `resolvedRequestRuntime` 小端口，inline fallback 成功后直接调用 `QuestionPendingRefreshRuntimeFacade.markQuestionRequestResolved()`
- `src/features/chat/services/QuestionRuntimeHostAdapter.ts`
  - 在 question runtime bundle 中把 `pendingRefreshRuntimeFacade` 注入给 `QuestionResolutionFlowCoordinator` 的 resolved-request runtime port
- `src/features/chat/services/QuestionDockCoordinator.ts`
  - 将 `markQuestionRequestResolved()` 收回为 dock coordinator 内部实现细节，保留 dock submit/reject 的本地 suppression 行为
- 测试
  - 更新 `tests/unit/features/chat/QuestionResolutionFlowCoordinator.test.ts`，覆盖 inline fallback 通过 resolved-request runtime port 标记 suppression
- 直接相关文档
  - 更新 `docs/modules/features/chat/services/QuestionResolutionFlowCoordinator.md`
  - 更新 `docs/modules/features/chat/services/QuestionRuntimeHostAdapter.md`
  - 更新 `docs/modules/features/chat/services/QuestionDockCoordinator.md`
  - 更新 `docs/modules/features/chat/services/QuestionPendingRefreshRuntimeFacade.md`

## 2. 变更文件

- `src/features/chat/services/QuestionResolutionFlowCoordinator.ts`
- `src/features/chat/services/QuestionRuntimeHostAdapter.ts`
- `src/features/chat/services/QuestionDockCoordinator.ts`
- `tests/unit/features/chat/QuestionResolutionFlowCoordinator.test.ts`
- `docs/modules/features/chat/services/QuestionResolutionFlowCoordinator.md`
- `docs/modules/features/chat/services/QuestionRuntimeHostAdapter.md`
- `docs/modules/features/chat/services/QuestionDockCoordinator.md`
- `docs/modules/features/chat/services/QuestionPendingRefreshRuntimeFacade.md`
- `docs/status/maintainability-phase-228.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- QuestionResolutionFlowCoordinator QuestionRuntimeHostAdapter QuestionDockCoordinator QuestionPendingRefreshRuntimeFacade`
- `npm run build`

本轮未执行全量 `npm test`：attempt `223` 不是 5 的倍数，且改动未命中仓库规则列出的高风险路径（如 `src/main.ts`、`src/core/`、`automation/`、`package.json`、`package-lock.json`、`manifest.json`、`styles.css` 或 build pipeline 文件）。

本轮构建 `BUILD_ID`：

- `autopilot-maintainability.202604130133`

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且 `npm run build` 后没有留下 tracked `styles.css` 变更，因此按仓库规则在成功 build 后停止于构建验证。

## 5. 下一步建议

P2 question 子链里，dock queue runtime、pending refresh runtime、post-resolution follow-up 与 inline fallback resolved-request suppression 已经分别收束到 dedicated facade/port。**下一轮建议继续在 P2 内复审 `QuestionDockCoordinator` 剩余的 draft answer sanitize、active group/index callback 与 dock render callback 维护，判断是否有可独立下沉到更小 dock-state interaction helper 的低风险边界；如果收益不足，则切到 P3 composer/context 或 P4 notice/timestamp ownership。**

一句话总结第二百二十八阶段本轮：

> 第二百二十八阶段收窄 inline question fallback 的 resolved-request 标记依赖，让它直接使用 `QuestionPendingRefreshRuntimeFacade` 小端口，不再通过 `QuestionDockCoordinator` 暴露非 dock 专属 API。
