# 可维护性改进：第一百八十三阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-182.md`
> **推进的 master-plan lane**: P2 `question / todo / background task` 链路（background-task stream trigger ownership）

本轮继续遵循 master plan 的 P2，优先削弱 `OpenCodianView` 在 background-task 相邻链路上的 ownership，没有回到 paused 的 `ConversationRenderService` / `TrailingAssistantPatch*` helper-fragmentation lane。实际切片是：**新增 `BackgroundTaskStreamTriggerCoordinator`，把 streaming tool-call start/end 与 primary-stream finalize 后的 background-task runtime trigger 从 `OpenCodianView` 迁到 dedicated runtime coordinator，并复用既有的 indicator/timeline 边界完成 rerender 与 launch upsert。**

这次改动没有改变 todo snapshot 语义、background-task launch/result 写回规则、authoritative-sync gate 时机，或 primary-stream finalize 后的 waiting/reset 判定；只是把这些仍集中在 view 内的 stream-side trigger orchestration 收束到单独模块，让 `OpenCodianView` 退回 host wiring。

## 1. 本轮范围

- `src/features/chat/runtime/BackgroundTaskStreamTriggerCoordinator.ts`
  - 新增 dedicated runtime coordinator，统一承接 streaming tool-call start/end 与 primary-stream finalize 后的 background-task trigger orchestration
  - 复用 `BackgroundTaskTimelineService.upsertLaunch()`、`BackgroundTaskIndicatorCoordinator.renderIfNeeded()` 与 todo refresh host，避免 view 再直接编排这组触发入口
- `src/features/chat/OpenCodianView.ts`
  - 新增 `BackgroundTaskStreamTriggerCoordinator` 的 host wiring 与实例化
  - stream controller callback 与 send pipeline finalize host 改为直接路由到新 coordinator
  - 移除 view 内原有的 `handleStreamingToolCallStart()` / `handleStreamingToolCallEnd()` / `finalizeBackgroundTaskIndicatorAfterPrimaryStream()` 内联实现
- 测试
  - `tests/unit/features/chat/BackgroundTaskStreamTriggerCoordinator.test.ts`
- 直接相关文档
  - `docs/modules/features/chat/OpenCodianView.md`
  - `docs/modules/features/chat/runtime/BackgroundTaskIndicatorCoordinator.md`
  - `docs/modules/features/chat/runtime/BackgroundTaskStreamTriggerCoordinator.md`
  - `docs/modules/README.md`

## 2. 变更文件

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/runtime/BackgroundTaskStreamTriggerCoordinator.ts`
- `tests/unit/features/chat/BackgroundTaskStreamTriggerCoordinator.test.ts`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/features/chat/runtime/BackgroundTaskIndicatorCoordinator.md`
- `docs/modules/features/chat/runtime/BackgroundTaskStreamTriggerCoordinator.md`
- `docs/modules/README.md`
- `docs/status/maintainability-phase-183.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- BackgroundTaskStreamTriggerCoordinator`
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

- `autopilot-maintainability.202604121606`

## 5. 下一步建议

下一轮如果继续沿 master plan 的 P2 收缩 `OpenCodianView` ownership，较高价值的相邻切片是把 **`hasTabBackgroundTaskIndicator()` 一组 session-live / pending-launch / grace-period 判定** 再向 dedicated runtime service 收束，让 view 不再同时持有 indicator trigger 与 “是否仍算 background task 运行中”的 runtime 判定。

一句话总结第一百八十三阶段本轮：

> 第一百八十三阶段新增 `BackgroundTaskStreamTriggerCoordinator`，把 background-task 的 streaming tool-call start/end 与 primary-stream finalize trigger 从 `OpenCodianView` 迁到 dedicated runtime coordinator，推进了 master plan 的 P2 `question / todo / background task` ownership 迁移。
