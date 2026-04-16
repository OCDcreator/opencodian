# 可维护性改进：第二百四十一阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-240.md`
> **推进的 master-plan lane**: P3 `context / composer / retained-selection`（focus-context preview / current-note writeback coordination extraction）

本轮先按 lane map 的 P3 首查入口回到 `OpenCodianView` 的 composer/context host 装配，再只追到相邻的 activation / file-open focus preview writeback。最终选择的单一切片是：**新增 `FocusContextPreviewCoordinator`，把 file-open 时的 current-note 写回，以及 activation/editor-change 相邻的 focus-context preview refresh，从 `OpenCodianView` host lambda 和 bridge 内联委托中收束到一个专用 coordinator。**

这次改动保持 file-open 记忆 Markdown 路径、current note 同步、activation preflight focus preview 刷新，以及 editor-change / selectionchange 的既有语义不变。变化点只在于 `ComposerContextEventBridge` 不再同时承担 current-note writeback 细节，`TabViewActivationBridge` 也不再经由 view host 直接触发 focus preview runtime，而是复用同一条 preview coordinator 入口。

## 1. 本轮范围

- `src/features/chat/services/FocusContextPreviewCoordinator.ts`
  - 新增 focus-context preview coordinator
  - 集中 file-open current-note 写回、preview refresh 调度与 activation/editor-change 的显式 refresh 入口
- `src/features/chat/services/ComposerContextEventBridge.ts`
  - 改为把 file-open / active-leaf-change / editor-change 相邻的 preview 刷新委托给新 coordinator
  - 保留 composer focus / retained-selection polling 与 vault catalog 桥接职责
- `src/features/chat/runtime/TabViewActivationBridge.ts`
  - activation preflight 的 focus preview writeback 改为依赖新 coordinator，而不是 view host callback
- `src/features/chat/OpenCodianView.ts`
  - 新增 preview coordinator 装配与 host
  - 移除只做转发的 focus-preview host lambda / wrapper
- 测试
  - 新增 `tests/unit/features/chat/FocusContextPreviewCoordinator.test.ts`
  - 更新 `tests/unit/features/chat/ComposerContextEventBridge.test.ts`
  - 更新 `tests/unit/features/chat/TabViewActivationBridge.test.ts`
- 直接相关文档
  - 新增 `docs/modules/features/chat/services/FocusContextPreviewCoordinator.md`
  - 更新 `docs/modules/features/chat/services/ComposerContextEventBridge.md`
  - 更新 `docs/modules/features/chat/services/FocusContextRuntimeService.md`
  - 更新 `docs/modules/features/chat/runtime/TabViewActivationBridge.md`

## 2. 变更文件

- `src/features/chat/services/FocusContextPreviewCoordinator.ts`
- `src/features/chat/services/ComposerContextEventBridge.ts`
- `src/features/chat/runtime/TabViewActivationBridge.ts`
- `src/features/chat/OpenCodianView.ts`
- `tests/unit/features/chat/FocusContextPreviewCoordinator.test.ts`
- `tests/unit/features/chat/ComposerContextEventBridge.test.ts`
- `tests/unit/features/chat/TabViewActivationBridge.test.ts`
- `docs/modules/features/chat/services/FocusContextPreviewCoordinator.md`
- `docs/modules/features/chat/services/ComposerContextEventBridge.md`
- `docs/modules/features/chat/services/FocusContextRuntimeService.md`
- `docs/modules/features/chat/runtime/TabViewActivationBridge.md`
- `docs/status/maintainability-phase-241.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- FocusContextPreviewCoordinator`
- `npm test -- ComposerContextEventBridge`
- `npm test -- TabViewActivationBridge`
- `npm run build`

本轮构建 `BUILD_ID`：

- `autopilot-maintainability.202604130348`

未执行完整 `npm test` 的原因：

- attempt `236` 不可被 `5` 整除，且改动未命中仓库规则要求全量测试的高风险路径

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且用户未显式要求部署，因此按仓库规则在成功 build 后停止于构建验证。

## 5. 下一步建议

下一轮如果继续沿 P3，可优先复审 `FocusContextRuntimeService` 中仍保留的 active MarkdownView fallback 解析，把 `lastKnownMarkdownFilePath -> currentConversation.currentNote -> markdown leaf` 的查找顺序收束到 dedicated locator；如果这一圈收益不足，再转向 composer context chips attach/detach 与 focus preview state bridging 的 host seam。

一句话总结第二百四十一阶段本轮：

> 第二百四十一阶段新增 `FocusContextPreviewCoordinator`，把 activation / file-open 相邻的 focus preview refresh 与 current-note writeback 从 `OpenCodianView` host wiring 中拆出，供 `ComposerContextEventBridge` 和 `TabViewActivationBridge` 共享。
