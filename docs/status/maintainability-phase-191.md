# 可维护性改进：第一百九十一阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-190.md`
> **推进的 master-plan lane**: P1 `OpenCodianView` 中剩余的核心 ownership 迁移（loaded-conversation post-render activation/render bridge）

本轮继续遵循 master plan，优先推进 `OpenCodianView` 相邻的 P1 `tab / pane / conversation activation` ownership 迁移，没有回到已暂停的 `ConversationRenderService` / `TrailingAssistantPatch*` helper-fragmentation lane。实际切片是：**把 loaded conversation 在消息重渲后的 `renderBackgroundTaskIndicatorIfNeeded()` ownership 从 `ConversationViewStateService` 收束到 `TabViewActivationBridge`，并把这段 post-render activation/render outcome 扩展成单一桥接入口。**

这次改动没有改变 loaded conversation 的 activation 判断、消息重渲、background-task indicator 本身的 DOM 渲染逻辑、post-render todo/question/status/session-todo refresh 顺序、scroll restore、hydration tail，或其它 sync/background-task lane 的 host wiring；只是把原先仍由 `ConversationViewStateService` 直接 await 的 background-task indicator render，并入同一个 activation/render bridge，让 service 进一步收敛到 hydration 与 scroll orchestration，而 `TabViewActivationBridge` 明确承接 loaded-conversation post-render UI outcome。

## 1. 本轮范围

- `src/features/chat/runtime/TabViewActivationBridge.ts`
  - `TabViewActivationBridgeHost` 新增 `renderBackgroundTaskIndicatorIfNeeded()`
  - 把 loaded-conversation post-render 边界从 `applyLoadedConversationPostRenderRefreshes()` 扩展为异步的 `applyLoadedConversationPostRenderOutcome()`，统一承接 background-task indicator → todo dock → question dock → status/questions/todos refresh 顺序
- `src/features/chat/services/ConversationViewStateService.ts`
  - `loadConversation()` 在消息重渲后不再直接调用 `renderBackgroundTaskIndicatorIfNeeded()`
  - `ConversationViewStateHost` 移除这条已迁出的 render host 回调，继续收窄 service host surface
- `src/features/chat/OpenCodianView.ts`
  - `createTabViewActivationBridgeHost()` 接管 loaded-conversation post-render indicator render 的 host 装配
  - `createConversationViewStateHost()` 删除已迁出的 background-task indicator host 回调
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
- `docs/status/maintainability-phase-191.md`

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

- `autopilot-maintainability.202604121740`

## 5. 下一步建议

下一轮如果继续沿 master plan 的 P1 收缩 `OpenCodianView` ownership，较高价值的相邻切片是把 **loaded-conversation hydration 里仍由 `ConversationViewStateService` 直接持有的 rehydrating class / scroll-restore shell 编排，评估是否继续收束到更明确的 hydration render bridge**，让 service 更专注于 activation decision 与 hydration lifecycle，而不是继续兼持消息容器 UI 壳层顺序。

一句话总结第一百九十一阶段本轮：

> 第一百九十一阶段把 loaded-conversation 在消息重渲后的 background-task indicator render 从 `ConversationViewStateService` 收束到 `TabViewActivationBridge`，推进了 master plan 的 P1 `tab / pane / conversation activation` ownership 迁移。
