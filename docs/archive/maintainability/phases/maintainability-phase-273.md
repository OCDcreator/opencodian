# 可维护性改进：第二百七十三阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-272.md`
> **推进的 master-plan lane**: P2 `question / todo / background task` wiring 与 post-sync/activation 协调（question dock render-state seam）

本轮继续遵循 master plan 与 lane map 的 P2 首查入口，选择一个高价值且低风险的单一职责切片：**把 `QuestionDockCoordinator` 中剩余的 above-input / active-tab / active-request / session-match dock render gating 下沉到 dedicated `QuestionDockRenderStateFacade`。**

这样 `QuestionDockCoordinator` 不再直接负责决定当前 dock 应渲染 active request、空 dock，还是保留竞态下的现有 UI；它现在消费独立 render-state seam 产出的 `active` / `empty` / `skip` 结果，再继续专注于 dock callbacks、queue writeback 与 resolution assembly。

## 1. 本轮范围

- `src/features/chat/services/QuestionDockRenderStateFacade.ts`
  - 新增 dedicated render-state facade，统一解析 above-input dock enablement、active tab、active pending request、session match 与 runtime disappearance guard
- `src/features/chat/services/QuestionDockCoordinator.ts`
  - 把 dock render gating 与 active pending request 选择改为转交 `QuestionDockRenderStateFacade`
  - host 依赖收窄，不再直接持有 current conversation session port
- `src/features/chat/services/QuestionRuntimeHostAdapter.ts`
  - 新增 `dockRenderStateHost`
  - 装配 `QuestionDockRenderStateFacade`，并把它作为 dock coordinator 的 render-state seam
- 测试
  - 新增 `tests/unit/features/chat/QuestionDockRenderStateFacade.test.ts`
  - 更新 `tests/unit/features/chat/QuestionDockCoordinator.test.ts`
  - 更新 `tests/unit/features/chat/QuestionRuntimeHostAdapter.test.ts`
- 直接相关文档
  - 新增 `docs/modules/features/chat/services/QuestionDockRenderStateFacade.md`
  - 更新 `docs/modules/features/chat/services/QuestionDockCoordinator.md`
  - 更新 `docs/modules/features/chat/services/QuestionRuntimeHostAdapter.md`
  - 更新 `docs/modules/features/chat/services/QuestionDockRenderAdapter.md`
  - 更新 `docs/modules/features/chat/services/QuestionDockSlotCoordinator.md`

## 2. 变更文件

- `src/features/chat/services/QuestionDockRenderStateFacade.ts`
- `src/features/chat/services/QuestionDockCoordinator.ts`
- `src/features/chat/services/QuestionRuntimeHostAdapter.ts`
- `tests/unit/features/chat/QuestionDockRenderStateFacade.test.ts`
- `tests/unit/features/chat/QuestionDockCoordinator.test.ts`
- `tests/unit/features/chat/QuestionRuntimeHostAdapter.test.ts`
- `docs/modules/features/chat/services/QuestionDockRenderStateFacade.md`
- `docs/modules/features/chat/services/QuestionDockCoordinator.md`
- `docs/modules/features/chat/services/QuestionRuntimeHostAdapter.md`
- `docs/modules/features/chat/services/QuestionDockRenderAdapter.md`
- `docs/modules/features/chat/services/QuestionDockSlotCoordinator.md`
- `docs/status/maintainability-phase-273.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- QuestionDockRenderStateFacade QuestionDockCoordinator QuestionRuntimeHostAdapter`
- `npm run build`

本轮未执行 `npm test` 全量套件。

原因：

- attempt `268` 不能被 `5` 整除
- 改动未命中仓库约定的 full-test 高风险路径（`src/main.ts`、`src/core/`、`automation/`、`package.json`、`package-lock.json`、`manifest.json`、`styles.css`、`esbuild.config.mjs`）

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且用户未显式要求部署，因此按仓库规则在成功 build 后停止于构建验证。

## 5. 下一步建议

下一轮可继续留在高优先级 P2，优先考虑把 `QuestionDockCoordinator` 中剩余的 dock submit/reject answer collection、required-answer notice gating 与 resolution action branching 下沉到 dedicated dock resolution action seam，让 coordinator 更接近纯 queue/writeback entrypoint。

一句话总结第二百七十三阶段本轮：

> 第二百七十三阶段把 question dock 的 active-request / session-match render gating 从 `QuestionDockCoordinator` 下沉到独立的 `QuestionDockRenderStateFacade`。
