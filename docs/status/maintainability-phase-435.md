# 可维护性改进：第四百三十五阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-434.md`
> **推进的 master-plan lane**: Maintainability / chat background sync
> **完成的 roadmap queue item**: `R100 - BackgroundConversation post-sync handoff seam`

本轮严格执行 roadmap 的首个 `[NEXT]` 项：`R100 - BackgroundConversation post-sync handoff seam`。范围限定在 background conversation post-sync handoff 的 shared view-host boundary、直接相关测试与状态文档；没有进入 `R101` 的 stream trigger runtime seam，也没有扩散到 `OpenCodeService`、`OpenCodianView` 或 settings lane。

## 1. 本轮范围

- 收束 `BackgroundConversationPostSyncHandoffHostAdapter` 内的 per-owner host fan-out，让同一个 dedicated handoff view host 直接满足 background refresh、signal authoritative mark 与 tab attention writeback 三组 port。
- 保留 `BackgroundConversationPostSyncHandoffCoordinator` 的 signal/background-tab 调度顺序与既有 `BackgroundConversationSignalSyncStateCoordinator`、`BackgroundConversationAttentionCoordinator` 行为。
- 更新 handoff host adapter 的 focused 单元测试，把已删除的 per-host derivation 断言替换为 end-to-end shared-host service wiring 覆盖。
- 同步更新直接相关 module docs 与 maintainability status docs，记录新的 shared handoff host seam，并推进 roadmap 到 `R101`。

## 2. 本轮改动

- `createBackgroundConversationPostSyncHandoffServices()` 不再先调用 `createBackgroundConversationPostSyncHandoffHosts()` 生成三组薄 host object，而是把 shared handoff view host 直接传给 `BackgroundConversationPostSyncRefreshExecutor`、`BackgroundConversationSignalSyncStateCoordinator` 与 `BackgroundConversationAttentionCoordinator`。
- 删除 `createBackgroundConversationPostSyncHandoffHosts()` 公开 factory surface，减少 host adapter 对 attention/signal follow-up 的额外 fan-out。
- `BackgroundConversationPostSyncHandoffHostAdapter.test.ts` 新增 background-tab handoff service wiring 断言，覆盖 shared host 触发 question/todo refresh、background task state rebuild、completion writeback 与 attention writeback 的顺序语义。
- `BackgroundConversationPostSyncHandoffCoordinator` 与 `BackgroundConversationPostSyncHandoffHostAdapter` 模块文档同步描述 shared view-host seam，避免继续把 per-owner host factory 作为稳定边界。

## 3. 验证

- `npm test -- --runTestsByPath tests/unit/features/chat/BackgroundConversationPostSyncHandoffHostAdapter.test.ts tests/unit/features/chat/BackgroundConversationPostSyncHandoffCoordinator.test.ts tests/unit/features/chat/QuestionTodoBackgroundTaskRuntimeViewHosts.test.ts tests/unit/features/chat/QuestionTodoBackgroundTaskRefreshHostAdapter.test.ts`
- `npm test`
- `BUILD_ID=autopilot-maintainability.$(date +%Y%m%d%H%M) npm run build`

验证结果：

- targeted `npm test -- --runTestsByPath tests/unit/features/chat/BackgroundConversationPostSyncHandoffHostAdapter.test.ts tests/unit/features/chat/BackgroundConversationPostSyncHandoffCoordinator.test.ts tests/unit/features/chat/QuestionTodoBackgroundTaskRuntimeViewHosts.test.ts tests/unit/features/chat/QuestionTodoBackgroundTaskRefreshHostAdapter.test.ts`：通过，`4` 个 suites / `10` 个 tests 全部通过，用时 `0.456 s`
- `npm test`：通过，`277 passed, 277 total` suites；`1151 passed, 1151 total` tests；用时 `4.647 s`
- `npm run build`：通过，`BUILD_ID` 为 `autopilot-maintainability.202604152152`

## 4. 部署

- 本轮修改位于 `src/features/chat/services/`、`tests/unit/features/chat/`、`docs/modules/` 与 maintainability 状态文档，未命中仓库约定的 Test Vault 强制部署路径。
- 未执行 Test Vault 部署；最近一次已验证部署仍为 `R64` 的 `autopilot-maintainability.202604150602`。

## 5. 文件变更

- `src/features/chat/services/BackgroundConversationPostSyncHandoffHostAdapter.ts`
- `tests/unit/features/chat/BackgroundConversationPostSyncHandoffHostAdapter.test.ts`
- `docs/modules/features/chat/services/BackgroundConversationPostSyncHandoffCoordinator.md`
- `docs/modules/features/chat/services/BackgroundConversationPostSyncHandoffHostAdapter.md`
- `docs/status/maintainability-master-plan.md`
- `docs/status/maintainability-round-roadmap.md`
- `docs/status/maintainability-lane-map.md`
- `docs/status/maintainability-phase-435.md`

## 6. 队列推进

- `docs/status/maintainability-round-roadmap.md` 已将 `R100` 标记为 `[DONE]`。
- 下一项 `R101 - BackgroundTaskStreamTriggerCoordinator runtime seam` 已提升为新的 `[NEXT]`。
- `docs/status/maintainability-master-plan.md` 与 `docs/status/maintainability-lane-map.md` 已同步刷新当前 `[NEXT]`、最近验证与首要热点入口。

## 7. 下一步

- 下一推荐切片：`R101 - BackgroundTaskStreamTriggerCoordinator runtime seam`
- 从 `src/features/chat/runtime/BackgroundTaskStreamTriggerCoordinator.ts` 与 `src/features/chat/services/QuestionTodoBackgroundTaskRuntimeServiceBundle.ts` 入手，继续收束 background task trigger arm/disarm、pending-task detection、stream follow-up 与 completion handoff residual。

一句话总结第四百三十五阶段本轮：

> 第四百三十五阶段完成 `R100`，把 background conversation post-sync 的 refresh、signal authoritative mark 与 attention writeback 重新收口到一个 shared handoff view-host seam，移除额外的 per-owner host fan-out。
