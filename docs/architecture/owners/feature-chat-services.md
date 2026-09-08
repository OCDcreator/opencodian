# Owner: feature.chat-services

> Auto-generated scaffold from `architecture-owners.config.json`. The manifest is the canonical truth source; this page narrates the model and records hard-to-automate rationale. Update it when the owner boundary or its non-obvious invariants change.

- **Layer:** `feature` (may import layers: shared, core, feature)
- **Risk:** high
- **Include:** `src/features/chat/services/**`

## Responsibilities
- chat services: context usage, scroll, conversation sync, background tasks, slash commands, title generation, model selection, session todo
- conversation history, write serialization, post-sync coordination

## Canonical state (truth home)
- conversation sync orchestration state
- slash command menu catalog cache
- context usage service state
- title generation service

> Cross-owner access is read-only snapshot/command/event. Do not replicate this state as a second writable truth source.

## Entrypoints
- `src/features/chat/services/ScrollManager.ts`
- `src/features/chat/services/ContextUsageService.ts`
- `src/features/chat/services/SlashCommandMenuCatalogCache.ts`
- `src/features/chat/services/TitleGenerationService.ts`

## Dependency surface
- **Allowed owner dependencies:** `shared.foundation`, `shared.diagnostics`, `core.types`, `core.prompts`
- **Forbidden dependencies:** `app`
- **Adjacent owners** (prefer editing these when out of scope): `feature.chat-shell`, `feature.chat-runtime`, `feature.chat-diagnostics`
- **Delegates to:** `feature.chat-diagnostics`, `feature.chat-misc`

## Focused tests
- `tests/unit/features/chat/services/**`

## Required gates
Run before merge: `npm run typecheck`, `npm run module-docs`.

## Recent change notes
- **Authoritative-sync preservation:** persistent assistant notices share the conversation write queue with authoritative sync. A notice for the currently visible conversation is committed to that live conversation object even when the caller still holds a detached same-ID reference. Valid turn-change records are persisted before visible rendering, deduplicated by their anchored user-message ID, and narrowly rebased if they arrive after merge calculation but before serialized commit; malformed or generic local notices do not receive that preservation rule.
- **Session sidebar fallback:** `ModifiedFilesSidebarCoordinator` keeps cached OpenCode `session.diff` as the primary source, but when that cache is empty it may derive a reload-safe, file-deduplicated fallback from the active conversation's persisted Turn Change Records. The fallback is gated by both a ready capability state and a non-null OpenCode session id.
- **Turn-record sidebar signal:** `ConversationNoticeCoordinator` emits `refreshSessionChangeSidebar()` only after a Turn Change Record has been persisted successfully. Early returns and persistence failures emit no refresh signal.
- **Conversation render concurrency + reconcile:** full conversation rerenders are serialized with a generation guard so re-entrant callers cannot interleave appends; `loadConversation` runs per-tab generation/abort checks; visible-conversation sync during hydration is deferred and retried (bounded), never silently dropped. Scroll restore snapshots are captured before any container clear, user scrolling during restore wins over the capture-time stick-to-bottom decision, and late-loading content re-applies the anchor inside a 1500ms window.
- **Full-rerender unchanged no-op:** `performRerenderConversationMessages` short-circuits when the render-input fingerprint (conversation id + each rendered message serialized in FULL via JSON.stringify, covering all DOM-affecting fields without field enumeration + empty-notice flag + host `renderInputSettingsSignature()` covering renderUserMarkupAsCodeBlocks / questionCardPosition / showAnsweredQuestionCards / locale) is identical to the last successful commit's fingerprint for the SAME messages container. The cache is written only after a successful staging→clear→commit with a final owner/generation re-check, and is invalidated by every ConversationRenderService live-DOM mutation path (renderMessages, incremental sync, trailing patch, single-message rerender, ad-hoc render) plus the public `invalidateRerenderFingerprint()` for external direct-DOM writers (e.g. PersistentAssistantNoticeService), and by a container identity change.
- **Keyed reconcile:** `ConversationKeyedReconcileDelegate` reconciles authoritative-sync updates by stable message identity (keep/update/insert/turn-level move, composite ids from consecutive-assistant merges) and preserves DOM node identity plus collapse state; the full rebuild remains the fallback when reconcile declines.

## Hard invariants
- Do not cross `forbiddenDependencies`.
- Do not replicate canonical state in another owner.
- Changes here must update the matching `docs/modules/**` page (via `module-docs.config.json`).
- Run `npm run inspect:owner -- <this owner or a path>` for an always-fresh summary.

## Pi owner boundary review (2026-09-08)

PiModelSelectionBinding owns Pi selector policy; send preparation and slash dispatch route Pi explicitly. Pi catalog reads do not use OpenCode runtime resources.
