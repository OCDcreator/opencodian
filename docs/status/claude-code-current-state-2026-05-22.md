# Claude Code SDK Current State - 2026-05-22

## Purpose

This document is the current continuity handoff for future models continuing the Claude Code SDK lane in OpenCodian.

Use this file to answer:

- where the Claude backend lane currently is;
- which capabilities are complete versus only wired;
- which surfaces are intentionally still diagnostic or hidden;
- which older status documents are now partially outdated.

This is a status snapshot, not the long-term design or full implementation plan.

## Current Anchor

- Worktree: `/Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/.worktrees/phase0-capability`
- Snapshot commit: `9ab7b6a62b0b31410a7c444a7329933bc72af1f9`
- Commit subject: `feat: route share-url read through backend getSession`
- Latest validated build at this snapshot: `feature-phase0-capability.202605230949`
- Recent continuity commits in this lane:
  - `9ab7b6a62b0b31410a7c444a7329933bc72af1f9` — `feat: route share-url read through backend getSession`
  - `4a5610537e24a3d899e161a222ff112170b6189a` — `docs: refresh Claude continuity after title read routing`
  - `d0a1e216080be2ad201624c538216e8024484952` — `feat: route title session reads through backend getSession`
  - `5013c0b7ad14c161a9d28ad8d6eb5ec1ac28544a` — `docs: refresh Claude continuity after settings history routing`
  - `d96841f71898b6434aafdaf19b0a9687539e69ff` — `feat: fork-only capability + backend-aware session/history routing`
  - `e012ef6b3fa9be4cde26f38deb501d1be3aea0d7` — `feat: backend-aware session history productization`
  - `719c43fb052d3aafade48dd48ad0878fdd61b292` — `feat: route settings session history reads through backend routing`

## Source Of Truth Order

Read these in order when continuing Claude work:

1. `docs/requirements/multi-agent-foundation/04-claude-code-adapter.md`
2. `docs/superpowers/specs/2026-05-20-claude-code-full-capability-design.md`
3. `docs/superpowers/plans/2026-05-20-claude-code-full-capability-implementation.md`
4. `src/core/agents/backend/ClaudeCodeAdapter.ts`
5. `src/core/agents/backend/ClaudeCodeOptionsBuilder.ts`
6. `src/features/settings/SettingsCapabilityLabSection.ts`
7. This file

Interpret older `docs/status/claude-code-*.md` files as historical snapshots unless they are explicitly newer than this file.

## Where The Project Is Now

The Claude Code lane is no longer at proposal stage.

The current position is:

- Phase 0 backend-neutral groundwork is sufficiently complete for real Claude backend work.
- Phase 1 minimal backend loop is complete.
- Phase 2 has meaningful implementation, not just design.
- A subset of later-phase Claude-native ecosystem capabilities has already been wired behind diagnostic or hidden surfaces.

The most important framing for future work:

- OpenCodian is not trying to flatten Claude into an OpenCode-shaped backend.
- OpenCodian is trying to preserve a multi-backend shell while still letting each backend eventually expose its native ecosystem.
- For Claude, advanced capabilities are being integrated with a diagnostic-first policy before stable promotion.

## Backend-Aware Session/History/Control Migration (2026-05-22)

Recent runs focused on two connected lanes:

- separating Claude `fork` from full OpenCode-style branching semantics; and
- productizing backend-aware session/history reads only where semantics genuinely match.

### What Became Backend-Aware

