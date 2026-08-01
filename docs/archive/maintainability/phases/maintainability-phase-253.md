# 可维护性改进：第二百五十三阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-252.md`
> **推进的 master-plan lane**: P3 `context / composer / retained-selection`（send-preparation composer context port）

本轮继续遵循 lane map 的 P3 首查入口，从 `OpenCodianView` 的 composer/context send-preparation seam、`ComposerContextViewFacade` 与 `MessageSendPreparationService` 进入，只复审上一轮建议的 draft-context send 依赖，没有重新广扫 context catalog、chips、picker lifecycle 或 retained-selection runtime。

确认的低风险问题是：上一轮已经用 `ComposerContextViewFacade` 收敛了 view-facing composer/context service fan-out，但 `MessageSendPreparationService` 仍通过 host 逐项暴露 `getDraftContextItems()` / `clearDraftContextItems()`，让 send-preparation helper 继续知道完整 composer facade 的两个具体方法。行为稳定，问题主要在发送链路的依赖端口仍偏散。

因此本轮只做一个窄切片：**在 `ComposerContextViewFacade` 上新增 `ComposerSendContextPort`，让 send-preparation 只消费发送前需要的 draft-context 端口。** `OpenCodianView` 的 send-preparation host 现在传入 `composerSendContext: this.composerContextViewFacade.sendContext`，`MessageSendPreparationService` 不再要求 view host 单独提供 draft-context getter / clearer；composer actions、picker、focus preview 与 lifecycle 入口保持在完整 facade 上，发送行为与清理时序保持不变。

## 1. 本轮范围

- `src/features/chat/services/ComposerContextViewFacade.ts`
  - 新增 `ComposerSendContextPort`
  - 将 draft-context 读取 / 清空收敛到 `sendContext` 子端口
- `src/features/chat/services/MessageSendPreparationService.ts`
  - 将 host contract 从两个 draft-context 方法改为一个 `composerSendContext` port
  - 保持 optimistic user message 构造与 stream-start 清理时序不变
- `src/features/chat/OpenCodianView.ts`
  - send-preparation host 改为传入 `composerContextViewFacade.sendContext`
  - 移除 view 层针对 draft-context getter / clearer 的两条独立转发
- 测试
  - 更新 `tests/unit/features/chat/ComposerContextHostAdapter.test.ts`
  - 更新 `tests/unit/features/chat/MessageSendPreparationService.test.ts`
- 直接相关文档
  - 更新 `docs/modules/features/chat/services/ComposerContextViewFacade.md`
  - 更新 `docs/modules/features/chat/services/MessageSendPreparationService.md`

## 2. 变更文件

- `src/features/chat/services/ComposerContextViewFacade.ts`
- `src/features/chat/services/MessageSendPreparationService.ts`
- `src/features/chat/OpenCodianView.ts`
- `tests/unit/features/chat/ComposerContextHostAdapter.test.ts`
- `tests/unit/features/chat/MessageSendPreparationService.test.ts`
- `docs/modules/features/chat/services/ComposerContextViewFacade.md`
- `docs/modules/features/chat/services/MessageSendPreparationService.md`
- `docs/status/maintainability-phase-253.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- MessageSendPreparationService ComposerContextHostAdapter`
- `npm run build`

本轮构建 `BUILD_ID`：

- `autopilot-maintainability.202604130539`

本轮未执行完整 `npm test` 的原因：

- attempt `248` 不能被 `5` 整除
- 改动未命中仓库规则中的高风险路径（`src/main.ts`、`src/core/`、`automation/`、`package.json`、`package-lock.json`、`manifest.json`、`styles.css`、`esbuild.config.mjs`）

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且用户未显式要求部署，因此按仓库规则在成功 build 后停止于构建验证。

## 5. 下一步建议

下一轮建议优先回到 master-plan 当前更高优先级的 P2 `question / todo / background task` 链路，从 lane map 的 P2 首查入口复审 question/todo/background-task host factory 与 post-sync/activation 协调区段，寻找一个同样低风险的 facade / coordinator 端口收口切片。

一句话总结第二百五十三阶段本轮：

> 第二百五十三阶段为 composer/context facade 增加了 `ComposerSendContextPort`，让 `MessageSendPreparationService` 只消费发送前需要的 draft-context 端口，同时保持 optimistic send 与 stream-start 清理行为不变。
