# 可维护性改进：第一百九十七阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-196.md`
> **推进的 master-plan lane**: P3 `context / composer / retained-selection` 链路（focus preview / retained-selection runtime ownership 迁移）

本轮先按 master plan 复审，继续选择高优先级的 P3 `context / composer / retained-selection` ownership，而没有回到已暂停的 `ConversationRenderService` / `TrailingAssistantPatch*` helper-fragmentation lane。实际切片是：**把 `OpenCodianView` 中活动 `MarkdownView` 回退解析、focus context preview 刷新、composer pointer handoff、retained-selection highlight/polling/cleanup，迁到新的 `FocusContextRuntimeService`，让 view 只保留 preview state writeback、附件入口和事件注册。**

这次改动没有改变 focus preview 的 current-note / selection 判定、selection line-range、composer handoff grace 语义、retained highlight 的 CodeMirror/DOM fallback 顺序、或 context attachment 的 attach 行为；只是把这块 runtime/editor 协调 ownership 从 `OpenCodianView` 收束到 dedicated service。

## 1. 本轮范围

- `src/features/chat/services/FocusContextRuntimeService.ts`
  - 新增 focus-context runtime service，统一承接活动 `MarkdownView` 回退查找、focus preview 计算与 refresh
  - 集中 retained-selection 的 pointer handoff、focusin/focusout follow-up、polling、CodeMirror/DOM highlight 与 cleanup
  - 通过 host callback 继续把 preview state 写回 active tab runtime，保持多 tab 语义不变
- `src/features/chat/OpenCodianView.ts`
  - 移除内联的 focus preview / retained-selection 状态与 editor-runtime 协调实现
  - `onOpen()` / `onClose()`、workspace 事件与 composer DOM 事件改为委托 `FocusContextRuntimeService`
  - 保留 composer context draft state、附件入口与 chips 渲染
- 测试
  - `tests/unit/features/chat/FocusContextRuntimeService.test.ts`
- 直接相关文档
  - `docs/modules/features/chat/services/FocusContextRuntimeService.md`
  - `docs/modules/features/chat/OpenCodianView.md`
  - `docs/modules/README.md`

## 2. 变更文件

- `src/features/chat/services/FocusContextRuntimeService.ts`
- `src/features/chat/OpenCodianView.ts`
- `tests/unit/features/chat/FocusContextRuntimeService.test.ts`
- `docs/modules/features/chat/services/FocusContextRuntimeService.md`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/README.md`
- `docs/status/maintainability-phase-197.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- FocusContextRuntimeService`
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

- `autopilot-maintainability.202604121858`

## 5. 下一步建议

本轮完成后，`OpenCodianView` 已经把 focus preview / retained-selection runtime ownership 迁出；**下一轮可继续沿 P3 评估把 composer context chip attach/detach 与 preview-attach orchestration 收束到 dedicated coordinator，进一步削弱 view 在 context / composer 入口上的集中 ownership。**

一句话总结第一百九十七阶段本轮：

> 第一百九十七阶段把 focus context preview、活动 MarkdownView 回退查找，以及 retained-selection handoff/highlight/polling 从 `OpenCodianView` 迁到新的 `FocusContextRuntimeService`，推进了 master plan 的 P3 `context / composer / retained-selection` ownership 迁移。