| Owner | Change |
|---|---|
| `OpenCodianView.ts` | `revertSession`/`unrevertSession` route through `AgentCapability.Branching`; `forkSession` routes separately through `AgentCapability.Fork` / `AgentForkCapability`. OpenCode fallback is explicit and backend-gated. `getCurrentConversationSessionId` uses `getConversationBackendSessionId()`. |
| `ConversationLoadRecoveryCoordinator.ts` | `handleRewindRequest`/`handleRestoreRewindRequest`/`handleForkRequest` use `getConversationBackendSessionId()` and gate revert/unrevert by backend kind. Fork preserves source conversation `backend` identity through `createConversationFromSession()` instead of using `settings.activeBackend`. |
| `ConversationAuthoritativeSyncCoordinator.ts` | Uses `getConversationBackendSessionId()`; skips sync for non-OpenCode backends (OpenCode-only by design). |
| `ConversationAuthoritativeReloadCoordinator.ts` | Uses `getConversationBackendSessionId()` in all debug logs; skips server sync for non-OpenCode backends. |
| `ConversationNoticeCoordinator.ts` | `appendTurnDiffNoticeIfNeeded` gated to OpenCode-only. |
| `SlashCommandExecutionService.ts` | `/undo` and `/redo` gated to OpenCode-only; uses `getConversationBackendSessionId()`. |
| `ChildSessionGraphCoordinator.ts` | `refreshGraph` gated to OpenCode-only. |
| `LocalStreamMessagePersistence.ts` | Debug logs use `getConversationBackendSessionId()`. |
| `ConversationRenderService.ts` | Debug logs use `getConversationBackendSessionId()`. |
| `ConversationSyncRuntimeCoordinator.ts` | Sync timeout payload uses both `openCodeSessionId` and `backendSessionId`. |
| `BackgroundTaskNoticeStateService.ts` | Session matching uses `getConversationBackendSessionId()`. |
| `BackgroundTaskTimelineService.ts` | Debug logs use `getConversationBackendSessionId()`. |
| `ConversationIdentityRuntime.ts` | Sync fingerprint uses `getConversationBackendSessionId()`. |
| `SessionTodoStateService.ts` | Session matching uses `getConversationBackendSessionId()`. |
| `AgentBackendRouting.ts` | Adds `getConversationSessionHistoryService()`, `loadBackendSessionMessages()`, `getActiveSessionHistoryService()`, `readBackendSessionTitle()`, `readBackendSessionShareUrl()`, `listBackendSessions()`, and `getBackendSessionPreview()` so shared owners can read raw session history, session titles, session share URLs, normalized session rows, and normalized preview messages without hard-binding to `openCodeService` or assuming OpenCode `Session` / `SessionMessage` shapes. `NormalizedSessionRow`, `NormalizedSessionPreviewMessage`, and `NormalizedSessionPreviewPart` are lightweight inspection-only types, not a stable cross-backend session contract. |
| `TitleGenerationService.ts` | `readOfficialSessionTitle()` now routes through `readBackendSessionTitle()` in `AgentBackendRouting` — calls `getSession(sessionId)` on the backend adapter instead of `listSessions()` + client-side filtering. Both OpenCode and Claude paths are unified through the registry. AI title generation (temp session create/delete/send via `openCodeService`) remains OpenCode-only until backend-neutral chat contract supports non-streaming single-shot response. |
| Context usage detail modal | Raw message loading now routes through `getConversationSessionHistoryService()` with backend-aware normalization; snapshots themselves remain OpenCode-only. |
| `SettingsConversationSection.ts` | Shared sessions list now routes through `listBackendSessions()` and session message preview routes through `getBackendSessionPreview()` instead of directly calling backend `listSessions()` / `getSessionMessages()` and casting to OpenCode `Session` / `SessionMessage`. The rendering uses `NormalizedSessionRow` and `NormalizedSessionPreviewMessage` types. `unshareSession()` remains a direct `openCodeService` call (OpenCode-specific write). |

### What Remains OpenCode-Only (Intentionally Gated)

| Capability | Reason |
|---|---|
| Authoritative server sync | OpenCode-specific message shape (`info`/`parts`), hydration path, and canonical state. |
| Revert / unrevert | Claude SDK has `rewindFiles` but semantics differ; no stable-complete runtime proof. |
| Session diff (`getSessionDiff`) | OpenCode-specific API; no backend-neutral equivalent. |
| Child session graph | OpenCode-specific `getSessionChildren` API. |
| Session todo/status live signals | Deeply tied to OpenCode server events. |
| Background task timeline | Assumes OpenCode task tool metadata shape. |

### What Claude Still Needs To Verify/Deploy

