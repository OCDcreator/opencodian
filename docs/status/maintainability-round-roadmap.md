# Maintainability Round Roadmap

> **用途**: 这是无人值守 maintainability 的受控轮次队列。Autopilot 必须按顺序执行，不得自由发挥。
> **执行规则**: 每轮只允许处理第一个标记为 `[NEXT]` 的任务；成功后把它改成 `[DONE]`，并把紧随其后的首个 `[QUEUED]` 改成 `[NEXT]`。R27 完成后必须暂停复盘，不得自动扩展新队列。
> **当前状态**: [CONFIRMED_NIGHT_BATCH] R19-R27 已确认；当前 `[NEXT]` 是 R25 Stream event transformer。

## 控制规则

- 不允许跳过当前 `[NEXT]` 去做“顺手的小抽取”。
- 如果当前 `[NEXT]` 已经在仓库中自然完成，先在 phase 文档里说明证据，再把它标记为 `[DONE]` 并推进下一个。
- 如果当前 `[NEXT]` 被测试、构建或正确性问题阻塞，只允许做解除阻塞所需的最小修改，不得借机切换赛道。
- 新增文件必须满足 master plan 的粒度规则；默认优先合并薄 provider / factory / adapter。
- 每个 queue item 的成功轮次都必须运行全量 `npm test` 与 `npm run build`。
- 每个 phase 文档必须明确说明：削弱了哪个 owner、缩短了哪条链、哪些边界刻意没有动。
- 不得继续细拆 `TrailingAssistantPatch*` 链路；不得回退 `SendPipelineRuntime`、`ScrollManager`、`ConversationViewStateService` 已经合理的边界。

## 总体路线

本轮规划目标是提升整体可维护性，降低单一文件复杂度，同时避免把“大单体”拆成“微碎片”。R1-R12 已完成 P2/P3/P4/settings/core-config 的首批收束；R13-R18 下一批已确认转向 `OpenCodianView` 中仍然成块的 UI/runtime shell ownership，按 tab pane → header → input → selector → appearance/glass → checkpoint 的顺序推进。

> **P2 状态（R6 完成后）**: R1-R6 已完成 question dock、todo refresh/status、background completion notice、post-sync handoff 与 session signal orchestration 的收束。剩余风险以回归为主：background tab 无 session 时的 dock 清理、post-sync todo/status gate、completion notice queue/fingerprint 去重，以及 live signal writeback 顺序。
>
> **P3 状态（R7 完成后）**: composer-context bundle 创建、`ContextAttachmentBuilder` 与 `ContextFileCatalogService` ownership 已收进 `ComposerContextViewFacade.create()`；`OpenCodianView` 只保留 view host seam、context row 挂载和按钮事件入口，后续 P3 风险以 facade / focus runtime 回归为主。
>
> **Checkpoint 状态（R12 完成后）**: 当前 `OpenCodianView.ts` / `OpenCodianSettings.ts` / `OpenCodeService.ts` 分别为 7732 / 4989 / 4733 行。本批明显收缩了 settings owner，并把 chat 侧多条链路迁出；`OpenCodeService` 未进入本批代码切口。下一批 R13-R18 已确认转向 `OpenCodianView` 的 tab/messages pane、header/input、selector/appearance UI/runtime shell；R18 后再判断是否转向 `OpenCodeService`。

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

### [DONE] R12 - Maintainability checkpoint

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

## R12 Checkpoint Result

- 本轮只做文档复盘、指标统计和 roadmap 状态调整，没有开启新代码重构。
- 已完成的 owner 缩减：P2 question/todo/background-task 链路、P3 composer-context bundle、P4 persisted assistant shell、settings section/model catalog、core catalog state API。
- 仍需人工排序的热点：`OpenCodianView` 的 tab activation / runtime bridge / header-appearance-model 边界，`OpenCodianSettings` 的剩余 section composition 与 modal launch，`OpenCodeService` 的 SDK/legacy/sync-event 边界。
- 当前队列到此结束，不自动新增 `[QUEUED]` 或 `[NEXT]` 项；下一批 roadmap 必须由人工确认后再写入。


