# Task Subagent Lifecycle Desktop Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align OpenCodian task/subagent background lifecycle handling with OpenCode Desktop by making native SDK task `ToolPart` status and `metadata.sessionId` drive existing background-task state before OMO reminder fallback.

**Architecture:** Keep OpenCodian's existing inline panel, completion notice, tab runtime, and conversation sync owners. Change their data source in narrow slices: preserve OMO reminder parsing as fallback, but let task tool blocks and stream tool calls carrying native `toolMetadata.sessionId` create launches and completions without requiring `search-mode`. Do not add new helper files or broad runtime ownership.

**Tech Stack:** TypeScript, Jest, Obsidian plugin runtime, OpenCode SDK v2 canonical `Part` data, existing OpenCodian `BackgroundTask*` services.

---

## Source Anchors

- OpenCodian target: `/Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian`
- OpenCode reference: `/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/opencode`
- Evaluation report: `docs/archive/maintainability/phases/task-subagent-lifecycle-alignment-evaluation-2026-05-11.md`
- Reference files:
  - `packages/ui/src/components/message-part.tsx`
  - `packages/opencode/src/tool/task.ts`
  - `src/features/chat/services/BackgroundTaskTimelineLaunchService.ts`
  - `src/features/chat/services/BackgroundTaskTimelineAssemblyService.ts`
  - `src/features/chat/services/BackgroundTaskTimelineService.ts`
  - `src/features/chat/runtime/BackgroundTaskStreamTriggerCoordinator.ts`

## File Structure

- Modify `src/features/chat/services/BackgroundTaskTimelineLaunchService.ts`: launch/completion identity rules. It should prefer native `toolMetadata.sessionId`, still support historical `bg_*` IDs, and expose one pure helper for native completion snapshots.
- Modify `src/features/chat/services/BackgroundTaskTimelineAssemblyService.ts`: persisted-message timeline assembly. It should accept task blocks after normal user anchors, record native completions from `toolStatus`, and keep OMO reminders as fallback.
- Modify `src/features/chat/services/BackgroundTaskTimelineService.ts`: facade method for stream-trigger native completion writeback. It should not duplicate launch parsing logic.
- Modify `src/features/chat/runtime/BackgroundTaskStreamTriggerCoordinator.ts`: live stream start/end handling. It should track `task` tools regardless of `backgroundTaskModeTag`, pass `toolMetadata`, and write native completion when status is terminal.
- Modify tests under `tests/unit/features/chat/`: focused red-green tests for each slice.
- Modify docs under `docs/modules/features/chat/...`: keep module docs accurate.
- Refresh `graphify-out/` with `npm run graphify:update:src` after `src/` changes.

## Existing Dirty-State Note

The controller may already have uncommitted draft edits in the files above. Workers must inspect the current diff first, keep only changes that match their assigned task, and fix broken partial edits inside their owned files. Do not touch unrelated files. Do not delete the untracked evaluation report.

---

### Task 1: Validate Desktop Source And Add Native Identity Tests

**Files:**
- Modify: `tests/unit/features/chat/BackgroundTaskTimelineService.test.ts`
- Modify: `tests/unit/features/chat/BackgroundTaskStreamTriggerCoordinator.test.ts`
- Read only: `/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/opencode/packages/ui/src/components/message-part.tsx`
- Read only: `/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/opencode/packages/opencode/src/tool/task.ts`

- [ ] **Step 1: Confirm OpenCode Desktop reference**

Run:

```bash
rg -n "name: \"task\"|metadata\\.sessionId|function taskSession|props\\.status" \
  /Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/opencode/packages/ui/src/components/message-part.tsx
rg -n "metadata:|sessionId|parentID|sessions.create" \
  /Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/opencode/packages/opencode/src/tool/task.ts
```

Expected: `message-part.tsx` task registry reads `props.metadata.sessionId` first and treats `pending/running` as active; `task.ts` injects child session id into tool metadata.