- ~~`forkSession` is wired in `ClaudeCodeAdapter` but not exposed as stable~~ **RESOLVED**: `AgentCapability.Fork` and `AgentForkCapability` have been added; Claude Code now declares `Fork` and routes fork through the registry layer.
- `ClaudeCodeAdapter` has `listSessions`, `getSession`, `getSessionMessages`, `deleteSession`, `updateSessionTitle` — these are adapter-wired. `getSessionMessages` is now on the shared `AgentSessionCapability` interface and both OpenCode and Claude adapters implement it; `getConversationSessionHistoryService()` routing helper exists in `AgentBackendRouting`. The context usage detail modal now routes through this helper with backend-aware message normalization. `getSession()` is now productized narrowly for two shared read seams via `readBackendSessionTitle()` and `readBackendSessionShareUrl()`; the helpers map only the currently validated backends and must not be described as a generic stable cross-backend session-detail object contract yet. `readBackendSessionShareUrl()` extracts `session.share.url` for OpenCode and returns `null` for Claude Code (no share URL concept).
- The `TitleGenerationService` official-title read seam now has Test Vault runtime proof through deployed plugin code: both OpenCode and Claude paths route through registry `getSession(sessionId)`, and the OpenCode read path no longer falls back to `openCodeService.listSessions()` for that seam. This proves the narrow shared session-detail read, not a broader backend-neutral session object contract.
- Backend-aware history normalization for non-OpenCode backends is currently best-effort foundation (`loadBackendSessionMessages()`); it is good enough for raw inspection surfaces, not yet a stable cross-backend history product contract.
- `SettingsConversationSection` now uses backend-aware normalized routing for session list + preview reads through `listBackendSessions()` and `getBackendSessionPreview()`. The preview renderer consumes `NormalizedSessionPreviewMessage` (not OpenCode `SessionMessage`), so it handles both OpenCode `{info, parts}` shape and generic/Claude `{role, content}` shape without crashing. `getBackendSessionPreview()` now distinguishes unavailable preview capability (`null` → failure copy) from legitimate empty history (`[]` → neutral empty-preview copy). `unshareSession()` remains OpenCode-only. Treat the shared-session manager as a real backend-aware inspection surface, not as a generic stable cross-backend session-detail contract.
- Runtime smoke for Claude fork/resume-at is not yet recorded.
- The `AgentBranchCapability` interface still requires ALL of fork/revert/unrevert/diff/getSessionRevertState; Claude only has fork. `AgentForkCapability` is the separate partial interface for fork-only backends.

## What Is Definitely Complete

These items are implemented enough to treat as real delivered backend capability, not speculative design:

| Area | Current state |
|---|---|
| Backend registration and routing | Claude is a real backend in the multi-backend architecture, not a placeholder. |
| SDK import and executable handling | The adapter uses the official SDK path, plus process resolution and Electron-safe spawn handling. |
| Persistent query runtime | Claude owns a persistent `query()` runtime and can stream across turns. |
| Session identity | Claude uses backend-owned session identity via `backendSessionId`-style flow, rather than pretending to be OpenCode. |
| Resume | Claude session resume is wired and runtime-smoked. |
| Stream normalization | Text, thinking, tool use, tool result, usage, message metadata, hook events, subagent progress, and structured output backend events are normalized. |
| Permissions bridge | `canUseTool` and elicitation/question bridging are wired into the existing permission/question flows. |
| Model / effort / thinking basics | Core Claude settings and options mapping are implemented. |
| MCP runtime pass-through | MCP servers can be passed through and refreshed at runtime. |
| OpenCode coexistence | OpenCode remains alive as a backend and is not meant to be regressed by Claude work. |

## What Exists But Must Not Be Described As Stable Completion

These capabilities are no longer “not wired”, but they are also not stable completed product surfaces.

