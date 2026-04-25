# Autopilot Phase 3 — `a1-agent-surface`

## Round Design

- **Queued slice**: `[NEXT] A3 - Restore child-session graph tracking and session-tree UI`
- **Active spec**: `docs/superpowers/specs/2026-04-25-opencode-agent-surface-design.md`
- **External reference**: `/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/opencode-agent-mechanism-and-sdk.md`
- **Targeted files/modules**:
  - `src/core/agents/ChildSessionGraphService.ts`
  - `src/core/agents/index.ts`
  - `src/core/agents/types.ts`
  - `src/features/chat/OpenCodianView.ts`
  - one adjacent chat runtime/service owner for active-session tree refresh/render state only if it keeps graph ownership out of `OpenCodianView.ts`
  - matching `tests/unit/core/agents/`, matching `tests/unit/features/chat/`, and matching `docs/modules/**`
- **Upstream/runtime contract to confirm**:
  - OpenCode `task` executions surface child linkage through task metadata `sessionId`, and persisted tool content must keep that linkage recoverable after hydration.
  - `session.children()` returns direct child sessions for the active parent session, so the plugin must use it to fill session info and to expose explicit `partial graph` degradation when a child session lacks a recoverable task edge.
  - The plugin must keep runtime truth, persisted-message truth, and fallback UI truth separate: existing task-card session jumps remain available even when the reconstructed graph is partial.
- **Targeted tests to run**:
  - focused Jest for `ChildSessionGraphService` and the touched chat runtime/view owner that renders or refreshes the active-session tree
  - `npm run check:module-docs` when touched module docs change
  - `npm run verify`
- **Deploy-required paths likely touched**: `No` if the slice stays in agent/chat runtime owners and reuses existing shell styling; `Yes` only if the queued UI cannot land without `src/style/` updates.
- **Non-goals / boundaries**:
  - no further chat send-path / explicit invocation work beyond consuming the already-landed A2 metadata
  - no Agent Studio / Markdown agent CRUD / system-agent override work (A4)
  - no MCP lane or formatter lane work
  - no plugin-private agent orchestration, no synthetic child-session semantics, and no hiding `partial graph` gaps

## Design Review Result

- **Verdict**: `PASS`
- **Why this design is ready**:
  - The active spec makes A3 a bounded reconstruction task, not a new orchestration feature: recover task → child-session edges from persisted task blocks, supplement them with `session.children()`, and surface an explicit active-session tree with `partial graph` fallback.
  - The repo already preserves the critical persisted inputs for this slice: task tool blocks retain `toolMetadata.sessionId`, hidden task results keep the raw `task_id`, and `OpenCodeService` already exposes `getSessionChildren()` without widening the transport contract.
  - A dedicated `ChildSessionGraphService` is the correct new owner because the root guardrails explicitly say not to grow `OpenCodianView.ts` with more runtime ownership; the view should only request graph refresh/render outcomes and keep the existing task-card open-session fallback.
  - The safest review boundary is direct-child recovery only for the active session. That matches upstream `session.children()` semantics, keeps concurrent-tab hydration behavior intact, and still lets deeper descendants appear naturally when a child session is opened as its own conversation.
- **Risks watched during implementation**:
  - graph recovery must survive authoritative hydration and active-tab reload without confusing child-session state across tabs
  - `session.children()` matches parent-session truth, not per-message truth, so unmatched children must be shown as partial/orphaned rather than guessed onto the wrong task
  - the active-session tree must not regress the existing task tool open-session button when graph metadata is incomplete

## Implementation Summary

### Pass 1

- OpenCode pass 1 added the missing core `ChildSessionGraphService` seam, exported the new child-session graph types, added focused unit coverage for the pure reconstruction service, and synced the matching core module docs.
- OpenCode pass 1 did **not** finish the queued slice: no active-session tree UI landed, no chat runtime/view wiring was added, and no feature-level tests were added for restoring/navigation behavior in the active conversation.

### Pass 2 (this pass)

