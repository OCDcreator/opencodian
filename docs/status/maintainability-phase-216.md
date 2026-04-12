# 可维护性改进：第二百一十六阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-215.md`
> **推进的 master-plan lane**: P2 `question / todo / background task`（session todo host-adapter bundle）

本轮继续先按 master plan 复审，仍优先选择能直接削弱 `OpenCodianView` ownership 的 P2 切口，没有回到已暂停的 `ConversationRenderService` / `TrailingAssistantPatch*` helper-fragmentation lane。实际切片是：**把 session todo 的 state/dock/refresh 三段 host factory 与 service wiring，从 `OpenCodianView` 迁到新的 `SessionTodoHostAdapter`，让 view 只保留一份 session todo host 与上层触发入口。**

这次改动没有改变现有语义：`SessionTodoStateService` 仍负责 todo/status snapshot、stale suppression 与 persisted notice 恢复，`SessionTodoDockCoordinator` 仍负责 dock 生命周期与 active/runtime session 选择，`SessionTodoStatusRefreshService` 仍负责主动 refresh 与 request-id stale guard。变化点只是把三段 shared host 装配与 service bundle wiring 收束到 dedicated adapter，减少 `OpenCodianView` 继续直接持有三份 session todo host factory 的 ownership。

## 1. 本轮范围

- `src/features/chat/services/SessionTodoHostAdapter.ts`
  - 新增 dedicated adapter，统一装配 `SessionTodoStateService`、`SessionTodoDockCoordinator`、`SessionTodoStatusRefreshService`
  - 保持 dock render、state 写回、refresh 成功后的 background-task reconcile 顺序不变
- `src/features/chat/OpenCodianView.ts`
  - 改为持有单一 `sessionTodoServices` bundle
  - 删除分散的三段 session todo host factory，改为只提供一份 `SessionTodoViewHost`
- 测试
  - 新增 `tests/unit/features/chat/SessionTodoHostAdapter.test.ts`
- 直接相关文档
  - 新增 `docs/modules/features/chat/services/SessionTodoHostAdapter.md`
  - 更新 `docs/modules/features/chat/OpenCodianView.md`
  - 更新 `docs/modules/features/chat/services/SessionTodoDockCoordinator.md`
  - 更新 `docs/modules/features/chat/services/SessionTodoStateService.md`
  - 更新 `docs/modules/features/chat/services/SessionTodoStatusRefreshService.md`

## 2. 变更文件

- `src/features/chat/services/SessionTodoHostAdapter.ts`
- `src/features/chat/OpenCodianView.ts`
- `tests/unit/features/chat/SessionTodoHostAdapter.test.ts`
- `docs/modules/features/chat/services/SessionTodoHostAdapter.md`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/features/chat/services/SessionTodoDockCoordinator.md`
- `docs/modules/features/chat/services/SessionTodoStateService.md`
- `docs/modules/features/chat/services/SessionTodoStatusRefreshService.md`
- `docs/status/maintainability-phase-216.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- SessionTodoHostAdapter SessionTodoStateService SessionTodoDockCoordinator staleSessionTodoState backgroundTaskHydrationState`
- `npm test`
- `npm run build`

补充检查：

- `rg -n "autopilot-maintainability\\.202604122255" /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/main.js`

## 4. 部署结果

`npm run build` 成功后，已按仓库约定部署到 Test Vault：

- 复制 `dist/main.js`
- 复制 `dist/manifest.json`
- 复制 `dist/styles.css`

部署目标：

- `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian`

本轮未改动 bundled assets，因此未复制 `dist/assets/`。

已校验 Test Vault 中的 `main.js` 包含本轮最新 `BUILD_ID`：

- `autopilot-maintainability.202604122255`

## 5. 下一步建议

session todo service bundle 的 host 装配迁出后，`OpenCodianView` 在 P2 子链上还剩一层明显的 session todo 触发入口粘合。**下一轮建议继续留在 P2，但改做更完整的 session todo runtime facade 切口：把 `applyStreamingTodoSnapshotFromTool()`、`getTabSessionTodos()` / `setTabSessionTodos()` 的上层触发入口，进一步收束到 shared runtime facade，供 `BackgroundTaskStreamTriggerCoordinator`、`TabConversationStateBridge` 与 live-signal adapter 复用。**

一句话总结第二百一十六阶段本轮：

> 第二百一十六阶段新增 `SessionTodoHostAdapter` 收束 session todo state/dock/refresh 三段 shared host wiring，推进了 master plan 的 P2 `question / todo / background task` ownership 迁移。
