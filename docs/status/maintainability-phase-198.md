# 可维护性改进：第一百九十八阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-197.md`
> **推进的 master-plan lane**: P3 `context / composer / retained-selection` 链路（composer context chip / preview-attach 协调 ownership 迁移）

本轮先按 master plan 复审，继续选择高优先级的 P3 `context / composer / retained-selection` ownership，而没有回到已暂停的 `ConversationRenderService` / `TrailingAssistantPatch*` helper-fragmentation lane。实际切片是：**把 `OpenCodianView` 中 composer context chip 渲染、attach/detach click 行为，以及 focus preview → attachment 的 stale-check / attach 编排，迁到新的 `ComposerContextCoordinator`，让 view 只保留 draft context/focus preview 的 tab-state 写回和 current-note / selection / file 入口。**

这次改动没有改变 composer context chip 的 label / class / `aria-pressed` 语义，也没有改变 selection preview、current-note preview、失效 preview refresh 或 attach/detach 的既有行为；只是把这块 composer context UI 协调 ownership 从 `OpenCodianView` 收束到 dedicated service。

## 1. 本轮范围

- `src/features/chat/services/ComposerContextCoordinator.ts`
  - 新增 composer context coordinator，统一承接 chips 渲染、preview attach/detach click 编排，以及 stale preview refresh handoff
  - 集中 `FocusContextPreview` → `PromptContextItem` 的 attach orchestration，继续复用 `ContextAttachmentBuilder`
- `src/features/chat/OpenCodianView.ts`
  - 移除内联的 composer context chip render / click / preview-attach 逻辑
  - 改为通过 host callback + `ComposerContextCoordinator` 装配 composer context row
  - 保留 draft context item / focus preview 的 active-tab runtime state 写回，以及 current-note / selection / file 入口
- 测试
  - `tests/unit/features/chat/ComposerContextCoordinator.test.ts`
- 直接相关文档
  - `docs/modules/features/chat/services/ComposerContextCoordinator.md`
  - `docs/modules/features/chat/OpenCodianView.md`
  - `docs/modules/features/chat/services/FocusContextRuntimeService.md`
  - `docs/modules/features/chat/services/ContextAttachmentBuilder.md`
  - `docs/modules/README.md`

## 2. 变更文件

- `src/features/chat/services/ComposerContextCoordinator.ts`
- `src/features/chat/OpenCodianView.ts`
- `tests/unit/features/chat/ComposerContextCoordinator.test.ts`
- `docs/modules/features/chat/services/ComposerContextCoordinator.md`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/features/chat/services/FocusContextRuntimeService.md`
- `docs/modules/features/chat/services/ContextAttachmentBuilder.md`
- `docs/modules/README.md`
- `docs/status/maintainability-phase-198.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- ComposerContextCoordinator`
- `npm test`
- `npm run build`

## 4. 部署结果

`npm run build` 成功后，已按仓库约定部署到 Test Vault：

- 复制 `dist/main.js`
- 复制 `dist/manifest.json`
- 复制 `dist/styles.css`

部署目标：

- `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian`

本轮未改动 bundled assets，因此未复制 `dist/assets/`。

已校验 Test Vault 中的 `main.js` 包含本轮最新 `BUILD_ID`：

- `autopilot-maintainability.202604121913`

## 5. 下一步建议

本轮完成后，`OpenCodianView` 已经把 composer context chips 的渲染和 preview-attach 编排迁出；**下一轮可继续沿 P3 评估把 current-note / selection / file 三个 composer context 入口动作也收束到统一的 composer-context action service，进一步削弱 view 在 context / composer 入口上的集中 ownership。**

一句话总结第一百九十八阶段本轮：

> 第一百九十八阶段把 composer context chip 渲染、attach/detach click 和 preview-attach stale-check 从 `OpenCodianView` 迁到新的 `ComposerContextCoordinator`，推进了 master plan 的 P3 `context / composer / retained-selection` ownership 迁移。
