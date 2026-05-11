# Task Subagent Search-Mode Gate Removal Design

## Context

`docs/status/task-subagent-lifecycle-alignment-evaluation-2026-05-11.md` now records the Council finding that OpenCodian's streaming path mostly follows native OpenCode task metadata, while persisted timeline, indicator arming, and live-signal cleanup still treat OMO `search-mode` as the structural background-task gate. That leaves a split behavior: ordinary native OpenCode `task` tool calls can render during active streaming, but reload and live-signal reconstruction are still incomplete when the user anchor has no OMO `search-mode` tag.

The previous committed slice already moved task identity toward `toolMetadata.sessionId` and native `toolStatus`. This design intentionally targets only the remaining P1-P3 search-mode gates from the Council report. It does not merge services or remove OMO compatibility.

## Goal

Make background task timeline anchors, inline indicators, diagnostics, and live-signal cleanup mode-agnostic for native OpenCode `task` tool activity, while preserving OMO `search-mode` metadata as optional compatibility context.

## Non-Goals

- Do not remove OMO system-reminder fallback parsing.
- Do not introduce a new service or adapter in this slice.
- Do not merge the background task service set.
- Do not edit `reference-projects/`.
- Do not change visual styling or user-facing copy unless an existing test requires a copy expectation update.
- Do not call `opencode`; this slice uses local source inspection, subagent task execution, and repository tests only.

## Design

### Timeline Anchoring

`BackgroundTaskTimelineAssemblyService` should treat the latest user message as the anchor for any downstream `toolName === 'task'` block, regardless of OMO mode. A segment may still carry `modeTag` when the anchor has OMO metadata, but segment creation must not require `modeTag === 'search-mode'`.

The assembly fallback that resolves OMO completion reminders should prefer a segment that already has task activity, regardless of mode. If a reminder cannot be matched by task id, it may still fall back to the latest search-mode segment for historical OMO conversations, but that fallback must no longer be the primary path for native task blocks.

### Diagnostics

`collectDiagnostics()` should use the most recent user message as the anchor when downstream task blocks exist. It should no longer return `null` solely because the user message is not an OMO search-mode injection. This keeps diagnostic logging aligned with the same task-block scan used for segment assembly.

### Indicator Arming

`BackgroundTaskTimelineService.armIndicatorForUserMessage()` should preserve an active anchor for every user message that can become a task anchor. For ordinary user messages, `backgroundTaskModeTag` should be `null`; for OMO user-injection messages, it should preserve the original mode tag. The authoritative sync gate, stale notice fingerprints, and suppressed fingerprints should be reset exactly as they are today.

Ordinary armed anchors should stay visually quiet until a downstream native `task` launch exists. Launchless preparing placeholders remain compatibility behavior for OMO-mode anchors only, and still require runtime to track the active anchor. This avoids showing a background-task preparing panel for every normal chat send while still giving native task launches a stable user anchor as soon as they arrive.

### Live Signals

`BackgroundTaskLiveSignalCoordinator` should decide whether an indicator still exists from runtime activity, pending launches, streaming state, grace period, or an OMO-mode launchless placeholder. Empty launch placeholders after the grace period should be reset for any mode, not only `search-mode`.

The existing grace-period and authoritative-sync protections remain unchanged. Hydration must still avoid premature stale notices until authoritative message sync has run.

### Documentation and Generated Artifacts

Because this slice touches `src/`, it must refresh the committed source graph with `npm run graphify:update:src`. Any changed source module must keep the corresponding `docs/modules/**` page aligned, especially:

- `docs/modules/features/chat/services/BackgroundTaskTimelineAssemblyService.md`
- `docs/modules/features/chat/services/BackgroundTaskTimelineService.md`
- `docs/modules/features/chat/services/BackgroundTaskLiveSignalCoordinator.md`

The existing Council status report may be updated only to record the completed P1-P3 implementation and verification outcome. The report's current uncommitted edits must not be accidentally overwritten.

## Testing Strategy

Add or update focused Jest tests before implementation:

- Timeline assembly: a normal user message followed by a native `task` block creates a segment with `modeTag: null`, launch metadata from `toolMetadata.sessionId`, and reload-safe pending/completed state.
- Diagnostics: the same normal user anchor returns diagnostics instead of `null`.
- Indicator arming: a normal user message stores runtime anchor metadata with `backgroundTaskModeTag: null` and calls the authoritative sync gate.
- Inline task state: an ordinary user anchor renders once a downstream native task launch exists, while a launchless ordinary user anchor stays hidden.
- Live signal cleanup: an empty launch placeholder after the grace period resets for `modeTag: null`.

Then run the targeted test files for the touched behavior, followed by the repository source guards:

- `npm test -- tests/unit/features/chat/BackgroundTaskTimelineService.runtime.test.ts tests/unit/features/chat/BackgroundTaskTimelineService.nativeTask.test.ts tests/unit/features/chat/BackgroundTaskTimelineService.test.ts tests/unit/features/chat/BackgroundTaskLiveSignalCoordinator.test.ts`
- `npm run graphify:update:src`
- `npm run check:module-docs`
- `npm run check:graphify`
- `npm run verify`

## Execution Model

Implementation should follow the user's requested controller workflow:

1. Write an implementation plan with `superpowers:writing-plans`.
2. Execute one plan task per fresh subagent.
3. After each subagent returns, the controller reviews the diff, runs the targeted check for that task, and only then dispatches the next task.
4. The controller performs the final graphify refresh, full verification, and commit.

## Success Criteria

- No lifecycle-critical branch in `BackgroundTaskTimelineAssemblyService`, `BackgroundTaskTimelineService`, or `BackgroundTaskLiveSignalCoordinator` requires `modeTag === 'search-mode'` to support native OpenCode `task` activity.
- Ordinary chat sends do not show a launchless background-task preparing panel unless a native `task` launch appears.
- Search-mode remains allowed as metadata and historical OMO fallback context.
- Native task reload behavior is covered by tests for ordinary user anchors.
- The module docs and graphify artifacts pass their guards.
- Full `npm run verify` passes before the implementation is reported complete.
