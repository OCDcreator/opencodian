# 可维护性改进：第一百九十四阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-193.md`
> **推进的 master-plan lane**: P1 `OpenCodianView` 中剩余的核心 ownership 迁移（loaded-conversation load-runtime bridge）

本轮继续遵循 master plan，优先推进 `OpenCodianView` 相邻的 P1 `tab / pane / conversation activation` ownership 迁移，没有回到已暂停的 `ConversationRenderService` / `TrailingAssistantPatch*` helper-fragmentation lane。实际切片是：**把 loaded-conversation activation 里仍由 `ConversationViewStateService` 直接持有的 conversation resolve / reload retry、server-sync 判定与 `load-conversation` revert-state 写回，迁到新的 `ConversationLoadRuntimeBridge`，让 service 更专注于 restore / activation / hydration orchestration。**

这次改动没有改变 streaming tab 激活时“只查已知 conversation、不额外 reload”的快速路径，没有改变 loaded-conversation miss 后仍先 `loadConversations()` 再重试一次的语义，也没有改变 `forceServerSync`、空消息、interrupted local assistant tail 驱动的 sync 判定，或 `load-conversation` sync 返回 revert state 后的写回行为；只是把这段 load-runtime 数据解析与 server-sync 入口从 `ConversationViewStateService` 的 host surface 收束到单一 runtime bridge。

## 1. 本轮范围

- `src/features/chat/runtime/ConversationLoadRuntimeBridge.ts`
  - 新增 loaded-conversation load-runtime bridge，统一承接 conversation resolve / reload retry、server-sync 判定与 `load-conversation` revert-state 写回
- `src/features/chat/services/ConversationViewStateService.ts`
  - `loadConversation()` 不再直接解析 conversation 或内联决定是否执行 `load-conversation` sync
  - streaming activation fast path 改为通过 `ConversationLoadRuntimeBridge` 查询 conversation，但保持默认不 reload 的语义
- `src/features/chat/OpenCodianView.ts`
  - 新增 `createConversationLoadRuntimeBridgeHost()`，负责 conversation lookup、sync 判定、server sync 与 revert-state 落点 host 装配
  - `ConversationViewStateService` 构造时改为注入新的 `ConversationLoadRuntimeBridge`
- 测试
  - `tests/unit/features/chat/ConversationLoadRuntimeBridge.test.ts`
  - `tests/unit/features/chat/ConversationViewStateService.test.ts`
- 直接相关文档
  - `docs/modules/features/chat/runtime/ConversationLoadRuntimeBridge.md`
  - `docs/modules/features/chat/services/ConversationViewStateService.md`
  - `docs/modules/features/chat/OpenCodianView.md`
  - `docs/modules/README.md`

## 2. 变更文件

- `src/features/chat/runtime/ConversationLoadRuntimeBridge.ts`
- `src/features/chat/services/ConversationViewStateService.ts`
- `src/features/chat/OpenCodianView.ts`
- `tests/unit/features/chat/ConversationLoadRuntimeBridge.test.ts`
- `tests/unit/features/chat/ConversationViewStateService.test.ts`
- `docs/modules/features/chat/runtime/ConversationLoadRuntimeBridge.md`
- `docs/modules/features/chat/services/ConversationViewStateService.md`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/README.md`
- `docs/status/maintainability-phase-194.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- ConversationLoadRuntimeBridge ConversationViewStateService`
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

- `autopilot-maintainability.202604121815`

## 5. 下一步建议

本轮完成后，`ConversationViewStateService` 在 loaded-conversation 链路上已经把 activation preflight、hydration shell、scroll/class restore、post-render UI outcome，以及 load-runtime resolve/sync 入口分别交给 dedicated bridge；**下一轮应先按 master plan 复审是否继续停留在这一条 P1 helper/bridge 链路，优先考虑切回更大的 `OpenCodianView` ownership 热点（例如 P2 `question / todo / background task` 或 P3 `context / composer`）**。

如果复审后仍继续沿 P1 收缩同一条 load/activation 链路，一个相对集中的相邻切片是：**评估把 loaded-conversation 里仍由 `ConversationViewStateService` 直接持有的 `syncBackgroundTaskStateFromConversation()` + render/baseline host surface，是否收束成更明确的 load-render bridge**，让 service 更接近纯 orchestration，而不是继续兼持 conversation-derived runtime/render outcome 入口。

一句话总结第一百九十四阶段本轮：

> 第一百九十四阶段把 loaded-conversation 的 conversation resolve / reload retry、server-sync 判定与 revert-state 写回从 `ConversationViewStateService` 收束到新的 `ConversationLoadRuntimeBridge`，推进了 master plan 的 P1 `OpenCodianView` 核心 ownership 迁移。
