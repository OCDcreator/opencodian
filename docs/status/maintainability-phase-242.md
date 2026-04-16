# 可维护性改进：第二百四十二阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-241.md`
> **推进的 master-plan lane**: P3 `context / composer / retained-selection`（active MarkdownView fallback locator extraction）

本轮先按 lane map 的 P3 首查入口回到 `OpenCodianView` 的 composer/context host 装配，再只追到相邻的 `FocusContextRuntimeService` 活动 `MarkdownView` 回退解析。最终选择的单一切片是：**新增 `FocusContextMarkdownViewLocator`，把 `lastKnownMarkdownFilePath -> currentConversation.currentNote -> markdown leaf` 的回退查找，从 `FocusContextRuntimeService` 里拆到专用 locator。**

这次改动保持 focus context preview、selection line-range、retained-selection handoff，以及 file-open/current-note 语义不变。变化点只在于 `FocusContextRuntimeService` 不再直接扫描 markdown leaves，而是把 remembered path 与 fallback 解析委托给新的 locator。

## 1. 本轮范围

- `src/features/chat/services/FocusContextMarkdownViewLocator.ts`
  - 新增活动 `MarkdownView` locator
  - 集中 remembered path 写回与 active/fallback leaf 解析顺序
- `src/features/chat/services/FocusContextRuntimeService.ts`
  - 改为委托新 locator 处理 `rememberMarkdownFilePath()` 与 `getActiveMarkdownView()`
  - 保留 preview 计算、retained-selection polling 与 highlight 编排
- 测试
  - 新增 `tests/unit/features/chat/FocusContextMarkdownViewLocator.test.ts`
  - 保留并通过 `tests/unit/features/chat/FocusContextRuntimeService.test.ts`
- 直接相关文档
  - 新增 `docs/modules/features/chat/services/FocusContextMarkdownViewLocator.md`
  - 更新 `docs/modules/features/chat/services/FocusContextRuntimeService.md`
  - 更新 `docs/modules/features/chat/services/FocusContextPreviewCoordinator.md`

## 2. 变更文件

- `src/features/chat/services/FocusContextMarkdownViewLocator.ts`
- `src/features/chat/services/FocusContextRuntimeService.ts`
- `tests/unit/features/chat/FocusContextMarkdownViewLocator.test.ts`
- `docs/modules/features/chat/services/FocusContextMarkdownViewLocator.md`
- `docs/modules/features/chat/services/FocusContextRuntimeService.md`
- `docs/modules/features/chat/services/FocusContextPreviewCoordinator.md`
- `docs/status/maintainability-phase-242.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- FocusContextMarkdownViewLocator`
- `npm test -- FocusContextRuntimeService`
- `npm run build`

本轮构建 `BUILD_ID`：

- `autopilot-maintainability.202604130356`

未执行完整 `npm test` 的原因：

- attempt `237` 不可被 `5` 整除，且改动未命中仓库规则要求全量测试的高风险路径

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且用户未显式要求部署，因此按仓库规则在成功 build 后停止于构建验证。

## 5. 下一步建议

下一轮如果继续沿 P3，可优先复审 composer context chips attach/detach 的 host seam，把 `ComposerContextCoordinator` 仍经由 `OpenCodianView` 触发的 preview attach/render writeback 进一步收束到更窄的 host/runtime adapter；如果这一圈收益不足，再转向 context catalog 或 retained-selection runtime 的相邻桥接点。

一句话总结第二百四十二阶段本轮：

> 第二百四十二阶段新增 `FocusContextMarkdownViewLocator`，把 focus-context runtime 使用的活动 `MarkdownView` fallback 解析从 `FocusContextRuntimeService` 中拆出，保留既有 preview 与 retained-selection 行为不变。
