# 可维护性改进：第三百零七阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-306.md`
> **推进的 master-plan lane**: P2 `question / todo / background task` wiring 与 post-sync/activation 协调（late-bound host-provider facade）

本轮继续遵循 master plan、lane map 与上一轮的 P2 首查顺序，先回到 `OpenCodianView` 里 question/todo/background-task runtime service bundle 的接线位置与 `createQuestionTodoBackgroundTaskRuntimeViewHostFactoryHost()` 片段，再复查 `QuestionTodoStatusRefreshCoordinator`、`PostSyncQuestionTodoRefreshFacade`、`BackgroundConversationPostSyncHandoffCoordinator` 与已有 host-adapter/factory 模式，最终选择了一个低风险单一职责切片：**把 `OpenCodianView` 里四组 grouped late-bound ports 的拼装，从 view 内联方法下沉到新的 `QuestionTodoBackgroundTaskRuntimeHostProvider` facade。**

这样 `OpenCodianView` 不再直接维护：

- `QuestionTodoBackgroundTaskRuntimeViewHostFactoryHost` 的四组 grouped port 闭包布局
- grouped port 到 shared runtime view-host factory 之间的中间适配层
- P2 runtime seam 与 grouped factory-host 契约的双重 owner 身份

view 现在只提供一份更扁平的 late-bound runtime seam；新的 host-provider 负责把它重新分组，再交给既有 `QuestionTodoBackgroundTaskRuntimeViewHostFactory` 与 `QuestionTodoBackgroundTaskRuntimeServiceBundle` 继续装配。

## 1. 本轮范围

- `src/features/chat/services/QuestionTodoBackgroundTaskRuntimeHostProvider.ts`
  - 新增薄 facade，把扁平的 P2 runtime seam 重新分组为 `QuestionTodoBackgroundTaskRuntimeViewHostFactoryHost`
- `src/features/chat/services/QuestionTodoBackgroundTaskRuntimeServiceBundle.ts`
  - 改为先经由新的 host-provider 适配，再调用既有 runtime view-host factory 与 service bundle 装配顺序
- `src/features/chat/OpenCodianView.ts`
  - 移除内联 grouped-port factory-host 方法，改为只提供扁平的 `QuestionTodoBackgroundTaskRuntimeHostProviderHost`
- `tests/unit/features/chat/QuestionTodoBackgroundTaskRuntimeHostProvider.test.ts`
  - 新增 focused coverage，验证 grouped port 重组与 late-bound collaborator 行为
- `tests/unit/features/chat/QuestionTodoBackgroundTaskRuntimeServiceBundle.test.ts`
  - 同步验证 bundle 现在会先经过 host-provider facade
- `docs/modules/features/chat/services/QuestionTodoBackgroundTaskRuntimeHostProvider.md`
  - 新增模块文档，记录新的 host-provider seam
- `docs/modules/features/chat/services/QuestionTodoBackgroundTaskRuntimeViewHostFactory.md`
  - 同步边界描述，说明 grouped ports 已改由 host-provider 负责
- `docs/modules/features/chat/services/QuestionTodoBackgroundTaskRuntimeServiceBundle.md`
  - 同步 bundle 输入边界，说明它现在消费的是更扁平的 runtime seam

## 2. 变更文件

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/services/QuestionTodoBackgroundTaskRuntimeHostProvider.ts`
- `src/features/chat/services/QuestionTodoBackgroundTaskRuntimeServiceBundle.ts`
- `tests/unit/features/chat/QuestionTodoBackgroundTaskRuntimeHostProvider.test.ts`
- `tests/unit/features/chat/QuestionTodoBackgroundTaskRuntimeServiceBundle.test.ts`
- `docs/modules/features/chat/services/QuestionTodoBackgroundTaskRuntimeHostProvider.md`
- `docs/modules/features/chat/services/QuestionTodoBackgroundTaskRuntimeViewHostFactory.md`
- `docs/modules/features/chat/services/QuestionTodoBackgroundTaskRuntimeServiceBundle.md`
- `docs/status/maintainability-phase-307.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- tests/unit/features/chat/QuestionTodoBackgroundTaskRuntimeHostProvider.test.ts tests/unit/features/chat/QuestionTodoBackgroundTaskRuntimeServiceBundle.test.ts tests/unit/features/chat/QuestionTodoBackgroundTaskRuntimeViewHostFactory.test.ts`
- `npm test`
- `npm run build`

本轮 build 生成的 `BUILD_ID`：

- `autopilot-maintainability.202604131514`

本轮执行全量 `npm test` 的原因：

- attempt `305` 可被 `5` 整除，命中仓库工作流的全量测试条件

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且用户未显式要求部署，因此按仓库规则在成功 build 后停止于构建验证。

## 5. 下一步建议

下一轮建议按 master plan 的更高优先级回到 P1，复查 `OpenCodianView` 里 activation / sync / runtime bridge 的 host-factory 区段，优先判断 `createTabActivationRuntimeViewHostFactoryHost()` 是否也适合采用类似的薄 host-provider seam，进一步削弱主集成点对 grouped runtime wiring 的 ownership。

一句话总结第三百零七阶段本轮：

> 第三百零七阶段把 question/todo/background-task runtime 的 grouped late-bound host ports 从 `OpenCodianView` 下沉到 `QuestionTodoBackgroundTaskRuntimeHostProvider`，让 P2 runtime seam 更接近单一职责 facade，并保持既有 view-host factory 与 service-bundle 行为不变。