## Confirmed Next Batch: R13-R18 `OpenCodianView` UI/runtime shell

本批由人工确认：继续降低 `OpenCodianView` 的 ownership 集中度，但不回到已完成的 P2/P3/P4 细碎链路。`OpenCodeService` 暂不进入本批，等 R18 checkpoint 后再单独设计 SDK-first / legacy fallback / sync-event 兼容边界。

### [DONE] R13 - Tab messages pane surface coordinator

- **Lane**: P1 `OpenCodianView tab / pane surface`
- **目标**: 把 messages pane lifecycle、active pane 切换、scroll metrics、pane observer 和 pane cleanup 从 `OpenCodianView` 收束到一个较厚 owner，让 view 不再直接管理 pane DOM map 的主要生命周期。
- **优先入口**:
  - `src/features/chat/OpenCodianView.ts` 中 `observeMessagesPaneChildren`、`syncPaneScrollMetrics`、`handleMessagesPaneScroll`、`handleMessagesPaneLayoutChange`
  - `src/features/chat/OpenCodianView.ts` 中 `ensureTabMessagesPane`、`setActiveMessagesPane`、`removeTabMessagesPane`、`clearTabMessagesPanes`
  - `src/features/chat/tabs/`
  - `src/features/chat/services/ScrollManager.ts`
- **允许边界**:
  - 可新增 `TabMessagesPaneCoordinator` 或同等厚 owner，前提是同时覆盖 create / activate / remove / clear / scroll metrics。
  - 可保留 `OpenCodianView` 的 host callbacks、必要 DOM root 和 `TabManager` 调用入口。
- **禁止项**:
  - 不新增只转发一个 map getter 的 provider / factory / adapter。
  - 不改 P2 question/todo/background-task、P3 composer-context、P4 persisted assistant shell。
  - 不回退 `ConversationViewStateService`、`ScrollManager` 或已有 tab bridge 边界。
- **验收**:
  - `OpenCodianView` 通过 coordinator API 管理 tab messages pane lifecycle。
  - 新 owner 满足粒度规则，且不是单方法 wrapper。
  - 运行 targeted tests、全量 `npm test`、`npm run build`。

### [DONE] R14 - Header and server status shell presenter

- **Lane**: P1 `OpenCodianView header / server status shell`
- **目标**: 把 header DOM、server status label/action、wordmark/settings button 组装迁到 `ChatHeaderPresenter` 或同等厚 owner，让 view 只提供 server/status/settings 回调。
- **优先入口**:
  - `src/features/chat/OpenCodianView.ts` 中 `buildHeader`
  - `src/features/chat/OpenCodianView.ts` 中 `applyLocaleTexts` 与 header 文案相关片段
  - `src/features/chat/OpenCodianView.ts` 中 `startServerStatusLoop`、`stopServerStatusLoop`、`getServerStatusLabel`
  - `src/features/chat/OpenCodianView.ts` 中 `getLogoSvg`、`getTitleWordmarkSrc`、`syncTitleWordmarkSrc`
- **允许边界**:
  - Presenter 可拥有 header refs、status render/update、settings/open-server-section actions。
  - 可保留 server lifecycle service 与 plugin settings API 在 view / plugin 层。
- **禁止项**:
  - 不混入 model selector、permission selector 或 input composer。
  - 不改变 server manager / OpenCode service 行为。
  - 不新增仅包 `buildHeader()` 一次调用的薄 adapter。
- **验收**:
  - Header/status DOM 细节离开 `OpenCodianView`，view 只负责创建 presenter 和提供回调。
  - Locale/status refresh 有 focused coverage 或稳定验证。
  - 运行 targeted tests、全量 `npm test`、`npm run build`。

### [DONE] R15 - Composer input shell coordinator

