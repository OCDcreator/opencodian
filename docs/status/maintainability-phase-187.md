# 可维护性改进：第一百八十七阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-186.md`
> **推进的 master-plan lane**: P1 `OpenCodianView` 中剩余的核心 ownership 迁移（tab / pane activation preflight 写回）

本轮继续遵循 master plan，优先推进 `OpenCodianView` 的 P1 `tab / pane / conversation activation` ownership 迁移，没有回到已暂停的 `ConversationRenderService` / `TrailingAssistantPatch*` helper-fragmentation lane。实际切片是：**把 tab 激活入口里剩余的 pane/UI 预刷新写回（`setActiveMessagesPane()`、focus preview、question dock、todo dock）从 `ConversationViewStateService` 的分散 host 回调收束到新的 `TabViewActivationBridge`。**

这次改动没有改变 tab 激活的分支判断、hydration 时序、streaming fast-path、empty-tab 清空行为，或 question/todo 的刷新顺序；只是把 tab 激活前置 UI writeback 变成一个独立 runtime boundary，让 `ConversationViewStateService` 更专注于 activation/hydration 决策，而 `OpenCodianView` 更接近 host/assembly。

## 1. 本轮范围

- `src/features/chat/runtime/TabViewActivationBridge.ts`
  - 新增 dedicated bridge，统一负责 tab 激活预刷新
  - 保持原有顺序：messages pane → focus preview → question dock → todo dock
- `src/features/chat/services/ConversationViewStateService.ts`
  - 构造时接收新的 activation bridge port
  - `activateTab()` 不再直接持有四个 pane/UI preflight host 回调
- `src/features/chat/OpenCodianView.ts`
  - 新增 `TabViewActivationBridge` 装配与 host
  - `ConversationViewStateService` host 去掉分散的 pane activation preflight wiring
- 测试
  - `tests/unit/features/chat/TabViewActivationBridge.test.ts`
  - `tests/unit/features/chat/ConversationViewStateService.test.ts`
- 直接相关文档
  - `docs/modules/features/chat/OpenCodianView.md`
  - `docs/modules/features/chat/services/ConversationViewStateService.md`
  - `docs/modules/features/chat/runtime/TabViewActivationBridge.md`

## 2. 变更文件

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/services/ConversationViewStateService.ts`
- `src/features/chat/runtime/TabViewActivationBridge.ts`
- `tests/unit/features/chat/ConversationViewStateService.test.ts`
- `tests/unit/features/chat/TabViewActivationBridge.test.ts`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/features/chat/services/ConversationViewStateService.md`
- `docs/modules/features/chat/runtime/TabViewActivationBridge.md`
- `docs/status/maintainability-phase-187.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- TabViewActivationBridge ConversationViewStateService`
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

- `autopilot-maintainability.202604121704`

## 5. 下一步建议

下一轮如果继续沿 master plan 的 P1 收缩 `OpenCodianView` ownership，较高价值的相邻切片是把 **streaming tab / empty-tab activation 后续 UI 刷新（selector、context usage、send-button，以及紧邻的 dock refresh）** 继续收束到同一条 tab view-activation 边界，让 `OpenCodianView` 不再同时持有 activation preflight 和 activation outcome UI 编排。

一句话总结第一百八十七阶段本轮：

> 第一百八十七阶段把 tab 激活入口里的 pane/UI preflight 写回从 `ConversationViewStateService` 的分散 host 回调收束到新的 `TabViewActivationBridge`，推进了 master plan 的 P1 `tab / pane / conversation activation` ownership 迁移。
