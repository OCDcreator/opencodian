# 可维护性改进：第二百二十二阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-221.md`
> **推进的 master-plan lane**: P2 `question / todo / background task`（question dock slot lifecycle / render-trigger ownership）

本轮继续遵循 master plan 与 lane map，优先留在 P2，并按 lane map 的首查顺序先检查 `OpenCodianView` 里的 question runtime host/wiring，再看既有 `QuestionRuntimeHostAdapter` / `QuestionDockCoordinator` 模式。最终选择的单一切片是：**新增 `QuestionDockSlotCoordinator`，把 `OpenCodianView` 里仍直接持有的 `QuestionDock` slot 创建/销毁、`questionCardPosition` 门控查询，以及 locale/activation/question UI refresh 的 dock render trigger 收束成 dedicated lifecycle coordinator。**

这次改动保持现有语义不变：真正的 pending-question refresh、dock callback、resolved follow-up 仍由 `QuestionDockCoordinator` 负责，`QuestionRuntimeHostAdapter` 仍负责装配 question runtime bundle。变化点只是把 view 内原本分散的 `questionDockMountEl` / `questionDock` 字段、`buildInputArea()` 中的手动 mount + render，以及多个 `renderQuestionDock()` 调用点下沉到专门的 slot coordinator，让 `OpenCodianView` 更接近 host assembly。

## 1. 本轮范围

- `src/features/chat/services/QuestionDockSlotCoordinator.ts`
  - 新增 dedicated slot coordinator，统一承接 question dock slot attach/destroy、dock instance 持有、render trigger 与 above-input 设置门控查询
- `src/features/chat/OpenCodianView.ts`
  - 改为持有 `QuestionDockSlotCoordinator`
  - `buildInputArea()` / `onClose()` / locale refresh / `refreshQuestionUi()` / activation bridge 全部改经由 slot coordinator 触发 dock lifecycle 与 render
  - `createQuestionRuntimeViewHost()` 改为从 slot coordinator 提供 `getQuestionDock()` 与 `shouldUseAboveInputQuestionDock()`
- 测试
  - 新增 `tests/unit/features/chat/QuestionDockSlotCoordinator.test.ts`
- 直接相关文档
  - 新增 `docs/modules/features/chat/services/QuestionDockSlotCoordinator.md`
  - 更新 `docs/modules/features/chat/services/QuestionRuntimeHostAdapter.md`
  - 更新 `docs/modules/features/chat/services/QuestionDockCoordinator.md`
  - 更新 `docs/modules/features/chat/OpenCodianView.md`

## 2. 变更文件

- `src/features/chat/services/QuestionDockSlotCoordinator.ts`
- `src/features/chat/OpenCodianView.ts`
- `tests/unit/features/chat/QuestionDockSlotCoordinator.test.ts`
- `docs/modules/features/chat/services/QuestionDockSlotCoordinator.md`
- `docs/modules/features/chat/services/QuestionRuntimeHostAdapter.md`
- `docs/modules/features/chat/services/QuestionDockCoordinator.md`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/status/maintainability-phase-222.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- QuestionDockSlotCoordinator QuestionDockCoordinator QuestionRuntimeHostAdapter`
- `npm run build`

本轮未运行 `npm test` 全量套件：本次改动只涉及 `src/features/chat/**` 与相关文档/测试，且 attempt `217` 不属于 5 的倍数，不触发额外全量测试规则。

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），因此按仓库规则在成功 build 后停止于构建验证。

本轮构建 `BUILD_ID`：

- `autopilot-maintainability.202604130034`

## 5. 下一步建议

P2 question 子链里，`OpenCodianView.createQuestionRuntimeViewHost()` 仍直接拼装 active tab/session、OpenCode question API、status refresh 与 question resolution-card gate 这组 question host 回调。**下一轮建议继续留在 P2，把 question runtime host 中剩余的 dock/question host bridge 再下沉到更专门的 host adapter 或 runtime bundle helper，继续减薄 `OpenCodianView` 的 question wiring。**

一句话总结第二百二十二阶段本轮：

> 第二百二十二阶段新增 `QuestionDockSlotCoordinator` 收束 `QuestionDock` 的 slot lifecycle、设置门控与 render trigger，把这段 question UI ownership 从 `OpenCodianView` 下沉到 dedicated coordinator，继续推进 master plan 的 P2 `question / todo / background task` ownership 迁移。
