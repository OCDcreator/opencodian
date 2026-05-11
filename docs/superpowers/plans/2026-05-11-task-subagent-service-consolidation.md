# Task Subagent Service Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce task/subagent background lifecycle service weight while preserving native SDK task behavior, inline panels, stale warnings, per-tab isolation, and persisted notices.

**Architecture:** Keep the existing background-task runtime and renderer owners, but remove dead fallback logic and collapse delegation-only services into stronger existing owners. OMO support remains compatibility code fenced behind explicit system-reminder handling; native OpenCode `task` blocks remain driven by `toolStatus` and `toolMetadata.sessionId`.

**Tech Stack:** TypeScript, Jest, Obsidian plugin runtime types, existing OpenCodian chat services, module-doc guards, graphify source graph, full `npm run verify`.

---

## File Structure

- Modify: `src/features/chat/services/BackgroundTaskTimelineAssemblyService.ts`
  - Remove final search-mode segment fallback helper.
- Modify: `src/features/chat/services/BackgroundTaskTimelineLaunchService.ts`
  - Remove arbitrary `bg_` regex/string/JSON scraping while preserving structured ids.
- Modify/Delete: `src/features/chat/services/BackgroundTaskActivationIndicatorCoordinator.ts`
  - Inline pure delegation into existing activation host wiring and delete the file if no imports remain.
- Modify: `src/features/chat/services/QuestionTodoBackgroundTaskActivationHostAdapter.ts`
  - Own the activation indicator methods directly.
- Modify/Delete/Merge: `src/features/chat/services/BackgroundTaskNoticeStateService.ts`, `src/features/chat/services/BackgroundTaskCompletionNoticeService.ts`
  - Merge into one notice service owner while preserving public behavior.
- Modify: `src/features/chat/runtime/BackgroundTaskIndicatorCoordinator.ts`, `src/features/chat/services/BackgroundTaskLiveSignalCoordinator.ts`
  - Update imports/types after notice merge.
- Modify/Delete/Merge: `src/features/chat/services/BackgroundConversationSignalSyncStateCoordinator.ts`, `src/features/chat/services/BackgroundConversationAttentionCoordinator.ts`, `src/features/chat/services/BackgroundConversationPostSyncHandoffCoordinator.ts`
  - Collapse signal mark and attention policy into the background post-sync handoff owner.
- Modify: `src/features/chat/services/BackgroundConversationPostSyncHandoffHostAdapter.ts`
  - Wire the consolidated post-sync service.
- Tests: update matching `tests/unit/features/chat/**` files for each service.
- Docs: update matching `docs/modules/features/chat/**` pages for changed/deleted source files.
- Generated: refresh `graphify-out/GRAPH_REPORT.md` and `graphify-out/graph.json` after source edits.

## Controller Rules

- Use an isolated worktree before implementation.
- Dispatch exactly one fresh worker subagent per task.
- Workers are not alone in the codebase. They must not revert user/controller/previous-worker edits.
- The controller reviews the diff and runs the listed targeted command before dispatching the next task.
- Do not use `opencode`.
- Do not deploy to Test Vault for this pure service/docs/graphify slice unless later deploy-relevant paths are touched.

---

### Task 1: Remove Search-Mode And `bg_` Identity Fallbacks

**Files:**
- Modify: `src/features/chat/services/BackgroundTaskTimelineAssemblyService.ts`
- Modify: `src/features/chat/services/BackgroundTaskTimelineLaunchService.ts`
- Modify: `tests/unit/features/chat/BackgroundTaskTimelineService.nativeTask.test.ts`
- Modify: `tests/unit/features/chat/BackgroundTaskTimelineService.reminderFallback.test.ts`

- [ ] **Step 1: Add fallback-removal regression coverage**

Add tests that assert native task identity comes from `toolMetadata.sessionId` and that arbitrary result strings containing `bg_legacy` no longer become task ids:

```typescript
const messages: ChatMessage[] = [
  { id: 'u1', role: 'user', content: 'delegate', timestamp: 1, sourceMessageId: 'u1' },
  {
    id: 'a1',
    role: 'assistant',
    content: '',
    timestamp: 2,
    contentBlocks: [{
      type: 'tool_use',
      toolId: 'call-1',
      toolName: 'task',
      toolInput: { description: 'Audit routes' },
      toolMetadata: { sessionId: 'child-session-1' },
      toolResult: 'contains bg_legacy but metadata wins',
      toolStatus: 'running',
    }],
  },
];
expect(service.collectSegments(messages, 'tab-1')[0].launches[0].taskId).toBe('child-session-1');
```

