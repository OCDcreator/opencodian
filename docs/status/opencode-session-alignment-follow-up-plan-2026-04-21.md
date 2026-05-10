# OpenCode Session Alignment Follow-Up Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` for parallelizable task slices or `superpowers:executing-plans` for inline execution. Steps use checkbox syntax for tracking.

**Goal:** Make OpenCodian's session mechanism logically equivalent to reference OpenCode for session/message/part state ownership, rendering, reload, sync, and finalization.

**Architecture:** Converge all runtime paths on the canonical `OpenCodeSessionStateStore` graph. Demote `Conversation.messages` to persisted compatibility/cache output, not a runtime fact source. Remove or narrow post-stream and authoritative-sync compensation only after focused tests prove live stream, reload, and post-sync produce the same canonical render input.

**Tech Stack:** TypeScript, Jest, Obsidian plugin runtime, OpenCode SDK v2 / legacy fallback, OpenCodian chat render services.

---

## Scope Rules

- Do not modify `reference-projects/`.
- Preserve SDK and legacy HTTP/SSE fallback behavior unless current code proves a path is dead.
- Preserve existing UI appearance, assistant cards, footer metadata, OMO compatibility, question cards, notices, context attachments, and tool rendering.
- Do not add a third truth source.
- Make the canonical graph the input to render/reload/finalization before adding shell or new plugin-injection behavior.
- For runtime behavior changes, run focused tests first. Before merge, run `npm run verify`. If deploy-relevant runtime files are changed and `npm run build` succeeds, deploy to Test Vault and verify `BUILD_ID` per `AGENTS.md`.

## Target End State

- `OpenCodeSessionStateStore` is the only canonical state owner for session/message/part runtime state.
- `Conversation.messages` is written as compatibility/cache output after canonical state changes, not used to decide runtime truth when canonical state exists.
- `ConversationRenderService` renders from canonical-derived turn/render input.
- Authoritative reload updates canonical snapshots and then refreshes canonical-derived render/cache output.
- Sync events update canonical state and trigger render/cache projection without server fallback unless canonical state is missing.
- `session.diff` updates diff-related state only; it does not trigger message authoritative reload.
- Finalization validates canonical convergence and no longer repairs live output by comparing local `ChatMessage[]` visual fingerprints.

## Current High-Risk Files

- `src/core/opencode/OpenCodeService.ts`
- `src/core/opencode/OpenCodeSessionStateStore.ts`
- `src/features/chat/services/ConversationRenderService.ts`
- `src/features/chat/services/ConversationTurnViewModelBuilder.ts`
- `src/features/chat/services/ConversationAuthoritativeReloadCoordinator.ts`
- `src/features/chat/services/ConversationAuthoritativeMessageMergeCoordinator.ts`
- `src/features/chat/services/ConversationSyncBridge.ts`
- `src/features/chat/services/ConversationSessionSignalRuntime.ts`
- `src/features/chat/services/MessageFinalizationService.ts`
- `src/features/chat/runtime/LocalStreamMessagePersistence.ts`
- `src/features/chat/runtime/StreamChunkRouter.ts`
- `src/features/chat/OpenCodianView.ts`

## Phase 1: Canonical Render Projection

**Problem solved:** `Conversation.messages` still participates in render fallback and local render grouping when canonical state exists.

**Files:**
- Modify: `src/features/chat/services/ConversationRenderService.ts`
- Modify: `src/features/chat/services/ConversationTurnViewModelBuilder.ts`
- Modify or add tests near existing chat service tests for canonical render projection.

- [ ] **Step 1: Add tests for canonical render input**
  - Cover a session state with one user message, one assistant message, and multiple parts.
  - Cover tool-first assistant parts with no initial text part.
  - Expected result: render input is built from canonical message/part state and does not require `Conversation.messages`.

- [ ] **Step 2: Make fallback explicit and narrow**
  - Keep fallback only when `getCanonicalSessionState(sessionId)` returns `null` or canonical state is empty before first authoritative load.
  - Add a debug log or test-visible branch label if helpful, but do not add a new state store.

- [ ] **Step 3: Preserve UI-specific compatibility in projection**
  - Confirm footer model metadata, context attachments, question resolution, OMO task markers, and visible tool cards still survive through canonical projection or documented compatibility projection.
  - Any field that cannot be canonical should be clearly marked as client-only decoration, not truth.

