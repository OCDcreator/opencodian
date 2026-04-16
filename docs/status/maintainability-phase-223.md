# 可维护性改进：第二百二十三阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-222.md`
> **推进的 master-plan lane**: P2 `question / todo / background task`（question runtime host bridge ownership）

本轮继续遵循 master plan 与 lane map，先按 P2 首查顺序检查 `OpenCodianView` 中 question runtime host factory，再对照 `QuestionTodoStatusRefreshCoordinator`、`PostSyncQuestionTodoRefreshFacade`、`BackgroundTaskPostSyncCoordinator` 与现有 `QuestionRuntimeHostAdapter` / `SessionTodoHostAdapter` 模式。最终选择的单一切片是：**新增 `QuestionRuntimeViewHostAdapter`，把 `OpenCodianView.createQuestionRuntimeViewHost()` 里剩余的 dock/settings/OpenCode question API/status-refresh host bridge 下沉到 dedicated P2 helper。**

这次改动保持现有行为不变：`QuestionRuntimeHostAdapter` 仍然负责装配 question runtime bundle，`QuestionDockCoordinator` 仍然负责 pending-question refresh 与 resolve follow-up，`QuestionDockSlotCoordinator` 仍然负责 slot lifecycle。变化点只是把 view 里最后那段 question runtime host 拼装从直接闭包工厂改成专门的 adapter，继续减少 `OpenCodianView` 的 question wiring ownership。

## 1. 本轮范围

- `src/features/chat/services/QuestionRuntimeViewHostAdapter.ts`
  - 新增 dedicated host adapter，统一组合 view runtime host、`QuestionDockSlotCoordinator`、question display settings、OpenCode question API 与 session-status refresh
- `src/features/chat/OpenCodianView.ts`
  - 删除直接的 `createQuestionRuntimeViewHost()` question bridge
  - 改为只提供更窄的 `QuestionRuntimeViewHostAdapterHost`，并在构造阶段通过新 adapter 生成 `QuestionRuntimeHostAdapter` 所需的 `QuestionRuntimeViewHost`
- 测试
  - 新增 `tests/unit/features/chat/QuestionRuntimeViewHostAdapter.test.ts`
- 直接相关文档
  - 新增 `docs/modules/features/chat/services/QuestionRuntimeViewHostAdapter.md`
  - 更新 `docs/modules/features/chat/services/QuestionRuntimeHostAdapter.md`
  - 更新 `docs/modules/features/chat/OpenCodianView.md`

## 2. 变更文件

- `src/features/chat/services/QuestionRuntimeViewHostAdapter.ts`
- `src/features/chat/OpenCodianView.ts`
- `tests/unit/features/chat/QuestionRuntimeViewHostAdapter.test.ts`
- `docs/modules/features/chat/services/QuestionRuntimeViewHostAdapter.md`
- `docs/modules/features/chat/services/QuestionRuntimeHostAdapter.md`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/status/maintainability-phase-223.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- QuestionRuntimeViewHostAdapter QuestionRuntimeHostAdapter`
- `npm run build`

本轮未运行 `npm test` 全量套件：改动只涉及 `src/features/chat/**` 与直接相关测试/文档，且 attempt `218` 不属于 5 的倍数，不触发额外全量测试规则。

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），因此按仓库规则在成功 build 后停止于构建验证。

本轮构建 `BUILD_ID`：

- `autopilot-maintainability.202604130043`

## 5. 下一步建议

P2 question 子链里，`OpenCodianView` 仍然直接持有 question runtime 的 view-owned callback 集合（例如 active tab/runtime state、resolution-card gate 与 sync follow-up host）。**下一轮建议继续留在 P2，把这组剩余 callback host 再评估是否可以与 `QuestionRuntimeHostAdapter` 或其它 question runtime bundle 形成更稳定的 runtime facade，继续压薄 view 的 question assembly。**

一句话总结第二百二十三阶段本轮：

> 第二百二十三阶段新增 `QuestionRuntimeViewHostAdapter`，把 `OpenCodianView` 中剩余的 question runtime dock/settings/API/status host bridge 收束到 dedicated adapter，继续推进 master plan 的 P2 `question / todo / background task` ownership 迁移。
