# Maintainability Round Roadmap

> **用途**: 这是无人值守 maintainability 的受控轮次队列。Autopilot 必须按顺序执行，不得自由发挥。
> **执行规则**: 每轮只允许处理第一个标记为 `[NEXT]` 的任务；成功后把它改成 `[DONE]`，并把紧随其后的首个 `[QUEUED]` 改成 `[NEXT]`。第 12 轮完成后必须暂停复盘，不得自动扩展新队列。

## 控制规则

- 不允许跳过当前 `[NEXT]` 去做“顺手的小抽取”。
- 如果当前 `[NEXT]` 已经在仓库中自然完成，先在 phase 文档里说明证据，再把它标记为 `[DONE]` 并推进下一个。
- 如果当前 `[NEXT]` 被测试、构建或正确性问题阻塞，只允许做解除阻塞所需的最小修改，不得借机切换赛道。
- 新增文件必须满足 master plan 的粒度规则；默认优先合并薄 provider / factory / adapter。
- 每个 queue item 的成功轮次都必须运行全量 `npm test` 与 `npm run build`。
- 每个 phase 文档必须明确说明：削弱了哪个 owner、缩短了哪条链、哪些边界刻意没有动。
- 不得继续细拆 `TrailingAssistantPatch*` 链路；不得回退 `SendPipelineRuntime`、`ScrollManager`、`ConversationViewStateService` 已经合理的边界。

## 总体路线

本轮规划目标是提升整体可维护性，降低单一文件复杂度，同时避免把“大单体”拆成“微碎片”。优先顺序是：先收束已经过碎的 P2 question/todo/background-task 链，再迁出 `OpenCodianView` 中仍然成块的 context 与 message ownership，最后处理 settings/core 的大 owner。

> **P2 状态（R6 完成后）**: R1-R6 已完成 question dock、todo refresh/status、background completion notice、post-sync handoff 与 session signal orchestration 的收束。剩余风险以回归为主：background tab 无 session 时的 dock 清理、post-sync todo/status gate、completion notice queue/fingerprint 去重，以及 live signal writeback 顺序。
>
> **P3 状态（R7 完成后）**: composer-context bundle 创建、`ContextAttachmentBuilder` 与 `ContextFileCatalogService` ownership 已收进 `ComposerContextViewFacade.create()`；`OpenCodianView` 只保留 view host seam、context row 挂载和按钮事件入口，后续 P3 风险以 facade / focus runtime 回归为主。

## Queue

### [DONE] R1 - 收束 P2 runtime provider 链

- **Lane**: P2 `question / todo / background task`
- **目标**: 收束 `QuestionTodoBackgroundTaskRuntimeServiceBundle.ts`、`QuestionTodoBackgroundTaskRuntimeHostProvider.ts`、`QuestionTodoBackgroundTaskRuntimeViewHostFactory.ts` 这条过长转发链，减少 question/todo/background-task 的跨文件跳转层级。
- **优先入口**:
  - `src/features/chat/services/QuestionTodoBackgroundTaskRuntimeServiceBundle.ts`
  - `src/features/chat/services/QuestionTodoBackgroundTaskRuntimeHostProvider.ts`
  - `src/features/chat/services/QuestionTodoBackgroundTaskRuntimeViewHostFactory.ts`
  - `src/features/chat/services/QuestionTodoBackgroundTaskActivationHostAdapter.ts`
  - `src/features/chat/services/QuestionTodoBackgroundTaskRefreshHostAdapter.ts`
- **允许边界**:
  - 允许合并低价值 provider / factory / adapter。
  - 允许更新直接相关 tests 与 docs/modules。
- **禁止项**:
  - 不新增同类 `*Provider` / `*Factory` / `*Adapter` 薄文件。
  - 不碰 `QuestionDock.ts` UI markup、stream routing、settings/core。
- **验收**:
  - 至少减少 2 个中间转发 seam，或让一条主调用链减少 2 次跨文件跳转。
  - phase 文档说明主调用链少跨了哪些文件。
  - 运行 targeted tests、全量 `npm test`、`npm run build`。

### [DONE] R2 - Question dock 生命周期协调

