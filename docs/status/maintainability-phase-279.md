# 可维护性改进：第二百七十九阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-278.md`
> **推进的 master-plan lane**: P2 `question / todo / background task` wiring 与 post-sync/activation 协调（activation supplemental refresh bridge seam）

本轮继续遵循 master plan 与 lane map 的 P2 首查入口，选择一个高价值且低风险的单一职责切片：**把 activation/open 路径使用的 supplemental question/todo/status refresh 从 `QuestionTodoStatusRefreshCoordinator` 抽到独立的 `QuestionTodoActivationRefreshBridge`。**

这样 `QuestionTodoActivationRefreshCoordinator` 只保留 question dock 与 session todo dock 的 activation-side writeback 顺序，不再依赖同时承接 post-sync runtime gate 的 coordinator；`QuestionTodoStatusRefreshCoordinator` 也收窄为 post-sync pending-question → rebuild hook → conditional todo/status refresh 的专用边界。

## 1. 本轮范围

- `src/features/chat/services/QuestionTodoActivationRefreshBridge.ts`
  - 新增 activation supplemental refresh bridge
  - 保留 activation/open 旧顺序：并行启动 status、pending-question、todo 三条 lazy refresh
  - 只暴露 activation 需要的窄 host，不再混入 post-sync runtime gate 依赖
- `src/features/chat/services/QuestionTodoStatusRefreshCoordinator.ts`
  - 删除 activation-side `refreshAfterActivation()`
  - 收窄为 post-sync question/todo/status refresh gate coordinator
- `src/features/chat/services/QuestionTodoActivationRefreshCoordinator.ts`
  - 改为依赖 `QuestionTodoActivationRefreshBridge`
  - 继续只负责 dock writeback 与 activation refresh handoff
- `src/features/chat/services/QuestionTodoBackgroundTaskRefreshHostAdapter.ts`
  - 从 shared refresh view host 额外派生 activation refresh host
  - 在 shared service bundle 中装配并返回 `QuestionTodoActivationRefreshBridge`
- `src/features/chat/services/QuestionTodoBackgroundTaskActivationHostAdapter.ts`
  - activation service bundle 改为接收 activation refresh bridge，而不是 post-sync coordinator
- `src/features/chat/OpenCodianView.ts`
  - 不再保留 `QuestionTodoStatusRefreshCoordinator` 作为 activation wiring 中转属性
  - 直接把 `QuestionTodoActivationRefreshBridge` 交给 activation-side bundle
- 测试
  - 新增 `tests/unit/features/chat/QuestionTodoActivationRefreshBridge.test.ts`
  - 更新 activation / post-sync host-adapter、coordinator focused tests，覆盖新的 handoff seam
- 直接相关文档
  - 新增 `docs/modules/features/chat/services/QuestionTodoActivationRefreshBridge.md`
  - 更新 activation/post-sync refresh 相关模块文档，明确 activation bridge 与 post-sync coordinator 的新边界

## 2. 变更文件

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/services/QuestionTodoActivationRefreshBridge.ts`
- `src/features/chat/services/QuestionTodoActivationRefreshCoordinator.ts`
- `src/features/chat/services/QuestionTodoBackgroundTaskActivationHostAdapter.ts`
- `src/features/chat/services/QuestionTodoBackgroundTaskRefreshHostAdapter.ts`
- `src/features/chat/services/QuestionTodoStatusRefreshCoordinator.ts`
- `tests/unit/features/chat/QuestionTodoActivationRefreshBridge.test.ts`
- `tests/unit/features/chat/QuestionTodoActivationRefreshCoordinator.test.ts`
- `tests/unit/features/chat/QuestionTodoBackgroundTaskActivationHostAdapter.test.ts`
- `tests/unit/features/chat/QuestionTodoBackgroundTaskRefreshHostAdapter.test.ts`
- `tests/unit/features/chat/QuestionTodoStatusRefreshCoordinator.test.ts`
- `docs/modules/features/chat/services/BackgroundTaskPostSyncCoordinator.md`
- `docs/modules/features/chat/services/QuestionTodoActivationRefreshBridge.md`
- `docs/modules/features/chat/services/QuestionTodoActivationRefreshCoordinator.md`
- `docs/modules/features/chat/services/QuestionTodoBackgroundTaskActivationHostAdapter.md`
- `docs/modules/features/chat/services/QuestionTodoBackgroundTaskRefreshHostAdapter.md`
- `docs/modules/features/chat/services/QuestionTodoStatusRefreshCoordinator.md`
- `docs/modules/features/chat/services/SessionTodoStatusRefreshService.md`
- `docs/status/maintainability-phase-279.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- QuestionTodoActivationRefreshBridge QuestionTodoActivationRefreshCoordinator QuestionTodoStatusRefreshCoordinator QuestionTodoBackgroundTaskActivationHostAdapter QuestionTodoBackgroundTaskRefreshHostAdapter`
- `npm run build`

本轮 build 生成的 `BUILD_ID`：

- `autopilot-maintainability.202604131020`

本轮未执行全量 `npm test` 的原因：

- attempt `276` 不能被 `5` 整除
- 改动未命中仓库规则要求补跑全量测试的高风险路径（`src/main.ts`、`src/core/`、`automation/`、`package.json`、`package-lock.json`、`manifest.json`、`styles.css`、`esbuild.config.mjs`）

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且用户未显式要求部署，因此按仓库规则在成功 build 后停止于构建验证。

## 5. 下一步建议

下一轮可继续留在高优先级 P2，优先考虑把 `PostSyncQuestionTodoRefreshFacade` 里剩余的 visible/background source routing 再下沉到更窄的 background post-sync execution seam，进一步减轻 facade 同时承接 visible 与 background conversation refresh 入口的职责。

一句话总结第二百七十九阶段本轮：

> 第二百七十九阶段把 activation/open 路径的 supplemental question/todo/status refresh 从 `QuestionTodoStatusRefreshCoordinator` 抽到新的 `QuestionTodoActivationRefreshBridge`，显式拆开 activation 与 post-sync 的 refresh handoff seam。