| Capability | Real state now | How to describe it |
|---|---|---|
| Structured output | Runtime-only `outputFormat` wiring exists, backend-event normalization exists, Capability Lab probe exists, runtime evidence exists. Transcript rendering and persistence are now stable. | `Diagnostic authoring`, stable transcript rendering. |
| Hooks | Runtime-only hook injection exists, hook events are normalized, SessionStart runtime proof exists in Capability Lab. | `Hidden` or `Diagnostic`, not authoring-complete. |
| Session store | Runtime-only SDK `sessionStore` path exists, plugin-owned diagnostic store adapter exists, import/mirror/list/load proof exists in Capability Lab. | `Diagnostic store proof only`, not stable storage product. |
| JSONL history browser | Capability Lab can browse history read-only and preview messages. | `Diagnostic browser`, not full history productization. |
| Rewind | Adapter-level `rewindFiles()` exists and dry-run surface exists. | Not stable-complete until no-data-loss guard and stronger runtime proof are accepted. |
| Agent definitions | Runtime-only `agent` / `agents` option wiring exists. | Must remain `Hidden / Untested`. |
| Skills / plugins / agent authoring | Some runtime-only channels exist or are planned, but no stable Claude-native authoring surface is complete in OpenCodian. | Not complete. |

## Current Capability-Layer Interpretation

Future models should use this language:

- `wired`: the SDK option or adapter seam exists.
- `runtime-proved`: there is local runtime evidence that the seam actually executes.
- `stable`: the capability is intentionally exposed as part of the product surface for end users.
- `backend-aware`: the service seams route through the registry/routing layer using `getConversationBackendSessionId()` and capability checks rather than hard-wiring `openCodeService`.

For several Claude-native capabilities, OpenCodian is currently at:

- `wired + runtime-proved + not stable`

That is the correct reading for:

- hooks
- diagnostic session store

Structured output is now at `wired + runtime-proved + stable transcript rendering`, with authoring/triggering remaining diagnostic-only.

Do not collapse this to either:

- "not implemented", or
- "fully complete"

Both would be wrong.

### Backend-Aware Session/History/Control Seams (as of this run)

The following service seams now route session identity through `getConversationBackendSessionId()` and are gated by backend kind checks:

| Seam | Backend-aware? | Notes |
|---|---|---|
| Conversation load/recovery (fork) | **Yes** | Fork routes through registry `AgentForkCapability` for capable backends; OpenCode fallback preserved. Forked conversation preserves source `backend` identity. |
| Conversation load/recovery (rewind/unrevert) | **Gated** | Explicitly OpenCode-only: backend check `backend !== 'opencode'` → unavailable for Claude |
| Authoritative sync (user message hydration) | **Gated** | OpenCode-only: entire hydration pipeline uses OpenCode-typed messages |
| Authoritative reload (log identity) | **Yes** | All log `sessionId` fields use `getConversationBackendSessionId()` |
| Context usage detail modal | **Backend-aware** | Routes through `getConversationSessionHistoryService()` with backend-aware message normalization; OpenCode uses `{info, parts}` shape, Claude uses generic SDK message shape. Context usage snapshots remain OpenCode-only. |
| Modified files sidebar (diff) | **Gated** | OpenCode-only: diff is not stable for Claude |
| Session todos (identity) | **Yes** | `SessionTodoStateService` uses `getConversationBackendSessionId()` |
| Background task timeline/notice (identity) | **Yes** | Both services use `getConversationBackendSessionId()` |
| Conversation identity runtime (log fingerprint) | **Yes** | Uses `getConversationBackendSessionId()` |
| Slash command undo (revert) | **Gated** | OpenCode-only: backend check |
| Slash command redo (unrevert) | **Gated** | OpenCode-only: backend check |
| Diff notice on turn completion | **Gated** | OpenCode-only: backend check |
| Child session graph | **Gated** | OpenCode-only: `getSessionChildren` has no backend-neutral equivalent |
| Task tool session open (backend identity) | **Yes** | `openTaskToolSession()` accepts parent `backend` parameter; `createConversationFromSession()` in `main.ts` prefers explicit `initial.backend` over `settings.activeBackend` |
| Stream message persistence (log identity) | **Yes** | Uses `getConversationBackendSessionId()` |
| Conversation render service (log identity) | **Yes** | Uses `getConversationBackendSessionId()` |
| Conversation sync runtime coordinator (diagnostic) | **Yes** | Includes both `openCodeSessionId` and `backendSessionId` |
| Settings shared sessions list (`listSessions`) | **Backend-aware** | Routes through `listBackendSessions()` instead of `openCodeService.listSessions()`. Returns `NormalizedSessionRow[]` (backend-neutral shape). Section remains OpenCode-gated because share URLs are OpenCode-specific, but the read surface is backend-aware. |
| Settings shared session preview (`getSessionMessages`) | **Backend-aware** | Routes through `getBackendSessionPreview()` instead of `openCodeService.getSessionMessages()`. Returns `NormalizedSessionPreviewMessage[]` (backend-neutral shape with `role`/`parts[]`). Handles both OpenCode `{info, parts}` and generic/Claude `{role, content}` message shapes. |
| Settings shared session unshare (`unshareSession`) | **OpenCode-only** | Direct `openCodeService.unshareSession()` call; no backend-neutral equivalent for share URL write operations. |
| TitleGenerationService official-title read | **Backend-aware** | Routes through `readBackendSessionTitle()` → `getSession(sessionId)` on the backend adapter via registry. OpenCode path uses `.title`; Claude path uses `.summary`. Unified for both backends. |
| ConversationSessionSettingsCoordinator share-URL read | **Backend-aware** | Routes through `readBackendSessionShareUrl()` → `getSession(sessionId)` on the backend adapter via registry. OpenCode extracts `session.share.url`; Claude Code returns `null` (no share URL concept). Replaces the previous `listSessions()` + client-side filtering path. Share/unshare writes remain OpenCode-only. **Session-import-free**: coordinator no longer imports OpenCode `Session` type; uses local `ShareInspectionEntry` (`{ id?, share? }`) for all session-related reads and writes. |