- [ ] **Step 4: Run focused render tests**
  - Run the smallest test command that covers the changed render service.
  - If no adjacent tests exist, add focused Jest coverage rather than broad snapshots.

**Exit criteria:**
- Render input prefers canonical graph and uses fallback only as a startup/cache-miss escape hatch.
- Tool-first assistant messages render a nonblank assistant turn from canonical parts.

## Phase 2: Authoritative Sync Becomes Canonical Snapshot Projection

**Problem solved:** `ConversationAuthoritativeReloadCoordinator` currently hydrates to `ChatMessage[]`, merges with `conversation.messages`, and writes that as runtime truth.

**Files:**
- Modify: `src/features/chat/services/ConversationAuthoritativeReloadCoordinator.ts`
- Modify: `src/features/chat/services/ConversationAuthoritativeMessageMergeCoordinator.ts`
- Modify: `src/features/chat/services/ConversationSyncBridge.ts`
- Modify or add tests for server snapshot sync and canonical-state sync.

- [ ] **Step 1: Add tests for server snapshot to canonical projection**
  - Start with existing `conversation.messages` containing stale assistant content.
  - Provide canonical/server messages with updated assistant parts.
  - Expected result: canonical-derived render/cache output wins; stale `Conversation.messages` content does not override it.

- [ ] **Step 2: Split client-only decorations from truth fields**
  - Preserve only explicit client decorations, such as context attachment display metadata or resolved question UI state.
  - Do not preserve assistant body, tool call output, structured payload, stream state, or source message content from `conversation.messages` when canonical state exists.

- [ ] **Step 3: Rewrite sync merge around canonical snapshot**
  - Treat server snapshot and canonical snapshot as inputs to `OpenCodeSessionStateStore`.
  - Derive render/cache `ChatMessage[]` after canonical update.
  - Keep `Conversation.messages` save as compatibility/cache writeback after projection.

- [ ] **Step 4: Keep server fallback only for canonical cache miss**
  - In `ConversationSyncBridge`, use server sync when canonical state is unavailable, not as an ordinary second truth path.

- [ ] **Step 5: Run focused sync tests**
  - Validate live sync event and explicit reload produce identical canonical-derived render input.

**Exit criteria:**
- Reload and sync no longer use stale `Conversation.messages` as authority for content/tool/structured fields.
- Server sync writes canonical state first and then projects cache/render output.

## Phase 3: `session.diff` Semantics Alignment

**Problem solved:** `session.diff` currently schedules conversation sync instead of behaving like reference OpenCode's separate diff state.

**Files:**
- Modify: `src/features/chat/services/ConversationSessionSignalRuntime.ts`
- Modify: `src/features/chat/services/ConversationSyncBridge.ts`
- Modify or add a small diff-state holder if an existing owner is not available.
- Modify tests around sync signal routing.

- [ ] **Step 1: Add tests for `session.diff` routing**
  - Emit a `session.diff` update for the active session.
  - Expected result: diff state / turn-diff notice path updates, but message authoritative sync is not scheduled.

- [ ] **Step 2: Route diff to diff-specific state**
  - Store or hand off diff payload separately from message/part canonical state.
  - Do not call `syncConversationMessagesFromServer()` solely because a diff event arrived.

- [ ] **Step 3: Preserve existing turn-diff notices**
  - Ensure `appendTurnDiffNoticeIfNeeded()` or its successor still has the diff data it needs.

- [ ] **Step 4: Run focused signal tests**
  - Validate `message.updated` still triggers canonical message projection.
  - Validate `session.diff` does not trigger message reload.

**Exit criteria:**
- `session.diff` no longer participates in message truth correction.
- Diff UI behavior remains intact.

## Phase 4: Finalization Without Local Repair

**Problem solved:** `MessageFinalizationService` still post-syncs, compares `Conversation.messages` fingerprints, and applies render repair.

**Files:**
- Modify: `src/features/chat/services/MessageFinalizationService.ts`
- Modify: `src/features/chat/runtime/LocalStreamMessagePersistence.ts`
- Modify: `src/features/chat/runtime/StreamChunkRouter.ts`
- Modify tests for finalization and live/reload parity.

