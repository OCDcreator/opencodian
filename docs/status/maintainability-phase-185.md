# 可维护性改进：第一百八十五阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-184.md`
> **推进的 master-plan lane**: P1 `OpenCodianView` 中剩余的核心 ownership 迁移（会话级 runtime 状态桥接）

本轮遵循 master plan，优先选择 `OpenCodianView` 剩余的高价值 ownership，而没有回到已暂停的 `ConversationRenderService` / `TrailingAssistantPatch*` helper-fragmentation lane。实际切片是：**把 tab stream-like badge、background-task badge、rewind/fork 按钮禁用态，以及多条 question / background-task / finalization 链路共用的 attention 写回，从 `OpenCodianView` 迁到新的 `TabRuntimeStateBridge`。**

这次改动没有改变 background-task live predicate、question/todo attention 规则、tab manager 的具体状态语义，或发送按钮更新时机；只是把“runtime state 如何写回 tab chrome 与消息区 DOM”这一层从主 view 收束成 dedicated runtime bridge，让 `OpenCodianView` 进一步退回 host/wiring。

## 1. 本轮范围

- `src/features/chat/runtime/TabRuntimeStateBridge.ts`
  - 新增 dedicated runtime bridge，统一负责 tab stream/background badge 写回
  - 收束 rewind / fork 按钮禁用态同步与 active send-button refresh
  - 集中 `setTabNeedsAttention()` 的 null guard 与 `TabManager` 写回
- `src/features/chat/OpenCodianView.ts`
  - 新增 `TabRuntimeStateBridge` 装配与 host
  - 把 `syncTabStreamLikeState()` / `syncActiveTabStreamLikeState()` 的具体逻辑委托给 bridge
  - 把 message finalization、background-task post-sync、question dock，以及 turn-diff notice 的 tab attention 写回统一路由到 bridge
- 测试
  - `tests/unit/features/chat/TabRuntimeStateBridge.test.ts`
- 直接相关文档
  - `docs/modules/features/chat/OpenCodianView.md`
  - `docs/modules/features/chat/runtime/TabRuntimeStateBridge.md`
  - `docs/modules/features/chat/userMessageActions.md`

## 2. 变更文件

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/runtime/TabRuntimeStateBridge.ts`
- `tests/unit/features/chat/TabRuntimeStateBridge.test.ts`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/features/chat/runtime/TabRuntimeStateBridge.md`
- `docs/modules/features/chat/userMessageActions.md`
- `docs/status/maintainability-phase-185.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- TabRuntimeStateBridge`
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

- `autopilot-maintainability.202604121634`

## 5. 下一步建议

下一轮如果继续沿 master plan 的 P1 收缩 `OpenCodianView` ownership，较高价值的相邻切片是把 **剩余的 tab conversation/activation 写回（例如 `setActiveTabConversation()` 一组 active-tab conversation bridge）** 继续从 view 迁到 dedicated tab runtime/view-state bridge，让 view 不再同时持有 tab chrome 状态写回与 conversation activation 装配。

一句话总结第一百八十五阶段本轮：

> 第一百八十五阶段把 tab stream/background badge、rewind-fork 按钮禁用态与 attention 写回从 `OpenCodianView` 迁到新的 `TabRuntimeStateBridge`，推进了 master plan 的 P1 `会话级 runtime 状态桥接`。
