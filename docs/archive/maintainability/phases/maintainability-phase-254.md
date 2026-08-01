# 可维护性改进：第二百五十四阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-253.md`
> **推进的 master-plan lane**: P2 `question / todo / background task`（activation host adapter bundle）

本轮继续遵循 lane map 的 P2 首查入口，从 `OpenCodianView` 中 question/todo/background-task 的 host factory 与 activation wiring 区段入手，再复审 `QuestionTodoActivationRefreshCoordinator`、`BackgroundTaskActivationIndicatorCoordinator` 以及已有的 `QuestionTodoBackgroundTaskRefreshHostAdapter` 模式，没有重新广扫其它 chat runtime 大片上下文。

确认的低风险问题是：虽然前几轮已经把 post-sync 的 question/todo/background-task refresh wiring 收敛到 `QuestionTodoBackgroundTaskRefreshHostAdapter`，但 activation 侧仍然在 `OpenCodianView` 内保留两段独立 host factory：`QuestionTodoActivationRefreshCoordinator` 的 dock refresh host 与 `BackgroundTaskActivationIndicatorCoordinator` 的 indicator host。行为已经稳定，问题主要在 activation-side wiring 仍直接占据 view 构造函数和两个局部 host builder。

因此本轮只做一个窄切片：**新增 `QuestionTodoBackgroundTaskActivationHostAdapter`，把 activation 侧的 question/todo/background-task host assembly 与 coordinator bundle 从 `OpenCodianView` 迁到专用模块。** `OpenCodianView` 现在只提供更窄的 activation view host 与 late-bound dock collaborator getters，再通过 `createQuestionTodoBackgroundTaskActivationServices()` 一次性拿到 `QuestionTodoActivationRefreshCoordinator` 和 `BackgroundTaskActivationIndicatorCoordinator`。activation preflight、conversation activation、same-conversation indicator reset 判定与 loaded/open indicator render 语义均保持不变。

## 1. 本轮范围

- `src/features/chat/services/QuestionTodoBackgroundTaskActivationHostAdapter.ts`
  - 新增 activation-side host adapter / host bundle / service bundle
  - 收敛 question dock、session todo dock 与 background-task indicator 的 activation wiring
- `src/features/chat/OpenCodianView.ts`
  - 改为使用新的 activation host adapter factory
  - 删除 view 内部两段独立 activation host factory
- 测试
  - 新增 `tests/unit/features/chat/QuestionTodoBackgroundTaskActivationHostAdapter.test.ts`
- 直接相关文档
  - 新增 `docs/modules/features/chat/services/QuestionTodoBackgroundTaskActivationHostAdapter.md`

## 2. 变更文件

- `src/features/chat/services/QuestionTodoBackgroundTaskActivationHostAdapter.ts`
- `src/features/chat/OpenCodianView.ts`
- `tests/unit/features/chat/QuestionTodoBackgroundTaskActivationHostAdapter.test.ts`
- `docs/modules/features/chat/services/QuestionTodoBackgroundTaskActivationHostAdapter.md`
- `docs/status/maintainability-phase-254.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- QuestionTodoBackgroundTaskActivationHostAdapter QuestionTodoActivationRefreshCoordinator BackgroundTaskActivationIndicatorCoordinator`
- `npm run build`

本轮构建 `BUILD_ID`：

- `autopilot-maintainability.202604130547`

本轮未执行完整 `npm test` 的原因：

- attempt `249` 不能被 `5` 整除
- 改动未命中仓库规则中的高风险路径（`src/main.ts`、`src/core/`、`automation/`、`package.json`、`package-lock.json`、`manifest.json`、`styles.css`、`esbuild.config.mjs`）

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且用户未显式要求部署，因此按仓库规则在成功 build 后停止于构建验证。

## 5. 下一步建议

下一轮建议继续留在 master-plan 当前高优先级的 P2 `question / todo / background task` lane，回到 lane map 的 post-sync 首查链路，优先复审 `PostSyncQuestionTodoRefreshFacade` 与 `BackgroundTaskPostSyncCoordinator` 之间仍残留的 background-task completion notice / stream-like writeback seam，寻找一个同样低风险的 effect port 收口切片。

一句话总结第二百五十四阶段本轮：

> 第二百五十四阶段新增了 `QuestionTodoBackgroundTaskActivationHostAdapter`，把 question/todo/background-task activation-side host assembly 从 `OpenCodianView` 迁到共享 bundle，同时保持 activation refresh 与 indicator 行为不变。
