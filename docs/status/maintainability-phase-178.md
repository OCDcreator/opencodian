# 可维护性改进：第一百七十八阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-177.md`
> **推进的 master-plan lane**: P1 `OpenCodianView` 中剩余的核心 ownership 迁移（session live-signal lifecycle）

本轮继续遵循 master plan 的 P1，没有回到 paused 的 `ConversationRenderService` / `TrailingAssistantPatch*` helper-fragmentation lane。实际切片是：**新增 `ConversationSessionLiveSignalAdapter`，把 `subscribeToSessionTodoUpdates()` / `subscribeToSessionStatusUpdates()` 的订阅生命周期、session→tab 匹配，以及 active-tab fallback 从 `OpenCodianView` 迁走；view 只保留命中 tab 后的 todo/status state bridge 与 background-task live reconciliation host。**

这次改动没有改变 session todo/status 的 fingerprint、stale suppression、background task authoritative-sync gate、live-signal stale downgrade，或 OpenCode 主动刷新逻辑；只是把剩余的 session live signal wiring 从 view 收束到 dedicated adapter，继续降低 `OpenCodianView` 的 runtime ownership。

## 1. 本轮范围

- `src/features/chat/services/ConversationSessionLiveSignalAdapter.ts`
  - 新增 dedicated live-signal adapter，统一持有 todo/status 两条 OpenCodeService listener 的启动、重启与释放
  - 集中处理 session 到打开 tab 的匹配，以及当前活动 conversation 的 fallback 路由
- `src/features/chat/OpenCodianView.ts`
  - 用 `ConversationSessionLiveSignalAdapter` 替换内联 `subscribeToSessionTodoUpdates()` / `subscribeToSessionStatusUpdates()` 与 session→tab routing
  - 新增 `createConversationSessionLiveSignalAdapterHost()`，把 view 侧的命中-tab state bridge 收束成单一 host
- `tests/unit/features/chat/ConversationSessionLiveSignalAdapter.test.ts`
  - 覆盖双订阅 restart/cleanup 语义
  - 覆盖共享 session 的多 tab 路由与 active-tab fallback
- 直接相关文档
  - `docs/modules/features/chat/OpenCodianView.md`
  - `docs/modules/features/chat/services/ConversationSessionLiveSignalAdapter.md`
  - `docs/modules/features/chat/services/SessionTodoStateService.md`

## 2. 变更文件

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/services/ConversationSessionLiveSignalAdapter.ts`
- `tests/unit/features/chat/ConversationSessionLiveSignalAdapter.test.ts`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/features/chat/services/ConversationSessionLiveSignalAdapter.md`
- `docs/modules/features/chat/services/SessionTodoStateService.md`
- `docs/status/maintainability-phase-178.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- ConversationSessionLiveSignalAdapter`
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

- `autopilot-maintainability.202604121451`

## 5. 下一步建议

下一轮如果继续沿 master plan 收缩 `OpenCodianView` 的 session/runtime ownership，较高价值的相邻切片是把 question/todo/background-task 一侧仍留在 view 的 live refresh / dock coordination 再往 dedicated runtime bridge 收束，优先审查 question dock 与 background-task post-sync 之间的装配边界。

一句话总结第一百七十八阶段本轮：

> 第一百七十八阶段新增 `ConversationSessionLiveSignalAdapter`，把 session todo/status live listener 的订阅与 session→tab 路由从 `OpenCodianView` 下沉到 dedicated adapter，继续推进了 master plan 的 P1 `OpenCodianView` runtime ownership 迁移。
