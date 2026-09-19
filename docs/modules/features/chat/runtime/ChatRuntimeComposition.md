# ChatRuntimeComposition
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