**Services remaining hard-wired to OpenCode** (no migration justified until backend-neutral equivalents exist):

| Service | Reason it stays OpenCode-only |
|---|---|
| ConversationSyncBridge | Subscribes to `SessionSyncEventUpdate` from `core/opencode` |
| ConversationSessionTabResolver | Only reachable through OpenCode sync event subscription |
| TitleGenerationService | ~~Calls `openCodeService.listSessions()`~~ **FULLY ROUTED for title reads**: `readOfficialSessionTitle` now uses `readBackendSessionTitle()` routing helper → `getSession(sessionId)` on the backend adapter. AI title generation (temp session create/delete/send) remains OpenCode-only until backend-neutral chat contract supports non-streaming single-shot response. |
| ConversationSessionSettingsCoordinator | ~~Falls back to `openCodeService.listSessions()` for share-URL reads~~ **PRODUCTION PATH ROUTED for share-URL reads**: in the OpenCodianView-wired runtime path, `getCurrentShareUrl` now uses `readBackendSessionShareUrl()` → backend `getSession(sessionId)`. Legacy host-less fallback remains only when no registry is provided. Share/unshare writes remain OpenCode-only. **Session-import-free**: coordinator uses `ShareInspectionEntry` instead of OpenCode `Session` type. |
| PostSyncQuestionTodoRefreshPlanBuilder | Feeds into question/todo refresh chain using OpenCode APIs |
| PostSyncQuestionTodoRefreshHostAdapter | Adapter for question/todo chain using `openCodeService` |
| ConversationSyncVisiblePostSyncRouter | Routes post-sync question/todo updates through OpenCode APIs |
| ConversationSyncOrchestrationService | Drives OpenCode-specific sync loop |
| SettingsConversationSection (`unshareSession`) | Share URL write is OpenCode-specific; `listSessions` and `getSessionMessages` are now backend-aware |
| OpenCodianView sync host (`getSessionMessages`) | Authoritative sync host is OpenCode-only by design; routes through `openCodeService` directly |

## Capability Lab Status

`src/features/settings/SettingsCapabilityLabSection.ts` is now an important state-owner for Claude parity work.

It currently serves as:

- a capability matrix;
- a read-only JSONL history browser;
- a diagnostic session-store mirror/import/list/load surface;
- a rewind dry-run preview surface;
- a structured-output runtime probe;
- a hook runtime proof surface;
- a provider-owned fork session diagnostic probe (select a Claude session, run `adapter.forkSession()`, see forked session id/title). This probe is diagnostic-only and does NOT represent stable fork productization.

Important policy:

- Capability Lab is allowed to do isolated diagnostic actions.
- Capability Lab is not allowed to claim stable completion of a feature by itself.
- Capability Lab must continue to distinguish `Settings`, `Diagnostic`, and `Hidden`.