- **Lane**: P1 `OpenCodianView composer input shell`
- **目标**: 把 input area DOM、textarea 行为、submit gate、高度同步与 composer layout metrics 收束为较厚 input shell owner。
- **优先入口**:
  - `src/features/chat/OpenCodianView.ts` 中 `buildInputArea`
  - `src/features/chat/OpenCodianView.ts` 中 `trySubmitCurrentInput`、`syncInputTextareaHeight`
  - `src/features/chat/OpenCodianView.ts` 中 `initializeComposerLayoutMetrics`、`scheduleComposerLayoutSync`、`clearScheduledComposerLayoutSync`、`syncComposerLayoutMetrics`
  - `src/features/chat/OpenCodianView.ts` 中 input/composer 相关 event wiring
- **允许边界**:
  - 可新增 `ComposerInputShellCoordinator` 或同等厚 owner，拥有 textarea refs、layout sync 和 submit affordance。
  - 可继续调用已有 send pipeline、context facade、question dock positioning。
- **禁止项**:
  - 不处理 liquid-glass diagnostics / adapter mount；这留给 R17。
  - 不改 send pipeline runtime、streaming parser 或 question/todo runtime。
  - 不新增只转发 `trySubmitCurrentInput()` 的薄 helper。
- **验收**:
  - Input area DOM 与 layout sync 主要逻辑离开 `OpenCodianView`。
  - 新 owner 具备完整 lifecycle 或至少 3 个公开动作入口。
  - 运行 targeted tests、全量 `npm test`、`npm run build`。

### [DONE] R16 - Model and permission selector ownership

- **Lane**: P1 `OpenCodianView selection controls`
- **目标**: 把 chat 内 model selector 与 permission selector 的 dropdown/search/list/selection display ownership 从 `OpenCodianView` 迁出到一个 selection controls owner。
- **优先入口**:
  - `src/features/chat/OpenCodianView.ts` 中 `initializeModelSelector` 到 `getSendMessageOptions` 的 model selector 区段
  - `src/features/chat/OpenCodianView.ts` 中 `initializePermissionSelector` 到 `closePermissionDropdown` 的 permission selector 区段
  - `src/features/chat/ui/modelSelector/`
  - `src/features/chat/runtime/PermissionInlineCardRenderer.ts`
- **允许边界**:
  - 可新增一个 `ChatSelectionControlsCoordinator`，同时覆盖 model 与 permission 的 dropdown lifecycle。
  - 可保留 model catalog data source、provider icon service 与 plugin settings writeback 在 host 回调中。
- **禁止项**:
  - 不改 settings model catalog、`ModelCatalogStateService`、provider availability 语义或 icon fallback 顺序。
  - 不改 send pipeline options 语义。
  - 不把 model 与 permission 再拆成两个低价值薄 presenter，除非每个 owner 都明显超过粒度规则并有独立 lifecycle。
- **验收**:
  - `OpenCodianView` 不再直接铺开 model/permission dropdown 状态机。
  - Send options 与 permission display 有 focused coverage 或稳定验证。
  - 运行 targeted tests、全量 `npm test`、`npm run build`。

### [DONE] R17 - Input appearance and glass state coordinator

- **Lane**: P5 `appearance / glass / input panel state`
- **目标**: 把 input panel theme class、action button style、SVG filter layer、liquid-glass adapter mount 与 diagnostics state 从 `OpenCodianView` 收束到 appearance/glass coordinator。
- **优先入口**:
  - `src/features/chat/OpenCodianView.ts` 中 `applyInputPanelThemeState`、`applyInputActionButtonStyleState`
  - `src/features/chat/OpenCodianView.ts` 中 `ensureComposerGlassSvgRoot`、`buildLiquidGlassMountContext`、`unmountLiquidGlassAdapter`
  - `src/features/chat/OpenCodianView.ts` 中 `ensureComposerSvgFilterLayer`、`removeComposerSvgFilterLayer`
  - `src/features/chat/OpenCodianView.ts` 中 `scheduleLiquidGlassDiagnostics`、`logLiquidGlassDiagnostics` 及 diagnostics helpers
