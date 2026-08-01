# 可维护性改进：第四百九十阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-489.md`
> **完成的 roadmap queue item**: `R155 - Typecheck gate recovery before zero-warning closeout`

## 1. 本轮范围

本轮严格执行 roadmap 的首个 `[NEXT]` 项：`R155 - Typecheck gate recovery before zero-warning closeout`。范围只限恢复真实 `typecheck` 绿灯所需的最小类型修复：对 `OpenCodianView` 的 host callback 返回类型做空值/void 对齐，修复 background-task OMO narrowing 与 tabId 可空边界，收束 settings server/runtime state 的类型面，补齐 opencode SDK/session lifecycle 适配类型，并通过根 `tsconfig.json` 排除无人值守生成的 `automation/runtime` worktree，消除 duplicated JSX shim snapshot 对主仓库类型门槛的污染；没有改变 chat runtime、settings 保存语义、background-task 流程、SDK-first / legacy fallback、managed server adoption/restart 或 JSX/render 行为。

## 2. Maintainability / Correctness 结果

- 根 `typecheck` 现在只检查真实源码树；`tsconfig.json` 已排除无人值守生成的 `automation/` worktree，避免 nested cutover snapshot、重复 JSX shim 与其测试副本污染仓库主类型门槛。
- `src/features/chat/OpenCodianView.ts` 的 conversation-history / composer-context / persistent-assistant-notice host 现已对齐 `Promise<void>`、`Conversation | null` 与 `string | undefined` 约束，不再依赖宽松返回值推断。
- `src/features/chat/services/BackgroundTaskTimelineAssemblyService.ts` 与 `src/features/chat/services/QuestionTodoBackgroundTaskRuntimeServiceBundle.ts` 现在显式收窄 system-reminder task 元数据与 `tabId ?? null` writeback，消除了 background-task runtime 的红线。
- `src/features/settings/OpenCodianSettings.ts` 与 `src/features/settings/SettingsModelSection.ts` 已把 server status/runtime activity 的类型边界收束到现有 owner 内，并为 provider icon label 提供稳定 fallback。
- `src/core/opencode/OpenCodeCatalogQueryCoordinator.ts`、`src/core/opencode/OpenCodeMessageContextOmoAssembler.ts`、`src/core/opencode/OpenCodeService.ts` 与 `src/core/opencode/OpenCodeServiceLifecycleCoordinator.ts` 已补齐 SDK 参数/返回值适配、text-part narrowing 与 subscription port typing，使 opencode owner 在不改行为的前提下重新通过严格类型检查。
- `src/types/jsx-shim.ts` 恢复为单一根 shim；结合根 `tsconfig.json` 调整后，`npm run lint -- --format unix` 现为 `0 errors / 38 warnings`，warning 数从上一轮记录的 `39` 条下降到 `38` 条。

## 3. 回归边界

- 不改变 `OpenCodianView` 的并发 tab/session streaming、hydration/auth-sync、background-task completion notice、scroll restore 或 question resolution 语义。
- 不改变 background-task timeline、question/todo activation、settings 保存与 provider icon runtime 的行为，只收束空值/union/type adapter。
- 不改变 `OpenCodeService` 的 SDK-first / legacy fallback、session-scoped abort/detach、managed server adoption/restart、sync-event bridge 或 MCP/provider 查询语义。
- 不改变 deploy-relevant 发布流程；本轮仅做类型门槛恢复与直接相关测试/import 对齐。

## 4. 验证

- Focused test: `npm test -- OpenCodeCatalogQueryCoordinator OpenCodeService.sdkCompat OpenCodeService.sessionRuntime OpenCodeServiceLifecycleCoordinator SettingsModelSection OpenCodianSettings QuestionTodoBackgroundTask PersistentAssistantNotice ConversationHistoryActions`
- Full lint: `npm run lint -- --format unix`
- Full typecheck: `npm run typecheck`
- Full test: `npm test`
- Build: `BUILD_ID=autopilot-maintainability.$(date +%Y%m%d%H%M); echo "$BUILD_ID"; BUILD_ID="$BUILD_ID" npm run build`

结果：

- Focused test：通过，`14 passed, 14 total` suites；`49 passed, 49 total` tests。
- Full lint：通过，`0 errors / 38 warnings`。
- Full typecheck：通过。
- Full test：通过，`286 passed, 286 total` suites；`1190 passed, 1190 total` tests。
- Build：通过，最新 `BUILD_ID` 为 `autopilot-maintainability.202604161558`。

## 5. 部署

- 本轮属于 no-deploy maintainability batch，且用户未要求部署；因此未执行 Test Vault 部署。

## 6. 文件变更

- `tsconfig.json`
- `src/core/opencode/OpenCodeCatalogQueryCoordinator.ts`
- `src/core/opencode/OpenCodeMessageContextOmoAssembler.ts`
- `src/core/opencode/OpenCodeService.ts`
- `src/core/opencode/OpenCodeServiceLifecycleCoordinator.ts`
- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/services/BackgroundTaskTimelineAssemblyService.ts`
- `src/features/chat/services/QuestionTodoBackgroundTaskRuntimeServiceBundle.ts`
- `src/features/settings/OpenCodianSettings.ts`
- `src/features/settings/SettingsModelSection.ts`
- `tests/unit/core/opencode/OpenCodeCatalogQueryCoordinator.test.ts`
- `docs/status/maintainability-master-plan.md`
- `docs/status/maintainability-round-roadmap.md`
- `docs/status/maintainability-lane-map.md`
- `docs/status/maintainability-phase-490.md`

## 7. 队列推进

- `docs/status/maintainability-round-roadmap.md` 已将 `R155` 标记为 `[DONE]`。
- 下一项 `R156 - Zero-warning hotspot closeout after typecheck recovery` 已提升为新的 `[NEXT]`。
- `docs/status/maintainability-master-plan.md` 与 `docs/status/maintainability-lane-map.md` 已同步刷新当前 queue 与质量门槛状态：`typecheck` 恢复通过，剩余 lint warning 为 `38` 条。

## 8. 下一步

- 下一推荐切片：`R156 - Zero-warning hotspot closeout after typecheck recovery`。
- 仅沿 roadmap 已列出的 heavy tests / glass/demo / opencode / chat hotspot 清理 remaining `38` 条 warnings；在 warning 清零之前，不切回新的 thick-owner seam。

> 第四百九十阶段完成 `R155`，恢复了根仓库 `typecheck` 绿灯，并把 live lint 基线从 `39` 条 warnings 压到 `38` 条，同时把 roadmap 推进到 `R156`。
