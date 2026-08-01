# 可维护性改进：第三百二十二阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-321.md`
> **推进的 master-plan lane**: P3 `context / composer / retained-selection`
> **完成的 roadmap queue item**: `R7 - P3 context/composer/retained-selection ownership`

本轮严格执行 roadmap 的第一个 `[NEXT]` 项：`R7 - P3 context/composer/retained-selection ownership`。本轮把 composer context 的 bundle 创建、`ContextAttachmentBuilder` 与 `ContextFileCatalogService` ownership 收进 `ComposerContextViewFacade.create()`，让 `OpenCodianView` 不再直接持有 builder/catalog 或直接编排 composer/focus/catalog service fan-out。这样削弱的 owner 是 **`OpenCodianView` 的 context/composer lifecycle ownership**：view 现在只保留较窄的 view host seam、context row DOM 挂载、add-context 按钮入口，以及公开的 active-editor context action 转发。

本轮刻意**没有**改动 message streaming、P2 question/todo/background-task 链路、context usage token 计算、retained-selection 具体算法、context picker UI markup 或发送/finalization 行为。`ComposerContextHostAdapter.ts` 仅保留为兼容导出层，实际 bundle 装配已经迁到 `ComposerContextViewFacade.ts`，避免再让 view 回到多 service 组装入口。

## 1. 本轮范围

- 收束 composer-context 总装配入口
  - `ComposerContextViewFacade.create()` 新增为 view-facing factory
  - `ComposerContextViewFacade.ts` 内部拥有 `ContextAttachmentBuilder` 与 `ContextFileCatalogService` 的创建，并继续组装 action / picker / chip / coordinator / focus runtime / event bridge
  - `createComposerContextServices()` 留在同一 owner 内，供 focused tests 以 mocked builder/catalog 覆盖 bundle wiring
- 简化 `OpenCodianView`
  - 移除 `contextAttachmentBuilder` 与 `contextFileCatalogService` 两个 view 字段
  - 构造函数只调用 `ComposerContextViewFacade.create()` 并传入三条窄 host seam
- 保留兼容边界
  - `ComposerContextHostAdapter.ts` 改为 re-export 兼容层，不再作为 view 的运行时装配入口
  - 更新对应 focused test 的 import / describe，使新 owner 继续有覆盖
- 同步直接相关文档
  - 更新 `OpenCodianView` 模块文档中的 context/composer ownership 描述
  - 更新 `ComposerContextViewFacade` 与 `ComposerContextHostAdapter` 模块文档
  - 更新 roadmap / lane map，把 R7 标为完成并把 R8 提升为新的 `[NEXT]`

## 2. 变更文件

- Code
  - `src/features/chat/OpenCodianView.ts`
  - `src/features/chat/services/ComposerContextViewFacade.ts`
  - `src/features/chat/services/ComposerContextHostAdapter.ts`
- Tests
  - `tests/unit/features/chat/ComposerContextHostAdapter.test.ts`
- Docs
  - `docs/modules/features/chat/OpenCodianView.md`
  - `docs/modules/features/chat/services/ComposerContextViewFacade.md`
  - `docs/modules/features/chat/services/ComposerContextHostAdapter.md`
  - `docs/status/maintainability-lane-map.md`
  - `docs/status/maintainability-round-roadmap.md`
  - `docs/status/maintainability-phase-322.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- tests/unit/features/chat/ComposerContextHostAdapter.test.ts tests/unit/features/chat/FocusContextHostAdapter.test.ts tests/unit/features/chat/ComposerContextViewHostAdapter.test.ts tests/unit/features/chat/FocusContextViewHostAdapter.test.ts`
- `npm test`
- `npm run build`

本轮 build 生成的 `BUILD_ID`：

- `autopilot-maintainability.202604131920`

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动属于 `src/features/chat/**` 的纯 maintainability refactor、focused tests 与文档更新，没有命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且用户未显式要求部署，因此按规则在成功 build 后停止于构建验证。

## 5. 下一步建议

下一轮应按 roadmap 推进新的 `[NEXT]` 项：`R8 - P4 message shell / notice / timestamp ownership`。建议从 `OpenCodianView` 中 assistant shell / notice / footer / timestamp 组装入口开始，优先复用或加厚现有 renderer/finalizer service，避免新增只包一层的 notice adapter。

一句话总结第三百二十二阶段本轮：

> 第三百二十二阶段把 composer-context bundle 创建与 builder/catalog ownership 收进 `ComposerContextViewFacade`，让 `OpenCodianView` 只消费一条更窄的 context orchestration seam，并把 roadmap 推进到 R8/P4。