- **允许边界**:
  - 可新增 `InputPanelAppearanceCoordinator`，拥有 mount/unmount、class sync、filter layer 与 diagnostics lifecycle。
  - 可保留 experimental demo toggle 入口在 view，但不得把 demo 暴露到 stable UI。
- **禁止项**:
  - 不改 theme preset / settings normalization / CSS token 语义。
  - 不混入 composer input textarea 或 model selector 行为。
  - 不让 experimental visual demo 进入稳定 UI 路径。
- **验收**:
  - Input panel appearance/glass state 主要逻辑离开 `OpenCodianView`。
  - 变更若命中 deploy-relevant runtime/style 路径，按 AGENTS 规则 build 后部署 Test Vault 并验证 BUILD_ID。
  - 运行 targeted tests、全量 `npm test`、`npm run build`。

### [DONE] R18 - UI shell checkpoint and next-lane decision

- **Lane**: Checkpoint
- **目标**: 暂停自动推进，复盘 R13-R17 对 `OpenCodianView` 的体量和调用链影响，并决定下一批是否转向 `OpenCodeService`。
- **优先入口**:
  - `docs/status/maintainability-round-roadmap.md`
  - `docs/status/maintainability-master-plan.md`
  - `docs/status/maintainability-lane-map.md`
  - R13-R17 phase 文档
  - `src/features/chat/OpenCodianView.ts`
  - `src/core/opencode/OpenCodeService.ts`
- **允许边界**:
  - 只做测试、文档、指标统计和下一批建议。
- **禁止项**:
  - 不开新代码重构。
  - 不允许 autopilot 自动扩展 R19+。
- **验收**:
  - phase 文档总结 `OpenCodianView` 缩减了什么、哪些 UI/runtime shell 边界仍需处理。
  - 明确下一批是否进入 `OpenCodeService` SDK/legacy/sync-event boundary。
  - 将 roadmap 状态设置为需要人工确认后再继续。
  - 运行全量 `npm test`、`npm run build`。

## R18 Checkpoint Result

- `OpenCodianView.ts` 已从 R12 checkpoint 的 **7732 行** 收缩到当前 **6203 行**，R13-R17 合计减少 **1529 行**（约 **19.8%**），tab pane、header/status、composer input、selection controls、input appearance/glass 五块 UI shell ownership 已迁出。
- `OpenCodianSettings.ts` / `OpenCodeService.ts` 当前分别保持在 **4989** / **4733** 行；settings 不是本批默认下一站，而 `OpenCodeService` 仍保留 SDK facade consumption、legacy HTTP/SSE fallback、sync-event normalization、question/tool/session/config glue 的高集中 ownership。
- 结论：本批 UI shell queue 已完成，`OpenCodianView` 剩余职责更偏向 runtime bridge、hydration/send pipeline seam 与少量实验路径，不再是下一轮无人值守的首选大块 DOM shell 切口。
- 下一批建议：夜间批次已确认转向 `OpenCodeService`，但只允许按兼容优先的 R19-R27 顺序执行；R27 后必须再次暂停，等待人工审查。


## Confirmed Night Batch: R19-R27 `OpenCodeService` compatibility-first

本批由人工确认：从 `OpenCodianView` 转向 `OpenCodeService`，但只允许处理仍成块存在、能形成较厚 owner 的兼容边界，不得把 session/config/query API 再拆成新的微碎片 facade。`OpenCodeService` 继续保持对外总门面；新 owner 只承接内部 lifecycle / state / mapping ownership。

### [DONE] R19 - Sync event runtime coordinator

