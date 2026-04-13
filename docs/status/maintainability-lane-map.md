# Maintainability Lane Map

> **用途**: 这是每轮开始时的快速定位图。先看这里，再配合 `docs/status/maintainability-round-roadmap.md` 执行当前 `[NEXT]` 任务，而不是自由选题。
> **当前状态**: [AWAITING_MANUAL_CONFIRMATION] R18 UI shell checkpoint 已完成；当前没有可自动执行的 `[NEXT]`。

## 当前优先级

- **P1 / R16**: 已完成 model / permission selection controls（chat 内 dropdown/search/list/selection display）
- **P1 / R15**: 已完成 composer input shell（input area DOM、textarea、高度同步、layout metrics）
- **P1 / R14**: 已完成 header / server status shell（header DOM、status label/action、wordmark/settings button）
- **P1 / R13**: 已完成 tab messages pane surface（messages pane lifecycle、active pane、scroll metrics、pane observer）
- **P5 / R17**: 已完成 input appearance / glass state（theme class、SVG filter、liquid-glass mount/diagnostics）
- **Checkpoint / R18**: 已完成 UI shell checkpoint；autopilot 现在暂停，等待人工确认下一批是否转向 `OpenCodeService`

## 当前热点首查入口

- R16 已完成：model / permission selector dropdown/search/list/selection display 已收束到 `services/ChatSelectionControlsCoordinator.ts`
- R15 已完成：input area DOM、textarea submit gate、高度同步与 composer stack metrics 已收束到 `services/ComposerInputShellCoordinator.ts`
- R14 已完成：header DOM、server status loop/label、wordmark/settings button 已收束到 `services/ChatHeaderPresenter.ts`
- R13 已完成：pane lifecycle / observer / scroll metrics / cleanup 已收束到 `services/TabMessagesPaneCoordinator.ts`
- R17 已完成：input panel theme/action-button/filter/liquid-glass/diagnostics 已收束到 `services/InputPanelAppearanceCoordinator.ts`
- 当前无自动执行入口；如需继续，先读 `docs/status/maintainability-phase-333.md`、roadmap 与 master plan，等待人工确认下一批
- `OpenCodeService` 现在是优先候选，但只能在新的人工确认队列中处理，不能沿用 R13-R18 自动继续
- P2 regression-only 首查顺序固定为：
  1. `tests/unit/features/chat/QuestionDockCoordinator.test.ts`
  2. `tests/unit/features/chat/QuestionTodoStatusRefreshCoordinator.test.ts`
  3. `tests/unit/features/chat/SessionTodoCoordinator.test.ts`
  4. `tests/unit/features/chat/BackgroundTaskCompletionNoticeService.test.ts`
  5. `tests/unit/features/chat/ConversationSessionSignalRuntime.test.ts`

## P2 收束状态

- R1-R6 已把 question dock lifecycle、todo refresh/status、background completion notice、post-sync handoff 与 session signal orchestration 收束到稳定 owner
- 当前剩余风险以回归为主：background tab 无 session 时的 dock 清理、post-sync todo/status gate、completion notice queue/fingerprint 去重，以及 live signal 进入 `SessionTodoCoordinator` 后的 writeback 顺序
- 后续若不是测试、构建或正确性问题，默认不要再回到 P2 开新拆分切口

## P3 收束状态

- R7 已把 composer-context bundle 创建、`ContextAttachmentBuilder` 与 `ContextFileCatalogService` ownership 收进 `ComposerContextViewFacade.create()`
- `OpenCodianView` 只保留 view host seam、context row DOM 挂载、add-context 按钮和公开的 editor context 入口；不要再把 builder/catalog/service fan-out 放回 view
- 后续若不是回归或正确性问题，不再默认回到 P3；按 R13-R18 的 UI/runtime shell queue 执行

## P4 收束状态

- R8 已把 persisted assistant shell / notice / footer / timestamp 组装收束到 `AssistantShellViewHostAdapter`，并让 `PersistentAssistantNoticeService` 直接消费 assistant-message render seam
- `OpenCodianView` 现在只保留 assistant 正文 block 渲染回调、pseudo-stream reveal 与少量本地错误/server-prompt UI 壳层；不要再把 persisted assistant 壳层组装搬回 view
- 后续若不是回归或正确性问题，不再自动扩展 P4；按 R13-R18 的 UI/runtime shell queue 执行

## Settings maintainability 状态

- R9 已把 settings section lifecycle、quick-nav 与 scroll restoration 收束到 `SettingsSectionCoordinator`
- R10 已把 provider/model accordion、search、bulk toggle 与 probe presentation 收束到 `SettingsModelCatalogPresenter`
- `OpenCodianSettings` 现在负责 section composition、settings persistence 与 modal launch；不要把 model catalog UI 状态机或 probe badge/detail 逻辑搬回主类
- R11 已把 `baseEffective` / `effective` / `currentEnabledProviderIds` availability API 从 settings presenter 侧抽回 `ModelCatalogStateService`
- Settings/core 的下一步不再开新 UI 拆分；R13-R18 已确认优先 `OpenCodianView`，`OpenCodeService` 留到 R18 后再决定

## 可复用模式

- host wiring 先看 `HostAdapter` / `create*Services()` 的现有模式
- post-sync / activation / runtime 多入口共享逻辑，优先落到 facade / coordinator / runtime bridge
- `OpenCodianView` 只保留 host assembly、bridge 入口和必要 UI writeback

## 低收益规则

- 不要在成功轮次里反复广扫同一大片 `OpenCodianView` 上下文
- `docs/modules/**` 只在模块边界真实变化时再读、再改
- 不要继续深挖 trailing-assistant helper 碎片化链路，除非正确性或构建失败直接阻塞


## R13-R18 执行边界

- 每轮必须先处理第一个 `[NEXT]`，不得自由选择 `OpenCodeService` 或 settings 新切口。
- 本批目标是迁出 `OpenCodianView` 中仍成块存在的 UI/runtime shell ownership，而不是继续制造 provider/factory/adapter 薄层。
- 新 owner 默认要覆盖完整 lifecycle；如果低于约 100 行且少于 3 个公开 API，必须在 phase 文档里说明为何不是微碎片，否则应合并回调用方。
- R18 已完成并已进入暂停态；是否转向 `OpenCodeService` 由下一次人工确认决定。
