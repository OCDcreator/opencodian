# 可维护性改进：第二百二十四阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-223.md`
> **推进的 master-plan lane**: P2 `question / todo / background task`（question runtime stable port reuse）

本轮继续遵循 master plan 与 lane map，先按 P2 首查顺序检查 `OpenCodianView` 中 question runtime host factory，再对照 `QuestionTodoStatusRefreshCoordinator`、`PostSyncQuestionTodoRefreshFacade`、`BackgroundTaskPostSyncCoordinator` 与现有 `QuestionRuntimeHostAdapter` / `QuestionRuntimeViewHostAdapter` 模式。最终选择的单一切片是：**收窄 `QuestionRuntimeViewHostAdapterHost`，把 question runtime 仍经由 view 包装的 resolution-card gate、tab attention 写回与 sync follow-up，改为直接复用已有 settings、`TabRuntimeStateBridge` 与 `ConversationSyncBridge` stable port。**

这次改动保持现有行为不变：`QuestionDockCoordinator` 仍然负责 pending-question queue、dock resolve 与 follow-up 调度，`QuestionRuntimeHostAdapter` 仍然负责 runtime bundle 装配，`QuestionRuntimeViewHostAdapter` 仍然负责把 view/runtime 依赖拼成 `QuestionRuntimeViewHost`。变化点只是把 adapter 里原本还要求 `OpenCodianView` 继续包一层的稳定能力，改为直接从现成 runtime/service port 读取，继续压薄 view 的 question assembly ownership。

## 1. 本轮范围

- `src/features/chat/services/QuestionRuntimeViewHostAdapter.ts`
  - 扩展 settings port，直接读取 `showAnsweredQuestionCards`
  - 新增对 `TabRuntimeStateBridge` 风格 attention port 与 `ConversationSyncBridge` 风格 sync port 的消费
  - 删除 adapter 对 view host 中 resolution-card gate、tab attention、sync follow-up callback 的依赖
- `src/features/chat/OpenCodianView.ts`
  - `createQuestionRuntimeViewHostAdapterHost()` 收窄为只暴露 active tab / runtime state / session / scroll pin 读取
  - question runtime 装配改为直接把 `tabRuntimeStateBridge` 与 `conversationSyncBridge` 传给 adapter
- 测试
  - 更新 `tests/unit/features/chat/QuestionRuntimeViewHostAdapter.test.ts`，覆盖新的 stable port 依赖与可变设置读取
- 直接相关文档
  - 更新 `docs/modules/features/chat/services/QuestionRuntimeViewHostAdapter.md`
  - 更新 `docs/modules/features/chat/services/QuestionRuntimeHostAdapter.md`
  - 更新 `docs/modules/features/chat/OpenCodianView.md`

## 2. 变更文件

- `src/features/chat/services/QuestionRuntimeViewHostAdapter.ts`
- `src/features/chat/OpenCodianView.ts`
- `tests/unit/features/chat/QuestionRuntimeViewHostAdapter.test.ts`
- `docs/modules/features/chat/services/QuestionRuntimeViewHostAdapter.md`
- `docs/modules/features/chat/services/QuestionRuntimeHostAdapter.md`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/status/maintainability-phase-224.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- QuestionRuntimeViewHostAdapter QuestionRuntimeHostAdapter`
- `npm run build`

本轮未运行 `npm test` 全量套件：改动只涉及 `src/features/chat/**`、直接相关测试与文档，且 attempt `219` 不属于 5 的倍数，不触发额外全量测试规则。

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），因此按仓库规则在成功 build 后停止于构建验证。

本轮构建 `BUILD_ID`：

- `autopilot-maintainability.202604130051`

## 5. 下一步建议

P2 question 子链里，`QuestionRuntimeViewHostAdapterHost` 已经缩窄到 tab/runtime 读取与 scroll pin。**下一轮建议继续留在 P2，评估 `QuestionDockCoordinator` resolve follow-up 与 inline resolution 是否还能共享一个更明确的 post-resolution runtime facade，从而继续减少 question bundle 内部对 sync/status follow-up 细节的分散持有。**

一句话总结第二百二十四阶段本轮：

> 第二百二十四阶段让 `QuestionRuntimeViewHostAdapter` 直接复用 settings、`TabRuntimeStateBridge` 与 `ConversationSyncBridge` stable port，收窄 `OpenCodianView` 剩余的 question runtime callback host，继续推进 master plan 的 P2 ownership 迁移。