- Expanded the core graph types with `OrphanedChildSession` carrying display data (id, title, createdAt, updatedAt) and added `orphanedSessions: readonly OrphanedChildSession[]` to `ChildSessionGraph`. The legacy `orphanedSessionIds` remains for backward compatibility, derived from the new field.
- Updated `ChildSessionGraphService` to populate `orphanedSessions` from unmatched `ChildSessionInfo` entries. Added enrichment test coverage for title/updatedAt backfill and edge-title-priority behavior.
- Created `ChildSessionGraphCoordinator` in `src/features/chat/services/` following the host-adapter pattern: bridges storage (conversation messages), SDK (`getSessionChildren`), and the pure-function graph service. Owns graph state and exposes `refreshGraph()`, `getGraph()`, `clearGraph()`.
- Wired the coordinator into `OpenCodianViewSurfaceRuntimeWiring`. Graph refresh triggers after conversation load and active-conversation authoritative sync. Graph clear triggers on conversation unload and view close.
- Added minimal session-tree rendering as a collapsible `<details>` section at the bottom of the messages container. Shows each edge with status dot, title, description, and "Open" button. Orphaned sessions show "Unknown task" with a "Partial graph" badge. A notice appears when the graph is partial.
- Added 7 focused coordinator tests covering null conversation, empty graph, edge reconstruction, enrichment, SDK failure, notification, and clear.
- Updated module docs for the coordinator, the view, and the core types/service.
- OpenCode also ran `npm run verify` and reported a green result, but Codex review still found user-facing closeout blockers before this round could mark A3 done.

### Pass 3 (Codex closeout)

- Applied the remaining small mechanical fixes directly after a narrowed OpenCode retry kept looping without landing them:
  - localized the new session-tree UI copy through `src/i18n/locales/en.ts` and `src/i18n/locales/zh.ts`
  - added a focused `OpenCodianView` regression that renders the partial graph and verifies the open action path
  - synced the mapped locale module docs

## Files Changed

- **Core graph seam**
  - `src/core/agents/ChildSessionGraphService.ts`
  - `src/core/agents/index.ts`
  - `src/core/agents/types.ts`
- **Chat integration**
  - `src/features/chat/services/ChildSessionGraphCoordinator.ts`
  - `src/features/chat/OpenCodianView.ts`
- **Locale**
  - `src/i18n/locales/en.ts`
  - `src/i18n/locales/zh.ts`
- **Tests**
  - `tests/unit/core/agents/ChildSessionGraphService.test.ts`
  - `tests/unit/features/chat/services/ChildSessionGraphCoordinator.test.ts`
  - `tests/unit/features/chat/OpenCodianView.childSessionTree.test.ts`
- **Module docs / roadmap**
  - `docs/modules/core/agents/ChildSessionGraphService.md`
  - `docs/modules/core/agents/index.md`
  - `docs/modules/core/agents/types.md`
  - `docs/modules/features/chat/services/ChildSessionGraphCoordinator.md`
  - `docs/modules/features/chat/OpenCodianView.md`
  - `docs/modules/i18n/locales/en.md`
  - `docs/modules/i18n/locales/zh.md`
  - `docs/status/lanes/a1-agent-surface/autopilot-round-roadmap.md`

## Validation

- Focused Jest:
  - `npm test -- --runInBand --runTestsByPath tests/unit/core/agents/ChildSessionGraphService.test.ts tests/unit/features/chat/services/ChildSessionGraphCoordinator.test.ts tests/unit/features/chat/OpenCodianView.childSessionTree.test.ts`
  - `3` suites / `34` tests passed
- Module docs:
  - `npm run check:module-docs`
  - coverage OK (`362` source modules / `362` mapped docs)
  - diff OK (`5` required doc targets)
- Full verification:
  - `npm run verify`
  - module-docs, lint, typecheck, full Jest (`329` suites / `1578` tests), and build all passed
  - extracted `BUILD_ID`: `autopilot-agent-mcp-formatter-review-loop.202604251045`
- Deploy verification:
  - not required; this slice did not touch deploy-required paths (`src/main.ts`, `manifest.json`, `styles.css`, `assets/`, `src/style/`, `src/core/theme/`, `src/features/settings/`)

## Code Review Result

- **Verdict**: `PASS`
- **Why the slice passes review**:
  - A3 now lands the missing end-to-end chain: persisted task metadata -> `ChildSessionGraphService` -> `ChildSessionGraphCoordinator` -> active-session tree rendering in `OpenCodianView`.
  - `session.children()` stays supplemental truth only: it enriches matched edges and exposes orphaned sessions explicitly as `partial graph`, while the existing task-card open-session path remains the degraded fallback.
  - The remaining user-facing blocker is closed: new session-tree copy now flows through locale keys instead of hard-coded English strings.
  - Focused tests now cover the pure graph reconstruction, the coordinator refresh seam, and the actual `OpenCodianView` rendering/open-action path for the user-visible tree surface.
  - The round stayed inside `[NEXT] A3`; it did not start A4, MCP, or formatter work.

## Outcome

- A3 is complete and verified. The active conversation can now reconstruct child-session edges from persisted task metadata, enrich them with live `session.children()` data, surface explicit partial-graph fallbacks, and open child sessions from the new session-tree UI.

## Next Recommended Slice

- `[NEXT] A4 - Finish Agent Studio management surfaces`
