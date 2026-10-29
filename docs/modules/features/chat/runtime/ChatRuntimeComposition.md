# ChatRuntimeComposition

> 2026-10-09（Codex preaccepted guard）：既有 interaction wiring 把 MessageSendPreparationService 的 Codex preflight 口接到当前 registry 的 CodexAdapter `getSendMessagePreflightError`，透传 sending conversation 已捕获的 per-turn codexOptions。adapter/guard 缺失返回非空 unavailable reason，production fail-closed；composition 不复制 approval policy 判定、不启动后端、不改模型/档位、普通 accepted 或 queued 语义。后端发送边界复用同一 guard 复检。

The slash execution host receives a narrow `refreshSessionChangeSidebar` callback. It is invoked after undo/redo's visible sync and delegated to the view, where the modified-files coordinator performs the native OpenCode 2 diff read.

2026-09-26：ZCode 回合在仍属于当前可见标签/会话时结束后，装配层请求选择控件从该会话的原生读回刷新模式。此举使从斜杠 `/plan` 进入 Plan 的同会话控制显示跟上真实状态；切换标签后的旧回合不覆盖当前会话。
> 2026-09-24 (ZCode image preflight)：interaction wiring 仅通过窄 adapter seam 提供原生模型目录读取给发送 preparation；发送前按所选 provider/model 证明 `supportsImageInput`，不把 ZCode 图片判断转发到 OpenCode service。
> 2026-09-21 (advantage-parity R-F1)：notifyFollowUpQueued/QueueChanged 接 host.refreshQueuedFollowUpBar + 本地化排队 Notice。
> 2026-09-21 (advantage-parity R-E1)：组合 UrlContextFetchService 并注入 MessageSendPreparationService 的 resolveUrlContextItems 缝（发送时抓取 pending 网页 chip）。
> 2026-09-18 (R-B3): R-B3: the pipeline view-port gains fail-soft observers `onTurnSnapshotBegin` / `onTurnSnapshotEnd` / `onWriteToolUse` that forward to `host.plugin.editRevertService`; the pipeline never awaits snapshot work.
> 2026-09-18 (R-B2): `ComposerContextViewFacade.create` receives a `contextGroups` port reading `settings.contextGroups`; the structural `plugin.settings` type gains the `contextGroups` field.

> 2026-08-01: 新增模块。Task 15 把 `OpenCodianView` 的四个 `create*RuntimeWiring()` 编排方法 + 构造器内联的 identity/render 装配 + `createSendPipelineHostDependencies` 全部迁出，集中到这个 composition owner。这是 Agent-Friendly Architecture Refactor Phase 4 的核心产物。
> **Inventory (APPROVED, codex/terra 4 轮审查)**: `docs/superpowers/plans/task15-chat-runtime-composition-inventory.md`

> **源码**: `src/features/chat/runtime/ChatRuntimeComposition.ts`
> **状态**: [REVIEW]

## 概述


R-C4：`ComposerContextViewFacade.create` 传入 `loadPdfEngine`（懒加载引擎端口）；`VaultRetrievalComposerCoordinator` 增加 `pdfRetrieval: host.plugin.pdfIndexService`——`pdfIndexEnabled` 开启时 PDF 命中片段与笔记片段走同一托管 chips 流。插件结构类型相应声明 `pdfEngineLoader` / `pdfIndexService` 窄化端口。


2026-09-18（R-C1）：`createSurfaceRuntimeWiring` 组装 `VaultRetrievalComposerCoordinator`（端口：composer facade `sendContext`、`plugin.vaultIndexService`、设置 getter、active tab），并以展开包装方式给 `ComposerInputShellCoordinator` host 注入可选的 `onComposerInputChanged` / `onComposerSubmitted` 观察钩子；feature 关闭时协调器为 no-op，发送通道零改动。宿主 `plugin` 形状新增 `vaultIndexService` 与四个 `vaultRetrieval*` 设置只读字段。

