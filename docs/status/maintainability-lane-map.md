# Maintainability Lane Map

> **用途**: 这是每轮开始时的快速定位图。先看这里，再配合 `docs/status/maintainability-round-roadmap.md` 执行当前 `[NEXT]` 任务，而不是自由选题。

## 当前优先级

- **Checkpoint**: maintainability checkpoint（R12 已提升为 roadmap 当前 `[NEXT]`）
- **Core config maintainability**: catalog state service（R11 已完成；后续只保留 settings/core catalog state regression watchpoints）
- **P4**: message shell / notice / timestamp 组装边界（R8 已完成；后续只保留 renderer/finalizer regression watchpoints）
- **P3**: context / composer / retained-selection 相关 ownership（R7 已完成；后续只保留 facade/focus runtime 回归 watchpoints）
- **P1**: `OpenCodianView` 里剩余的 activation / sync / runtime bridge ownership
- **P2**: question / todo / background task queue 已完成 R1-R6；后续只保留 regression watchpoints，不再继续拆新 owner

## 当前热点首查入口

- Checkpoint 首查 roadmap / master plan / 最近 phase 文档，再复核 `OpenCodianView.ts`、`OpenCodianSettings.ts` 与 `OpenCodeService.ts` 的 owner 体量变化
- Core config maintainability 首查 `ModelConfigService.ts` / `ModelCatalogStateService.ts` 的 catalog state 入口，再看 `OpenCodianSettings.ts` 与 `modelConfigWorkspace.ts` 现在只保留的 UI 消费缝
- P4 regression-only 首查 `AssistantShellViewHostAdapter`、`PersistentAssistantNoticeService` 与 `ConversationRenderService` 的 persisted assistant body/footer seam
- P3 regression-only 首查 composer-context facade 创建、context catalog ownership 与 retained-selection runtime
- P1 首查 `OpenCodianView` 里 activation / sync host 与 runtime bridge 创建区段，再看对应 bridge/service
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
- 后续若不是回归或正确性问题，默认按 roadmap 转向 P4 message shell / notice / timestamp ownership

## P4 收束状态

- R8 已把 persisted assistant shell / notice / footer / timestamp 组装收束到 `AssistantShellViewHostAdapter`，并让 `PersistentAssistantNoticeService` 直接消费 assistant-message render seam
- `OpenCodianView` 现在只保留 assistant 正文 block 渲染回调、pseudo-stream reveal 与少量本地错误/server-prompt UI 壳层；不要再把 persisted assistant 壳层组装搬回 view
- 后续若不是回归或正确性问题，默认按 roadmap 转向 core catalog state service

## Settings maintainability 状态

- R9 已把 settings section lifecycle、quick-nav 与 scroll restoration 收束到 `SettingsSectionCoordinator`
- R10 已把 provider/model accordion、search、bulk toggle 与 probe presentation 收束到 `SettingsModelCatalogPresenter`
- `OpenCodianSettings` 现在负责 section composition、settings persistence 与 modal launch；不要把 model catalog UI 状态机或 probe badge/detail 逻辑搬回主类
- R11 已把 `baseEffective` / `effective` / `currentEnabledProviderIds` availability API 从 settings presenter 侧抽回 `ModelCatalogStateService`
- Settings/core 的下一步不再开新 UI 拆分，而是按 roadmap 进入 checkpoint，复盘 `OpenCodianSettings` 与 core config owner 的缩减效果

## 可复用模式

- host wiring 先看 `HostAdapter` / `create*Services()` 的现有模式
- post-sync / activation / runtime 多入口共享逻辑，优先落到 facade / coordinator / runtime bridge
- `OpenCodianView` 只保留 host assembly、bridge 入口和必要 UI writeback

## 低收益规则

- 不要在成功轮次里反复广扫同一大片 `OpenCodianView` 上下文
- `docs/modules/**` 只在模块边界真实变化时再读、再改
- 不要继续深挖 trailing-assistant helper 碎片化链路，除非正确性或构建失败直接阻塞
