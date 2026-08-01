# Task Subagent Service Consolidation Design

## Context

`docs/archive/maintainability/phases/task-subagent-lifecycle-alignment-evaluation-2026-05-11.md` records the third Council review after commit `8f2e84eb`. Lifecycle correctness is no longer the blocker: native OpenCode `task` blocks now use `toolStatus`, `toolMetadata.sessionId`, and ordinary user-message anchors without functional `search-mode` gates.

The remaining gap is architectural weight. OpenCodian keeps useful behavior that OpenCode Desktop does not have, including inline background-task panels, stale-task warnings, per-tab isolation, and persisted completion notices. The optimization should keep those behaviors while removing small delegation-only services, narrowing OMO compatibility, and reducing the background sync service surface.

## Goal

Move task/subagent lifecycle alignment from roughly 6.8/10 to the 8+ range by mechanically consolidating background-task services and legacy fallback code without changing user-facing behavior.

## Non-Goals

- Do not replace OpenCodian's inline panel, stale warning, per-tab state, or persisted completion notice UX with OpenCode Desktop's simpler renderer.
- Do not introduce new helper, adapter, provider, or factory files.
- Do not move background-task ownership into `OpenCodianView.ts`.
- Do not remove OMO compatibility wholesale; only fence or delete fallback paths that are proven redundant by tests.
- Do not call `opencode`; this workflow uses Codex subagents and local repository verification only.
- Do not touch `reference-projects/`.

## Approach Options

### Recommended: staged mechanical consolidation

Land the Council P1-P6 list in small, reversible slices. First remove the last literal `search-mode` fallback and ambiguous `bg_` scraping. Then inline the 31-line activation coordinator, merge stopped/completion notice services behind one notice owner, prove SDK-native reload coverage, and finally collapse post-sync state/attention/handoff micro-services into one background sync handoff owner.

This keeps behavior stable and gives every slice a focused test surface.

### Alternative: Desktop-style renderer rewrite

Replace the background-task family with a single ToolPart renderer path closer to OpenCode Desktop. This would simplify the architecture more aggressively, but it would discard plugin-specific UX or require rebuilding it in a larger migration. It is too risky for this maintenance phase.

### Alternative: documentation-only future queue

Document P1-P6 as a future queue and stop. This preserves safety, but it leaves the known low-risk dead surface in place and does not answer the Council's final recommendation.

## Design

### P1: remove final search-mode fallback

`BackgroundTaskTimelineAssemblyService.resolveReminderSegments()` should no longer use `getLatestSearchModeSegment()`. The fallback should be either a segment with task activity or the latest task anchor already tracked by the collection state. Historical OMO reminders can still attach through task ids, activity-bearing segments, or the latest tracked user anchor.

The private `getLatestSearchModeSegment()` helper should be deleted. Tests should assert that the source no longer contains that helper name or a `modeTag === 'search-mode'` branch in assembly.

### P2: remove `bg_` regex identity scraping

`BackgroundTaskTimelineLaunchService` should treat native `metadata.sessionId` as authoritative. It may still read explicit structured legacy fields such as `task_id`, `taskId`, or `id` from object inputs, but it should not regex-match `bg_` ids from arbitrary strings or `JSON.stringify(source)`.

This removes identity guessing and makes native child-session ids the clear path. Tests should cover `sessionId` success and absence of ids when only a result string contains `bg_...`.

### P3: inline activation indicator delegation

`BackgroundTaskActivationIndicatorCoordinator` is a pure host delegation layer. Its four methods should move to the existing activation host adapter or runtime bridge that already calls it, and imports/tests/docs for the deleted file should be removed.

The behavior remains identical: opening another conversation resets the indicator, open conversation state rebuilds from the conversation, and loaded/open render paths still call `renderBackgroundTaskIndicatorIfNeeded()`.

### P4: merge background task notice owners

`BackgroundTaskNoticeStateService` and `BackgroundTaskCompletionNoticeService` both own persistent assistant notice state, fingerprints, and append timing. Merge them into one `BackgroundTaskNoticeService` owner.

The merged owner should keep the existing public methods needed by live-signal stale handling and indicator completion flushing:

- `buildStoppedNoticeContent()`
- `isPendingLaunchSetSuppressed()`
- `handleStoppedPendingLaunches()`
- `queueNotices()`
- `flushQueuedNotices()`

The runtime state fields remain unchanged so this stays a service consolidation, not a state migration.

### P5: fence OMO completion reminder replay

Add an explicit SDK-native reload test for a completed native task after an ordinary user anchor. If native task `toolStatus` plus `toolMetadata.sessionId` already restores launch and completion state, then OMO system-reminder completion replay should become a clearly named compatibility path used only for `message.omo.kind === 'system-reminder'`.

If tests show OMO replay is still needed for historical conversations, keep it but rename the path to make its compatibility status obvious. Do not delete compatibility behavior without proof.

### P6: collapse background post-sync micro-services

`BackgroundConversationSignalSyncStateCoordinator`, `BackgroundConversationAttentionCoordinator`, and `BackgroundConversationPostSyncHandoffCoordinator` should collapse into the existing background post-sync handoff module. `BackgroundConversationPostSyncRefreshExecutor` can remain as the refresh executor because it contains the question/todo/background-task refresh sequence.

The resulting service surface should have:

- one refresh executor for background conversation refresh/writeback;
- one handoff service that marks authoritative sync, calls the refresh executor, and applies attention policy.

Tests should preserve the exact call order for signal sync and background-tab sync.

## Testing Strategy

Use focused Jest tests for each slice before source edits where practical:

- launch identity tests for `metadata.sessionId` and removed `bg_` string scraping;
- assembly tests for no remaining search-mode fallback helper;
- activation adapter tests replacing activation coordinator tests;
- notice service tests covering stale notice and completion queue behavior after merge;
- native reload completion test for ordinary user anchors;
- post-sync handoff tests covering authoritative mark, refresh, and attention order.

Because this touches `src/`, refresh graphify with `npm run graphify:update:src`, then run:

- targeted Jest files per task;
- `npm run check:module-docs`;
- `npm run check:graphify`;
- full `npm run verify`.

No Test Vault deployment is required unless later edits touch deploy-relevant runtime/style/manifest paths or the user asks for deployment.

## Execution Model

Follow the user's requested controller workflow:

1. Write the implementation plan with `superpowers:writing-plans`.
2. Create an isolated worktree before source changes.
3. Dispatch exactly one fresh worker subagent per plan task.
4. After each worker returns, the controller reviews the diff and runs the task's targeted verification.
5. Do not dispatch the next implementation task until the prior task is reviewed.
6. Finish with graphify refresh, module-doc guards, full `npm run verify`, final review, commit, and merge.

## Success Criteria

- No `getLatestSearchModeSegment` helper remains.
- `BackgroundTaskTimelineLaunchService` no longer regex-scrapes `bg_` ids from arbitrary strings or serialized objects.
- `BackgroundTaskActivationIndicatorCoordinator` is deleted or reduced to zero runtime ownership with callers using the existing host bridge directly.
- Stale and completion notice behavior is owned by a single background-task notice service.
- SDK-native completed task reload after an ordinary user anchor is explicitly covered.
- Background post-sync authoritative mark, refresh, and attention policy use fewer service files while preserving call order.
- Module docs and graphify artifacts are updated.
- `npm run verify` passes before claiming completion.
