# 可维护性改进：第二百七十七阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-276.md`
> **推进的 master-plan lane**: P2 `question / todo / background task` wiring 与 post-sync/activation 协调（question inline action-source seam）

本轮继续遵循 master plan 与 lane map 的 P2 首查入口，选择一个高价值且低风险的单一职责切片：**把 `QuestionResolutionFlowCoordinator` 内联持有的 inline question action 收集与 action-shape 组装下沉到独立的 `QuestionInlineResolutionActionFacade`。**

这样 `QuestionResolutionFlowCoordinator` 只再负责“dock 是否接管”与“inline 分支是否拿到统一 execution action”的编排，不再同时持有 `questionDisplayMode` 读取、`QuestionInlineCardRenderer.collectAction()` 调用与 reply/reject action 组装。

## 1. 本轮范围

- `src/features/chat/services/QuestionInlineResolutionActionFacade.ts`
  - 新增 inline action-source seam，统一读取 `questionDisplayMode`
  - 集中调用 `QuestionInlineCardRenderer.collectAction()` 并把 inline `reply` / `reject` 映射为 `QuestionResolutionExecutionAction`
  - 统一承接 inline question card 无法挂载时的错误日志
- `src/features/chat/services/QuestionResolutionFlowCoordinator.ts`
  - 删除内联的 display-mode 读取、inline action 收集与 reply/reject action 组装
  - coordinator 仅保留 dock handoff 与 shared apply seam 编排
- `src/features/chat/services/QuestionRuntimeHostAdapter.ts`
  - 在 question runtime hosts/services 中装配新的 inline action-source seam
  - 把 `QuestionResolutionFlowCoordinator` 的 inline 分支改为消费 `QuestionInlineResolutionActionFacade`
- 测试
  - 新增 `tests/unit/features/chat/QuestionInlineResolutionActionFacade.test.ts`
  - 更新 `tests/unit/features/chat/QuestionResolutionFlowCoordinator.test.ts`
  - 更新 `tests/unit/features/chat/QuestionRuntimeHostAdapter.test.ts`
- 直接相关文档
  - 新增 `docs/modules/features/chat/services/QuestionInlineResolutionActionFacade.md`
  - 更新 `docs/modules/features/chat/services/QuestionResolutionFlowCoordinator.md`
  - 更新 `docs/modules/features/chat/services/QuestionRuntimeHostAdapter.md`

## 2. 变更文件

- `src/features/chat/services/QuestionInlineResolutionActionFacade.ts`
- `src/features/chat/services/QuestionResolutionFlowCoordinator.ts`
- `src/features/chat/services/QuestionRuntimeHostAdapter.ts`
- `tests/unit/features/chat/QuestionInlineResolutionActionFacade.test.ts`
- `tests/unit/features/chat/QuestionResolutionFlowCoordinator.test.ts`
- `tests/unit/features/chat/QuestionRuntimeHostAdapter.test.ts`
- `docs/modules/features/chat/services/QuestionInlineResolutionActionFacade.md`
- `docs/modules/features/chat/services/QuestionResolutionFlowCoordinator.md`
- `docs/modules/features/chat/services/QuestionRuntimeHostAdapter.md`
- `docs/status/maintainability-phase-277.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- QuestionInlineResolutionActionFacade QuestionResolutionFlowCoordinator QuestionRuntimeHostAdapter`
- `npm run build`

本轮未执行全量 `npm test` 的原因：

- attempt `272` 不能被 `5` 整除
- 改动未命中仓库规则要求补跑全量测试的高风险路径（`src/main.ts`、`src/core/`、`automation/`、`package.json`、`package-lock.json`、`manifest.json`、`styles.css`、`esbuild.config.mjs`）

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且用户未显式要求部署，因此按仓库规则在成功 build 后停止于构建验证。

## 5. 下一步建议

下一轮可继续留在高优先级 P2，优先考虑把 `QuestionResolutionFlowCoordinator` 里剩余的 dock handoff 判定进一步收束到更窄的 dialog-source/entry seam，或转向同链路里仍在 view/host adapter 间分散的 question activation/post-sync wiring。

一句话总结第二百七十七阶段本轮：

> 第二百七十七阶段把 inline question fallback 的 action 来源与 reply/reject 组装从 `QuestionResolutionFlowCoordinator` 下沉到新的 `QuestionInlineResolutionActionFacade`。