Also add a no-metadata case:

```typescript
expect(service.collectSegments(messagesWithoutMetadata, 'tab-1')[0].launches[0].taskId).toBeNull();
```

- [ ] **Step 2: Remove assembly search-mode fallback**

In `BackgroundTaskTimelineAssemblyService.resolveReminderSegments()`, replace:

```typescript
const fallback = this.getLatestSegmentWithActivity(state.segments)
  ?? this.getLatestSearchModeSegment(state);
```

with:

```typescript
const fallback = this.getLatestSegmentWithActivity(state.segments)
  ?? this.getOrCreateSegment(state, state.latestTaskAnchorMessage);
```

Delete `getLatestSearchModeSegment()`.

- [ ] **Step 3: Remove arbitrary `bg_` scraping**

In `BackgroundTaskTimelineLaunchService.extractBackgroundTaskId()`, delete the regex and the `JSON.stringify(source).match(...)` path. Keep structured fields only:

```typescript
const sessionId = (source as Record<string, unknown>).sessionId;
const nested = [
  (source as Record<string, unknown>).task_id,
  (source as Record<string, unknown>).taskId,
  (source as Record<string, unknown>).id,
];
```

String sources should no longer be parsed for ids.

- [ ] **Step 4: Run targeted tests**

Run:

```bash
npm test -- tests/unit/features/chat/BackgroundTaskTimelineService.nativeTask.test.ts tests/unit/features/chat/BackgroundTaskTimelineService.reminderFallback.test.ts
```

Expected: PASS.

---

### Task 2: Inline Activation Indicator Delegation

**Files:**
- Modify: `src/features/chat/services/QuestionTodoBackgroundTaskActivationHostAdapter.ts`
- Modify: `src/features/chat/runtime/TabConversationActivationBridge.ts`
- Modify: `src/features/chat/runtime/TabViewActivationBridge.ts`
- Delete: `src/features/chat/services/BackgroundTaskActivationIndicatorCoordinator.ts`
- Modify/delete tests and docs for `BackgroundTaskActivationIndicatorCoordinator`.

- [ ] **Step 1: Add or update adapter-level tests**

Move expectations from `BackgroundTaskActivationIndicatorCoordinator.test.ts` into the activation host adapter / activation bridge tests. Preserve these behaviors:

```typescript
expect(host.resetBackgroundTaskIndicator).toHaveBeenCalled();
expect(host.syncBackgroundTaskStateFromConversation).toHaveBeenCalledWith(conversation, 'tab-1');
expect(host.renderBackgroundTaskIndicatorIfNeeded).toHaveBeenCalledWith('tab-1');
```

- [ ] **Step 2: Inline the four delegation methods**

Replace coordinator calls with direct functions on the existing host bundle:

```typescript
prepareOpenConversation(conversation) {
  if (viewHost.getCurrentConversationId() !== conversation.id) {
    viewHost.resetBackgroundTaskIndicator();
  }
}
```

and direct pass-throughs for sync/render loaded indicator.

- [ ] **Step 3: Delete the coordinator file and references**

Run:

```bash
rg -n "BackgroundTaskActivationIndicatorCoordinator" src tests docs/modules
```

Expected after edits: no source/test imports remain; docs mention only deleted module history if required by module-doc tooling.

- [ ] **Step 4: Run targeted tests**

Run:

```bash
npm test -- tests/unit/features/chat/QuestionTodoBackgroundTaskActivationHostAdapter.test.ts tests/unit/features/chat/TabConversationActivationBridge.test.ts tests/unit/features/chat/TabViewActivationBridge.test.ts
```

Expected: PASS.

---

### Task 3: Merge Background Task Notice Services