- **Lane**: P2 `question / todo / background task`
- **目标**: 把 pending requests、draft answers、active indexes、submit/reject 后处理收进一个较厚的 question lifecycle coordinator。
- **优先入口**:
  - `src/features/chat/OpenCodianView.ts` 中 `renderQuestionDock`、`handleQuestionDockSubmit`、question runtime maps 相关片段
  - `src/features/chat/ui/QuestionDock.ts`
  - `src/features/chat/services/QuestionDockCoordinator.ts`
  - `src/features/chat/services/QuestionDockRenderAdapter.ts`
  - `src/features/chat/services/QuestionDockWritebackFacade.ts`
  - `src/features/chat/services/QuestionResolutionFlowCoordinator.ts`
- **允许边界**:
  - 允许合并一句话 facade / adapter。
  - 保留 `QuestionDock.ts` 的 UI markup 与 `OpenCodeService.replyToQuestion/rejectQuestion` API。
- **禁止项**:
  - 不改变问题卡片交互行为。
  - 不新增只转发给 view 的 adapter。
- **验收**:
  - `OpenCodianView` 不再直接管理 question runtime map 的主要读写。
  - 新 owner 至少覆盖 request hydration 与 respond/reject 后处理。
  - 运行 targeted tests、全量 `npm test`、`npm run build`。

### [DONE] R3 - Session todo refresh/status 收束

- **Lane**: P2 `question / todo / background task`
- **目标**: 集中 `applySessionTodoUpdate`、`setTabSessionTodos`、stale suppression、dock render trigger，让 todo 初始同步、live update、stale 处理统一走一个 coordinator。
- **优先入口**:
  - `src/features/chat/OpenCodianView.ts` 中 session todo subscription / update / dock render 片段
  - `src/features/chat/services/SessionTodoHostAdapter.ts`
  - `src/features/chat/services/SessionTodoRuntimeFacade.ts`
  - `src/features/chat/services/SessionTodoStatusRefreshService.ts`
  - `src/features/chat/services/SessionTodoStateService.ts`
  - `src/features/chat/ui/SessionTodoDock.ts`
- **允许边界**:
  - 可保留 todo UI 呈现组件，也可把过薄 DOM wrapper 合并到更厚 coordinator。
  - 可更新相关 focused tests 与 docs。
- **禁止项**:
  - 不混入 background-task notice 或 question dock 逻辑。
  - 不回退 `ConversationViewStateService` 的职责边界。
- **验收**:
  - `OpenCodianView` 只通过 coordinator API 刷新/渲染 todo 状态。
  - Todo live update 和 stale 处理路径统一。
  - 运行 targeted tests、全量 `npm test`、`npm run build`。

### [DONE] R4 - Background task notice pipeline

- **Lane**: P2 `question / todo / background task`
- **目标**: 迁出 `collectBackgroundTaskSegments`、completion notice queue、flush/fingerprint 逻辑，形成 `BackgroundTaskNoticeService` 或相邻厚 owner。
- **优先入口**:
  - `src/features/chat/OpenCodianView.ts` 中 `reconcileBackgroundTaskStateFromLiveSignals`、`collectBackgroundTaskSegments`、`queueBackgroundTaskCompletionNotices`、`flushQueuedBackgroundTaskCompletionNotices`
  - `src/features/chat/services/BackgroundTaskCompletionNoticeService.ts`
  - `src/features/chat/services/BackgroundTaskNoticeStateService.ts`
  - `src/features/chat/services/BackgroundTaskTimelineService.ts`
  - `src/features/chat/services/PersistentAssistantNoticeService.ts`
- **允许边界**:
  - 新 service 可读 conversation messages 与 runtime metadata。
  - 新 service 可拥有 notice fingerprint / queue state。
- **禁止项**:
  - 不改变 general message renderer。
  - 不动 stream chunk parser 或 send pipeline。
- **验收**:
  - `OpenCodianView` 只调用 service reconcile/flush，不再持有 notice queue 细节。
  - Completion notice fingerprinting 有 focused coverage。
  - 运行 targeted tests、全量 `npm test`、`npm run build`。

### [DONE] R5 - P2 event orchestrator

