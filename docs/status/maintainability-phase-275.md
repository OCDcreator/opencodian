# 可维护性改进：第二百七十五阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-274.md`
> **推进的 master-plan lane**: P2 `question / todo / background task` wiring 与 post-sync/activation 协调（shared question resolution execution/error-notice seam）

本轮继续遵循 master plan 与 lane map 的 P2 首查入口，选择一个高价值且低风险的单一职责切片：**把 `QuestionDockCoordinator` 与 `QuestionResolutionFlowCoordinator` 里重复的 question reply/reject 执行与错误 notice 下沉到共享的 `QuestionResolutionExecutionFacade`。**

这样 dock 与 inline fallback 不再各自持有 `replyToQuestion()` / `rejectQuestion()` 的 try/catch、error logger 与 `chat.question.notice.error` 提示；两条链路现在统一复用同一份 execution seam，只保留各自的 action 来源与 writeback 顺序。

## 1. 本轮范围

- `src/features/chat/services/QuestionResolutionExecutionFacade.ts`
  - 新增共享 execution facade，统一 question `reply` / `reject` API 调用、错误 logger、notice 与成功后的 `QuestionResolution` 回传
- `src/features/chat/services/QuestionDockResolutionActionFacade.ts`
  - 把 dock submit/reject 的 answered/rejected action shape 改为复用共享 execution action helper
- `src/features/chat/services/QuestionDockCoordinator.ts`
  - 删除本地 question API try/catch，改为调用共享 `QuestionResolutionExecutionFacade`
  - host 依赖继续收窄，不再直接持有 `replyToQuestion()` / `rejectQuestion()`
- `src/features/chat/services/QuestionResolutionFlowCoordinator.ts`
  - 把 inline fallback 的 `reply` / `reject` 执行改为调用共享 execution facade
  - host 依赖收窄，只保留 active-tab 与 display-mode 读取
- `src/features/chat/services/QuestionRuntimeHostAdapter.ts`
  - 新增 `resolutionExecutionHost`
  - 在 question runtime bundle 中装配共享 `QuestionResolutionExecutionFacade`，并把它接到 dock 与 inline 两条 resolve 流程
- 测试
  - 新增 `tests/unit/features/chat/QuestionResolutionExecutionFacade.test.ts`
  - 更新 `tests/unit/features/chat/QuestionDockCoordinator.test.ts`
  - 更新 `tests/unit/features/chat/QuestionResolutionFlowCoordinator.test.ts`
  - 更新 `tests/unit/features/chat/QuestionRuntimeHostAdapter.test.ts`
- 直接相关文档
  - 新增 `docs/modules/features/chat/services/QuestionResolutionExecutionFacade.md`
  - 更新 `docs/modules/features/chat/services/QuestionDockCoordinator.md`
  - 更新 `docs/modules/features/chat/services/QuestionDockResolutionActionFacade.md`
  - 更新 `docs/modules/features/chat/services/QuestionResolutionFlowCoordinator.md`
  - 更新 `docs/modules/features/chat/services/QuestionRuntimeHostAdapter.md`

## 2. 变更文件

- `src/features/chat/services/QuestionResolutionExecutionFacade.ts`
- `src/features/chat/services/QuestionDockResolutionActionFacade.ts`
- `src/features/chat/services/QuestionDockCoordinator.ts`
- `src/features/chat/services/QuestionResolutionFlowCoordinator.ts`
- `src/features/chat/services/QuestionRuntimeHostAdapter.ts`
- `tests/unit/features/chat/QuestionResolutionExecutionFacade.test.ts`
- `tests/unit/features/chat/QuestionDockCoordinator.test.ts`
- `tests/unit/features/chat/QuestionResolutionFlowCoordinator.test.ts`
- `tests/unit/features/chat/QuestionRuntimeHostAdapter.test.ts`
- `docs/modules/features/chat/services/QuestionResolutionExecutionFacade.md`
- `docs/modules/features/chat/services/QuestionDockCoordinator.md`
- `docs/modules/features/chat/services/QuestionDockResolutionActionFacade.md`
- `docs/modules/features/chat/services/QuestionResolutionFlowCoordinator.md`
- `docs/modules/features/chat/services/QuestionRuntimeHostAdapter.md`
- `docs/status/maintainability-phase-275.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- QuestionResolutionExecutionFacade QuestionDockCoordinator QuestionResolutionFlowCoordinator QuestionRuntimeHostAdapter`
- `npm test`
- `npm run build`

本轮执行全量测试的原因：

- attempt `270` 可以被 `5` 整除，因此按仓库规则在 targeted suites 之后补跑 `npm test`

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且用户未显式要求部署，因此按仓库规则在成功 build 后停止于构建验证。

## 5. 下一步建议

下一轮可继续留在高优先级 P2，优先考虑把 `QuestionDockCoordinator` 与 `QuestionResolutionFlowCoordinator` 里仍重复的“execution 成功后调用 `QuestionResolutionWritebackFacade.applyResolution()`”骨架再收束到共享 apply seam，让两条链路只保留 action 来源差异。

一句话总结第二百七十五阶段本轮：

> 第二百七十五阶段把 dock 与 inline fallback 共用的 question reply/reject 执行与错误 notice 从两个 coordinator 下沉到共享的 `QuestionResolutionExecutionFacade`。
