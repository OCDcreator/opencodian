# 可维护性改进：第二百八十九阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-288.md`
> **推进的 master-plan lane**: P2 `question / todo / background task` wiring 与 post-sync/activation 协调（shared view-host pass-through cleanup）

本轮继续遵循 master plan 与 lane map 的 P2 首查入口，选择一个高价值且低风险的单一职责切片：**删除只负责派生 activation/refresh 两个 adapter host 的 `QuestionTodoBackgroundTaskViewHostFactory` pass-through layer，让 `OpenCodianView` 直接把同一份 shared question/todo/background-task view host 交给 activation 与 refresh adapter。**

这样 activation/open 侧的 `QuestionTodoBackgroundTaskActivationHostAdapter` 与 post-sync 侧的 `QuestionTodoBackgroundTaskRefreshHostAdapter` 仍共享同一份 current-conversation/runtime/background-task writeback seam，但不再通过额外的中间 factory 转发；真正的 dock、todo/status、post-sync、background-task handoff 规则仍分别留在已有 dedicated adapter/coordinator 中。

## 1. 本轮范围

- `src/features/chat/OpenCodianView.ts`
  - 删除 `createQuestionTodoBackgroundTaskViewHostFactoryHost()` 调用链
  - 新增构造期共享的 `QuestionTodoBackgroundTaskViewHost` seam，并把同一 host 对象直接传给 activation 与 refresh adapter
  - 移除 `QuestionTodoBackgroundTaskViewHostFactory` import
- `src/features/chat/services/QuestionTodoBackgroundTaskViewHostFactory.ts`
  - 删除只剩 pass-through 派生职责的 shared-host factory
- 测试
  - 删除已无对应模块边界的 `QuestionTodoBackgroundTaskViewHostFactory` focused suite
  - 保留并运行 activation/refresh host adapter coverage，验证两侧 adapter/service bundle 行为未变
- 直接相关文档
  - 删除 `QuestionTodoBackgroundTaskViewHostFactory` 模块文档
  - 更新 `OpenCodianView`、activation host adapter 与 refresh host adapter 文档，说明现在是 direct shared host seam

## 2. 变更文件

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/services/QuestionTodoBackgroundTaskViewHostFactory.ts`（删除）
- `tests/unit/features/chat/QuestionTodoBackgroundTaskViewHostFactory.test.ts`（删除）
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/features/chat/services/QuestionTodoBackgroundTaskActivationHostAdapter.md`
- `docs/modules/features/chat/services/QuestionTodoBackgroundTaskRefreshHostAdapter.md`
- `docs/modules/features/chat/services/QuestionTodoBackgroundTaskViewHostFactory.md`（删除）
- `docs/status/maintainability-phase-289.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- QuestionTodoBackgroundTaskActivationHostAdapter QuestionTodoBackgroundTaskRefreshHostAdapter`
- `npm run build`

本轮 build 生成的 `BUILD_ID`：

- `autopilot-maintainability.202604131215`

本轮未执行全量 `npm test`。

原因：attempt `287` 不能被 `5` 整除，且改动未命中仓库规则中要求全量测试的 high-risk 路径（`src/main.ts`、`src/core/`、`automation/`、`package.json`、`package-lock.json`、`manifest.json`、`styles.css` 或 `esbuild.config.mjs`）。

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且用户未显式要求部署，因此按仓库规则在成功 build 后停止于构建验证。

## 5. 下一步建议

下一轮建议继续从 P2 首查入口出发，复审 `OpenCodianView` 里 question resolution / todo stale notice / background-task follow-up 的 runtime ownership；若没有同等级 pass-through seam，可优先寻找仍由 view 持有的状态写回或 UI follow-up 编排，而不是继续拆已经足够窄的 post-sync router/handoff 边界。

一句话总结第二百八十九阶段本轮：

> 第二百八十九阶段删除 `QuestionTodoBackgroundTaskViewHostFactory` pass-through layer，让 activation 与 refresh adapter 直接共享 `OpenCodianView` 提供的 question/todo/background-task view host，并保留既有 coordinator 行为。
