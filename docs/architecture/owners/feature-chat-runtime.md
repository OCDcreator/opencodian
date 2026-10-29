> 2026-09-18 (FlowText parity R-A7): `UserMessageContentRenderer` renders the `folder` context-attachment kind label (`chat.context.kind.folder`).
> 2026-09-21 (advantage-parity R-F1)：消费后队列变化通知 + composition 接线。
> 2026-09-21 (advantage-parity R-E6)：owner manifest 刷新——shared.foundation 的 include 新增 `src/shared/tokenEstimate.ts`（token 估算启发式）；本 owner 的边界与职责未变。
> 2026-09-21 (advantage-parity R-E1)：ChatRuntimeComposition 组合 UrlContextFetchService 并注入发送准备的 resolveUrlContextItems 缝。

# Owner: feature.chat-runtime

2026-10-29：ChatRuntimeComposition 为统一引用服务注入当前 Vault 文件、插件持久化会话与来源后端只读入口；目录与发送准备共用实例。SendPipelineRuntime 将准备好的后端正文送往目的后端，保留本地可读用户消息，不切换全局活跃后端或恢复来源会话。
> 2026-10-26（DSH UI 修复）：AssistantShellRenderer 使用 shell 提供的目录查询显示历史消息模型名称；原始 provider/model 身份保留在 data 属性、焦点提示和可访问名称中。找不到目录项时显示原始身份，不借用当前会话模型，也不改写消息记录。
> 2026-09-25 (FA880): BackgroundTaskInlinePanelRenderer displays native ZCode jobs separately from the foreground tool card, refreshing active jobs and surfacing cancel/failure/interrupted terminal states.
> The native watch is armed on activation before a task exists and only fetches for the active tab; the renderer owns its timer cleanup.
> 2026-09-25 (FA880): QuestionInlineCardRenderer now settles and removes an inline question whose original native ask disappears; process loss cannot leave its promise and answer buttons alive.
> 2026-09-25 (FA880): PermissionInlineCardRenderer uses an optional native pending-read callback for ZCode. It removes actions and renders an explicit terminal card when the original ask expires or disconnects; callback-free backends keep their existing behavior.
> 2026-10-25 (DSH gap remediation): PermissionInlineCardRenderer's session approval cache now also records "Allow always" clicks, not only "Allow for session". Backends whose runtime offers allow-once options only (DSH today) would otherwise re-prompt identical tools for the rest of the plugin session; for backends with a persistent always channel the client-side record is redundant within the session and does not widen scope.
> 2026-09-21 (advantage-parity R-F2/R-F3)：SendPipelineRuntime 把绑定笔记去重合入 R-B3 发送前 snapshot candidates；turn/batch 结束冻结 post-image 供回退预览。发送与回退写路径仍复用既有边界，不自动写回绑定笔记。

> Auto-generated scaffold from `architecture-owners.config.json`. The manifest is the canonical truth source; this page narrates the model and records hard-to-automate rationale. Update it when the owner boundary or its non-obvious invariants change.
- 2026-09-13 (universal memory backend): ChatRuntimeComposition wires planMemoryInjection and onTurnSettled into the send pipeline host; SendPipelineRuntime fires the settle hook in the finally block.

- **Layer:** `feature` (may import layers: shared, core, feature)
- **Risk:** high
- **Include:** `src/features/chat/runtime/**`

## Responsibilities
- chat runtime coordinators: send pipeline, streaming, background tasks, sync load, tab activation
- assistant/user message renderers, permission and question inline cards

## Canonical state (truth home)
- send pipeline runtime state
- background task stream/indicator state
- conversation sync load/hydration state

> Cross-owner access is read-only snapshot/command/event. Do not replicate this state as a second writable truth source.

## Entrypoints
- `src/features/chat/runtime/send/SendPipelineRuntime.ts`
- `src/features/chat/runtime/background/BackgroundTaskIndicatorCoordinator.ts`
- `src/features/chat/runtime/ChatRuntimeComposition.ts` — composition owner that assembles the full chat runtime (surface/identity/render/background/conversation/interaction phases) into a single `ChatRuntime` struct the view destructures. Owns no disposal; receives the view only as the structural `ChatRuntimeCompositionHost`. See Task 15.

## Dependency surface
- **Allowed owner dependencies:** `shared.foundation`, `shared.utils-streaming`, `core.types`, `core.agents`, `core.opencode`, `feature.chat-services`
- **Forbidden dependencies:** `app`
- **Adjacent owners** (prefer editing these when out of scope): `feature.chat-shell`, `feature.chat-services`

## Focused tests
- `tests/unit/features/chat/runtime/**`
- `tests/unit/features/chat/ChatRuntimeComposition.test.ts`

## Required gates
Run before merge: `npm run typecheck`, `npm run module-docs`.

