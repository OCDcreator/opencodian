# 可维护性改进：第一百七十三阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-172.md`
> **推进的 master-plan lane**: P1 `OpenCodianView` 中剩余的核心 ownership 迁移（sync orchestration）

本轮继续遵循 master plan 的 P1，没有回到 paused 的 `ConversationRenderService` / `TrailingAssistantPatch*` helper-fragmentation lane。实际切片是：**新增 `ConversationSyncOrchestrationService`，把 signal sync 与后台轮询 sync 中仍留在 `OpenCodianView` 的 tab / conversation 选择、conversation 加载和 hidden-tab dispatch 编排下沉出去；`OpenCodianView` 只保留 signal timer 调度、具体服务端拉取与 post-sync host bridge。**

这次改动没有改变 visible sync、hidden-tab sync、background-task post-sync 收尾、question/todo 刷新或 attention 判定语义；`ConversationSyncRuntimeCoordinator` 仍负责 runtime guard、`isConversationSyncInFlight` lock 与 fingerprint baseline。

## 1. 本轮范围

- `src/features/chat/services/ConversationSyncOrchestrationService.ts`
  - 新增 dedicated orchestration service，承接 signal sync active/hidden 分派、hidden tab conversation 加载，以及后台轮询 eligible tab 选择
  - 继续通过 `ConversationSyncRuntimeCoordinator` 执行 hidden-tab runtime lock 与 fingerprint baseline
- `src/features/chat/OpenCodianView.ts`
  - 装配 `ConversationSyncOrchestrationService`
  - `syncConversationFromSignal()` 与 `syncBackgroundTaskTabsInBackground()` 改为只提供 visible sync、server sync 与 post-sync 回调
- `tests/unit/features/chat/ConversationSyncOrchestrationService.test.ts`
  - 覆盖 active signal 回到 visible sync、inactive signal conversation 加载与后台轮询 eligible tab 选择
- 直接相关文档
  - `docs/modules/features/chat/OpenCodianView.md`
  - `docs/modules/features/chat/services/ConversationSyncOrchestrationService.md`
  - `docs/modules/features/chat/services/ConversationSyncRuntimeCoordinator.md`

## 2. 变更文件

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/services/ConversationSyncOrchestrationService.ts`
- `tests/unit/features/chat/ConversationSyncOrchestrationService.test.ts`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/features/chat/services/ConversationSyncOrchestrationService.md`
- `docs/modules/features/chat/services/ConversationSyncRuntimeCoordinator.md`
- `docs/status/maintainability-phase-173.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- ConversationSyncOrchestrationService`
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

- `autopilot-maintainability.202604121355`

## 5. 下一步建议

下一轮如果继续沿 master plan 的 P1 前进，较高价值的相邻切片是继续把 conversation sync 的 loop lifecycle / signal debounce timer 编排从 `OpenCodianView` 迁到 sync orchestration 边界，只把真正依赖 DOM 或具体服务端同步的回调留在 view 内，而不是回到 trailing-assistant helper 链。

一句话总结第一百七十三阶段本轮：

> 第一百七十三阶段新增 `ConversationSyncOrchestrationService`，把 signal 与后台轮询 sync 的 tab/conversation 选择、加载和 hidden-tab dispatch 从 `OpenCodianView` 下沉出去，继续推进了 master plan 的 P1 `OpenCodianView` sync orchestration ownership 迁移。