- **Lane**: OpenCodeService `sync event runtime`
- **目标**: 把 session todo / status / sync-event listeners、订阅 wanted state、subscription lifecycle、emit 路径从 `OpenCodeService` 收束到一个较厚 coordinator。
- **优先入口**:
  - `src/core/opencode/OpenCodeService.ts` 中 `subscribeToSessionTodoUpdates` / `subscribeToSessionStatusUpdates` / `subscribeToSessionSyncEvents`
  - `src/core/opencode/OpenCodeService.ts` 中 `hasSyncEventListeners` / `ensureSyncEventSubscription` / `stopSyncEventSubscription` / `restartSyncEventSubscription`
  - `src/core/opencode/OpenCodeService.ts` 中 `handleSyncEvent` / `emitSessionTodoUpdate` / `emitSessionStatusUpdate` / `emitSessionSyncEventUpdate`
  - `src/core/opencode/OpenCodeSdkFacade.ts`
- **允许边界**:
  - 可新增 `OpenCodeSyncEventRuntimeCoordinator` 或同等厚 owner，同时覆盖 listener registry、subscription lifecycle、event routing、emit。
  - 可继续通过 host seam 调用 SDK facade、vault path / settings 更新与 logger。
- **禁止项**:
  - 不改 SDK-first / legacy fallback 语义。
  - 不把每个 listener 类型拆成独立薄 service。
  - 不改 tool/MCP catalog、prompt builder、streaming runtime。
- **验收**:
  - `OpenCodeService` 不再直接铺开 sync-event listener + subscription 状态机。
  - 新 owner 满足粒度规则，且有 focused coverage。
  - 运行 targeted tests、全量 `npm test`、`npm run build`。

### [DONE] R20 - OpenCode event subscription coordinator

- **Lane**: OpenCodeService `open-code event runtime`
- **目标**: 把 OpenCode event listeners、event subscription lifecycle、catalog-relevant event routing 与 emit path 从 `OpenCodeService` 收束到单一 coordinator。
- **优先入口**:
  - `src/core/opencode/OpenCodeService.ts` 中 `hasOpenCodeEventListeners` / `ensureOpenCodeEventSubscriptions` / `stopOpenCodeEventSubscriptions` / `restartOpenCodeEventSubscriptions`
  - `src/core/opencode/OpenCodeService.ts` 中 `getEventPayload` / `handleCatalogRelevantEvent` / `emitOpenCodeEvent` / `handleSdkEventEnvelope`
  - `src/core/opencode/OpenCodeSdkFacade.ts`
- **允许边界**:
  - 可新增 `OpenCodeEventSubscriptionCoordinator`，前提是同时覆盖 listener registry、subscription lifecycle、payload routing、emit。
  - 可暂时让 catalog state 仍留在 `OpenCodeService`，等 R21 再收束。
- **禁止项**:
  - 不和 R21 混做一个超大 owner；event lifecycle 与 catalog state 要分轮处理。
  - 不改 MCP status API / tool list API 语义。
- **验收**:
  - `OpenCodeService` 不再直接持有 open-code event listener + subscription 状态机。
  - event payload routing 保持行为不变，并有 focused coverage。
  - 运行 targeted tests、全量 `npm test`、`npm run build`。

### [DONE] R21 - Tool and MCP catalog state store

- **Lane**: OpenCodeService `catalog / MCP state`
- **目标**: 把 registry tool ids、tool schema cache、MCP server status map、catalog snapshot 构造和 catalog update state 收束到一个 state store owner。
- **优先入口**:
  - `src/core/opencode/OpenCodeService.ts` 中 `normalizeMcpServerStatusMap`
  - `src/core/opencode/OpenCodeService.ts` 中 `updateRegistryToolIds` / `updateToolSchemaCache` / `updateMcpServerStatus`
  - `src/core/opencode/OpenCodeService.ts` 中 `createToolCatalogSnapshot` / `createMcpServerSnapshot`
  - `src/core/opencode/OpenCodeEventSubscriptionCoordinator.ts` 中 `emitCatalogUpdate`
  - `src/core/opencode/OpenCodeService.ts` 中 `refreshToolIds` / `listTools` / `refreshMcpServerStatus`
- **允许边界**:
  - 可新增 `OpenCodeCatalogStateStore`，同时覆盖 cache + snapshot + update lifecycle。
  - `OpenCodeService` 仍保留对外 API 门面。
