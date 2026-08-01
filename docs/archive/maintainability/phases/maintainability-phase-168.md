# 可维护性改进：第一百六十八阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-167.md`
> **推进的 master-plan lane**: P2 `question / todo / background task 链路`

本轮继续遵循 master plan 的高优先级 P2，没有回到 paused 的 `ConversationRenderService` / `TrailingAssistantPatch*` helper-fragmentation lane。实际切片是：**把 background task live-signal reconciliation 与 authoritative-sync runtime gate，从 `OpenCodianView` 下沉到新的 `BackgroundTaskLiveSignalCoordinator`。**

这次改动没有改变 background task segment/timeline 推导、inline panel DOM 渲染、completion notice queue/flush，或 stopped/stale notice content；`OpenCodianView` 现在只保留何时 arm/reset gate、何时触发 render/notice host bridge 的编排，具体 live-signal 状态机与 authoritative-sync gate 过渡由 dedicated coordinator 承接。

## 1. 本轮范围

- `src/features/chat/services/BackgroundTaskLiveSignalCoordinator.ts`
  - 新增 `BackgroundTaskLiveSignalCoordinatorHost` 与 `BackgroundTaskLiveSignalRuntime`
  - 统一管理 `backgroundTaskAwaitingAuthoritativeSync` / `backgroundTaskLastAuthoritativeSyncAt` 的 arm、clear 与 ready 过渡
  - 承接 session todo/status live signal 下的 background-task reconcile、stale downgrade 与 indicator reset 判定
- `src/features/chat/OpenCodianView.ts`
  - 新增 `backgroundTaskLiveSignalCoordinator` 装配与 host bridge
  - `beginConversationHydration()`、`markBackgroundTaskAuthoritativeSync()`、`reconcileBackgroundTaskStateFromLiveSignals()` 改成通过 coordinator 协调
  - background task user-injection、tool start/end、runtime reset 与 conversation-derived state rebuild 不再直接维护 authoritative-sync gate 细节
- `tests/unit/features/chat/BackgroundTaskLiveSignalCoordinator.test.ts`
  - 新增 direct unit tests，覆盖 authoritative-sync logging、awaiting-sync gate、stale launch clear 与空 search-mode placeholder reset
- `tests/unit/features/chat/backgroundTaskAuthoritativeSyncLogging.test.ts`
  - 删除旧的 view-bound logging test，改由新的 coordinator-level 测试覆盖
- 直接相关文档
  - `docs/modules/features/chat/OpenCodianView.md`
  - `docs/modules/features/chat/services/BackgroundTaskLiveSignalCoordinator.md`

## 2. 变更文件

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/services/BackgroundTaskLiveSignalCoordinator.ts`
- `tests/unit/features/chat/BackgroundTaskLiveSignalCoordinator.test.ts`
- `tests/unit/features/chat/backgroundTaskAuthoritativeSyncLogging.test.ts`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/features/chat/services/BackgroundTaskLiveSignalCoordinator.md`
- `docs/status/maintainability-phase-168.md`

## 3. 验证

本轮实际执行并通过：

- `npm test`
- `npm run build`
- `git diff --check`

## 4. 部署结果

`npm run build` 成功后，已按仓库约定部署到 Test Vault：

- 复制 `dist/main.js`
- 复制 `dist/manifest.json`
- 复制 `dist/styles.css`

部署目标：

- `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian`

本轮未改动 bundled assets，因此未复制 `dist/assets/`。

已校验 Test Vault 中的 `main.js` 包含本轮最新 `BUILD_ID`：

- `autopilot-maintainability.202604121302`

## 5. 下一步建议

下一轮仍建议优先沿 master plan 的 P2 前进。更高价值的后续切片是把后台 tab / signal sync 完成后的 question refresh、todo/status refresh、completion notice flush 与 attention 标记这段 post-sync orchestration，从 `OpenCodianView` 下沉到 dedicated background-task sync coordinator，同时继续保留 segment/timeline 推导与 inline panel DOM 渲染在 view；不要回到 trailing-assistant helper 链，除非测试、构建或正确性问题直接要求。

一句话总结第一百六十八阶段本轮：

> 第一百六十八阶段把 background task live-signal reconciliation 与 authoritative-sync runtime gate 从 `OpenCodianView` 下沉到 `BackgroundTaskLiveSignalCoordinator`，推进了 master plan 的 P2 `question / todo / background task` ownership 迁移。