**Files:**
- Modify/Rename: `src/features/chat/services/BackgroundTaskNoticeStateService.ts`
- Modify/Delete: `src/features/chat/services/BackgroundTaskCompletionNoticeService.ts`
- Modify: `src/features/chat/runtime/BackgroundTaskIndicatorCoordinator.ts`
- Modify: `src/features/chat/services/BackgroundTaskLiveSignalCoordinator.ts`
- Modify: `tests/unit/features/chat/BackgroundTaskNoticeStateService.test.ts`
- Modify: `tests/unit/features/chat/BackgroundTaskCompletionNoticeService.test.ts`

- [ ] **Step 1: Combine test expectations**

Create a single notice-service test file that covers both stopped stale notices and completion notices:

```typescript
describe('BackgroundTaskNoticeService', () => {
  it('dedupes stopped notices by fingerprint', async () => {});
  it('queues and flushes completion notices after streaming ends', async () => {});
});
```

- [ ] **Step 2: Move completion queue state into the notice state service**

Add the completion interfaces and queue methods to the surviving notice service. Preserve method signatures used by callers:

```typescript
queueNotices(segments, tabId, conversation): void
flushQueuedNotices(tabId, conversation): Promise<void>
handleStoppedPendingLaunches(tabId, pending): Promise<void>
isPendingLaunchSetSuppressed(pending, tabId, conversation): boolean
```

- [ ] **Step 3: Update imports**

Update `BackgroundTaskIndicatorCoordinator`, `BackgroundTaskLiveSignalCoordinator`, `BackgroundTaskTimelineAssemblyService`, `BackgroundTaskTimelineLaunchService`, and `BackgroundTaskTimelineService` to import completion types from the surviving notice service.

- [ ] **Step 4: Remove obsolete completion service file if unused**

Run:

```bash
rg -n "BackgroundTaskCompletionNoticeService" src tests docs/modules
```

Expected: no live source imports remain before deleting the file/doc, or only intentional migration notes remain.

- [ ] **Step 5: Run targeted tests**

Run:

```bash
npm test -- tests/unit/features/chat/BackgroundTaskNoticeStateService.test.ts tests/unit/features/chat/BackgroundTaskLiveSignalCoordinator.test.ts tests/unit/features/chat/BackgroundTaskIndicatorCoordinator.test.ts tests/unit/features/chat/backgroundTaskTimeline.test.ts
```

Expected: PASS.

---

### Task 4: Fence OMO Completion Reminder Replay

**Files:**
- Modify: `src/features/chat/services/BackgroundTaskTimelineAssemblyService.ts`
- Modify: `tests/unit/features/chat/BackgroundTaskTimelineService.nativeTask.test.ts`
- Modify: `tests/unit/features/chat/BackgroundTaskTimelineService.reminderFallback.test.ts`

- [ ] **Step 1: Add explicit native completed reload coverage**

Add a test where an ordinary user anchor is followed by a completed native task block:

```typescript
expect(segment.completed).toEqual([
  expect.objectContaining({ taskId: 'child-session-1', description: 'Audit routes' }),
]);
expect(segment.pending).toEqual([]);
expect(segment.waitingForFollowUp).toBe(false);
```

- [ ] **Step 2: Rename OMO reminder functions as compatibility path**

Rename `collectCompletionReminderSegments()` to `collectOmoCompletionReminderSegments()` and keep the first guard explicit:

```typescript
if (message.omo?.kind !== 'system-reminder') {
  return;
}
```

Do not remove OMO reminder behavior unless the existing reminder fallback tests are adjusted and still prove historical conversations are represented correctly.

- [ ] **Step 3: Run targeted tests**

Run:

```bash
npm test -- tests/unit/features/chat/BackgroundTaskTimelineService.nativeTask.test.ts tests/unit/features/chat/BackgroundTaskTimelineService.reminderFallback.test.ts tests/unit/features/chat/BackgroundTaskTimelineService.test.ts
```

Expected: PASS.

---

### Task 5: Collapse Background Post-Sync Micro-Services

**Files:**
- Modify: `src/features/chat/services/BackgroundConversationPostSyncHandoffCoordinator.ts`
- Modify: `src/features/chat/services/BackgroundConversationPostSyncHandoffHostAdapter.ts`
- Keep: `src/features/chat/services/BackgroundConversationPostSyncRefreshExecutor.ts`
- Delete if unused: `src/features/chat/services/BackgroundConversationSignalSyncStateCoordinator.ts`
- Delete if unused: `src/features/chat/services/BackgroundConversationAttentionCoordinator.ts`
- Modify matching tests/docs.

