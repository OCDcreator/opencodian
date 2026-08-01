# 可维护性改进：第二百三十二阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-231.md`
> **推进的 master-plan lane**: P3 `context / composer / retained-selection`（active-tab context state host adapter）

本轮继续按 master plan 与 lane map 优先留在 P3，并先从 `OpenCodianView` 的 composer/context 首查入口、`FocusContextRuntimeService` 以及上一轮新增的 `ComposerContextEventBridge` 边界入手。最终选择的单一切片是：**新增 `ComposerContextViewHostAdapter`，把 active-tab `focusContextPreview` / `draftContextItems` 的读写 host path 从 `OpenCodianView` 下沉到 dedicated adapter，并让 composer action/coordinator/focus-runtime 与 send-preparation 共用这条 state seam。**

这次改动保持多 tab runtime 字段、focus preview equality guard、composer chips 重绘时机，以及发送后清空 draft context 的行为不变；变化点只在于让 `OpenCodianView` 不再直接持有这一组 draft/preview getter-setter 与三个 host factory 里的重复 state wiring。

## 1. 本轮范围

- `src/features/chat/services/ComposerContextViewHostAdapter.ts`
  - 新增 composer/context state host adapter
  - 统一代持 active-tab `draftContextItems` / `focusContextPreview` 的读写
  - 统一为 `ComposerContextActionService`、`ComposerContextCoordinator`、`FocusContextRuntimeService` 创建 host
  - 让发送前读取 draft context、发送后清空 draft context 复用同一份 state seam
- `src/features/chat/OpenCodianView.ts`
  - 改为实例化 `ComposerContextViewHostAdapter`
  - composer/context 三组 host factory 与 `MessageSendPreparationService` 的 draft-context 读写改走 adapter
  - 删除 view 内部直接维护的 draft/preview getter-setter 片段
- 测试
  - 新增 `tests/unit/features/chat/ComposerContextViewHostAdapter.test.ts`，覆盖 active-tab draft state 写回、focus preview equality guard，以及 host factory 共享同一份 tab-state seam
- 直接相关文档
  - 新增 `docs/modules/features/chat/services/ComposerContextViewHostAdapter.md`
  - 更新 `docs/modules/features/chat/services/FocusContextRuntimeService.md`
  - 更新 `docs/modules/features/chat/OpenCodianView.md`

## 2. 变更文件

- `src/features/chat/services/ComposerContextViewHostAdapter.ts`
- `src/features/chat/OpenCodianView.ts`
- `tests/unit/features/chat/ComposerContextViewHostAdapter.test.ts`
- `docs/modules/features/chat/services/ComposerContextViewHostAdapter.md`
- `docs/modules/features/chat/services/FocusContextRuntimeService.md`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/status/maintainability-phase-232.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- ComposerContextViewHostAdapter ComposerContextCoordinator FocusContextRuntimeService MessageSendPreparationService`
- `npm run build`

本轮未执行全量 `npm test`：attempt `227` 不是 5 的倍数，且改动未命中 `src/main.ts`、`src/core/`、`automation/`、`package.json`、`package-lock.json`、`manifest.json`、`styles.css` 或 `esbuild.config.mjs` 这些工作流定义的高风险路径。

本轮构建 `BUILD_ID`：

- `autopilot-maintainability.202604130214`

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且用户未显式要求部署，因此按仓库规则在成功 build 后停止于构建验证。

## 5. 下一步建议

P3 里，composer/context 的事件桥接、focus runtime、入口动作、chips 编排，以及 active-tab draft/preview state host 现在已经分开。**下一轮建议切到 P4，从 assistant footer 的 timestamp / notice action host 装配入手，把 `OpenCodianView` 里仍然内联的 footer/notice wiring 收束到更窄的 adapter 或 renderer host。**

一句话总结第二百三十二阶段本轮：

> 第二百三十二阶段新增 `ComposerContextViewHostAdapter`，把 active-tab `focusContextPreview` / `draftContextItems` 的共享读写 host 从 `OpenCodianView` 拆出，让 composer action、focus runtime、chips 编排和发送前后清理共用同一条更窄的 state seam。
