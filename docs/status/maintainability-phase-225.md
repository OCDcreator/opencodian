# 可维护性改进：第二百二十五阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-224.md`
> **推进的 master-plan lane**: P2 `question / todo / background task`（question post-resolution runtime facade）

本轮继续遵循 master plan 与 lane map，先按 P2 首查顺序检查 `OpenCodianView` 的 question runtime wiring，再对照 `QuestionTodoStatusRefreshCoordinator`、`PostSyncQuestionTodoRefreshFacade`、`BackgroundTaskPostSyncCoordinator` 与现有 `QuestionRuntimeHostAdapter` / `QuestionDockCoordinator` / `QuestionResolutionFlowCoordinator` 的分工。最终选择的单一切片是：**把 question resolve 之后的 status refresh / sync-loop / visible-conversation background sync 收尾，从 `QuestionDockCoordinator` 的本地 follow-up 逻辑中抽成共享的 `QuestionPostResolutionRuntimeFacade`，并让 inline fallback resolve 也复用同一条 runtime follow-up 路径。**

这次改动保持现有 question API、dock queue、resolved-card render 与 question runtime host adapter 的整体行为不变；变化点只在于把 dock 和 inline resolution 共同依赖的运行时收尾抽到一个更明确的 facade，进一步减少 question bundle 内部对 sync/status follow-up 细节的分散持有。

## 1. 本轮范围

- `src/features/chat/services/QuestionPostResolutionRuntimeFacade.ts`
  - 新增共享 facade，统一负责 question resolve 之后的 session status refresh、conversation sync loop 重启，以及 active/non-streaming 场景下的 visible conversation background sync
- `src/features/chat/services/QuestionDockCoordinator.ts`
  - 删除本地 `afterQuestionDockResolution()` 中的 sync/status 细节，改为委托给共享 facade
- `src/features/chat/services/QuestionResolutionFlowCoordinator.ts`
  - 让 inline fallback resolve 成功后也调用共享 facade，和 dock resolution 共用同一条 post-resolution runtime follow-up
- `src/features/chat/services/QuestionRuntimeHostAdapter.ts`
  - 从共享 `QuestionRuntimeViewHost` 派生 post-resolution runtime host，并在 question runtime bundle 中集中装配新 facade
- 测试
  - 新增 `tests/unit/features/chat/QuestionPostResolutionRuntimeFacade.test.ts`
  - 更新 `tests/unit/features/chat/QuestionDockCoordinator.test.ts`
  - 更新 `tests/unit/features/chat/QuestionResolutionFlowCoordinator.test.ts`
  - 更新 `tests/unit/features/chat/QuestionRuntimeHostAdapter.test.ts`
- 直接相关文档
  - 新增 `docs/modules/features/chat/services/QuestionPostResolutionRuntimeFacade.md`
  - 更新 `docs/modules/features/chat/services/QuestionDockCoordinator.md`
  - 更新 `docs/modules/features/chat/services/QuestionResolutionFlowCoordinator.md`
  - 更新 `docs/modules/features/chat/services/QuestionRuntimeHostAdapter.md`

## 2. 变更文件

- `src/features/chat/services/QuestionPostResolutionRuntimeFacade.ts`
- `src/features/chat/services/QuestionDockCoordinator.ts`
- `src/features/chat/services/QuestionResolutionFlowCoordinator.ts`
- `src/features/chat/services/QuestionRuntimeHostAdapter.ts`
- `tests/unit/features/chat/QuestionPostResolutionRuntimeFacade.test.ts`
- `tests/unit/features/chat/QuestionDockCoordinator.test.ts`
- `tests/unit/features/chat/QuestionResolutionFlowCoordinator.test.ts`
- `tests/unit/features/chat/QuestionRuntimeHostAdapter.test.ts`
- `docs/modules/features/chat/services/QuestionPostResolutionRuntimeFacade.md`
- `docs/modules/features/chat/services/QuestionDockCoordinator.md`
- `docs/modules/features/chat/services/QuestionResolutionFlowCoordinator.md`
- `docs/modules/features/chat/services/QuestionRuntimeHostAdapter.md`
- `docs/status/maintainability-phase-225.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- QuestionPostResolutionRuntimeFacade QuestionDockCoordinator QuestionResolutionFlowCoordinator QuestionRuntimeHostAdapter`
- `npm test`
- `npm run build`

本轮之所以额外执行全量 `npm test`：attempt `220` 是 5 的倍数，按仓库规则触发全量测试。

本轮构建 `BUILD_ID`：

- `autopilot-maintainability.202604130105`

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），因此按仓库规则在成功 build 后停止于构建验证。

## 5. 下一步建议

P2 question 子链里，dock 与 inline resolution 的 runtime follow-up 已统一。**下一轮建议继续留在 P2，评估 `QuestionDockCoordinator` / `QuestionResolutionFlowCoordinator` / post-sync refresh 链路中对 resolved-request suppress 与 pending-question refresh 的 runtime state 访问，是否还能收束成一个更窄的 question refresh facade，继续减少 question bundle 内部对 tab runtime map 细节的分散持有。**

一句话总结第二百二十五阶段本轮：

> 第二百二十五阶段新增 `QuestionPostResolutionRuntimeFacade`，让 dock 与 inline question resolution 复用同一条 post-resolution sync/status follow-up，继续推进 master plan 的 P2 ownership 迁移。
