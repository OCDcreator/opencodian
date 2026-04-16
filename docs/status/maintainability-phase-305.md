# 可维护性改进：第三百零五阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-304.md`
> **推进的 master-plan lane**: P2 `question / todo / background task` wiring 与 post-sync/activation 协调（grouped runtime view-host factory seam）

本轮遵循 master plan、lane map 与上一轮的 P2 首查顺序，先回到 `OpenCodianView` 里的 `createQuestionTodoBackgroundTaskViewHost()` 与相邻 activation / post-sync wiring，再检查 `QuestionTodoStatusRefreshCoordinator`、`PostSyncQuestionTodoRefreshFacade`、`BackgroundConversationPostSyncHandoffCoordinator` 以及现有 host-adapter 模式后，选择了一个低风险单一职责切片：**把 question / todo / background-task 共享的 runtime view-host 装配从 `OpenCodianView` 下沉到新的 `QuestionTodoBackgroundTaskRuntimeViewHostFactory`。**

这样 `OpenCodianView` 不再同时维护：

- 共享的 question/todo/background-task base host
- refresh-side adapter 依赖装配
- background handoff adapter 依赖装配
- activation-side adapter 依赖装配

view 现在只提供 grouped 的 conversation state、question/todo refresh runtime、activation writeback 与 background-task runtime 四组 late-bound port；factory 负责把这些 port 重组成 `VisibleConversationPostSyncStateHostAdapter`、`QuestionTodoBackgroundTaskRefreshHostAdapter`、`BackgroundConversationPostSyncHandoffHostAdapter` 与 `QuestionTodoBackgroundTaskActivationHostAdapter` 需要的共享 seam，同时保留既有 visible post-sync、background handoff 与 activation refresh 行为。

## 1. 本轮范围

- `src/features/chat/services/QuestionTodoBackgroundTaskRuntimeViewHostFactory.ts`
  - 新增 grouped runtime view-host factory，从四组 late-bound port 组合出 visible-state、refresh、background handoff 与 activation 四份共享 view host
  - 保持 late-bound getter 行为，避免构造期过早绑定 question dock、session todo、background indicator/live-signal 与 tab-runtime bridge
- `src/features/chat/OpenCodianView.ts`
  - 移除内联 `createQuestionTodoBackgroundTaskViewHost()` 与三段 adapter 装配
  - 改为只提供 `QuestionTodoBackgroundTaskRuntimeViewHostFactoryHost`，并复用 factory 输出继续实例化既有 refresh / activation service bundle
- `tests/unit/features/chat/QuestionTodoBackgroundTaskRuntimeViewHostFactory.test.ts`
  - 新增 focused coverage，覆盖 grouped port 转发与 late-bound port 替换
- `docs/modules/features/chat/services/QuestionTodoBackgroundTaskRuntimeViewHostFactory.md`
  - 新增模块文档，记录新的 P2 runtime host seam
- `docs/modules/features/chat/services/QuestionTodoBackgroundTaskActivationHostAdapter.md`
- `docs/modules/features/chat/services/QuestionTodoBackgroundTaskRefreshHostAdapter.md`
- `docs/modules/features/chat/services/BackgroundConversationPostSyncHandoffHostAdapter.md`
- `docs/modules/features/chat/services/VisibleConversationPostSyncStateHostAdapter.md`
  - 同步边界描述，改为由新 factory 提供共享 view host，而不是继续写成 `OpenCodianView` 直接内联装配

## 2. 变更文件

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/services/QuestionTodoBackgroundTaskRuntimeViewHostFactory.ts`
- `tests/unit/features/chat/QuestionTodoBackgroundTaskRuntimeViewHostFactory.test.ts`
- `docs/modules/features/chat/services/QuestionTodoBackgroundTaskRuntimeViewHostFactory.md`
- `docs/modules/features/chat/services/QuestionTodoBackgroundTaskActivationHostAdapter.md`
- `docs/modules/features/chat/services/QuestionTodoBackgroundTaskRefreshHostAdapter.md`
- `docs/modules/features/chat/services/BackgroundConversationPostSyncHandoffHostAdapter.md`
- `docs/modules/features/chat/services/VisibleConversationPostSyncStateHostAdapter.md`
- `docs/status/maintainability-phase-305.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- tests/unit/features/chat/QuestionTodoBackgroundTaskRuntimeViewHostFactory.test.ts tests/unit/features/chat/QuestionTodoBackgroundTaskActivationHostAdapter.test.ts tests/unit/features/chat/QuestionTodoBackgroundTaskRefreshHostAdapter.test.ts tests/unit/features/chat/BackgroundConversationPostSyncHandoffHostAdapter.test.ts tests/unit/features/chat/VisibleConversationPostSyncStateHostAdapter.test.ts`
- `npm run build`

本轮 build 生成的 `BUILD_ID`：

- `autopilot-maintainability.202604131451`

本轮未执行全量 `npm test`。

原因：attempt `303` 不可被 `5` 整除，且改动未命中工作流列出的高风险路径（`src/main.ts`、`src/core/`、`automation/`、`package.json`、`package-lock.json`、`manifest.json`、`styles.css`、`esbuild.config.mjs`）。

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且用户未显式要求部署，因此按仓库规则在成功 build 后停止于构建验证。

## 5. 下一步建议

下一轮仍建议留在 P2，但把切口收窄到 service-bundle 装配：复审 `createVisibleConversationPostSyncStateServices(...)`、`createQuestionTodoBackgroundTaskRefreshServices(...)` 与 `createQuestionTodoBackgroundTaskActivationServices(...)` 这段顺序依赖，判断是否适合新增一个轻量 factory/facade，把 visible post-sync state / refresh / activation 三段实例化顺序从 `OpenCodianView` 再收束一层，同时保持各 coordinator 的业务边界不变。

一句话总结第三百零五阶段本轮：

> 第三百零五阶段把 question/todo/background-task 共享的 runtime view-host assembly 从 `OpenCodianView` 下沉到 `QuestionTodoBackgroundTaskRuntimeViewHostFactory`，让 P2 activation / post-sync wiring 更接近单一职责边界。
