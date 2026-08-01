# 可维护性改进：第二百二十九阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-228.md`
> **推进的 master-plan lane**: P2 `question / todo / background task`（question dock interaction-state helper）

本轮继续按 master plan 与 lane map 的 P2 首查顺序，从 `OpenCodianView` 的 question/todo/background-task host wiring 开始，再复核 `QuestionTodoStatusRefreshCoordinator`、`PostSyncQuestionTodoRefreshFacade`、`BackgroundTaskPostSyncCoordinator` 与 host adapter 模式。最终选择的单一切片是：**把 `QuestionDockCoordinator` 中的 draft answer sanitize、active group 与 active question index 写回逻辑下沉到 dedicated dock interaction-state helper。**

这次改动保持上方 dock 渲染、group 切换、单题/多题选择、reply/reject、resolved card state、pending refresh suppression 与 post-resolution follow-up 行为不变；变化点只在于让 dock coordinator 不再直接维护 dock interaction runtime maps，而是只调度 dock callbacks 和 resolve flow。

## 1. 本轮范围

- `src/features/chat/services/QuestionDockInteractionState.ts`
  - 新增上方 question dock interaction-state helper
  - 封装 draft answer normalize/sanitize、active group/index view-model 写回、group selection 与 question selection map 更新
- `src/features/chat/services/QuestionDockCoordinator.ts`
  - 将 render callback 内的 draft answer、active group 与 active question index 维护改为调用 `QuestionDockInteractionState`
  - 保留 pending-question refresh/session filter、attention、dock render 入口、submit/reject API 调用与 post-resolution follow-up orchestration
- 测试
  - 新增 `tests/unit/features/chat/QuestionDockInteractionState.test.ts`，覆盖单选/多选 sanitize、active selection 持久化与 dock callback map 写回
- 直接相关文档
  - 新增 `docs/modules/features/chat/services/QuestionDockInteractionState.md`
  - 更新 `docs/modules/features/chat/services/QuestionDockCoordinator.md`

## 2. 变更文件

- `src/features/chat/services/QuestionDockInteractionState.ts`
- `src/features/chat/services/QuestionDockCoordinator.ts`
- `tests/unit/features/chat/QuestionDockInteractionState.test.ts`
- `docs/modules/features/chat/services/QuestionDockInteractionState.md`
- `docs/modules/features/chat/services/QuestionDockCoordinator.md`
- `docs/status/maintainability-phase-229.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- QuestionDockInteractionState QuestionDockCoordinator questionDockState`
- `npm run build`

本轮未执行全量 `npm test`：attempt `224` 不是 5 的倍数，且改动未命中仓库规则列出的高风险路径（如 `src/main.ts`、`src/core/`、`automation/`、`package.json`、`package-lock.json`、`manifest.json`、`styles.css` 或 build pipeline 文件）。

本轮构建 `BUILD_ID`：

- `autopilot-maintainability.202604130142`

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且 `npm run build` 后没有留下 tracked `styles.css` 变更，因此按仓库规则在成功 build 后停止于构建验证。

## 5. 下一步建议

P2 question 子链里，dock queue runtime、pending refresh runtime、post-resolution follow-up、inline fallback resolved-request suppression 与本轮 dock interaction-state map 写回已经分别收束到 dedicated facade/helper。**下一轮建议继续复审 `QuestionDockCoordinator` 是否还存在可独立下沉的 dock render-state/callback composition 边界；如果收益不足，则切到 P3 composer/context 或 P4 notice/timestamp ownership。**

一句话总结第二百二十九阶段本轮：

> 第二百二十九阶段新增 `QuestionDockInteractionState`，把上方 question dock 的 draft answer sanitize 与 active group/index 写回从 `QuestionDockCoordinator` 拆出，进一步收窄 P2 question dock coordinator 的职责。
