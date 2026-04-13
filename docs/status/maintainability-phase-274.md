# 可维护性改进：第二百七十四阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-273.md`
> **推进的 master-plan lane**: P2 `question / todo / background task` wiring 与 post-sync/activation 协调（question dock resolution-action seam）

本轮继续遵循 master plan 与 lane map 的 P2 首查入口，选择一个高价值且低风险的单一职责切片：**把 `QuestionDockCoordinator` 中剩余的 dock submit/reject answer collection、required-answer notice gating 与 answered/rejected action branching 下沉到 dedicated `QuestionDockResolutionActionFacade`。**

这样 `QuestionDockCoordinator` 不再直接负责从 dock runtime 读取并 sanitize draft answers、判断 required answer 是否缺失，或分支组装 answered/rejected resolution action；它现在消费独立 resolution-action seam 产出的 `skip` / `answer-required` / `reply` / `reject` 结果，再继续专注于真实 API 调用、queue/writeback 顺序与错误 notice。

## 1. 本轮范围

- `src/features/chat/services/QuestionDockResolutionActionFacade.ts`
  - 新增 dedicated dock resolution-action facade，统一解析 active pending request、draft answer sanitize、required-answer gating 与 submit/reject action assembly
- `src/features/chat/services/QuestionDockCoordinator.ts`
  - 把 dock submit/reject action branching 改为转交 `QuestionDockResolutionActionFacade`
  - host 依赖收窄，不再直接持有 dock runtime-state 读取或多余的 attention callback
- `src/features/chat/services/QuestionRuntimeHostAdapter.ts`
  - 新增 `dockResolutionActionHost`
  - 装配 `QuestionDockResolutionActionFacade`，并把它接入 `QuestionDockCoordinator`
- 测试
  - 新增 `tests/unit/features/chat/QuestionDockResolutionActionFacade.test.ts`
  - 更新 `tests/unit/features/chat/QuestionDockCoordinator.test.ts`
  - 更新 `tests/unit/features/chat/QuestionRuntimeHostAdapter.test.ts`
- 直接相关文档
  - 新增 `docs/modules/features/chat/services/QuestionDockResolutionActionFacade.md`
  - 更新 `docs/modules/features/chat/services/QuestionDockCoordinator.md`
  - 更新 `docs/modules/features/chat/services/QuestionRuntimeHostAdapter.md`

## 2. 变更文件

- `src/features/chat/services/QuestionDockResolutionActionFacade.ts`
- `src/features/chat/services/QuestionDockCoordinator.ts`
- `src/features/chat/services/QuestionRuntimeHostAdapter.ts`
- `tests/unit/features/chat/QuestionDockResolutionActionFacade.test.ts`
- `tests/unit/features/chat/QuestionDockCoordinator.test.ts`
- `tests/unit/features/chat/QuestionRuntimeHostAdapter.test.ts`
- `docs/modules/features/chat/services/QuestionDockResolutionActionFacade.md`
- `docs/modules/features/chat/services/QuestionDockCoordinator.md`
- `docs/modules/features/chat/services/QuestionRuntimeHostAdapter.md`
- `docs/status/maintainability-phase-274.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- QuestionDockResolutionActionFacade QuestionDockCoordinator QuestionRuntimeHostAdapter`
- `npm run build`

本轮未执行 `npm test` 全量套件。

原因：

- attempt `269` 不能被 `5` 整除
- 改动未命中仓库约定的 full-test 高风险路径（`src/main.ts`、`src/core/`、`automation/`、`package.json`、`package-lock.json`、`manifest.json`、`styles.css`、`esbuild.config.mjs`）

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且用户未显式要求部署，因此按仓库规则在成功 build 后停止于构建验证。

## 5. 下一步建议

下一轮可继续留在高优先级 P2，优先考虑把 `QuestionDockCoordinator` 与 `QuestionResolutionFlowCoordinator` 中仍重复的 question API execute/error-notice 分支收束到共享 resolution execution seam，让 dock 与 inline fallback 更接近共用一套执行/报错骨架。

一句话总结第二百七十四阶段本轮：

> 第二百七十四阶段把 question dock 的 submit/reject action assembly 从 `QuestionDockCoordinator` 下沉到独立的 `QuestionDockResolutionActionFacade`。
