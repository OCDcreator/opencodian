# 可维护性改进：第一百七十五阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-174.md`
> **推进的 master-plan lane**: P1 `OpenCodianView` 中剩余的核心 ownership 迁移（sync bridge callback assembly）

本轮继续遵循 master plan 的 P1，没有回到 paused 的 `ConversationRenderService` / `TrailingAssistantPatch*` helper-fragmentation lane。实际切片是：**把 visible/signal/background conversation sync 的 callback 装配从 `OpenCodianView` 下沉到新的 `ConversationSyncBridge`；`OpenCodianView` 只保留 `syncConversationMessagesFromServer()`、`applySyncedConversationUpdate()` 和 `renderBackgroundTaskIndicatorIfNeeded()` 这些真正依赖 view host 的入口。**

这次改动没有改变 signal debounce、background polling tab 选择、per-tab sync runtime lock、visible sync post-sync outcome、hidden-tab attention 规则或 background-task post-sync 收尾语义；`ConversationSyncOrchestrationService` 仍负责 loop/signal dispatch，`ConversationSyncRuntimeCoordinator` 仍负责 active/hidden tab sync guard，`BackgroundTaskPostSyncCoordinator` 仍负责 question/todo/background-task 收尾。

## 1. 本轮范围

- `src/features/chat/services/ConversationSyncBridge.ts`
  - 新增 dedicated sync bridge，集中装配 visible/signal/background sync 的 server-sync callback
  - 统一绑定 `sync-event:*` / `background-tab-sync` reason、hidden-tab fingerprint commit 与 post-sync coordinator 调用
  - 只把真正依赖 DOM 的 render plan 回调给 `OpenCodianView`
- `src/features/chat/OpenCodianView.ts`
  - 新增 `ConversationSyncBridge` 实例与 host factory
  - `startConversationSyncLoop()`、signal sync 调度、visible/background sync 方法改为委托给 bridge
  - 删除 view 本地的 sync callback 拼装逻辑
- `tests/unit/features/chat/ConversationSyncBridge.test.ts`
  - 覆盖 visible sync apply/indicator 分流
  - 覆盖 signal sync 的 fingerprint commit 与 post-sync routing
  - 覆盖 background-tab polling callback 装配
- 直接相关文档
  - `docs/modules/features/chat/OpenCodianView.md`
  - `docs/modules/features/chat/services/ConversationSyncBridge.md`
  - `docs/modules/features/chat/services/ConversationSyncOrchestrationService.md`
  - `docs/modules/features/chat/services/ConversationSyncRuntimeCoordinator.md`
  - `docs/modules/features/chat/services/BackgroundTaskPostSyncCoordinator.md`

## 2. 变更文件

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/services/ConversationSyncBridge.ts`
- `tests/unit/features/chat/ConversationSyncBridge.test.ts`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/features/chat/services/ConversationSyncBridge.md`
- `docs/modules/features/chat/services/ConversationSyncOrchestrationService.md`
- `docs/modules/features/chat/services/ConversationSyncRuntimeCoordinator.md`
- `docs/modules/features/chat/services/BackgroundTaskPostSyncCoordinator.md`
- `docs/status/maintainability-phase-175.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- ConversationSyncBridge`
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

- `autopilot-maintainability.202604121419`

## 5. 下一步建议

下一轮如果继续沿 master plan 的 P1 前进，较高价值的相邻切片是把 sync 相关的 host adapter 进一步从 `OpenCodianView` 抽离：把 `createConversationSyncOrchestrationHost()`、`createConversationSyncBridgeHost()` 与 `createConversationSyncRuntimeCoordinatorHost()` 的 view-state 读取/写回桥，合并到 dedicated sync host module，让 view 不再直接持有多段 sync service host 装配代码。

一句话总结第一百七十五阶段本轮：

> 第一百七十五阶段新增 `ConversationSyncBridge`，把 visible/signal/background conversation sync 的 callback 装配从 `OpenCodianView` 下沉到 dedicated sync bridge，继续推进了 master plan 的 P1 `OpenCodianView` sync ownership 迁移。