- [ ] **Step 2: Write failing persisted-message native completion test**

In `tests/unit/features/chat/BackgroundTaskTimelineService.test.ts`, replace the test currently named `ignores plain OpenCode task blocks when no search-mode anchor armed the background-task timeline` with this test:

```typescript
it('collects native OpenCode task blocks after a normal user anchor using metadata sessionId', () => {
  const host = createHost(null);
  const service = new BackgroundTaskTimelineService(host);
  const messages: ChatMessage[] = [
    {
      id: 'user-local-1',
      role: 'user',
      content: 'delegate this',
      timestamp: 1,
      sourceMessageId: 'msg-user-1',
    },
    {
      id: 'assistant-1',
      role: 'assistant',
      content: '',
      timestamp: 2,
      contentBlocks: [{
        type: 'tool_use',
        toolId: 'call-1',
        toolName: 'task',
        toolInput: { description: 'Audit routes' },
        toolMetadata: { sessionId: 'child-session-1' },
        toolResult: 'done',
        toolStatus: 'completed',
      }],
    },
  ];

  const segments = service.collectSegments(messages, 'tab-1');

  expect(segments).toHaveLength(1);
  expect(segments[0]).toEqual(expect.objectContaining({
    anchorKey: 'msg-user-1',
    modeTag: null,
    launches: [expect.objectContaining({
      launchId: 'call-1',
      taskId: 'child-session-1',
      description: 'Audit routes',
    })],
    completed: [expect.objectContaining({
      taskId: 'child-session-1',
      description: 'Audit routes',
    })],
    pending: [],
    waitingForFollowUp: false,
  }));
});
```

- [ ] **Step 3: Write failing stream-trigger native completion test**

In `tests/unit/features/chat/BackgroundTaskStreamTriggerCoordinator.test.ts`, update `createRuntime()` so it includes:

```typescript
backgroundTaskCompletedTasks: new Map(),
```

Update the `timelineService` mock so it includes:

```typescript
upsertCompletionFromToolCall: jest.fn((
  toolCall: { id: string; input: Record<string, unknown>; toolMetadata?: Record<string, unknown> },
  target: Map<string, unknown>,
) => {
  const taskId = typeof toolCall.toolMetadata?.sessionId === 'string'
    ? toolCall.toolMetadata.sessionId
    : toolCall.id;
  target.set(taskId, {
    taskId,
    description: typeof toolCall.input.description === 'string' ? toolCall.input.description : '',
  });
}),
```

Add this test:

```typescript
it('records native SDK task completion metadata on tool end', async () => {
  const {
    coordinator,
    runtime,
    timelineService,
  } = createCoordinator();

  await coordinator.handleToolCallEnd(createToolCall({
    toolMetadata: { sessionId: 'child-session-1' },
    result: 'finished',
    status: 'completed',
  }), 'tab-1');

  expect(timelineService.upsertCompletionFromToolCall).toHaveBeenCalledWith(
    expect.objectContaining({
      id: 'call-1',
      toolMetadata: { sessionId: 'child-session-1' },
      result: 'finished',
    }),
    runtime?.backgroundTaskCompletedTasks,
  );
  expect(runtime?.backgroundTaskCompletedTasks.get('child-session-1')).toEqual({
    taskId: 'child-session-1',
    description: 'Search docs',
  });
});
```

- [ ] **Step 4: Run tests and verify they fail for the intended reason**

Run:

```bash
npm test -- --runInBand tests/unit/features/chat/BackgroundTaskTimelineService.test.ts tests/unit/features/chat/BackgroundTaskStreamTriggerCoordinator.test.ts
```

Expected: failures mention missing native segment collection, missing `backgroundTaskCompletedTasks`, or missing `upsertCompletionFromToolCall`. Syntax errors are not acceptable; fix accidental test syntax only.

- [ ] **Step 5: Commit only tests if this task is run in isolation**

