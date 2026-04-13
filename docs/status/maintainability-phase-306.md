# 可维护性改进：第三百零六阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-305.md`
> **推进的 master-plan lane**: P2 `question / todo / background task` wiring 与 post-sync/activation 协调（runtime service-bundle seam）

本轮继续遵循 master plan、lane map 与上一轮的 P2 首查顺序，先回到 `OpenCodianView` 构造函数里 visible post-sync state、refresh、activation 三段 service bundle 的实例化区段，再复查 `QuestionTodoBackgroundTaskRuntimeViewHostFactory`、`QuestionTodoBackgroundTaskRefreshHostAdapter`、`VisibleConversationPostSyncStateHostAdapter` 与 `QuestionTodoBackgroundTaskActivationHostAdapter` 的现有边界后，选择了一个低风险单一职责切片：**把 question/todo/background-task 的 runtime view-host + visible/refresh/activation service-bundle 实例化顺序，从 `OpenCodianView` 下沉到新的 `QuestionTodoBackgroundTaskRuntimeServiceBundle`。**

这样 `OpenCodianView` 不再直接维护：

- shared runtime view-host factory 的调用
- `VisibleConversationPostSyncStateCoordinator` 的实例化顺序
- `QuestionTodoActivationRefreshBridge` 的中间桥接持有
- refresh-side 与 activation-side coordinator bundle 的串接顺序

view 现在只提供 `QuestionTodoBackgroundTaskRuntimeViewHostFactoryHost` 的 grouped ports，并直接消费 `visibleConversationPostSyncCoordinator`、`backgroundConversationPostSyncHandoffCoordinator`、`questionTodoActivationRefreshCoordinator` 与 `backgroundTaskActivationIndicatorCoordinator` 四个最终 runtime coordinator。

## 1. 本轮范围

- `src/features/chat/services/QuestionTodoBackgroundTaskRuntimeServiceBundle.ts`
  - 新增轻量 service-bundle factory，顺序串起 runtime view host、visible-state services、refresh services 与 activation services
  - 把 `VisibleConversationPostSyncStateCoordinator` 与 `QuestionTodoActivationRefreshBridge` 保留为 bundle 内部依赖，不再让 `OpenCodianView` 直接持有
- `src/features/chat/OpenCodianView.ts`
  - 移除构造函数里三段 P2 service-bundle 的内联实例化顺序
  - 改为通过单一 `createQuestionTodoBackgroundTaskRuntimeServiceBundle(...)` 入口获取 conversation sync / activation wiring 所需 coordinator
- `tests/unit/features/chat/QuestionTodoBackgroundTaskRuntimeServiceBundle.test.ts`
  - 新增 focused coverage，验证 runtime view-host factory、visible-state services、refresh services 与 activation services 的装配顺序与依赖传递
- `docs/modules/features/chat/services/QuestionTodoBackgroundTaskRuntimeServiceBundle.md`
  - 新增模块文档，记录新的 P2 runtime service-bundle seam
- `docs/modules/features/chat/services/QuestionTodoBackgroundTaskRuntimeViewHostFactory.md`
  - 同步边界描述，说明后续 service-bundle instantiation 已交给新的 bundle factory

## 2. 变更文件

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/services/QuestionTodoBackgroundTaskRuntimeServiceBundle.ts`
- `tests/unit/features/chat/QuestionTodoBackgroundTaskRuntimeServiceBundle.test.ts`
- `docs/modules/features/chat/services/QuestionTodoBackgroundTaskRuntimeServiceBundle.md`
- `docs/modules/features/chat/services/QuestionTodoBackgroundTaskRuntimeViewHostFactory.md`
- `docs/status/maintainability-phase-306.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- tests/unit/features/chat/QuestionTodoBackgroundTaskRuntimeServiceBundle.test.ts tests/unit/features/chat/QuestionTodoBackgroundTaskRuntimeViewHostFactory.test.ts tests/unit/features/chat/QuestionTodoBackgroundTaskRefreshHostAdapter.test.ts tests/unit/features/chat/QuestionTodoBackgroundTaskActivationHostAdapter.test.ts tests/unit/features/chat/BackgroundConversationPostSyncHandoffHostAdapter.test.ts tests/unit/features/chat/VisibleConversationPostSyncStateHostAdapter.test.ts`
- `npm run build`

本轮 build 生成的 `BUILD_ID`：

- `autopilot-maintainability.202604131501`

本轮未执行全量 `npm test`。

原因：attempt `304` 不可被 `5` 整除，且改动未命中工作流列出的高风险路径（`src/main.ts`、`src/core/`、`automation/`、`package.json`、`package-lock.json`、`manifest.json`、`styles.css`、`esbuild.config.mjs`）。

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且用户未显式要求部署，因此按仓库规则在成功 build 后停止于构建验证。

## 5. 下一步建议

下一轮如果仍留在 P2，可复审 `createQuestionTodoBackgroundTaskRuntimeViewHostFactoryHost()` 里的四组 grouped ports，判断是否适合继续收束成一个更轻量的 late-bound host-provider facade，让 `OpenCodianView` 只保留 P2 runtime seam 的最终接线入口，而不再拥有整段 grouped port 闭包定义。

一句话总结第三百零六阶段本轮：

> 第三百零六阶段把 question/todo/background-task 的 visible post-sync / refresh / activation service-bundle instantiation 从 `OpenCodianView` 下沉到 `QuestionTodoBackgroundTaskRuntimeServiceBundle`，让 P2 post-sync/activation wiring 更接近单一职责装配边界。
