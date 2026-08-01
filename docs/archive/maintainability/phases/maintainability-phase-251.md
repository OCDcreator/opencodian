# 可维护性改进：第二百五十一阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-250.md`
> **推进的 master-plan lane**: P3 `context / composer / retained-selection`（picker lifecycle / focus writeback host split）

本轮继续遵循 lane map 的 P3 首查入口，从 `ComposerContextHostAdapter` 与 `OpenCodianView` 的 composer/context host seam 进入，只复审上一轮建议的 **context picker interaction hooks 与 retained-selection refresh writeback** 接缝，没有重新广扫 context catalog、chips 渲染或 retained-selection 算法。

确认的低风险问题是：`OpenCodianView` 原先只通过一条 `FocusContextViewHost` 同时提供 current-note fallback、composer focus gate 与 current-note writeback；同时 `ComposerContextHostAdapter` 还内联了 picker open / close 到 focus runtime 的闭包。这样 picker interaction lifecycle 与 file-open/current-note writeback 虽然行为稳定，但 ownership 仍集中在同一 bundle seam。

因此本轮只做一个窄切片：**拆分 focus runtime host 与 preview writeback host，并新增专用 picker interaction bridge。** 具体来说，`OpenCodianView` 现在分别提供 `FocusContextRuntimeViewHost` 与 `FocusContextPreviewWritebackHost`；`ContextPickerInteractionBridge` 专门承接 picker begin → retained-selection handoff、picker complete → delayed preview refresh；`ComposerContextHostAdapter` 仍作为 bundle 组装层，但不再内联这两段 picker lifecycle wiring。

这次改动不改变 picker 打开、取消、选择文件、`try/finally` complete callback、current-note writeback、preview refresh timeout 或 retained-selection highlight 行为；变化只在于 host seam 与 lifecycle ownership。

## 1. 本轮范围

- `src/features/chat/services/ContextPickerInteractionBridge.ts`
  - 新增专用 picker lifecycle bridge
  - 集中 picker begin / complete 到 focus runtime 与 preview coordinator 的桥接
- `src/features/chat/services/ComposerContextHostAdapter.ts`
  - 将 `FocusContextViewHost` 拆成 `FocusContextRuntimeViewHost` 与 `FocusContextPreviewWritebackHost`
  - 改为通过 `ContextPickerInteractionBridge` 装配 picker lifecycle callbacks
- `src/features/chat/OpenCodianView.ts`
  - 将原来的 focus context host factory 拆成 runtime host 与 writeback host 两个 view-facing factory
- 测试
  - 新增 `tests/unit/features/chat/ContextPickerInteractionBridge.test.ts`
  - 更新 `tests/unit/features/chat/ComposerContextHostAdapter.test.ts`
- 直接相关文档
  - 新增 `docs/modules/features/chat/services/ContextPickerInteractionBridge.md`
  - 更新 composer/focus host adapter 与 focus runtime 相关模块文档

## 2. 变更文件

- `src/features/chat/services/ContextPickerInteractionBridge.ts`
- `src/features/chat/services/ComposerContextHostAdapter.ts`
- `src/features/chat/OpenCodianView.ts`
- `tests/unit/features/chat/ContextPickerInteractionBridge.test.ts`
- `tests/unit/features/chat/ComposerContextHostAdapter.test.ts`
- `docs/modules/features/chat/services/ContextPickerInteractionBridge.md`
- `docs/modules/features/chat/services/ComposerContextHostAdapter.md`
- `docs/modules/features/chat/services/ComposerContextViewHostAdapter.md`
- `docs/modules/features/chat/services/FocusContextRuntimeService.md`
- `docs/modules/features/chat/services/FocusContextViewHostAdapter.md`
- `docs/status/maintainability-phase-251.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- ComposerContextHostAdapter ContextPickerInteractionBridge ComposerContextViewHostAdapter FocusContextViewHostAdapter`
- `npm run build`

本轮构建 `BUILD_ID`：

- `autopilot-maintainability.202604130521`

本轮未执行完整 `npm test` 的原因：

- attempt `246` 不能被 `5` 整除
- 改动未命中仓库规则中的高风险路径（`src/main.ts`、`src/core/`、`automation/`、`package.json`、`package-lock.json`、`manifest.json`、`styles.css`、`esbuild.config.mjs`）

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且用户未显式要求部署，因此按仓库规则在成功 build 后停止于构建验证。

## 5. 下一步建议

下一轮如果继续沿 P3 推进，建议复审 `ComposerContextHostAdapter` 返回的 `ComposerContextServices` bundle：`OpenCodianView` 仍逐项接收 action / picker / chip / coordinator / runtime / preview / event bridge。可以寻找一个只影响 host assignment 的窄 facade，把 view-facing composer context service bundle 再收窄一层，同时不改变 context picker、chips 或 retained-selection 行为。

一句话总结第二百五十一阶段本轮：

> 第二百五十一阶段把 composer context 的 focus runtime host、preview writeback host 与 picker interaction lifecycle 分离，让 picker retained-selection handoff 进入 `ContextPickerInteractionBridge`，同时保持原有 picker 与 preview refresh 行为不变。