If the repo policy for this run allows per-task commits, run:

```bash
git add tests/unit/features/chat/BackgroundTaskTimelineService.test.ts tests/unit/features/chat/BackgroundTaskStreamTriggerCoordinator.test.ts
git commit -m "test: capture native task lifecycle alignment"
```

Expected: commit succeeds. If the controller is coordinating uncommitted multi-task integration, report the exact changed files instead of committing.

---

### Task 2: Add Native Session Identity To Launch And Completion Rules

**Files:**
- Modify: `src/features/chat/services/BackgroundTaskTimelineLaunchService.ts`
- Test: `tests/unit/features/chat/BackgroundTaskTimelineService.test.ts`
- Test: `tests/unit/features/chat/BackgroundTaskTimelineService.runtime.test.ts`

- [ ] **Step 1: Write or confirm focused launch-service behavior through existing timeline tests**

Confirm there is a test that exercises `toolMetadata: { sessionId: 'child-session-1' }` and expects `taskId: 'child-session-1'`. If Task 1 did not add it, add the persisted-message test from Task 1 Step 2.

- [ ] **Step 2: Implement native sessionId extraction and completion helper**

In `src/features/chat/services/BackgroundTaskTimelineLaunchService.ts`, update `upsertLaunch()` input type and extraction order:

```typescript
static upsertLaunch(
  toolCall: {
    id: string;
    input: Record<string, unknown>;
    toolMetadata?: Record<string, unknown>;
    result?: string;
  },
  target: Map<string, BackgroundTaskLaunchInfo>,
): void {
  const existing = target.get(toolCall.id);
  const description = this.getBackgroundTaskDescription(
    toolCall.input,
    toolCall.result ?? existing?.description,
  );
  const taskId = this.extractBackgroundTaskId(
    toolCall.toolMetadata,
    toolCall.input,
    toolCall.result,
    existing?.taskId,
  ) ?? null;

  target.set(toolCall.id, {
    launchId: toolCall.id,
    taskId,
    description,
  });
}
```

Add this public helper:

```typescript
static getCompletedTaskFromToolCall(toolCall: {
  id: string;
  input: Record<string, unknown>;
  toolMetadata?: Record<string, unknown>;
  result?: string;
}): BackgroundTaskCompletionInfo | null {
  const taskId = this.extractNativeTaskSessionId(toolCall.toolMetadata);
  if (!taskId) {
    return null;
  }

  return {
    taskId,
    description: this.getBackgroundTaskDescription(toolCall.input, toolCall.result),
  };
}
```

Inside `extractBackgroundTaskId()`, before checking `task_id/taskId/id`, add:

```typescript
const sessionId = (source as Record<string, unknown>).sessionId;
if (typeof sessionId === 'string' && sessionId.trim().length > 0) {
  return sessionId.trim();
}
```

Add the private native-only helper:

```typescript
private static extractNativeTaskSessionId(
  metadata: Record<string, unknown> | undefined,
): string | null {
  const sessionId = metadata?.sessionId;
  return typeof sessionId === 'string' && sessionId.trim().length > 0
    ? sessionId.trim()
    : null;
}
```

- [ ] **Step 3: Run focused tests**

Run:

```bash
npm test -- --runInBand tests/unit/features/chat/BackgroundTaskTimelineService.test.ts tests/unit/features/chat/BackgroundTaskTimelineService.runtime.test.ts
```

Expected: tests that only require identity parsing pass; persisted-message native completion may still fail until Task 3.

- [ ] **Step 4: Commit or report**

If committing per task:

```bash
git add src/features/chat/services/BackgroundTaskTimelineLaunchService.ts tests/unit/features/chat/BackgroundTaskTimelineService.test.ts tests/unit/features/chat/BackgroundTaskTimelineService.runtime.test.ts
git commit -m "feat: prefer native task session identity"
```

Expected: only launch-service and focused tests are staged.

---

