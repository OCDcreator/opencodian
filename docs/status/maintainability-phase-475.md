# 可维护性改进：第四百七十五阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-474.md`
> **推进的 master-plan lane**: Maintainability / chat services
> **完成的 roadmap queue item**: `R140 - Background timeline/context usage residual seam`

本轮严格执行 roadmap 的首个 `[NEXT]` 项：`R140 - Background timeline/context usage residual seam`。范围限定在 `BackgroundTaskTimelineService`、`ContextUsageService` 及其相邻 tests/docs；没有启动 `R141` 的 render/history/control 切片，也没有触碰 settings、opencode、startup 或 deploy-relevant runtime 路径。

## 1. 本轮范围

- 新增 `src/features/chat/services/BackgroundTaskTimelineAssemblyService.ts`，统一承接 persisted conversation messages、completion reminders 与 active runtime state 的 background-task segment assembly / diagnostics 责任。
- 新增 `src/features/chat/services/BackgroundTaskTimelineLaunchService.ts`，集中承接 task launch upsert、`bg_*` id 抽取、description fallback、completion matching 与 pending 过滤规则。
- 将 `src/features/chat/services/BackgroundTaskTimelineService.ts` 收窄为 runtime facade：保留 indicator reset/arm、conversation→runtime rebuild、inline renderability 与 copy 文案，对 timeline assembly / pending matching 只做委托。
- 新增 `src/features/chat/services/ContextUsageDisplayService.ts`，集中承接 context usage summary、token breakdown、context breakdown estimate 与 number/currency/percent formatter。
- 将 `src/features/chat/services/ContextUsageService.ts` 收窄为 `TabContextState` identity / stream delta / precise snapshot update facade，同时保留原 display static API 作为兼容委托。
- 只更新直接相关模块文档：background timeline service/assembly/launch 与 context usage service/display docs。

## 2. 结果

- `BackgroundTaskTimelineService.ts` 从 `836` 行收缩到 `268` 行，移除了该文件的 `max-lines` warning。
- `ContextUsageService.ts` 从 `662` 行收缩到 `264` 行，移除了该文件的 `max-lines` warning。
- 新增 owner 均保持厚度与明确职责：timeline assembly、launch matching、context display 三段不再继续堆在原 facade 文件内。
- live lint 从 `0 errors / 56 warnings` 降到 `0 errors / 54 warnings`。
- background-task persisted completion notice、pending matching、search-mode preparing inline state、context usage threshold/formatting、session todo stale notice 与 model selection 语义保持不变。

## 3. 验证

- Focused tests: `npm test -- BackgroundTaskTimelineService backgroundTaskTimeline BackgroundTaskInlinePanelRenderer ContextUsageService ContextDetailModal ContextRing`
- Focused lint: `npx eslint src/features/chat/services/BackgroundTaskTimelineService.ts src/features/chat/services/BackgroundTaskTimelineAssemblyService.ts src/features/chat/services/BackgroundTaskTimelineLaunchService.ts src/features/chat/services/ContextUsageService.ts src/features/chat/services/ContextUsageDisplayService.ts tests/unit/features/chat/BackgroundTaskTimelineService.test.ts tests/unit/features/chat/ContextUsageService.test.ts --format unix`
- Full lint: `npm run lint -- --format unix`
- Full test: `npm test`
- Build: `BUILD_ID=autopilot-maintainability.$(date +%Y%m%d%H%M); echo "$BUILD_ID"; BUILD_ID=$BUILD_ID npm run build`

验证结果：

- focused tests：通过，`4 passed, 4 total` suites；`17 passed, 17 total` tests
- focused lint：通过，相关 chat service/test 文件 `0 warnings`
- `npm run lint -- --format unix`：通过，live lint 为 `0 errors / 54 warnings`
- `npm test`：通过，`282 passed, 282 total` suites；`1189 passed, 1189 total` tests
- `npm run build`：通过，`BUILD_ID` 为 `autopilot-maintainability.202604160605`

## 4. 部署

- 本轮触及 `src/features/chat/services/**`、`docs/modules/**` 与 maintainability 状态文档，未命中 `src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/` 或 `src/features/settings/` 等 deploy-relevant 路径。
- 因此按仓库规则未执行 Test Vault 部署；最近一次部署仍为 `R133`，`BUILD_ID` `autopilot-maintainability.202604160412`。

## 5. 文件变更

- `src/features/chat/services/BackgroundTaskTimelineService.ts`
- `src/features/chat/services/BackgroundTaskTimelineAssemblyService.ts`
- `src/features/chat/services/BackgroundTaskTimelineLaunchService.ts`
- `src/features/chat/services/ContextUsageService.ts`
- `src/features/chat/services/ContextUsageDisplayService.ts`
- `docs/modules/features/chat/services/BackgroundTaskTimelineService.md`
- `docs/modules/features/chat/services/BackgroundTaskTimelineAssemblyService.md`
- `docs/modules/features/chat/services/BackgroundTaskTimelineLaunchService.md`
- `docs/modules/features/chat/services/ContextUsageService.md`
- `docs/modules/features/chat/services/ContextUsageDisplayService.md`
- `docs/status/maintainability-master-plan.md`
- `docs/status/maintainability-lane-map.md`
- `docs/status/maintainability-round-roadmap.md`
- `docs/status/maintainability-phase-475.md`

## 6. 队列推进

- `docs/status/maintainability-round-roadmap.md` 已将 `R140` 标记为 `[DONE]`。
- 下一项 `R141 - Conversation render/history controls residual seam` 已提升为新的 `[NEXT]`。
- `docs/status/maintainability-master-plan.md` 与 `docs/status/maintainability-lane-map.md` 已同步刷新 lint 基线、最近验证与当前 queue 入口。

## 7. 下一步

- 下一推荐切片：`R141 - Conversation render/history controls residual seam`
- 从 `src/features/chat/services/ConversationRenderService.ts`、`src/features/chat/services/ConversationHistoryActionsCoordinator.ts` 与 `src/features/chat/services/ChatSelectionControlsCoordinator.ts` 入手，继续收束 render/history/control residual，同时保持 message render ordering、trailing assistant patch、selection state、history action enablement 与 user markup rendering 语义不变。

一句话总结第四百七十五阶段本轮：

> 第四百七十五阶段完成 `R140`，把 background-task timeline assembly / launch matching 与 context usage display / breakdown 规则分别压回相邻厚 owner，让两个原 service 回到更清晰的 runtime/state facade 边界，并把 live lint warning 再降两档。
