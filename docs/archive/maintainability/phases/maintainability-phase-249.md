# 可维护性改进：第二百四十九阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-248.md`
> **推进的 master-plan lane**: P3 `context / composer / retained-selection`（focus-preview note-path host split）

本轮继续遵循 lane map 的 P3 首查入口，从 `OpenCodianView` 的 composer/context host 装配开始，只复审 **current-conversation note path 读写与 focus-preview activation 相关的宿主接缝**，而不重新广扫 catalog、chip render 或其它聊天链路。确认低风险且仍有价值的集中点在于：**`ComposerContextViewHost` 仍同时承担 composer action host 与 focus-preview note-path / focus gate seam，导致 `ComposerContextHostAdapter` 需要把 current-note writeback、focus-preview runtime host 与普通 composer action host 混在同一份 view host 里装配。**

因此本轮只做一个切片：**新增 `FocusContextViewHostAdapter`，把 `FocusContextRuntimeService` 与 `FocusContextPreviewCoordinator` 依赖的 current-conversation note-path 读写、composer-focus gate，以及 active-tab preview writeback host 从 `ComposerContextViewHostAdapter` / `ComposerContextViewHost` 中拆出；`OpenCodianView` 同步分离 `createComposerContextViewHost()` 与 `createFocusContextViewHost()` 两条窄 seam。**

这次改动不改变 file-open note path 持久化、focus preview 刷新时机、retained-selection polling、picker open/close handoff，变化只在于 host ownership：composer context action/picker host 与 focus-preview host 不再共用一份更宽的 view seam。

## 1. 本轮范围

- `src/features/chat/services/FocusContextViewHostAdapter.ts`
  - 新增专用 focus host adapter
  - 集中 `FocusContextRuntimeService` / `FocusContextPreviewCoordinator` 所需的 preview runtime host 与 current-note writeback host
- `src/features/chat/services/ComposerContextHostAdapter.ts`
  - 将依赖拆成 `ComposerContextViewHost` 与 `FocusContextViewHost`
  - 改由新 adapter 装配 focus runtime / preview coordinator
- `src/features/chat/services/ComposerContextViewHostAdapter.ts`
  - 删除 focus runtime host 组装职责，收窄回 action / picker / chip / coordinator host
- `src/features/chat/OpenCodianView.ts`
  - 将原有 composer context host 拆成 `createComposerContextViewHost()` 与 `createFocusContextViewHost()`
  - 继续由 `createComposerContextServices()` 统一装配 bundle
- 测试
  - 新增 `tests/unit/features/chat/FocusContextViewHostAdapter.test.ts`
  - 更新 `tests/unit/features/chat/ComposerContextHostAdapter.test.ts`
  - 更新 `tests/unit/features/chat/ComposerContextViewHostAdapter.test.ts`
- 直接相关文档
  - 新增 `docs/modules/features/chat/services/FocusContextViewHostAdapter.md`
  - 更新 `docs/modules/features/chat/services/ComposerContextHostAdapter.md`
  - 更新 `docs/modules/features/chat/services/ComposerContextViewHostAdapter.md`
  - 更新 `docs/modules/features/chat/services/FocusContextRuntimeService.md`
  - 更新 `docs/modules/features/chat/OpenCodianView.md`

## 2. 变更文件

- `src/features/chat/services/FocusContextViewHostAdapter.ts`
- `src/features/chat/services/ComposerContextHostAdapter.ts`
- `src/features/chat/services/ComposerContextViewHostAdapter.ts`
- `src/features/chat/OpenCodianView.ts`
- `tests/unit/features/chat/FocusContextViewHostAdapter.test.ts`
- `tests/unit/features/chat/ComposerContextHostAdapter.test.ts`
- `tests/unit/features/chat/ComposerContextViewHostAdapter.test.ts`
- `docs/modules/features/chat/services/FocusContextViewHostAdapter.md`
- `docs/modules/features/chat/services/ComposerContextHostAdapter.md`
- `docs/modules/features/chat/services/ComposerContextViewHostAdapter.md`
- `docs/modules/features/chat/services/FocusContextRuntimeService.md`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/status/maintainability-phase-249.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- ComposerContextHostAdapter ComposerContextViewHostAdapter FocusContextViewHostAdapter`
- `npm run build`

本轮构建 `BUILD_ID`：

- `autopilot-maintainability.202604130504`

本轮未执行完整 `npm test` 的原因：

- attempt `244` 不可被 `5` 整除
- 改动未命中仓库规则要求全量测试的高风险路径（`src/main.ts`、`src/core/`、`automation/`、`package.json`、`package-lock.json`、`manifest.json`、`styles.css`、`esbuild.config.mjs`）

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且用户未显式要求部署，因此按仓库规则在成功 build 后停止于构建验证。

## 5. 下一步建议

下一轮如果继续沿 P3 推进，建议复审 `ComposerContextEventBridge` 里仍混合在一起的 **focus-preview activation 事件桥接 与 context file catalog 事件注册 seam**，优先寻找一个只影响事件 host 装配的窄 split，而不是重新回到 catalog 数据结构或 chips 渲染细节。

一句话总结第二百四十九阶段本轮：

> 第二百四十九阶段新增 `FocusContextViewHostAdapter`，把 focus-preview note-path / focus gate host 从更宽的 composer context host 中拆出，让 composer action host 与 focus runtime host 分别收敛到独立单一职责边界。