## Older Status Docs That Are Now Partially Outdated

The following files contain useful history, but their per-capability status must not be treated as current:

- `docs/status/claude-code-backend-capabilities-2026-05-21.md`
- `docs/status/claude-code-phase1-smoke-status-2026-05-21.md`

Why they are partially outdated:

- they still describe hooks as “not wired”;
- they still describe session store as “not wired”;
- they still describe structured output as “not wired”;
- they predate the diagnostic runtime proof slices landed in commit `9adc44da`.

Keep them for history, but prefer current code plus this file for present-state judgments.

## Relationship To Claudian

`claudian` remains a useful reference project for:

- Claude-native settings productization;
- `.claude/settings.json` ownership;
- slash command, skills, agent, MCP, and plugin storage patterns;
- provider-owned history and rewind product surfaces.

But OpenCodian is not meant to become Claude-only.

The intended direction is:

- multi-backend shell;
- provider-owned native ecosystem surfaces where appropriate;
- capability-gated shared UI where semantics genuinely match.

Do not use `claudian` as evidence that Claude-specific semantics should be flattened into generic OpenCode-style settings.

## Current Evidence Artifacts

At the current snapshot, local runtime evidence exists under `.obsidian-debug/`, especially:

- `.obsidian-debug/session-history-productization-runtime.png`
- `.obsidian-debug/session-history-settings-productization-runtime-2026-05-22.png`
- `.obsidian-debug/session-history-settings-productization-runtime-assertion-2026-05-22.json`
- `.obsidian-debug/session-history-settings-productization-dom-2026-05-22.html`
- `.obsidian-debug/session-history-settings-productization-console-2026-05-22.txt`
- `.obsidian-debug/session-history-settings-productization-errors-2026-05-22.txt`
- `.obsidian-debug/claude-session-history-control-console.txt`
- `.obsidian-debug/claude-session-history-control-errors.txt`
- `.obsidian-debug/claude-session-history-control-runtime.png`
- `.obsidian-debug/claude-fork-only-runtime-assertion-2026-05-22.json`
- `.obsidian-debug/claude-fork-only-runtime-console-2026-05-22.txt`
- `.obsidian-debug/claude-fork-only-runtime-errors-2026-05-22.txt`
- `.obsidian-debug/claude-fork-only-runtime-screenshot-2026-05-22.png`
- `.obsidian-debug/title-generation-official-read-runtime-assertion-2026-05-22.json`
- `.obsidian-debug/title-generation-official-read-runtime-console-2026-05-22.txt`
- `.obsidian-debug/title-generation-official-read-runtime-errors-2026-05-22.txt`
- `.obsidian-debug/title-generation-official-read-runtime-screenshot-2026-05-22.png`
- `.obsidian-debug/share-url-read-runtime-assertion-2026-05-23.json`
- `.obsidian-debug/share-url-read-runtime-console-2026-05-23.txt`
- `.obsidian-debug/share-url-read-runtime-errors-2026-05-23.txt`
- `.obsidian-debug/share-url-read-runtime-screenshot-2026-05-23.png`

Treat those as local evidence for:

- deployed build identity;
- Test Vault reload success;
- backend-aware session/history surface presence;
- settings shared-session list/preview read routing presence in the conversation sharing block;
- Claude `fork=true` + `branching=false` runtime gating;
- `TitleGenerationService.readOfficialSessionTitle()` routing through registry `getSession()` for both OpenCode and Claude, with the OpenCode title-read seam no longer using `openCodeService.listSessions()`;
- `ConversationSessionSettingsCoordinator.getCurrentShareUrl()` routing through registry `getSession()` in the OpenCodianView-wired runtime path, with `getSession` hit and `openCodeService.listSessions()` not hit during the runtime assertion;
- hook and structured-output backend-event activity in runtime logs where the older capability-lab artifacts are still referenced.

Note: older capability-lab artifacts still matter for hook / structured-output proof, but newer lane-specific evidence should be preferred when the question is specifically about fork-only capability gating or backend-aware session/history reads.

## The Best Short Summary For Future Models

If you need one sentence:

> OpenCodian's Claude Code SDK lane has passed Phase 1 backend viability, has meaningful Phase 2 wiring, and has begun Phase 3/4-style Claude-native capability integration through diagnostic-first surfaces. Session/history/control seams are now backend-aware where semantics match: fork routes through the registry layer, official-title polling, share-URL inspection, raw history inspection, and the settings shared-session read surfaces can route through backend-aware session owners, rewind/unrevert/diff remain gated as OpenCode-only, and session identity uses `getConversationBackendSessionId()` across the service layer. Several advanced capabilities (hooks, session store, structured output authoring) are intentionally runtime-proved without yet being stable product features.

## Recommended Next-Step Mindset

When continuing this lane, choose one of these modes explicitly:

- promote a diagnostic Claude capability to stable UI;
- deepen runtime proof for a currently diagnostic capability;
- expand Claude-native ecosystem ownership, such as history, rewind, skills, agents, plugins, or MCP authoring;
- improve multi-backend abstraction so future backends can expose their own native ecosystems cleanly.

Do not mix these modes casually in one slice.

For the current session/history lane, do **not** stop after one small slice per session anymore. The expected execution mode is now multi-round Phase 3 delivery inside one Codex session.

## Execution Mode For Continuation (2026-05-23 User Instruction)

Future sessions should follow these rules unless the user overrides them again:

- use `opencode run --dir "/Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/.worktrees/phase0-capability" "<task>"` as the default OpenCode delegation path;
- do **not** use A2A for this lane unless the user explicitly re-enables it;
- one Codex session should cover multiple consecutive rounds inside this phase, not a single small slice;
- after each completed round:
  - update this continuity document and any mapped module docs;
  - review OpenCode's implementation result;
  - run the required validation stack for the touched surface;
  - commit the verified round;
  - then immediately continue by sending the next round to `opencode run` while Phase 3 backlog still remains;
- Codex still stays in the same role split:
  - read/align docs and current code;
  - delegate the main implementation to OpenCode;
  - review the implementation;
  - run verify/build/deploy/runtime proof;
  - update docs and summarize.

## Remaining Phase 3 Backlog (Work Through In Multi-Round Sessions)

The remaining Phase 3 foundation/productization work should be treated as one continuing backlog rather than isolated single-slice sessions:

- continue auditing the remaining session detail / history inspection / session list-detail reads that still bind directly to `openCodeService` or still assume OpenCode-shaped payloads;
- where semantics truly match, keep promoting narrow shared read seams like the official-title and share-URL reads, but do not widen `getSession()` into a generic stable session-detail contract;
- identify whether another inspection/detail surface can be productized through backend-aware `getSession()` or `getSessionMessages()` without flattening Claude payloads;
- if a read surface cannot be safely generalized, keep it explicitly OpenCode-only or diagnostic and document that boundary instead of forcing abstraction;
- deepen runtime proof for the currently productized backend-aware session/history reads as adjacent rounds justify deployment validation;
- keep `revert / unrevert / diff / child-session graph / authoritative sync` gated unless a later round provides both official basis and accepted runtime proof.

For the next multi-round continuation, the immediate high-value targets are:

- continue auditing remaining session detail/history inspection surfaces that still read directly from `openCodeService` or still assume OpenCode-shaped payloads after the title-read and share-URL read seams landed;
- only promote another shared `getSession()` consumer when the shared semantic is as narrow and provable as the official-title or share-URL read seams;
- keep share writes, rewind, diff, authoritative sync, and child-session graph explicitly gated unless new official basis plus runtime proof says otherwise;
- if one round finishes cleanly and more backlog remains, do not hand off immediately to a fresh human/Codex session; update docs, commit, and launch the next `opencode run` round in the same session.

## Hard Guardrails

- Do not regress OpenCode while promoting Claude.
- Do not claim `Agent Definitions` complete unless both official basis and runtime product proof justify it.
- Do not mark hooks, session store, structured output, or rewind as stable merely because the adapter seam exists.
- Do not remove legacy compatibility fields that older OpenCode conversations still rely on without an explicit migration plan.
- Do not flatten Claude-native semantics into generic settings when the design docs say they are backend-specific.