- **禁止项**:
  - 不改 tool identity 规则、icon fallback 或 MCP summary 语义。
  - 不拆成 `ToolCacheHelper` / `McpStatusHelper` 之类薄文件。
- **验收**:
  - `OpenCodeService` 只通过 state store 管理 catalog / MCP snapshots。
  - 新 owner 满足粒度规则并有 focused coverage。
  - 运行 targeted tests、全量 `npm test`、`npm run build`。

### [DONE] R22 - Prompt request builder

- **Lane**: OpenCodeService `prompt request assembly`
- **目标**: 把 SDK prompt parameters、shared prompt options、allowed-tools / output-format / variant / reasoning 映射收束到较厚 request builder。
- **优先入口**:
  - `src/core/opencode/OpenCodeService.ts` 中 `buildSdkPromptParameters`
  - `src/core/opencode/OpenCodeService.ts` 中 `buildAllowedToolsRecord` / `buildSharedPromptOptions`
  - `src/core/opencode/OpenCodeService.ts` 中 `resolveLocalOutputFormat` / `resolveSdkOutputFormat` / `resolveSdkVariant`
- **允许边界**:
  - 可新增 `OpenCodePromptRequestBuilder`，同时覆盖 SDK / legacy prompt option assembly。
  - `OpenCodeService` 继续决定走 SDK 还是 legacy transport。
- **禁止项**:
  - 不改 sendMessage / requestAssistantResponse 的 transport 分流。
  - 不混入 context/image serialization；那留给 R23。
- **验收**:
  - `OpenCodeService` 不再直接铺开 prompt option assembly。
  - 新 owner 有 focused coverage，并保持 SDK-first / legacy fallback 语义不变。
  - 运行 targeted tests、全量 `npm test`、`npm run build`。

### [DONE] R23 - Context part serializer

- **Lane**: OpenCodeService `context / image request parts`
- **目标**: 把 `buildPromptRequestParts()`、`createPromptContextPart()` 与本地/远程 context、image parts 序列化收束到独立 serializer。
- **优先入口**:
  - `src/core/opencode/OpenCodeService.ts` 中 `buildPromptRequestParts`
  - `src/core/opencode/OpenCodeService.ts` 中 `createPromptContextPart`
  - `src/shared/contextPath*`
- **允许边界**:
  - 可新增 `OpenCodeContextPartSerializer`，前提是同时覆盖 local file / remote synthetic text / image part serialization。
  - 可继续通过 host seam 调用 vault path、logger 和 context path helpers。
- **禁止项**:
  - 不改 context tag 文本格式、Windows path normalization、remote text-size guard 语义。
  - 不混入 prompt option builder；与 R22 保持边界。
- **验收**:
  - `OpenCodeService` 不再直接铺开 context/image request part 序列化。
  - 新 owner 有 focused coverage，并保持跨平台行为稳定。
  - 运行 targeted tests、全量 `npm test`、`npm run build`。

### [DONE] R24 - Streaming runtime state coordinator

- **Lane**: OpenCodeService `streaming runtime state`
- **目标**: 把 active stream contexts、create/release/cancel/detach 的运行时状态 ownership 从 `OpenCodeService` 收束到 coordinator。
- **优先入口**:
  - `src/core/opencode/OpenCodeService.ts` 中 `createStreamingState` / `createActiveStreamContext` / `releaseActiveStreamContext`
  - `src/core/opencode/OpenCodeService.ts` 中 `cancelStream` / `detachStream`
  - `src/core/opencode/OpenCodeService.ts` 中与 `activeStreams` 相关的状态字段
- **允许边界**:
  - 可新增 `OpenCodeStreamingRuntimeCoordinator`，同时覆盖 runtime registry、abort controllers、session-scoped stream lifecycle。
  - transport 仍留在 `OpenCodeService`，只迁出 runtime owner。
- **禁止项**:
  - 不改 server abort 语义。
  - 不把 event→chunk transform 一起混入本轮；那留给 R25。
