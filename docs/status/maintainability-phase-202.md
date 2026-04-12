# 可维护性改进：第二百零二阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-201.md`
> **推进的 master-plan lane**: P2 `question / todo / background task` 链路（foreground background-task indicator/live-signal host bridge 收束）

本轮先按 master plan 复审，继续优先推进高优先级的 P2 `question / todo / background task` ownership，而没有回到已暂停的 `ConversationRenderService` / `TrailingAssistantPatch*` helper-fragmentation lane。实际切片是：**把 `BackgroundTaskIndicatorCoordinator` 对 foreground live-signal reconcile 与 tab stream-like UI sync 的依赖，从 `OpenCodianView` 的 callback host bridge 改成直接组合 `BackgroundTaskLiveSignalCoordinator` 与 `TabRuntimeStateBridge`，并把 host 契约收窄为只暴露 active tab、current conversation 与 runtime presence。**

这次改动没有改变 indicator render 顺序、completion notice queue/flush 顺序、inline panel 渲染语义，或 foreground background-task badge / send-button / rewind-fork 写回时机；只是把这组仍需要经由 `OpenCodianView` 转发的 foreground indicator/live-signal bridge 收束回 dedicated runtime modules 自身。

## 1. 本轮范围

- `src/features/chat/runtime/BackgroundTaskIndicatorCoordinator.ts`
  - 直接组合 `BackgroundTaskLiveSignalCoordinator` 与 `TabRuntimeStateBridge`
  - 精简 host 接口，只保留 active tab、current conversation 与 runtime presence 查询
- `src/features/chat/OpenCodianView.ts`
  - 调整 `BackgroundTaskIndicatorCoordinator` 的装配
  - 精简 indicator coordinator host，不再转发 foreground live-signal reconcile / stream-like sync callback
- 测试
  - 更新 `tests/unit/features/chat/BackgroundTaskIndicatorCoordinator.test.ts`
  - 更新 `tests/unit/features/chat/backgroundTaskTimeline.test.ts`
- 直接相关文档
  - `docs/modules/features/chat/OpenCodianView.md`
  - `docs/modules/features/chat/runtime/BackgroundTaskIndicatorCoordinator.md`
  - `docs/modules/features/chat/services/BackgroundTaskLiveSignalCoordinator.md`

## 2. 变更文件

- `src/features/chat/runtime/BackgroundTaskIndicatorCoordinator.ts`
- `src/features/chat/OpenCodianView.ts`
- `tests/unit/features/chat/BackgroundTaskIndicatorCoordinator.test.ts`
- `tests/unit/features/chat/backgroundTaskTimeline.test.ts`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/features/chat/runtime/BackgroundTaskIndicatorCoordinator.md`
- `docs/modules/features/chat/services/BackgroundTaskLiveSignalCoordinator.md`
- `docs/status/maintainability-phase-202.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- BackgroundTaskIndicatorCoordinator backgroundTaskTimeline`
- `npm test`
- `npm run build`

补充检查：

- 通过 `rg -n "autopilot-maintainability\\.202604122009" /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/main.js` 校验部署产物已更新到本轮最新 `BUILD_ID`

## 4. 部署结果

`npm run build` 成功后，已按仓库约定部署到 Test Vault：

- 复制 `dist/main.js`
- 复制 `dist/manifest.json`
- 复制 `dist/styles.css`

部署目标：

- `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian`

本轮未改动 bundled assets，因此未复制 `dist/assets/`。

已校验 Test Vault 中的 `main.js` 包含本轮最新 `BUILD_ID`：

- `autopilot-maintainability.202604122009`

## 5. 下一步建议

本轮完成后，foreground background-task indicator lane 已不再通过 `OpenCodianView` 转发 live-signal reconcile 与 stream-like sync；**下一轮建议继续沿 master plan 的 P2，优先审查 `refreshTabSessionTodos()` / `refreshTabSessionStatus()` 与 `ConversationSessionLiveSignalAdapter` host wiring，继续把剩余的 session todo/status → background-task reconcile 触发从 `OpenCodianView.reconcileBackgroundTaskStateFromLiveSignals()` wrapper 收束到 `BackgroundTaskLiveSignalCoordinator` 直接入口。**

一句话总结第二百零二阶段本轮：

> 第二百零二阶段把 foreground background-task indicator 的 live-signal reconcile 与 stream-like UI sync 从 `OpenCodianView` callback host bridge 收束到 `BackgroundTaskIndicatorCoordinator` 直接组合的 dedicated runtime modules，推进了 master plan 的 P2 `question / todo / background task` ownership 迁移。