2026-09-18（R-B1 聊天侧）：`createInteractionRuntimeWiring` 构造 `AssistantAutoInternalLinkService`（processor 取自 `host.plugin.createAutoInternalLinkBridge?.()`——与行内编辑共用的 `createInlineEditAutoLinkProcessor` seam），作为 `MessageFinalizationService` 的第二个构造参数注入；`ChatRuntimeCompositionHost.plugin` 结构类型相应声明可选的 `createAutoInternalLinkBridge?`（缺失时 service 经 trace 如实上报 `processor-unavailable`，行为与关闭态一致）。finalization 缺省该 service 时保持既有行为逐字节不变。

2026-09-18（R-B1 修复）：`AssistantAutoInternalLinkService` 改为 `getAutoInternalLinkService()` 单例共享，同一实例注入三个消费点——`MessageFinalizationService`（finalization 尾部 pass）、`ConversationAuthoritativeSyncCoordinator`（可选第二构造参数，权威合并重放，内链穿越 resync/重载）、`createConversationRenderService`（可选第三构造参数，canonical 投影重放，DOM 与存储文本一致）。

`ChatRuntimeComposition` 是聊天 runtime 的 composition owner。它在 `OpenCodianView` 构造时被实例化一次，通过 `compose()` 按既定阶段顺序（surface → identity/render → background → conversation → interaction）装配全部 chat runtime coordinator，返回单个 `ChatRuntime` 结构体，由 view 解构到既有的私有字段。

关键不变量（characterization 测试 + inventory §2.2c 锁定）：

- **从不引用 `OpenCodianView` 类**。view 仅作为结构化的 `ChatRuntimeCompositionHost` 传入（按 shape 满足），杜绝 god-object 泄漏。
- `assembleConversationTabRuntime` 只接收窄化的 `TabRuntimeViewSource`（view 通过 `tabRuntimeViewSource` getter 显式暴露），而非整个 view。
- 返回结构体；view 不按 key/type 检索服务（非 service locator）。
- **不拥有 disposal**。`OpenCodianView.onClose` 按 inventory §4 文档化的 26 步顺序销毁解构后的字段；本 owner 只负责构造。

## 跨阶段值流动

- 早期阶段构建、晚期阶段消费的 coordinator 通过 `compose()` 局部变量传递（如 `conversationRenderService`、`composerContextViewFacade`、`tabMessagesPaneCoordinator`、`userMessageContentRenderer`、`sessionTodoCoordinator`）。
- 懒读取的 view 状态（compose 完成后才被 view 解构赋值的字段）通过 `host.X` 读取，使其在闭包被调用时 live 解析。
- `buildSendPipelineHostDependencies` 中被同步调用的 `createSendPipelineShellPort` 读取 surface 构建的 `assistantShellViewHostAdapter`（非 `host.X`），因为它在 `SendPipelineRuntime` 构造期间就被调用，早于 view 解构。
- identity/render 装配向 `ConversationRenderService` 注入独立的本地 turn-diff notice 读取 seam；该 card 只在 canonical full render 时按 `noticeMeta.sourceMessageId` 合并，不改变 canonical message truth。
- identity runtime wiring 通过窄 host seam 读取 `plugin.settings.showTurnChangeRecords`；该开关只门控有效 `turn-diff` notice 的渲染，历史消息仍保留并可在重新开启后恢复。
- render host wiring 新增 `renderInputSettingsSignature`：把 `plugin.settings` 中影响 full-rerender DOM 但不在消息负载内的显示设置序列化为签名注入 `ConversationRenderHost`——当前覆盖 `renderUserMarkupAsCodeBlocks`（经 `prepareUserMessageMarkdownForDisplay` 改写 user body markdown）、`questionCardPosition`、`showAnsweredQuestionCards`（改变 question-card 渲染计划）、`locale`（经 `t()` 改变所有渲染器标签）。`ChatRuntimeCompositionHost.plugin.settings` 的窄类型相应声明这四个字段。
- background-task indicator 的 host wiring 透传可选 `isCurrent` lease；visible post-sync 的异步 inline Markdown、completion notice 与 stream-like writeback 不得越过 tab/conversation/pane 代际边界。

## 依赖方向

owner: `feature.chat-runtime`（layer features）。依赖 `feature.chat`（services/runtime/ui）+ `core.opencode` + `core.agents` + `shared`。无反向依赖；不依赖 `src/app` 或 `src/main.ts`。