- **Lane**: P2 `question / todo / background task`
- **目标**: 集中 `subscribeToSessionTodoUpdates`、`subscribeToSessionStatusUpdates`、`subscribeToSessionSyncEvents` 以及 signal routing / scheduling。
- **优先入口**:
  - `src/features/chat/OpenCodianView.ts` 中 session todo/status/sync subscription 片段
  - `src/features/chat/services/ConversationSyncEventLiveSignalHostAdapter.ts`
  - `src/features/chat/services/ConversationSessionSignalRuntimeHostProvider.ts`
  - `src/features/chat/services/BackgroundTaskLiveSignalCoordinator.ts`
- **允许边界**:
  - Dispatcher 只负责路由 signal 与调度已有 service。
  - 可依赖 R2-R4 新 owner。
- **禁止项**:
  - 不把 UI render 职责放进 dispatcher。
  - 不新增只包一层 subscription 的薄 facade。
- **验收**:
  - `OpenCodianView` 的 subscribe 方法只保留装配调用。
  - Reconcile/schedule 逻辑离开 view。
  - 运行 targeted tests、全量 `npm test`、`npm run build`。

### [DONE] R6 - P2 集成测试与文档回收

- **Lane**: P2 `question / todo / background task`
- **目标**: 补齐 question dock、todo refresh、background notice 的 focused tests，并同步 docs/modules 与 roadmap。
- **优先入口**:
  - R1-R5 新增或改动的 service/coordinator 文档与测试
  - `docs/modules/features/chat/services/`
  - `docs/status/maintainability-lane-map.md`
- **允许边界**:
  - 只做测试、文档和小型命名/导出整理。
- **禁止项**:
  - 不再开新重构切口。
  - 不碰 settings/core。
- **验收**:
  - P2 链路测试覆盖新增 owner。
  - roadmap 标明 P2 收束完成/剩余风险。
  - 运行 targeted tests、全量 `npm test`、`npm run build`。

### [DONE] R7 - P3 context/composer/retained-selection ownership

- **Lane**: P3 `context / composer / retained-selection`
- **目标**: 迁出 context catalog、composer chips、focus preview、retained selection 的一块完整 ownership，让 `OpenCodianView` 只通过小接口消费 context orchestration。
- **优先入口**:
  - `src/features/chat/OpenCodianView.ts` 中 context/composer/retained selection 片段
  - `src/features/chat/services/ContextUsageService.ts`
  - `src/features/chat/services/ContextFileCatalogService.ts`
  - `src/features/chat/services/ComposerContextCoordinator.ts`
  - `src/features/chat/composerContext.ts`
- **允许边界**:
  - 可新增一个较厚 coordinator，前提是拥有完整 lifecycle。
  - 可合并小型 context bridge。
- **禁止项**:
  - 不只拆小 helper。
  - 不碰 message streaming 或 P2 question/todo。
- **验收**:
  - `OpenCodianView` 不再直接编排主要 context lifecycle。
  - 新 owner 有 focused tests。
  - 运行 targeted tests、全量 `npm test`、`npm run build`。

### [DONE] R8 - P4 message shell / notice / timestamp ownership

- **Lane**: P4 `message shell / notice / timestamp`
- **目标**: 把 assistant shell、notice、footer/timestamp 组装迁到更厚的 render/finalizer service，减少 `OpenCodianView` 的消息级 DOM 细节。
- **优先入口**:
  - `src/features/chat/OpenCodianView.ts` 中 assistant shell / notice / footer / timestamp 片段
  - `src/features/chat/services/MessageFinalizationService.ts`
  - `src/features/chat/services/PersistentAssistantNoticeService.ts`
  - `src/features/chat/runtime/AssistantShellRenderer.ts`
  - `src/features/chat/runtime/AssistantFooterRenderer.ts`
  - `src/features/chat/runtime/AssistantNoticeRenderer.ts`
- **允许边界**:
  - 可迁移完整 notice / shell assembly ownership。
  - 可更新 renderer/finalizer 文档与 focused tests。
- **禁止项**:
  - 不碰 streaming chunk parser。
  - 不碰 question dock 或 todo dock。
  - 不新增只再包一层 notice adapter。
- **验收**:
  - `OpenCodianView` 不再直接持有主要消息级 DOM 组装流程。
  - 运行 targeted tests、全量 `npm test`、`npm run build`。

### [DONE] R9 - Settings panel scaffolding split