- **验收**:
  - `OpenCodeService` 不再直接持有 active stream runtime state。
  - 新 owner 有 focused coverage，并保持多 session 并发语义不变。
  - 运行 targeted tests、全量 `npm test`、`npm run build`。

### [NEXT] R25 - Stream event transformer

- **Lane**: OpenCodeService `stream event transform`
- **目标**: 把 SDK / legacy SSE event → chunk transform 与 SSE parser 从 `OpenCodeService` 收束到 transformer owner。
- **优先入口**:
  - `src/core/opencode/OpenCodeService.ts` 中 `handleStreamingEvent`
  - `src/core/opencode/OpenCodeService.ts` 中 `transformEventToChunks` / `transformPartToChunks`
  - `src/core/opencode/OpenCodeService.ts` 中 `parseSSEEvents`
- **允许边界**:
  - 可新增 `OpenCodeStreamEventTransformer`，同时覆盖 SDK event、legacy SSE event、part→chunk mapping 与 parser。
  - `OpenCodeService` 仍负责 transport 调用与最终 chunk yield。
- **禁止项**:
  - 不改 SDK 首事件失败才 fallback 到 legacy 的现有策略。
  - 不改 chunk schema / tool / permission / question 事件语义。
- **验收**:
  - `OpenCodeService` 不再直接铺开 event→chunk transform。
  - focused coverage 证明 chunk 语义未回归。
  - 运行 targeted tests、全量 `npm test`、`npm run build`。

### [QUEUED] R26 - Message normalization mapper

- **Lane**: OpenCodeService `message normalization`
- **目标**: 把 message → `ChatMessage` 归一化、context attachment 提取、tool identity / OMO meta 处理收束到 mapper owner。
- **优先入口**:
  - `src/core/opencode/OpenCodeService.ts` 中 `openCodeMessageToChatMessage` 附近的标准化逻辑
  - `src/core/opencode/OpenCodeService.ts` 中 question prompt normalization、tool identity helpers、OMO normalization 相关区段
  - `src/core/opencode/omoCompat.ts`
  - `src/shared/toolIdentity.ts`
- **允许边界**:
  - 可新增 `OpenCodeMessageNormalizationMapper`，同时覆盖 content blocks、attachments、model/tool metadata、OMO/system reminder normalization。
  - `OpenCodeService` 继续提供对外 `hydrateOpenCodeMessage()` / message fetch API。
- **禁止项**:
  - 不改现有 `ChatMessage` 形状。
  - 不把 tool icon / summary 规则迁回 UI 层。
- **验收**:
  - `OpenCodeService` 不再直接铺开主要消息归一化逻辑。
  - focused coverage 证明 OMO / context attachments / tool metadata 行为稳定。
  - 运行 targeted tests、全量 `npm test`、`npm run build`。

### [QUEUED] R27 - OpenCodeService checkpoint

- **Lane**: Checkpoint
- **目标**: 暂停自动推进，复盘 R19-R26 对 `OpenCodeService` 的缩减幅度和兼容风险，并决定下一批是否继续处理 session/config/query gateway。
- **优先入口**:
  - `docs/status/maintainability-round-roadmap.md`
  - `docs/status/maintainability-master-plan.md`
  - `docs/status/maintainability-lane-map.md`
  - R19-R26 phase 文档
  - `src/core/opencode/OpenCodeService.ts`
  - `src/core/opencode/OpenCodeSdkFacade.ts`
  - `src/core/opencode/ServerManager.ts`
- **允许边界**:
  - 只做测试、文档、指标统计和下一批建议。
- **禁止项**:
  - 不开新代码重构。
  - 不允许 autopilot 自动扩展 R28+。
- **验收**:
  - phase 文档总结 `OpenCodeService` 缩减了什么、哪些兼容边界仍需处理。
  - 明确下一批是否继续做 session/config/query gateway，还是到此暂停。
  - 将 roadmap 状态设置为需要人工确认后再继续。
  - 运行全量 `npm test`、`npm run build`。