- [ ] **Step 1: Add canonical drift tests**
  - Build a stream result with assistant text and tool parts.
  - Build the equivalent canonical snapshot.
  - Expected result: finalization compares canonical-derived fingerprints, not raw `Conversation.messages`.

- [ ] **Step 2: Replace visual fingerprint repair with canonical convergence check**
  - Compute fingerprints from canonical render input or canonical message/part state.
  - If drift exists, project canonical state to render/cache; do not preserve local assistant body as truth.

- [ ] **Step 3: Narrow local assistant append behavior**
  - Make `LocalStreamMessagePersistence` append compatibility/cache output only after canonical stream state exists.
  - Keep interrupted/error notices only where they are intentionally client-only and documented.

- [ ] **Step 4: Remove or gate post-sync render repair**
  - Keep server sync only when the stream transport did not deliver enough canonical events.
  - Otherwise finalization should mark completion, save cache output, refresh todos/context, and stop.

- [ ] **Step 5: Run finalization tests**
  - Cover normal text response, tool-first assistant response, interrupted response, and structured output response.

**Exit criteria:**
- Finalization no longer depends on local `ChatMessage[]` visual repair for correct assistant body rendering.
- Live stream, reload, and post-sync render inputs match for covered scenarios.

## Phase 5: Extension Path Parity Pass

**Problem solved:** Plugin synthetic parts, command, shell, question, and notice paths can still bypass unified session logic.

**Files:**
- Modify: `src/core/opencode/OpenCodeSessionControlOrchestrator.ts`
- Modify: `src/features/chat/services/MessageSendPreparationService.ts`
- Modify: `src/features/chat/services/SlashCommandExecutionService.ts`
- Modify: `src/features/chat/OpenCodianView.ts`
- Add or update tests for synthetic parts and command/shell routing.

- [ ] **Step 1: Add plugin synthetic part reload test**
  - Send a prompt with synthetic text parts.
  - Reload from canonical/server messages.
  - Expected result: synthetic parts survive through canonical state without depending on fallback `Conversation.messages.content`.

- [ ] **Step 2: Audit command path for canonical reuse**
  - Ensure slash command execution eventually produces canonical message/part state through the same projection path as normal prompt sends.

- [ ] **Step 3: Decide shell scope before implementation**
  - If shell remains disabled, document it as intentionally unsupported in stable OpenCodian.
  - If shell is enabled, route it through `session.shell` and canonical projection instead of a local-only path.

- [ ] **Step 4: Validate question/notice client-only boundaries**
  - Ensure question cards and notices are clearly client decorations or canonical-backed messages.

**Exit criteria:**
- Extension paths either reuse canonical session logic or are explicitly documented as unsupported/client-only.

## Validation Checklist

- [ ] Focused tests for canonical render projection.
- [ ] Focused tests for server snapshot sync and canonical-state sync.
- [ ] Focused tests for `session.diff` routing.
- [ ] Focused tests for finalization canonical convergence.
- [ ] Focused tests for synthetic parts surviving reload.
- [ ] `npm run check:module-docs` if source modules are added, deleted, renamed, or materially changed.
- [ ] `npm run verify` before treating the implementation branch as complete.
- [ ] `npm run build` for runtime changes.
- [ ] Test Vault deployment and deployed `BUILD_ID` verification if deploy-relevant runtime files changed and build succeeded.

## Recommended First Slice

Start with **Phase 1 + the smallest part of Phase 2**:

1. Make `ConversationRenderService` and `ConversationTurnViewModelBuilder` produce stable canonical render input.
2. Change canonical sync projection so `Conversation.messages` cannot override canonical assistant body/tool/structured data.
3. Add tests proving live canonical state and reload canonical state produce identical render input for a normal assistant response and a tool-first assistant response.

This slice directly attacks the highest-risk non-equivalence: local `ChatMessage[]` truth competing with canonical `session/message/part` truth.

## Current Implementation Status

As of 2026-05-10, the focused canonical-convergence slice has landed in code:

- Phase 1 canonical render projection: implemented
- Phase 2 authoritative reload / sync projection: implemented
- Phase 3 `session.diff` routing: implemented
- Phase 4 finalization without local repair: implemented
- Phase 5 extension-path parity proof: implemented for synthetic parts, command/shell routing, and client-only notice boundaries

Still intentionally out of scope for this slice:

- follow-up queue
- sync-event batching
- background-task metadata persistence
- full `TabSessionPhase`