- **Lane**: Settings maintainability
- **目标**: 从 `OpenCodianSettings.ts` 抽出 section lifecycle、quick-nav、scroll restoration，让 settings tab 专注 section composition。
- **优先入口**:
  - `src/features/settings/OpenCodianSettings.ts`
  - `docs/modules/features/settings/OpenCodianSettings.md`
- **允许边界**:
  - 可新增 `SettingsSectionCoordinator` 或同等厚 owner。
  - 可覆盖 `prepareRestoreScrollOnNextOpen`、post-render setup、quick nav registration。
- **禁止项**:
  - 不动 model/provider/appearance 业务逻辑。
  - 不动 chat runtime。
- **验收**:
  - Settings tab 把 section lifecycle 与 quick-nav 委托给新 owner。
  - 新 owner 满足粒度规则并有 tests 或可验证覆盖。
  - 运行 targeted tests、全量 `npm test`、`npm run build`。

### [DONE] R10 - Settings model catalog presenter

- **Lane**: Settings maintainability
- **目标**: 把 provider/model accordion、search、bulk toggle、probe presentation 从 `OpenCodianSettings.ts` 收束为 presenter。
- **优先入口**:
  - `src/features/settings/OpenCodianSettings.ts`
  - `src/features/settings/ModelConfigModal.ts`
  - `src/features/settings/ModelPickerModal.ts`
  - `src/features/settings/ProviderIconCacheModal.ts`
  - `src/core/config/ModelConfigService.ts`
- **允许边界**:
  - Presenter 可发出 provider/model toggle semantic events。
  - Modal launch 可暂时留在 settings tab。
- **禁止项**:
  - 不改 `ModelConfigService` 核心 merge 规则。
  - 不改变 provider availability 语义或 icon fallback 顺序。
- **验收**:
  - Settings tab 不再直接铺开 catalog UI 状态机。
  - Presenter 有 focused coverage 或稳定验证。
  - 运行 targeted tests、全量 `npm test`、`npm run build`。

### [DONE] R11 - Core catalog state service

- **Lane**: Core config maintainability
- **目标**: 围绕 `ModelConfigService` + `OpencodeConfigManager` 提供明确 catalog state API，集中 `baseEffective` / `effective` / `currentEnabledProviderIds` 与 provider/model availability 操作。
- **优先入口**:
  - `src/core/config/ModelConfigService.ts`
  - `src/core/config/OpencodeConfigManager.ts`
  - `src/features/settings/OpenCodianSettings.ts`
  - `src/features/settings/modelConfigWorkspace.ts`
- **允许边界**:
  - 新 service 至少提供 3 个公开 API，例如 `getCatalogState`、`applyProviderAvailabilityChange`、`applyModelAvailabilityChange`、`probeProvider`。
  - 保持现有数据源和 server API。
- **禁止项**:
  - 不改变 `baseEffective` 与 filtered `effective` 区分。
  - 不改 server provider discovery 语义。
  - 不混入 UI DOM 逻辑。
- **验收**:
  - Provider/model availability 有 unit tests。
  - Settings presenter 或后续 UI 只消费 catalog state API。
  - 运行 targeted tests、全量 `npm test`、`npm run build`。

### [NEXT] R12 - Maintainability checkpoint

- **Lane**: Checkpoint
- **目标**: 暂停自动推进，复盘 `OpenCodianView`、`OpenCodianSettings`、`OpenCodeService` 的体量变化和链路复杂度，决定下一批 roadmap。
- **优先入口**:
  - `docs/status/maintainability-round-roadmap.md`
  - `docs/status/maintainability-master-plan.md`
  - 最近 11 个 phase 文档
  - `src/features/chat/OpenCodianView.ts`
  - `src/features/settings/OpenCodianSettings.ts`
  - `src/core/opencode/OpenCodeService.ts`
- **允许边界**:
  - 只做文档复盘、指标统计、roadmap 调整。
- **禁止项**:
  - 不开新代码重构。
  - 不允许 autopilot 自动扩展新队列继续跑。
- **验收**:
  - 更新 master plan / roadmap。
  - phase 文档总结每个 hotspot 缩减了什么、哪些链路仍需处理。
  - 将 autopilot 状态设置为需要人工确认后再继续。
