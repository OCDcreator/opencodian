# 可维护性改进：第二百六十阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-259.md`
> **推进的 master-plan lane**: P3 `context / composer / retained-selection`（focus-preview 子图 host adapter 化）

本轮继续遵循 master plan、lane map 与上一轮 phase 建议，先回到 P3 首查入口，并围绕 `ComposerContextHostAdapter`、`ContextPickerInteractionBridge` 与 focus-preview writeback 子图寻找低风险 ownership 切口。最终选择只做一个单一职责切片：**把 focus-preview runtime、file-open current-note writeback，以及 context picker interaction bridge 的子图装配从 `ComposerContextHostAdapter` 抽到新的 `FocusContextHostAdapter`。**

这样 `ComposerContextHostAdapter` 只保留更外层的 composer/context bundle 装配，而 `FocusContextHostAdapter` 单独负责创建 `FocusContextRuntimeService`、`FocusContextPreviewCoordinator` 与 `ContextPickerInteractionBridge`，让 P3 链路里原本混在 composer 总装配里的 focus 子图拥有更清晰的 owner。

## 1. 本轮范围

- `src/features/chat/services/FocusContextHostAdapter.ts`
  - 新增 focus 子图 host adapter
  - 集中装配 `FocusContextRuntimeService`、`FocusContextPreviewCoordinator` 与 `ContextPickerInteractionBridge`
- `src/features/chat/services/ComposerContextHostAdapter.ts`
  - 移除 focus-preview / picker bridge 的直接装配细节
  - 改为委托 `createFocusContextServices()` 收口 focus 子图
- 测试
  - 新增 `tests/unit/features/chat/FocusContextHostAdapter.test.ts`
  - 继续复用 `ComposerContextHostAdapter`、`FocusContextPreviewCoordinator` 与 `ContextPickerInteractionBridge` 的 focused suites 验证外层接线保持不变
- 直接相关文档
  - 新增 `docs/modules/features/chat/services/FocusContextHostAdapter.md`
  - 更新 `docs/modules/features/chat/services/ComposerContextHostAdapter.md`
  - 更新 `docs/modules/features/chat/services/FocusContextViewHostAdapter.md`
  - 更新 `docs/modules/features/chat/services/FocusContextPreviewCoordinator.md`
  - 更新 `docs/modules/features/chat/services/ContextPickerInteractionBridge.md`

## 2. 变更文件

- `src/features/chat/services/FocusContextHostAdapter.ts`
- `src/features/chat/services/ComposerContextHostAdapter.ts`
- `tests/unit/features/chat/FocusContextHostAdapter.test.ts`
- `docs/modules/features/chat/services/FocusContextHostAdapter.md`
- `docs/modules/features/chat/services/ComposerContextHostAdapter.md`
- `docs/modules/features/chat/services/FocusContextViewHostAdapter.md`
- `docs/modules/features/chat/services/FocusContextPreviewCoordinator.md`
- `docs/modules/features/chat/services/ContextPickerInteractionBridge.md`
- `docs/status/maintainability-phase-260.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- FocusContextHostAdapter ComposerContextHostAdapter FocusContextPreviewCoordinator ContextPickerInteractionBridge`
- `npm test`
- `npm run build`

本轮构建 `BUILD_ID`：

- `autopilot-maintainability.202604130642`

本轮执行完整 `npm test` 的原因：

- attempt `255` 可被 `5` 整除，命中仓库规则要求的整库 Jest 回归

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且用户未显式要求部署，因此按仓库规则在成功 build 后停止于构建验证。

## 5. 下一步建议

下一轮可再复审一次 P3，但不要继续细拆 `FocusContextHostAdapter` 内部 wiring。优先检查 `ComposerContextViewFacade` 是否还混合了 send-context 读写、preview refresh 入口与 lifecycle 收口；如果没有同等级、低风险的 ownership 可迁出，就按 master plan 切到 P4 `message shell / notice / timestamp`。

一句话总结第二百六十阶段本轮：

> 第二百六十阶段把 focus-preview runtime、file-open note writeback 与 context picker bridge 的子图装配从 `ComposerContextHostAdapter` 迁到新的 `FocusContextHostAdapter`，让 composer context 总装配与 focus 子装配的职责边界更清晰。