### Task 3: Assemble Native Task Blocks Into Existing Timeline Segments

**Files:**
- Modify: `src/features/chat/services/BackgroundTaskTimelineAssemblyService.ts`
- Modify: `src/features/chat/services/BackgroundTaskTimelineService.ts`
- Test: `tests/unit/features/chat/BackgroundTaskTimelineService.test.ts`
- Test: `tests/unit/features/chat/BackgroundTaskTimelineService.runtime.test.ts`

- [ ] **Step 1: Update assembly facade signatures**

In `BackgroundTaskTimelineAssemblyService.upsertLaunch()`, accept `toolMetadata?: Record<string, unknown>`.

Add:

```typescript
getCompletedTaskFromToolCall(toolCall: {
  id: string;
  input: Record<string, unknown>;
  toolMetadata?: Record<string, unknown>;
  result?: string;
}): BackgroundTaskCompletionInfo | null {
  return BackgroundTaskTimelineLaunchService.getCompletedTaskFromToolCall(toolCall);
}
```

- [ ] **Step 2: Let normal user anchors own native task blocks**

In `collectTaskLaunchBlock()`, replace the search-mode-only guard with:

```typescript
if (!state.latestUserMessage) {
  return;
}
```

When upserting the segment launch, pass `toolMetadata`:

```typescript
this.upsertSegmentLaunch(segment, {
  id: block.toolId,
  input: block.toolInput ?? {},
  toolMetadata: block.toolMetadata,
  result: block.toolResult,
});
this.addNativeTaskCompletionToSegment(segment, block);
```

- [ ] **Step 3: Add native completion application**

Add this private method in `BackgroundTaskTimelineAssemblyService`:

```typescript
private addNativeTaskCompletionToSegment(
  segment: BackgroundTaskSegment,
  block: Extract<ChatContentBlock, { type: 'tool_use' }>,
): void {
  if (block.toolStatus !== 'completed' && block.toolStatus !== 'error') {
    return;
  }

  const completion = BackgroundTaskTimelineLaunchService.getCompletedTaskFromToolCall({
    id: block.toolId,
    input: block.toolInput ?? {},
    toolMetadata: block.toolMetadata,
    result: block.toolResult,
  });
  if (completion) {
    this.addCompletionToSegment(segment, completion);
  }
}
```

Update `upsertSegmentLaunch()` input type to include `toolMetadata?: Record<string, unknown>`.

- [ ] **Step 4: Add service facade for stream completion**

In `BackgroundTaskTimelineService`, import `BackgroundTaskCompletionInfo` and add:

```typescript
upsertCompletionFromToolCall(
  toolCall: {
    id: string;
    input: Record<string, unknown>;
    toolMetadata?: Record<string, unknown>;
    result?: string;
  },
  target: Map<string, BackgroundTaskCompletionInfo>,
): void {
  const completion = this.assemblyService.getCompletedTaskFromToolCall(toolCall);
  if (!completion) {
    return;
  }
  target.set(completion.taskId, completion);
}
```

- [ ] **Step 5: Run timeline tests**

Run:

```bash
npm test -- --runInBand tests/unit/features/chat/BackgroundTaskTimelineService.test.ts tests/unit/features/chat/BackgroundTaskTimelineService.runtime.test.ts tests/unit/features/chat/BackgroundTaskTimelineService.reminderFallback.test.ts
```

Expected: all listed tests pass. Existing OMO reminder fallback tests must remain green.

- [ ] **Step 6: Commit or report**

If committing per task:

```bash
git add src/features/chat/services/BackgroundTaskTimelineAssemblyService.ts src/features/chat/services/BackgroundTaskTimelineService.ts tests/unit/features/chat/BackgroundTaskTimelineService.test.ts tests/unit/features/chat/BackgroundTaskTimelineService.runtime.test.ts
git commit -m "feat: assemble native task lifecycle segments"
```

Expected: no runtime or UI files are staged in this task.

