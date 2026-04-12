# 可维护性改进：第二百阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-199.md`
> **推进的 master-plan lane**: P2 `question / todo / background task` 链路（persisted notice append/dedupe ownership 迁移）

本轮先按 master plan 复审，优先切回高优先级的 P2 `question / todo / background task` ownership，而没有继续停留在已暂停的 `ConversationRenderService` / `TrailingAssistantPatch*` helper-fragmentation lane。实际切片是：**把 `OpenCodianView` 中 session todo stale notice、background-task stale/completion notice、turn diff notice、model-unavailable notice 共用的 persisted assistant notice append/dedupe 逻辑，迁到新的 `PersistentAssistantNoticeService`，统一承接 conversation 历史匹配、可见会话 render→save 顺序、hidden-tab save + attention、以及 sync fingerprint / hydration-scroll follow-up，让 view 只保留 render/save/tab-runtime host bridge。**

这次改动没有改变 stale/completion notice 的内容、fingerprint 规则、suppression 语义、`noticeMeta` 结构，或 visible/hidden conversation 的 notice 保存目标；只是把这一段原本仍集中在 `OpenCodianView` 的共享 notice persistence ownership 收束到 dedicated service，并让 session todo / background task 两条 P2 链路复用同一条边界。

## 1. 本轮范围

- `src/features/chat/services/PersistentAssistantNoticeService.ts`
  - 新增 persisted notice service，统一承接 assistant notice 的历史匹配、持久化追加、sync fingerprint 写回，以及 visible/hidden tab 后续动作
- `src/features/chat/OpenCodianView.ts`
  - 新增 notice-service host 装配
  - `SessionTodoStateService` / `BackgroundTaskNoticeStateService` / `BackgroundTaskCompletionNoticeService` host 改为委托 `PersistentAssistantNoticeService`
  - turn diff notice 与 model-unavailable notice 改为复用 notice service
- 测试
  - 新增 `tests/unit/features/chat/PersistentAssistantNoticeService.test.ts`
  - 删除已被 dedicated service 覆盖的 `tests/unit/features/chat/backgroundTaskNoticeDedup.test.ts`
- 直接相关文档
  - `docs/modules/features/chat/services/PersistentAssistantNoticeService.md`
  - `docs/modules/features/chat/OpenCodianView.md`
  - `docs/modules/features/chat/services/SessionTodoStateService.md`
  - `docs/modules/features/chat/services/BackgroundTaskNoticeStateService.md`
  - `docs/modules/features/chat/services/BackgroundTaskCompletionNoticeService.md`
  - `docs/modules/README.md`

## 2. 变更文件

- `src/features/chat/services/PersistentAssistantNoticeService.ts`
- `src/features/chat/OpenCodianView.ts`
- `tests/unit/features/chat/PersistentAssistantNoticeService.test.ts`
- `tests/unit/features/chat/backgroundTaskNoticeDedup.test.ts`
- `docs/modules/features/chat/services/PersistentAssistantNoticeService.md`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/features/chat/services/SessionTodoStateService.md`
- `docs/modules/features/chat/services/BackgroundTaskNoticeStateService.md`
- `docs/modules/features/chat/services/BackgroundTaskCompletionNoticeService.md`
- `docs/modules/README.md`
- `docs/status/maintainability-phase-200.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- PersistentAssistantNoticeService`
- `npm test`
- `npm run build`

补充检查：

- 通过 `rg -n "autopilot-maintainability\\.202604121946" /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/main.js` 校验部署产物已更新到本轮最新 `BUILD_ID`

## 4. 部署结果

`npm run build` 成功后，已按仓库约定部署到 Test Vault：

- 复制 `dist/main.js`
- 复制 `dist/manifest.json`
- 复制 `dist/styles.css`

部署目标：

- `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian`

本轮未改动 bundled assets，因此未复制 `dist/assets/`。

已校验 Test Vault 中的 `main.js` 包含本轮最新 `BUILD_ID`：

- `autopilot-maintainability.202604121946`

## 5. 下一步建议

本轮完成后，session todo stale notice 与 background-task stale/completion notice 已共用 dedicated persisted-notice boundary；**下一轮建议继续沿 master plan 的 P2，优先审查 `BackgroundTaskLiveSignalCoordinator` 与 `SessionTodoStateService` 之间仍留在 `OpenCodianView` 的 stale follow-up trigger / host routing（例如 `appendBackgroundTaskStoppedNotice()`、`reconcileStaleSessionTodoState()` 这一组桥接入口），把这段 background-task stale follow-up / notice trigger 协调再向 dedicated module 收束。**

一句话总结第二百阶段本轮：

> 第二百阶段把 session todo / background task / diff / model-unavailable 共用的 persisted assistant notice append/dedupe 逻辑从 `OpenCodianView` 迁到新的 `PersistentAssistantNoticeService`，推进了 master plan 的 P2 `question / todo / background task` ownership 迁移。
