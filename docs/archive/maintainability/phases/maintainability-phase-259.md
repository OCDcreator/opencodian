# 可维护性改进：第二百五十九阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-258.md`
> **推进的 master-plan lane**: P3 `context / composer / retained-selection`（retained-selection runtime coordinator 化）

本轮先按 master plan 与 lane map 的顺序复审了 P2 首查入口：`OpenCodianView` 里的 question/todo/background-task wiring、`QuestionTodoStatusRefreshCoordinator`、`PostSyncQuestionTodoRefreshFacade`、`BackgroundTaskPostSyncCoordinator`，以及对应的 host adapter 模式。结合上一轮已经抽出的 visible post-sync state coordinator，当前剩余的 P2 current-conversation bridge 主要已经收敛为薄 host seam，没有再发现同等级、低风险且能明显迁出新 ownership 的切口。

因此本轮遵循 focus hint 切到 P3，只做一个单一职责切片：**把 retained-selection 的 polling、composer pointer/focus handoff，以及 highlight lifecycle 从 `FocusContextRuntimeService` 抽到 `RetainedSelectionRuntimeCoordinator`。** `FocusContextRuntimeService` 现在保留活动 `MarkdownView` 回退查找、focus preview 计算与 debounce 调度；retained-selection runtime 则由新 coordinator 统一编排，并继续复用既有 `RetainedSelectionHighlightService`。

## 1. 本轮范围

- `src/features/chat/services/RetainedSelectionRuntimeCoordinator.ts`
  - 新增 retained-selection runtime coordinator
  - 集中 `250ms` polling、composer `pointerdown/focusin/focusout` handoff 与 highlight lifecycle
- `src/features/chat/services/FocusContextRuntimeService.ts`
  - 移除 retained-selection interval 与 composer handoff 的内部状态
  - 保留 focus preview 计算、retain 规则合并、markdown view fallback 与 debounce 调度
  - 改为委托 `RetainedSelectionRuntimeCoordinator` 处理 retained-selection runtime
- 测试
  - 新增 `tests/unit/features/chat/RetainedSelectionRuntimeCoordinator.test.ts`
  - 继续复用 `FocusContextRuntimeService`、`FocusContextEventBridge`、`ComposerContextHostAdapter` 的 focused suites 验证对外行为不变
- 直接相关文档
  - 新增 `docs/modules/features/chat/services/RetainedSelectionRuntimeCoordinator.md`
  - 更新 `docs/modules/features/chat/services/FocusContextRuntimeService.md`
  - 更新 `docs/modules/features/chat/services/RetainedSelectionHighlightService.md`
  - 更新 `docs/modules/features/chat/services/FocusContextEventBridge.md`
  - 更新 `docs/modules/features/chat/services/FocusContextPreviewCoordinator.md`
  - 更新 `docs/modules/features/chat/OpenCodianView.md`

## 2. 变更文件

- `src/features/chat/services/RetainedSelectionRuntimeCoordinator.ts`
- `src/features/chat/services/FocusContextRuntimeService.ts`
- `tests/unit/features/chat/RetainedSelectionRuntimeCoordinator.test.ts`
- `docs/modules/features/chat/services/RetainedSelectionRuntimeCoordinator.md`
- `docs/modules/features/chat/services/FocusContextRuntimeService.md`
- `docs/modules/features/chat/services/RetainedSelectionHighlightService.md`
- `docs/modules/features/chat/services/FocusContextEventBridge.md`
- `docs/modules/features/chat/services/FocusContextPreviewCoordinator.md`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/status/maintainability-phase-259.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- RetainedSelectionRuntimeCoordinator FocusContextRuntimeService FocusContextEventBridge ComposerContextHostAdapter`
- `npm run build`

本轮构建 `BUILD_ID`：

- `autopilot-maintainability.202604130630`

本轮未执行完整 `npm test` 的原因：

- attempt `254` 不可被 `5` 整除，且改动未命中仓库规则要求完整测试的高风险路径（`src/main.ts`、`src/core/`、`automation/`、`package.json`、`package-lock.json`、`manifest.json`、`styles.css`、`esbuild.config.mjs`）

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且用户未显式要求部署，因此按仓库规则在成功 build 后停止于构建验证。

## 5. 下一步建议

下一轮可继续留在 P3，但不要继续细拆同一条 retained-selection runtime。优先回到 lane map 的 P3 首查入口，检查 `ComposerContextHostAdapter` / `ComposerContextViewFacade` / `ContextPickerInteractionBridge` 一带是否还存在可低风险迁出的 context picker 或 focus-preview writeback bridge；若没有明显 ownership 可搬迁，再考虑切到 P4 `message shell / notice / timestamp`。

一句话总结第二百五十九阶段本轮：

> 第二百五十九阶段把 retained-selection 的 polling、composer handoff 与 highlight lifecycle 从 `FocusContextRuntimeService` 迁到 `RetainedSelectionRuntimeCoordinator`，让 focus runtime 更接近单纯的 preview 计算与 markdown-view fallback service。