- [ ] **Step 1: Preserve call-order tests**

Update `BackgroundConversationPostSyncHandoffCoordinator.test.ts` so it asserts signal sync order:

```typescript
expect(callOrder).toEqual([
  'markBackgroundTaskAuthoritativeSync',
  'refreshSignalSyncedBackgroundConversation',
  'setTabNeedsAttention',
]);
```

And background-tab order:

```typescript
expect(callOrder).toEqual([
  'refreshBackgroundTabConversation',
  'setTabNeedsAttention',
]);
```

- [ ] **Step 2: Move mark and attention logic into handoff coordinator**

Inline:

```typescript
this.host.markBackgroundTaskAuthoritativeSync(tabId, `sync-event:${reason}`);
```

and:

```typescript
const changed = syncResult.changed || syncResult.fingerprint !== previousFingerprint;
if (changed) this.host.setTabNeedsAttention(tabId, tabId !== activeTabId);
```

For background-tab sync, `needsAttention` is always true when changed.

- [ ] **Step 3: Simplify service assembly**

In `BackgroundConversationPostSyncHandoffHostAdapter.ts`, instantiate only `BackgroundConversationPostSyncRefreshExecutor` and `BackgroundConversationPostSyncHandoffCoordinator`.

- [ ] **Step 4: Delete unused files and update docs**

Run:

```bash
rg -n "BackgroundConversationSignalSyncStateCoordinator|BackgroundConversationAttentionCoordinator" src tests docs/modules
```

Expected: no source imports remain before deleting obsolete files/docs.

- [ ] **Step 5: Run targeted tests**

Run:

```bash
npm test -- tests/unit/features/chat/BackgroundConversationPostSyncHandoffCoordinator.test.ts tests/unit/features/chat/BackgroundConversationPostSyncHandoffHostAdapter.test.ts tests/unit/features/chat/ConversationSyncBackgroundPostSyncRouter.test.ts
```

Expected: PASS.

---

### Task 6: Docs, Graphify, Full Verification, And Final Report

**Files:**
- Modify: matching `docs/modules/features/chat/**` files for every changed/deleted `src` module.
- Modify: `docs/status/task-subagent-lifecycle-alignment-evaluation-2026-05-11.md`
- Modify: `graphify-out/GRAPH_REPORT.md`
- Modify: `graphify-out/graph.json`

- [ ] **Step 1: Update module docs**

For changed modules, update responsibility and public API sections. For deleted modules, remove or redirect the matching module doc according to `npm run check:module-docs` output.

- [ ] **Step 2: Append status note**

Append a short “service consolidation implementation record” to the Council report with:

```markdown
## P1-P6 服务整合实施记录（2026-05-11）

- Removed the final `search-mode` assembly fallback.
- Removed arbitrary `bg_` id scraping.
- Inlined activation indicator delegation.
- Merged background task notice ownership.
- Fenced OMO completion reminders as compatibility replay.
- Collapsed background post-sync mark/attention handoff into fewer owners.
```

- [ ] **Step 3: Refresh graphify**

Run:

```bash
npm run graphify:update:src
```

Expected: exits 0 and refreshes root `graphify-out/` artifacts.

- [ ] **Step 4: Run guards**

Run:

```bash
npm run check:module-docs
npm run check:graphify
```

Expected: both PASS.

- [ ] **Step 5: Run full verification**

Run:

```bash
npm run verify
```

Expected: lint has `0 errors / 0 warnings`, tests pass, typecheck passes, module-doc/graphify guards pass, and production build succeeds.

- [ ] **Step 6: Commit implementation**

Run:

```bash
git status --short
git add src tests docs graphify-out
git commit -m "refactor: consolidate task lifecycle services"
```

Expected: commit succeeds only after `npm run verify` has passed.

## Self-Review

- Spec coverage: Tasks 1-6 map directly to Council P1-P6 and the design success criteria.
- Placeholder scan: no deferred markers remain.
- Type consistency: plan uses existing service names and stable `ChatMessage`, `Conversation`, `TabId`, `toolMetadata.sessionId`, `toolStatus`, and runtime field names.
- Scope: no UI styling, deployment, OpenCode CLI, or reference-project edits are included.