---

### Task 4: Wire Stream Trigger To Native Task Completion And Remove Search-Mode Gate

**Files:**
- Modify: `src/features/chat/runtime/BackgroundTaskStreamTriggerCoordinator.ts`
- Test: `tests/unit/features/chat/BackgroundTaskStreamTriggerCoordinator.test.ts`

- [ ] **Step 1: Update runtime interface and timeline port**

In `BackgroundTaskStreamTriggerCoordinator.ts`, import `BackgroundTaskCompletionInfo` and add `backgroundTaskCompletedTasks` to `BackgroundTaskStreamTriggerRuntime`:

```typescript
backgroundTaskCompletedTasks: Map<string, BackgroundTaskCompletionInfo>;
```

Update the timeline port:

```typescript
type BackgroundTaskTriggerTimelinePort = Pick<
  BackgroundTaskTimelineService,
  'upsertLaunch' | 'upsertCompletionFromToolCall'
>;
```

- [ ] **Step 2: Pass native metadata on stream start/end**

In both `handleToolCallStart()` and `handleToolCallEnd()`, pass:

```typescript
toolMetadata: toolCall.toolMetadata,
```

inside the object sent to `this.timelineService.upsertLaunch(...)`.

- [ ] **Step 3: Record terminal native completion on stream end**

After `upsertLaunch()` in `handleToolCallEnd()`, add:

```typescript
if (toolCall.status === 'completed' || toolCall.status === 'error') {
  this.timelineService.upsertCompletionFromToolCall(
    {
      id: toolCall.id,
      input: toolCall.input ?? {},
      toolMetadata: toolCall.toolMetadata,
      result: toolCall.result,
    },
    runtime.backgroundTaskCompletedTasks,
  );
}
```

- [ ] **Step 4: Remove search-mode functional gate**

Change:

```typescript
return toolName === 'task' && runtime.backgroundTaskModeTag === 'search-mode';
```

to:

```typescript
return toolName === 'task';
```

If lint complains about the unused runtime parameter, rename it to `_runtime`.

- [ ] **Step 5: Update tests for new behavior**

In `BackgroundTaskStreamTriggerCoordinator.test.ts`, rename the old search-mode inactive test to:

```typescript
it('tracks plain OpenCode task tools even when search mode is inactive', async () => {
```

Change its expectations to:

```typescript
expect(runtime?.backgroundTaskStartedAt).not.toBeNull();
expect(runtime?.backgroundTaskLaunches.size).toBe(1);
expect(runtime?.backgroundTaskWaitingForFollowUp).toBe(false);
expect(runtime?.backgroundTaskStaleNoticeFingerprint).toBeNull();
expect(timelineService.upsertLaunch).toHaveBeenCalled();
expect(liveSignalCoordinator.armAuthoritativeSyncGate).toHaveBeenCalledWith('tab-1');
expect(indicatorCoordinator.renderIfNeeded).toHaveBeenCalledWith('tab-1');
```

- [ ] **Step 6: Run stream-trigger tests**

Run:

```bash
npm test -- --runInBand tests/unit/features/chat/BackgroundTaskStreamTriggerCoordinator.test.ts
```

Expected: all tests in the file pass.

- [ ] **Step 7: Commit or report**

If committing per task:

```bash
git add src/features/chat/runtime/BackgroundTaskStreamTriggerCoordinator.ts tests/unit/features/chat/BackgroundTaskStreamTriggerCoordinator.test.ts
git commit -m "feat: track native task stream lifecycle"
```

Expected: only stream-trigger files are staged.

---

### Task 5: Documentation, Graphify, And Final Verification

