# 可维护性改进：第二百七十六阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-275.md`
> **推进的 master-plan lane**: P2 `question / todo / background task` wiring 与 post-sync/activation 协调（shared question-resolution apply seam）

本轮继续遵循 master plan 与 lane map 的 P2 首查入口，选择一个高价值且低风险的单一职责切片：**把 `QuestionDockCoordinator` 与 `QuestionResolutionFlowCoordinator` 里重复的 execute-then-writeback 骨架下沉到共享的 `QuestionResolutionApplyFacade`。**

这样 dock 与 inline fallback 不再各自持有“执行 question reply/reject 后再写回 resolved state”的公共骨架；两条链路现在统一复用同一份 apply seam，只保留各自的 action 来源与 dock 专属的 pending-request 移除回调。

## 1. 本轮范围

- `src/features/chat/services/QuestionResolutionApplyFacade.ts`
  - 新增共享 apply facade，统一串联 `QuestionResolutionExecutionFacade.execute()` 与 `QuestionResolutionWritebackFacade.applyResolution()`
  - 支持透传 dock 专属的 `afterStateApplied` callback，让 pending request 仍在 follow-up 前移除
- `src/features/chat/services/QuestionDockCoordinator.ts`
  - 删除本地 execute-then-writeback 骨架，改为直接调用共享 `QuestionResolutionApplyFacade`
  - coordinator 依赖继续收窄，不再同时持有 execution 与 writeback 两个 port
- `src/features/chat/services/QuestionResolutionFlowCoordinator.ts`
  - 把 inline fallback 的 execution/writeback 串联改为调用共享 apply seam
  - coordinator 只保留 dock handoff、inline action collection 与 action-shape 组装
- `src/features/chat/services/QuestionRuntimeHostAdapter.ts`
  - 在 question runtime bundle 中装配共享 `QuestionResolutionApplyFacade`
  - 把同一份 apply seam 注入 dock 与 inline 两条 resolve 流程
- 测试
  - 新增 `tests/unit/features/chat/QuestionResolutionApplyFacade.test.ts`
  - 更新 `tests/unit/features/chat/QuestionDockCoordinator.test.ts`
  - 更新 `tests/unit/features/chat/QuestionResolutionFlowCoordinator.test.ts`
- 直接相关文档
  - 新增 `docs/modules/features/chat/services/QuestionResolutionApplyFacade.md`
  - 更新 `docs/modules/features/chat/services/QuestionDockCoordinator.md`
  - 更新 `docs/modules/features/chat/services/QuestionResolutionExecutionFacade.md`
  - 更新 `docs/modules/features/chat/services/QuestionResolutionFlowCoordinator.md`
  - 更新 `docs/modules/features/chat/services/QuestionResolutionWritebackFacade.md`
  - 更新 `docs/modules/features/chat/services/QuestionRuntimeHostAdapter.md`

## 2. 变更文件

- `src/features/chat/services/QuestionResolutionApplyFacade.ts`
- `src/features/chat/services/QuestionDockCoordinator.ts`
- `src/features/chat/services/QuestionResolutionFlowCoordinator.ts`
- `src/features/chat/services/QuestionRuntimeHostAdapter.ts`
- `tests/unit/features/chat/QuestionResolutionApplyFacade.test.ts`
- `tests/unit/features/chat/QuestionDockCoordinator.test.ts`
- `tests/unit/features/chat/QuestionResolutionFlowCoordinator.test.ts`
- `docs/modules/features/chat/services/QuestionResolutionApplyFacade.md`
- `docs/modules/features/chat/services/QuestionDockCoordinator.md`
- `docs/modules/features/chat/services/QuestionResolutionExecutionFacade.md`
- `docs/modules/features/chat/services/QuestionResolutionFlowCoordinator.md`
- `docs/modules/features/chat/services/QuestionResolutionWritebackFacade.md`
- `docs/modules/features/chat/services/QuestionRuntimeHostAdapter.md`
- `docs/status/maintainability-phase-276.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- QuestionResolutionApplyFacade QuestionDockCoordinator QuestionResolutionFlowCoordinator QuestionRuntimeHostAdapter`
- `npm run build`

本轮未执行全量 `npm test` 的原因：

- attempt `271` 不能被 `5` 整除
- 改动未命中仓库规则要求补跑全量测试的高风险路径（`src/main.ts`、`src/core/`、`automation/`、`package.json`、`package-lock.json`、`manifest.json`、`styles.css`、`esbuild.config.mjs`）

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且用户未显式要求部署，因此按仓库规则在成功 build 后停止于构建验证。

## 5. 下一步建议

下一轮可继续留在高优先级 P2，优先考虑把 `QuestionResolutionFlowCoordinator` 里剩余的 dock-handoff / inline-collection 分支再收束到更窄的 action-source seam，让 flow coordinator 更接近单纯的 question-dialog orchestration host。

一句话总结第二百七十六阶段本轮：

> 第二百七十六阶段把 dock 与 inline fallback 共用的 question execute-then-writeback 骨架从两个 coordinator 下沉到共享的 `QuestionResolutionApplyFacade`。
