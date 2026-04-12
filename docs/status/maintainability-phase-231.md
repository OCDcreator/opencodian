# 可维护性改进：第二百三十一阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-230.md`
> **推进的 master-plan lane**: P3 `context / composer / retained-selection`（composer/context 事件桥接与 polling lifecycle）

本轮按 master plan 与 lane map 优先切到 P3，并先从 `OpenCodianView` 的 composer/context/retained-selection 首查入口、`FocusContextRuntimeService` 与 `ContextFileCatalogService` 的现有边界入手。最终选择的单一切片是：**新增 `ComposerContextEventBridge`，把 composer/context 相关的 workspace/vault/DOM 事件注册以及 retained-selection polling lifecycle 从 `OpenCodianView` 下沉到 dedicated bridge。**

这次改动保持 focus preview 刷新时机、current conversation note path 写回、composer pointer/focus handoff、document selection refresh，以及 context 文件目录的 vault 增量同步行为不变；变化点只在于让 `OpenCodianView` 不再直接持有这一整段事件 wiring 与 polling/dispose 入口。

## 1. 本轮范围

- `src/features/chat/services/ComposerContextEventBridge.ts`
  - 新增 composer/context 事件桥接模块
  - 统一桥接 workspace `file-open` / `active-leaf-change` / `editor-change`
  - 统一桥接 composer `pointerdown` / `focusin` / `focusout`、document `selectionchange` / `mouseup` / `keyup`
  - 统一桥接 vault `create` / `delete` / `rename`，并代持 retained-selection polling start/dispose lifecycle
- `src/features/chat/OpenCodianView.ts`
  - 改为通过 `ComposerContextEventBridge` 装配 composer/context 事件 wiring 与 retained-selection cleanup
  - 保留 Escape scope、focus preview state host、context action/coordinator host 与 UI 装配逻辑
- 测试
  - 新增 `tests/unit/features/chat/ComposerContextEventBridge.test.ts`，覆盖事件注册、workspace/DOM 路由、vault catalog 路由，以及 dispose lifecycle
- 直接相关文档
  - 新增 `docs/modules/features/chat/services/ComposerContextEventBridge.md`
  - 更新 `docs/modules/features/chat/services/FocusContextRuntimeService.md`
  - 更新 `docs/modules/features/chat/OpenCodianView.md`

## 2. 变更文件

- `src/features/chat/services/ComposerContextEventBridge.ts`
- `src/features/chat/OpenCodianView.ts`
- `tests/unit/features/chat/ComposerContextEventBridge.test.ts`
- `docs/modules/features/chat/services/ComposerContextEventBridge.md`
- `docs/modules/features/chat/services/FocusContextRuntimeService.md`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/status/maintainability-phase-231.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- ComposerContextEventBridge FocusContextRuntimeService ComposerContextCoordinator`
- `npm run build`

本轮未执行全量 `npm test`：attempt `226` 不是 5 的倍数，且改动未命中 `src/main.ts`、`src/core/`、`automation/`、`package.json`、`package-lock.json`、`manifest.json`、`styles.css` 或 `esbuild.config.mjs` 这些工作流定义的高风险路径。

本轮构建 `BUILD_ID`：

- `autopilot-maintainability.202604130159`

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且用户未显式要求部署，因此按仓库规则在成功 build 后停止于构建验证。

## 5. 下一步建议

P3 里，composer/context 的入口动作、chip 渲染、focus runtime 与本轮的事件桥接已经分开。**下一轮建议继续留在 P3，把 active-tab `focusContextPreview` / `draftContextItems` 的 read-write host 适配从 `OpenCodianView` 抽到更窄的 host adapter；如果这一段没有低风险切片，再转去 P4 notice/timestamp ownership。**

一句话总结第二百三十一阶段本轮：

> 第二百三十一阶段新增 `ComposerContextEventBridge`，把 composer/context 的 workspace/vault/DOM 事件 wiring 与 retained-selection polling lifecycle 从 `OpenCodianView` 拆出，让 view 更集中于 host assembly 与 active-tab state writeback。
