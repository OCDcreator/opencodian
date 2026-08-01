# 可维护性改进：第二百三十阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-229.md`
> **推进的 master-plan lane**: P2 `question / todo / background task`（question dock render payload adapter）

本轮继续按 master plan 与 lane map 的 P2 首查顺序，从 `OpenCodianView` 的 question/todo/background-task host wiring 开始，再复核 `QuestionTodoStatusRefreshCoordinator`、`PostSyncQuestionTodoRefreshFacade`、`BackgroundTaskPostSyncCoordinator` 与 host adapter 模式。最终选择的单一切片是：**把 `QuestionDockCoordinator` 中的上方 question dock render state / callbacks composition 下沉到 dedicated render adapter。**

这次改动保持上方 dock 可见性判断、active request/session 过滤、draft answer sanitize、group/question 选择、submit/reject/close、pending refresh、resolved state bridge 与 post-resolution follow-up 行为不变；变化点只在于让 dock coordinator 不再直接拼装 `QuestionDock.render()` 的 state/callbacks，而是只选择 active request 并注入 rerender/submit/reject actions。

## 1. 本轮范围

- `src/features/chat/services/QuestionDockRenderAdapter.ts`
  - 新增上方 question dock render adapter
  - 封装 active dock render state、callback wiring、空 dock payload 与 no-op callbacks
  - 继续复用 `QuestionDockInteractionState` 维护 draft answer、active group 与 active question index runtime maps
- `src/features/chat/services/QuestionDockCoordinator.ts`
  - 将 active/empty dock render payload composition 改为调用 `QuestionDockRenderAdapter`
  - 保留 pending-question refresh/session filter、attention、queue、submit/reject API 调用与 post-resolution follow-up orchestration
- 测试
  - 新增 `tests/unit/features/chat/QuestionDockRenderAdapter.test.ts`，覆盖 active render state、callback interaction-state 写回、rerender/submit/reject action routing 与 empty payload
- 直接相关文档
  - 新增 `docs/modules/features/chat/services/QuestionDockRenderAdapter.md`
  - 更新 `docs/modules/features/chat/services/QuestionDockCoordinator.md`

## 2. 变更文件

- `src/features/chat/services/QuestionDockRenderAdapter.ts`
- `src/features/chat/services/QuestionDockCoordinator.ts`
- `tests/unit/features/chat/QuestionDockRenderAdapter.test.ts`
- `docs/modules/features/chat/services/QuestionDockRenderAdapter.md`
- `docs/modules/features/chat/services/QuestionDockCoordinator.md`
- `docs/status/maintainability-phase-230.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- QuestionDockRenderAdapter QuestionDockCoordinator questionDockState`
- `npm test`
- `npm run build`

本轮执行全量 `npm test` 的原因：attempt `225` 是 5 的倍数，符合无人值守工作流的全量测试触发条件。

本轮构建 `BUILD_ID`：

- `autopilot-maintainability.202604130150`

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且用户未显式要求部署，因此按仓库规则在成功 build 后停止于构建验证。

## 5. 下一步建议

P2 question dock 子链里，queue runtime、pending refresh runtime、post-resolution follow-up、interaction-state map 写回与本轮 render payload/callback composition 都已分别收束到 dedicated helper/facade。**下一轮建议优先切到 P3 composer/context/retained-selection 首查入口；如果 P3 没有低风险切片，再切到 P4 notice/timestamp ownership。**

一句话总结第二百三十阶段本轮：

> 第二百三十阶段新增 `QuestionDockRenderAdapter`，把上方 question dock 的 render state / callbacks composition 从 `QuestionDockCoordinator` 拆出，让 P2 question dock coordinator 更集中于 pending refresh、queue 与 resolve orchestration。
