# 可维护性改进：第二百零五阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-204.md`
> **推进的 master-plan lane**: P1 `tab / pane / conversation activation 与 sync orchestration`（activation/post-sync supplemental refresh ownership 下沉）

本轮先按 master plan 复审，优先选择仍能直接削弱 `OpenCodianView` ownership 的 P1 activation/sync orchestration 切口，而没有回到已暂停的 `ConversationRenderService` / `TrailingAssistantPatch*` helper-fragmentation lane。实际切片是：**把 `OpenCodianView`、`TabViewActivationBridge` 与 `BackgroundTaskPostSyncCoordinator` 之间散落的 `status + pending question + todo` post-open/post-sync 刷新顺序，提取到新的 `QuestionTodoStatusRefreshCoordinator`，并让 streaming / loaded / current-tab open activation 与 visible/signal/background post-sync 统一复用这条边界。**

这次改动没有改变 activation fast path 里的刷新触发顺序、visible post-sync 的 current-session todo/status 选择、background post-sync 里 pending-question → background-task rebuild → todo/status gate 的语义，或 `SessionTodoStatusRefreshService` 既有的 request-id stale guard；只是把这段跨 activation/post-sync 反复出现的组合刷新 ownership 从 view/bridge host surface 继续迁到 dedicated coordinator。

## 1. 本轮范围

- `src/features/chat/services/QuestionTodoStatusRefreshCoordinator.ts`
  - 新增 dedicated supplemental refresh coordinator
  - 统一承接 activation/open 与 post-sync 共享的 status + pending question + todo 刷新顺序
- `src/features/chat/OpenCodianView.ts`
  - 新增 coordinator host 装配
  - 让 `TabViewActivationBridge`、`BackgroundTaskPostSyncCoordinator` 与 `openConversationInCurrentTab()` 复用同一条 supplemental refresh 边界
- `src/features/chat/runtime/TabViewActivationBridge.ts`
  - 删除 bridge host 上分散暴露的 status/question/todo refresh callback
  - 改为只编排 activation UI writeback，并委托 coordinator 触发 supplemental refresh
- `src/features/chat/services/BackgroundTaskPostSyncCoordinator.ts`
  - 删除 post-sync host 上分散暴露的 pending-question / todo / status refresh callback 与 runtime gate
  - 改为注入 coordinator，只保留 authoritative mark、timeline rebuild hook、completion notice、attention 与 visible sync state-commit 判定
- 测试
  - 新增 `tests/unit/features/chat/QuestionTodoStatusRefreshCoordinator.test.ts`
  - 更新 `tests/unit/features/chat/TabViewActivationBridge.test.ts`
  - 更新 `tests/unit/features/chat/BackgroundTaskPostSyncCoordinator.test.ts`
  - 更新 `tests/unit/features/chat/ConversationViewStateService.test.ts`
- 直接相关文档
  - 新增 `docs/modules/features/chat/services/QuestionTodoStatusRefreshCoordinator.md`
  - 更新 `docs/modules/features/chat/OpenCodianView.md`
  - 更新 `docs/modules/features/chat/runtime/TabViewActivationBridge.md`
  - 更新 `docs/modules/features/chat/services/BackgroundTaskPostSyncCoordinator.md`
  - 更新 `docs/modules/features/chat/services/SessionTodoStatusRefreshService.md`

## 2. 变更文件

- `src/features/chat/services/QuestionTodoStatusRefreshCoordinator.ts`
- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/runtime/TabViewActivationBridge.ts`
- `src/features/chat/services/BackgroundTaskPostSyncCoordinator.ts`
- `tests/unit/features/chat/QuestionTodoStatusRefreshCoordinator.test.ts`
- `tests/unit/features/chat/TabViewActivationBridge.test.ts`
- `tests/unit/features/chat/BackgroundTaskPostSyncCoordinator.test.ts`
- `tests/unit/features/chat/ConversationViewStateService.test.ts`
- `docs/modules/features/chat/services/QuestionTodoStatusRefreshCoordinator.md`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/features/chat/runtime/TabViewActivationBridge.md`
- `docs/modules/features/chat/services/BackgroundTaskPostSyncCoordinator.md`
- `docs/modules/features/chat/services/SessionTodoStatusRefreshService.md`
- `docs/status/maintainability-phase-205.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- QuestionTodoStatusRefreshCoordinator TabViewActivationBridge BackgroundTaskPostSyncCoordinator ConversationViewStateService`
- `npm test`
- `npm run build`

补充检查：

- 通过 `rg -n "autopilot-maintainability\\.202604122051" /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/main.js` 校验部署产物已更新到本轮最新 `BUILD_ID`

## 4. 部署结果

`npm run build` 成功后，已按仓库约定部署到 Test Vault：

- 复制 `dist/main.js`
- 复制 `dist/manifest.json`
- 复制 `dist/styles.css`

部署目标：

- `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian`

本轮未改动 bundled assets，因此未复制 `dist/assets/`。

已校验 Test Vault 中的 `main.js` 包含本轮最新 `BUILD_ID`：

- `autopilot-maintainability.202604122051`

## 5. 下一步建议

本轮完成后，activation/post-sync 共享的 supplemental refresh 顺序已经不再散落在 view、activation bridge 与 post-sync coordinator host 上；**下一轮建议继续沿 master plan 的 P1，把 `openConversationInCurrentTab()` 里仍由 `OpenCodianView` 自己持有的 current-tab open shell（indicator reset、messages 容器清空、turn state reset、sync baseline、context/background indicator follow-up）提升成 dedicated current-tab activation/open bridge，继续压缩 view 对当前 tab 打开路径的直接 orchestration ownership。**

一句话总结第二百零五阶段本轮：

> 第二百零五阶段把 activation/post-sync 里散落的 `status + pending question + todo` 组合刷新顺序迁到 `QuestionTodoStatusRefreshCoordinator`，推进了 master plan 的 P1 `tab / pane / conversation activation 与 sync orchestration` ownership 迁移。
