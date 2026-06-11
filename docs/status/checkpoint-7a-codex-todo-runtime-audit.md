# Checkpoint 7A: Codex `todo_list` Ordinary Chat Runtime Audit

## 1. Files Changed

No repo source files were changed by this review round.

Runtime artifact captured:
- `/Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/.worktrees/codex-sdk-capability/.obsidian-debug/checkpoint-7a-codex-todo-dock-runtime.png`

## 2. Capability Diagnosed

- Codex `todo_list` emission into the existing ordinary chat todo surfaces
  - transcript tool block
  - `SessionTodoDock`

## 3. Build / Deploy / Runtime Preconditions

- Worktree build ID: `feature-codex-sdk-capability.202606092027`
- Deployed Test Vault plugin `main.js` contains the same `BUILD_ID`
- Plugin reloaded in Test Vault before validation
- `obsidian dev:errors` after the proof run: `No errors captured.`

## 4. Runtime Proof Achieved

### Prompt used

- Fresh Codex conversation in Test Vault ordinary chat:
  - `Before answering, create a short todo list with exactly 3 steps for solving this task, keep it updated as you work, and then tell me what 12 + 30 equals.`

### Visible ordinary chat evidence

- Assistant response rendered a visible `Todos` tool block in the transcript
  - tool label summary: `Todos 1/3 · Set up a 3-step todo list for the task · Calculate 12 + 30 · +1`
- The existing ordinary todo dock also appeared above the composer
  - visible dock summary: `已完成 1 / 3 个待办`
  - visible todo rows included:
    - `Set up a 3-step todo list for the task`
    - `Calculate 12 + 30`
    - `Return the result to the user`
- DOM/readback probes during the run confirmed the dock text was present in `document.body.innerText`
- Screenshot proof captured while the dock was visible:
  - `/Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/.worktrees/codex-sdk-capability/.obsidian-debug/checkpoint-7a-codex-todo-dock-runtime.png`

## 5. Blocking Product Bug

Checkpoint 7A is **not approvable yet** because the ordinary todo surface becomes stale at completion.

### Observed runtime mismatch

- The assistant's final visible text explicitly marked all three todos as completed and returned `12 + 30 = 42`
- The transcript tool block had status `completed`
- But the transcript tool block summary itself still showed the original `Todos 1/3 ...` snapshot instead of an all-complete summary
- But the dock remained stuck at the initial snapshot:
  - summary still showed `已完成 1 / 3 个待办`
  - only the first row was checked
  - the other two rows remained incomplete in the dock

### Why the dock goes stale

Current wiring only feeds the dock from `todowrite` tool input snapshots:

- `src/core/agents/backend/CodexStreamNormalizer.ts`
  - `onTodoList()` emits `tool_use(name='todowrite', input.todos=...)` on `started`
  - `onTodoList()` emits only `tool_result(...)` on `completed` when `started` was already seen
- `src/features/chat/services/SessionTodoCoordinator.ts`
  - `applyStreamingTodoSnapshotFromTool()` updates session todos only from `toolCall.input.todos` when `toolCall.name === 'todowrite'`

Result:

- the dock receives the initial `started` snapshot
- the dock does **not** receive a refreshed completed snapshot
- completion text and tool status advance, but dock state does not

## 6. Honest Verdict

- `todo_list` has now been proven to reach ordinary Codex chat surfaces
  - visible transcript tool block: **yes**
  - visible ordinary `SessionTodoDock`: **yes**
- But the current behavior is **not stable productization**
  - completion-state synchronization is wrong
  - this checkpoint must **not** be promoted to `已 pass`

Recommended checkpoint status:

- Codex todo seam: **not approved**
- Do not move this capability to `completed`
- Keep it outside the `已 pass` bucket until the dock receives correct completion snapshots

## 7. Smallest Next Fix

Open a follow-up checkpoint that does only this:

- make Codex `todo_list` refresh the same snapshot surface on completion or update
- rerun `npm run verify`
- rebuild, redeploy, reload
- prove in Obsidian that:
  - the transcript tool block appears
  - the dock appears
  - the dock advances from partial to fully completed state correctly
  - no stale `1 / 3` summary remains after completion