## 相关

- 装配的 coordinator 列表见 inventory §2（surface 17、background 4、conversation ~14、interaction 8）。
- disposal 顺序契约见 inventory §4。

- 2026-09-13: 组合层接线 planMemoryInjection（host.plugin.memoryRuntime）与 onTurnSettled；plugin 形状新增 memoryRuntime 端口。

- 2026-09-18 (FlowText R-B4): Obsidian 原生工具注入接缝接入——插件结构类型新增 obsidianToolingRuntime（planInjection 端口），MessageSendPreparationHost 新增 planObsidianToolingInjection 回调接线。

## R-C2 扩展

2026-09-18 slash host 字面量新增 `runImageGenerationCommand`（转发 `host.plugin.openImageGenerationCard?.(promptArgument.trim())`）；`ChatRuntimeCompositionHost.plugin` 结构类型新增可选 `openImageGenerationCard?`。

## 2026-09-27 OpenCode 2 compatibility

The send and slash command composition starts the selected OpenCode 2 adapter and routes command, compact, rewind and history work to it without forwarding OpenCode 2 session IDs to OpenCodeService.

## 2026-10-05 Codex 消息前分支与恢复

对 native 最终文本修正的 Codex 回合，使用既有 ConversationRenderService 及其滚动/归属守卫重绘；仅在仍为同一 tab/conversation 时执行。

为 ConversationLoadRecoveryCoordinator 注入 scoped Codex history 读取与既有 serialized conversation-write callback；不反向引用 feature 到 core，不改其他后端。
Codex turn settled 后，仅在 tab/conversation/native thread 都仍匹配时刷新 user footer，把迟到的 native identity 接到 Fork 控件；保留原消息正文 DOM、滚动位置和其他后端路径。

Claude Code also refreshes settled user footers after native identity arrives. The existing tab, conversation and native-session ownership checks remain; original body DOM and scroll position are preserved.

## 目录定位（2026-10-23）

