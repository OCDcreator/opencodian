# Session Lifecycle Report Baseline Design

## Context

`docs/archive/maintainability/phases/session-lifecycle-alignment-evaluation.md` is an untracked status report that evaluates OpenCodian's session lifecycle against OpenCode Desktop. The report is useful, but it currently needs to become a trustworthy audit baseline before it drives implementation planning or external review.

The current repository state also has local `main` ahead of `origin/main` by five commits. This design intentionally scopes the next work to the report baseline only and avoids touching unrelated commits or runtime code.

## Goal

Revise `docs/archive/maintainability/phases/session-lifecycle-alignment-evaluation.md` into a factual, source-grounded, externally reviewable audit report that can safely feed the later implementation plan.

## Non-Goals

- Do not change TypeScript runtime behavior in this slice.
- Do not implement canonical session convergence yet.
- Do not add follow-up queues, sync-event batching, background-task metadata persistence, or `TabSessionPhase` yet.
- Do not edit `reference-projects/`.
- Do not rewrite the report into a full implementation plan.

## Report Corrections

The report should be corrected as a document baseline:

- Fix the date and source baseline so the report is clearly tied to the current checkout and review date.
- Remove or downgrade unverified claims such as completed multi-model Council review unless that review has actually run in this workflow.
- Keep conclusions supported by current source evidence, including `Conversation.messages` participation in send, sync, reload, finalization, and persistence.
- Narrow overly broad claims by acknowledging that rendering already prefers canonical state when available, while reload, finalization, and compatibility cache projection still preserve local compensation paths.
- Reframe the recommended first implementation slice around canonical render, reload, and finalization convergence before broader Tier 1 items.

## Evidence Model

The revised report should cite concrete local files and line-level owners where helpful. The main evidence anchors are:

- `src/core/opencode/OpenCodeSessionStateStore.ts` for canonical session/message/part storage.
- `src/features/chat/services/ConversationRenderService.ts` for canonical-first render fallback behavior.
- `src/features/chat/services/ConversationAuthoritativeReloadCoordinator.ts` for canonical projection plus `Conversation.messages` merge and persistence.
- `src/features/chat/services/MessageFinalizationService.ts` for post-stream sync, fingerprints, and final save behavior.
- `src/features/chat/services/MessageSendPreparationService.ts` for optimistic user message insertion and canonical seeding.
- `src/core/opencode/OpenCodeSyncEventRuntimeCoordinator.ts` for immediate sync-event application and listener dispatch.
- `src/core/opencode/OpenCodeStreamingRuntimeCoordinator.ts` for session-keyed active stream replacement.
- `src/features/chat/services/BackgroundTaskTimelineService.ts` for background task state reconstruction from conversation messages.

## Priority Framing

The revised report should recommend the following order:

1. Make canonical render, reload, and finalization inputs converge in a focused first implementation slice.
2. Treat `Conversation.messages` as compatibility/cache output once canonical state exists, while preserving intentional client-only notices and decorations.
3. Consider a write lock only as a stabilizing measure if the canonical convergence slice still leaves async write interleavings.
4. Treat `TabSessionPhase`, background-task metadata persistence, follow-up queue, and sync-event batching as separate follow-up slices.

## Review Workflow

After the report baseline is revised:

1. Self-review the report for stale dates, unsupported claims, contradictory statements, unfinished markers, and implementation-plan creep.
2. Commit the report correction separately from unrelated local commits.
3. Use `superpowers:writing-plans` to create a detailed implementation plan only after the user approves the written spec.
4. Submit that implementation plan to `opencode` Council review, anchored to the current checkout and final diff rather than branch history.
5. Start implementation only after the external review passes.

## Success Criteria

- The report can be read as a current audit baseline, not a speculative or already-reviewed implementation plan.
- Every strong conclusion in the report has a matching source-code basis.
- The next implementation target is explicitly a small canonical convergence slice.
- The report no longer implies external Council review happened before this workflow actually runs it.
- The working tree remains limited to intentional documentation changes for this slice.
