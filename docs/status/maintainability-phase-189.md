# 可维护性改进：第一百八十九阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-188.md`
> **推进的 master-plan lane**: P1 `OpenCodianView` 中剩余的核心 ownership 迁移（loaded-conversation hydration 尾段 activation/runtime UI bridge）

本轮继续遵循 master plan，优先推进 `OpenCodianView` 的 P1 `tab / pane / conversation activation` ownership 迁移，没有回到已暂停的 `ConversationRenderService` / `TrailingAssistantPatch*` helper-fragmentation lane。实际切片是：**把 loaded conversation hydration 完成后紧邻的 composer layout sync、model selector/context usage identity 刷新，以及 context usage server fetch，从 `ConversationViewStateService` 收束到同一个 `TabViewActivationBridge`。**

这次改动没有改变 loaded conversation 的 activation 判断、hydration 生命周期、消息重渲、scroll restore、background task indicator、todo/question/status refresh，或 context usage snapshot 的 guard 逻辑；只是把 hydrate 尾段里仍然带有明显 activation/runtime UI 性质的 writeback 从 conversation-load orchestration 里迁出，让 `ConversationViewStateService` 更接近“hydrate/render coordinator”，而 `TabViewActivationBridge` 继续扩展为 pane activation 与 hydration-tail UI outcome 的统一边界。

## 1. 本轮范围

- `src/features/chat/runtime/TabViewActivationBridge.ts`
  - 扩展 bridge host，新增 loaded-conversation hydration tail 所需的 composer layout sync 与 context usage snapshot refresh host wiring
  - 新增 `applyLoadedConversationHydrationTail()`，保持原有顺序：composer layout sync → model selector → context usage identity → context usage snapshot fetch
- `src/features/chat/services/ConversationViewStateService.ts`
  - `TabViewActivationPort` 扩展为包含 hydrate-tail entry
  - `loadConversation()` 去掉内联的 composer/model/context usage 尾段写回，只在 scroll restore 之后委托 `TabViewActivationBridge`
  - 同时收窄 `ConversationViewStateHost`，移除已迁出的 composer/model/context usage host 回调
- `src/features/chat/OpenCodianView.ts`
  - `createTabViewActivationBridgeHost()` 补齐新 bridge host wiring
  - `createConversationViewStateHost()` 删除已经迁出的 hydrate-tail UI host 回调，保留 hydration/render orchestration host
- 测试
  - `tests/unit/features/chat/TabViewActivationBridge.test.ts`
  - `tests/unit/features/chat/ConversationViewStateService.test.ts`
- 直接相关文档
  - `docs/modules/features/chat/runtime/TabViewActivationBridge.md`
  - `docs/modules/features/chat/services/ConversationViewStateService.md`
  - `docs/modules/features/chat/OpenCodianView.md`

## 2. 变更文件

- `src/features/chat/runtime/TabViewActivationBridge.ts`
- `src/features/chat/services/ConversationViewStateService.ts`
- `src/features/chat/OpenCodianView.ts`
- `tests/unit/features/chat/TabViewActivationBridge.test.ts`
- `tests/unit/features/chat/ConversationViewStateService.test.ts`
- `docs/modules/features/chat/runtime/TabViewActivationBridge.md`
- `docs/modules/features/chat/services/ConversationViewStateService.md`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/status/maintainability-phase-189.md`

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

- `autopilot-maintainability.202604121723`

## 5. 下一步建议

下一轮如果继续沿 master plan 的 P1 收缩 `OpenCodianView` ownership，较高价值的相邻切片是把 **loaded conversation 在 render 完成后仍留在 `ConversationViewStateService` 内联的 todo dock / question dock / session status / pending question / active-session todos 刷新** 继续收束到同一个 `TabViewActivationBridge`，让 service 更专注于 hydration 与 scroll orchestration。

一句话总结第一百八十九阶段本轮：

> 第一百八十九阶段把 loaded-conversation hydration 尾段的 composer layout、model selector、context usage identity 与 context usage server fetch 从 `ConversationViewStateService` 收束到 `TabViewActivationBridge`，推进了 master plan 的 P1 `tab / pane / conversation activation` ownership 迁移。