- 源码位置：`src/features/chat/runtime/ChatRuntimeComposition.ts`。
- 随目录调整更新的依赖：`src/features/chat/runtime/rendering/AssistantNoticeCardRenderer.ts`、`src/features/chat/runtime/rendering/AssistantShellViewHostAdapter.ts`、`src/features/chat/runtime/background/BackgroundTaskIndicatorCoordinator.ts`、`src/features/chat/runtime/background/BackgroundTaskInlinePanelRenderer.ts`、`src/features/chat/runtime/background/BackgroundTaskStreamTriggerCoordinator.ts`、`src/features/chat/runtime/activation/ConversationLoadRuntimeBridge.ts`、`src/features/chat/runtime/rendering/PermissionInlineCardRenderer.ts`、`src/features/chat/runtime/send/SendPipelineDebugSummaries.ts`、`src/features/chat/runtime/send/SendPipelineRuntime.ts`、`src/features/chat/runtime/rendering/StreamingInlineCardRenderer.ts`、`src/features/chat/runtime/activation/TabConversationActivationBridge.ts`、`src/features/chat/runtime/activation/TabConversationStateBridge.ts`、`src/features/chat/runtime/activation/TabRuntimeStateBridge.ts`、`src/features/chat/runtime/activation/TabViewActivationBridge.ts`、`src/features/chat/runtime/rendering/UserMessageContentRenderer.ts`、`src/features/chat/runtime/rendering/UserMessageFooterRenderer.ts`、`src/features/chat/services/context/ActiveTabContextUsageCoordinator.ts`、`src/features/chat/services/rendering/AssistantAutoInternalLinkService.ts`、`src/features/chat/services/background/BackgroundTaskCompletionNoticeService.ts`、`src/features/chat/services/background/BackgroundTaskLiveSignalCoordinator.ts`、`src/features/chat/services/background/BackgroundTaskNoticeStateService.ts`、`src/features/chat/services/background/BackgroundTaskTimelineService.ts`、`src/features/chat/services/surface/ChatHeaderPresenter.ts`、`src/features/chat/services/selection/ChatSelectionControlsCoordinator.ts`、`src/features/chat/services/surface/ChatSurfaceAppearanceCoordinator.ts`、`src/features/chat/services/conversation/ChildSessionGraphCoordinator.ts`、`src/features/chat/services/composer/ComposerContextViewFacade.ts`、`src/features/chat/services/composer/ComposerInputShellCoordinator.ts`、`src/features/chat/services/sync/ConversationAuthoritativeSyncCoordinator.ts`、`src/features/chat/services/conversation/ConversationHistoryActionsCoordinator.ts`、`src/features/chat/services/sync/ConversationHydrationRuntimeViewHostFactory.ts`、`src/features/chat/services/conversation/ConversationIdentityRuntime.ts`、`src/features/chat/services/conversation/ConversationLoadRecoveryCoordinator.ts`、`src/features/chat/services/rendering/ConversationNoticeCoordinator.ts`、`src/features/chat/services/rendering/ConversationRenderService.ts`、`src/features/chat/services/conversation/ConversationSessionSettingsCoordinator.ts`、`src/features/chat/services/conversation/ConversationSessionSignalRuntime.ts`、`src/features/chat/services/sync/ConversationSyncBridge.ts`、`src/features/chat/services/sync/ConversationSyncHostAdapter.ts`、`src/features/chat/services/sync/ConversationSyncOrchestrationService.ts`、`src/features/chat/services/sync/ConversationSyncRuntimeCoordinator.ts`、`src/features/chat/services/conversation/ConversationTabLifecycleRecoveryCoordinator.ts`、`src/features/chat/services/conversation/ConversationTabOpenCoordinator.ts`、`src/features/chat/services/conversation/ConversationTabRuntimeCoordinator.ts`、`src/features/chat/services/conversation/ConversationViewStateService.ts`、`src/features/chat/services/surface/InputPanelAppearanceCoordinator.ts`、`src/features/chat/services/send/MessageFinalizationService.ts`、`src/features/chat/services/send/MessageSendPreparationService.ts`、`src/features/chat/services/send/PersistentAssistantNoticeService.ts`、`src/features/chat/services/questions/QuestionDockSlotCoordinator.ts`、`src/features/chat/services/questions/QuestionRuntimeHostAdapter.ts`、`src/features/chat/services/questions/QuestionRuntimeViewHostFactory.ts`、`src/features/chat/services/questions/QuestionTodoBackgroundTaskRuntimeServiceBundle.ts`、`src/features/chat/services/rendering/ScrollManager.ts`、`src/features/chat/services/context/ServerReferenceContextService.ts`、`src/features/chat/services/questions/SessionTodoHostAdapter.ts`、`src/features/chat/services/commands/SlashCommandExecutionHostFactory.ts`、`src/features/chat/services/commands/SlashCommandExecutionService.ts`、`src/features/chat/services/conversation/TabActivationRuntimeHostProvider.ts`、`src/features/chat/services/conversation/TabActivationRuntimeViewHostFactory.ts`、`src/features/chat/services/conversation/TabMessagesPaneCoordinator.ts`、`src/features/chat/services/title/TitleGenerationService.ts`、`src/features/chat/services/sync/trailingAssistantPatchDebug.ts`、`src/features/chat/services/context/UrlContextFetchService.ts`、`src/features/chat/services/context/VaultRetrievalComposerCoordinator.ts`。

## 2026-10-28：原生命令与技能弹框

slash execution host 传入 activeBackend，确保无 conversation 的草稿也按当前后端隔离分派；运行时 ownership 不变。

## 2026-10-29：统一 @ 引用接线

组合层构造共享 PromptReferenceService，同时向输入候选与发送准备提供当前 Vault、目标后端及会话身份。会话候选只来自插件当前 Vault 列表，源正文由 getConversationById 加载完整持久化消息；读取不会改变当前插件后端或会话。优先使用 getPromptReferenceMessages 的现存会话只读接口；ZCode/Pi 缺少安全读取或源不常驻时保守使用明确标注 plugin-cache 的快照，Codex 空兼容回读同样回退缓存。有效原生能力由目标后端运行时目录及显式来源身份提供。