## Recent change notes
- **Native CLI stream lifetime:** `StreamChunkRouter` applies its idle-detach watchdog only to OpenCode, whose background sync can recover after detachment. Codex, Claude Code and Pi keep their stream until backend completion, transport failure or explicit user cancellation; silence during reasoning must not call their cancel operation.
- **User message controls:** `UserMessageContentRenderer` groups the collapse toggle and context chips after text/images in a wrapping controls row; empty controls do not consume layout space, and OMO raw content retains its own collapse container.
- **Canonical render seam:** runtime composition supplies valid local turn-change records to canonical OpenCode rendering and reads the display preference through `ConversationIdentityRuntime`; this preserves the record without broadening ordinary local-notice retention.
- **Turn-diff compact card:** `AssistantNoticeCardRenderer` now routes valid `turn-diff` notices (via `getTurnDiffNoticeMeta`) into a dedicated structured DOM branch — no notice icon, one native button row per file, vault-relative middle-elided paths, `+N`/`−N` badges, and a DOM-local 5-row expand/collapse toggle. Generic warning/error/info/OMO notices keep the existing icon + Markdown branch; `message.content` Markdown remains persistence-only for these cards.
- **Hydration scroll-restore capture:** `ConversationHydrationRenderBridge` captures the full scroll anchor snapshot (real message-id anchor, offset, old scrollHeight/scrollTop, distanceFromBottom) before any container clear, aligning with the sync fallback timing; restores resolve through `resolveEffectiveScrollRestoreSnapshot` so mid-restore user scrolling wins, and superseded loads skip restore but still release the rehydrating shell via `abortLoadedConversationTransition`.
- **Render-input settings signature:** `ChatRuntimeComposition` now wires a `renderInputSettingsSignature()` host callback that serializes display settings affecting full-rerender DOM output but not captured by `getMessageVisualSignature` (renderUserMarkupAsCodeBlocks, questionCardPosition, showAnsweredQuestionCards, locale); `ConversationRenderService` folds it into the full-rerender fingerprint so a setting toggle is never masked by an unchanged-message no-op.

## Hard invariants
- Do not cross `forbiddenDependencies`.
- Do not replicate canonical state in another owner.
- Changes here must update the matching `docs/modules/**` page (via `module-docs.config.json`).
- Run `npm run inspect:owner -- <this owner or a path>` for an always-fresh summary.

## Pi owner boundary review (2026-09-08)

The new core.backend-pi owner isolates the external Pi process service. feature.chat-runtime retains its existing responsibilities; Pi process lifecycle, RPC compatibility and native history must not be added to this owner.

- 2026-09-15: Owner 模型新增 `feature.inline-edit`（行内编辑：CM6 内嵌输入框 + 原位词级 diff + 单次 `replaceRange` 落盘），owner 表已更新；本 owner 的边界与职责未变。
- 2026-09-17: `AssistantErrorRenderer.renderStreamError()` 把错误文案按首个换行拆成摘要标题（`.streaming-error-title`）与细节行（`.streaming-error-text`，保留 provider 原始报文）；单行错误行为不变。渲染细节仍在本 owner，工具身份归一化归 `core.backend-pi`。
# 2026-09-24

- `ChatRuntimeComposition` supplies a narrow ZCode image-capability preflight seam to `MessageSendPreparationService`; it reads the native selected-model catalog before optimistic append and never routes the decision through OpenCode.
- The composer acknowledgement is an explicit `accepted | queued | rejected` outcome; runtime composition remains the adapter boundary and does not own composer DOM cleanup.

## 2026-09-27 OpenCode 2 compatibility

The chat runtime starts the selected OpenCode 2 adapter and dispatches its commands, compact and rewind through the backend session owner.

## 2026-10-05 Codex 消息前分支与恢复

Codex 原生单条文本的纠正先通过 serialized write 保存，再经既有 renderer 按当前归属收敛显示；不改共享 StreamController 或其他后端。

既有 router/outcome/persistence 链同时保存 user item ID 与 owning turn；composition 只注入 Codex 权威读取与 serialized write seam。
settled Codex footer 的最小刷新留在已有 composition callback，并守住 active tab、conversation ID 和 native thread 三个归属条件，不增加 view-local runtime owner。

2026-10-07 owner manifest 核对：新增 `shared.foundation` 的 `src/shared/sessionCatalogReadback.ts`，统一目录读取结果与错误分类。本 owner `feature.chat-runtime` 的路径映射、职责、canonical state 和依赖约束经核对保持原定义；目录读取仍由 backend/lifecycle owners 调用共享契约。


2026-10-07 成功 Pi prompt 进入既有 after-stream sync；SDK/process/history 读取仍经 adapter-native view 分支，不借用 OpenCode transport。

Settled Claude Code turns reuse the existing scoped user-footer identity refresh alongside Codex; no new runtime owner or rerender of the message body is introduced.

## 目录定位（2026-10-23）

当前源码目录：`src/features/chat/runtime`、`src/features/chat/runtime/activation`、`src/features/chat/runtime/background`、`src/features/chat/runtime/rendering`、`src/features/chat/runtime/send`。

目录整理沿用本 owner 的职责、状态和依赖约束；路径导航见[源码目录说明](../source-layout.md)。


2026-10-26 现场目录时序补充：目录晚到时，AssistantShellViewHostAdapter/AssistantShellRenderer 只更新已存在 footer 的可见模型名、tooltip 和 AX 名称，完整历史身份保持不变，不重建 body。

2026-10-28 owner manifest 核对：仅 app.memory-runtime 的模型调用依赖由 core.opencode 改为 core.backend 通用只读辅助能力；本 owner `feature.chat-runtime` 的 include、职责、canonical state 与依赖规则逐项对比 HEAD 均未改变。
