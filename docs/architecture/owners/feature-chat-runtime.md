# Owner: feature.chat-runtime

> Auto-generated scaffold from `architecture-owners.config.json`. The manifest is the canonical truth source; this page narrates the model and records hard-to-automate rationale. Update it when the owner boundary or its non-obvious invariants change.

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
- `src/features/chat/runtime/SendPipelineRuntime.ts`
- `src/features/chat/runtime/BackgroundTaskIndicatorCoordinator.ts`
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
