# 可维护性改进：第二百一十七阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-216.md`
> **推进的 master-plan lane**: P2 `question / todo / background task`（session todo runtime facade）

本轮继续先按 master plan 复审，仍优先选择能直接削弱 `OpenCodianView` ownership 的 P2 切口，没有回到已暂停的 `ConversationRenderService` / `TrailingAssistantPatch*` helper-fragmentation lane。实际切片是：**新增 `SessionTodoRuntimeFacade`，把 session todo 的 streaming snapshot、live-signal 写回，以及 activation/empty-tab session reset 入口，从 `OpenCodianView` 迁到共享 runtime facade，供 `BackgroundTaskStreamTriggerCoordinator`、`ConversationSessionLiveSignalAdapter` 与 `TabConversationStateBridge` 复用。**

这次改动没有改变现有语义：`SessionTodoStateService` 仍负责 todo/status runtime state、snapshot 规范化、stale suppression 与 persisted notice 协调，`SessionTodoStatusRefreshService` 仍负责主动 refresh 与 request-id stale guard，`SessionTodoDockCoordinator` 仍负责 dock 生命周期与 session→dock 渲染选择。变化点只是把剩余的 session todo 触发入口收束到 dedicated facade，并让 `SessionTodoHostAdapter` 统一返回这份 shared runtime bridge，进一步减少 `OpenCodianView` 继续直接持有 session todo helper 的 ownership。

## 1. 本轮范围

- `src/features/chat/services/SessionTodoRuntimeFacade.ts`
  - 新增 shared runtime facade，统一承接 todo/status get/set、streaming `todowrite` snapshot、live-signal update 与 tab session reset
- `src/features/chat/services/SessionTodoHostAdapter.ts`
  - 改为装配并返回 `runtimeFacade`
  - 让 dock / refresh 相关 wiring 通过 facade 复用同一份 session todo runtime bridge
- `src/features/chat/OpenCodianView.ts`
  - 删除 view 内联的 `getTabSessionTodos()` / `setTabSessionTodos()` / `getTabSessionStatus()` / `setTabSessionStatus()` / `applyStreamingTodoSnapshotFromTool()`
  - 改为让 background-task stream trigger、live-signal adapter 与 tab conversation state bridge 统一复用 `sessionTodoRuntimeFacade`
- `src/features/chat/runtime/TabConversationStateBridge.ts`
  - 把成对的 todo/status reset host 回调收束成 `resetTabSessionState()` / `clearTabSessionState()`
- 测试
  - 新增 `tests/unit/features/chat/SessionTodoRuntimeFacade.test.ts`
  - 更新 `tests/unit/features/chat/TabConversationStateBridge.test.ts`
  - 更新 `tests/unit/features/chat/staleSessionTodoState.test.ts`
- 直接相关文档
  - 新增 `docs/modules/features/chat/services/SessionTodoRuntimeFacade.md`
  - 更新 `docs/modules/features/chat/OpenCodianView.md`
  - 更新 `docs/modules/features/chat/services/SessionTodoHostAdapter.md`
  - 更新 `docs/modules/features/chat/services/ConversationSessionLiveSignalAdapter.md`
  - 更新 `docs/modules/features/chat/runtime/BackgroundTaskStreamTriggerCoordinator.md`
  - 更新 `docs/modules/features/chat/runtime/TabConversationStateBridge.md`

## 2. 变更文件

- `src/features/chat/services/SessionTodoRuntimeFacade.ts`
- `src/features/chat/services/SessionTodoHostAdapter.ts`
- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/runtime/TabConversationStateBridge.ts`
- `tests/unit/features/chat/SessionTodoRuntimeFacade.test.ts`
- `tests/unit/features/chat/TabConversationStateBridge.test.ts`
- `tests/unit/features/chat/staleSessionTodoState.test.ts`
- `docs/modules/features/chat/services/SessionTodoRuntimeFacade.md`
- `docs/modules/features/chat/services/SessionTodoHostAdapter.md`
- `docs/modules/features/chat/services/ConversationSessionLiveSignalAdapter.md`
- `docs/modules/features/chat/runtime/BackgroundTaskStreamTriggerCoordinator.md`
- `docs/modules/features/chat/runtime/TabConversationStateBridge.md`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/status/maintainability-phase-217.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- SessionTodoRuntimeFacade TabConversationStateBridge BackgroundTaskStreamTriggerCoordinator ConversationSessionLiveSignalAdapter SessionTodoHostAdapter`
- `npm test`
- `npm run build`

补充检查：

- `rg -n "autopilot-maintainability\\.202604122313" /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/main.js`

## 4. 部署结果

`npm run build` 成功后，已按仓库约定部署到 Test Vault：

- 复制 `dist/main.js`
- 复制 `dist/manifest.json`
- 复制 `dist/styles.css`

部署目标：

- `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian`

本轮未改动 bundled assets，因此未复制 `dist/assets/`。

已校验 Test Vault 中的 `main.js` 包含本轮最新 `BUILD_ID`：

- `autopilot-maintainability.202604122313`

## 5. 下一步建议

session todo runtime facade 迁出后，`OpenCodianView` 在 P2 子链上还剩一层 question/todo/background-task 的组合 refresh host 粘合。**下一轮建议继续留在 P2，但把 `QuestionTodoStatusRefreshCoordinator` 与 `BackgroundTaskPostSyncCoordinator` 之间仍留在 view 的 session 选择 / refresh host 组装，进一步收束成 shared post-sync facade，减少 activation/post-sync 两端对 session todo + question refresh bridge 的重复装配。**

一句话总结第二百一十七阶段本轮：

> 第二百一十七阶段新增 `SessionTodoRuntimeFacade` 收束 session todo 的 stream/live-signal/session-reset 触发入口，推进了 master plan 的 P2 `question / todo / background task` ownership 迁移。