**Files:**
- Modify: `docs/modules/features/chat/services/BackgroundTaskTimelineLaunchService.md`
- Modify: `docs/modules/features/chat/services/BackgroundTaskTimelineAssemblyService.md`
- Modify: `docs/modules/features/chat/services/BackgroundTaskTimelineService.md`
- Modify: `docs/modules/features/chat/runtime/BackgroundTaskStreamTriggerCoordinator.md`
- Modify: `graphify-out/**`
- Read: `docs/archive/maintainability/phases/task-subagent-lifecycle-alignment-evaluation-2026-05-11.md`

- [ ] **Step 1: Update module docs**

Update docs to state:

```markdown
- Native OpenCode task metadata (`toolMetadata.sessionId`) is preferred as the child-session/task identity.
- OMO `system-reminder` tasks remain a fallback completion source for historical or OMO-enhanced conversations.
- Task tool tracking no longer requires `search-mode`; `modeTag` is preserved as segment metadata rather than used as the functional gate.
```

For `BackgroundTaskTimelineAssemblyService.md`, replace the old claim that ordinary task/subagent cards are ignored with:

```markdown
- Native `task` tool blocks after any user anchor can create a background-task segment when they carry task lifecycle state; OMO search-mode anchors still provide historical grouping and reminder fallback.
```

- [ ] **Step 2: Run focused tests**

Run:

```bash
npm test -- --runInBand tests/unit/features/chat/BackgroundTaskTimelineService.test.ts tests/unit/features/chat/BackgroundTaskTimelineService.runtime.test.ts tests/unit/features/chat/BackgroundTaskTimelineService.reminderFallback.test.ts tests/unit/features/chat/BackgroundTaskStreamTriggerCoordinator.test.ts
```

Expected: all focused tests pass.

- [ ] **Step 3: Refresh graphify for src changes**

Run:

```bash
npm run graphify:update:src
```

Expected: graphify completes and `graphify-out/` is updated if source graph changed.

- [ ] **Step 4: Run module-doc and graph checks**

Run:

```bash
npm run check:module-docs
npm run check:graphify
```

Expected: both commands pass.

- [ ] **Step 5: Run full verification**

Run:

```bash
npm run verify
```

Expected: lint, typecheck, tests, build, module-doc checks, graphify checks, and devlog order checks pass with `0 errors / 0 warnings`.

- [ ] **Step 6: Commit or report**

If committing per task:

```bash
git add src/features/chat/runtime/BackgroundTaskStreamTriggerCoordinator.ts \
  src/features/chat/services/BackgroundTaskTimelineAssemblyService.ts \
  src/features/chat/services/BackgroundTaskTimelineLaunchService.ts \
  src/features/chat/services/BackgroundTaskTimelineService.ts \
  tests/unit/features/chat/BackgroundTaskStreamTriggerCoordinator.test.ts \
  tests/unit/features/chat/BackgroundTaskTimelineService.test.ts \
  tests/unit/features/chat/BackgroundTaskTimelineService.runtime.test.ts \
  docs/modules/features/chat/runtime/BackgroundTaskStreamTriggerCoordinator.md \
  docs/modules/features/chat/services/BackgroundTaskTimelineAssemblyService.md \
  docs/modules/features/chat/services/BackgroundTaskTimelineLaunchService.md \
  docs/modules/features/chat/services/BackgroundTaskTimelineService.md \
  graphify-out
git commit -m "feat: align task lifecycle with native OpenCode metadata"
```

Expected: the commit excludes unrelated workspace changes. The untracked evaluation report can be committed only if the controller explicitly chooses to include the report in final delivery.

---

## Self-Review

- Spec coverage: Tasks cover Desktop source validation, native `metadata.sessionId` identity, native terminal `toolStatus`, removal of `search-mode` functional gate, OMO fallback preservation, docs, graphify, and full verify.
- Placeholder scan: The plan contains concrete paths, code snippets, commands, and expected results. It does not use TBD/TODO placeholders.
- Type consistency: `toolMetadata?: Record<string, unknown>` is threaded through launch service, assembly service, facade, and stream trigger. `BackgroundTaskCompletionInfo | null` is handled at both assembly and facade call sites.
