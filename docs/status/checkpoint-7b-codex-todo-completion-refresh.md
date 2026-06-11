# Checkpoint 7B: Codex `todo_list` Completion Snapshot Refresh

## 1. Files Changed

Implementation/test changes reviewed from OpenCode:

- `src/core/agents/backend/CodexStreamNormalizer.ts`
- `tests/unit/core/agents/backend/CodexStreamNormalizer.test.ts`

Review-round status artifact added by Codex:

- `docs/status/checkpoint-7b-codex-todo-completion-refresh.md`

Runtime screenshots captured during validation:

- `.obsidian-debug/checkpoint-7b-final.png`
- `.obsidian-debug/checkpoint-7b-explicit-1.png`
- `.obsidian-debug/checkpoint-7b-fresh-1.png`
- `.obsidian-debug/checkpoint-7b-fresh-2.png`
- `.obsidian-debug/checkpoint-7b-latest-build-runtime.png`

## 2. Intended Fix

Checkpoint 7A proved that Codex `todo_list` could reach ordinary chat surfaces, but the completed state stayed stale:

- transcript summary stayed at `Todos 1/3 ...`
- `SessionTodoDock` stayed at `已完成 1 / 3 个待办`

Checkpoint 7B applies the smallest code fix:

- `CodexStreamNormalizer.onTodoList()` now re-emits a `tool_use(name='todowrite', input.todos=...)` snapshot on `completed`, not only on `started`
- the completed snapshot is immediately followed by the existing `tool_result`

## 3. Code Review Verdict

The code change is minimal and aligned with the existing product surface:

- no new Codex-only UI was introduced
- no broader settings or MCP scope was widened
- the fix stays inside the current `todowrite` snapshot path already consumed by ordinary chat todo owners

Key reviewed lines:

- `src/core/agents/backend/CodexStreamNormalizer.ts`
  - `phase === 'started' || phase === 'completed'` now emits the snapshot
- `tests/unit/core/agents/backend/CodexStreamNormalizer.test.ts`
  - completed-after-started now expects refreshed `tool_use` + `tool_result`
  - added a 3-item regression covering the stale `1/3 -> 3/3` path

## 4. Verification

### Full verify

Ran successfully with owner-guard approval note:

- command:
  - `OWNER_GUARD_APPROVED='Checkpoint 7B: Codex todo completed snapshot refresh' npm run verify`
- result:
  - `479` test suites passed
  - `4516` tests passed
  - production build succeeded

### Build

- latest worktree build during final verify:
  - `feature-codex-sdk-capability.202606092115`

### Deploy

- copied `dist/main.js`, `dist/manifest.json`, `dist/styles.css` to:
  - `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/`
- confirmed deployed plugin file contains:
  - `feature-codex-sdk-capability.202606092115`

## 5. Runtime Evidence

### Strong proof on the repaired seam

On the earlier checkpoint-7B runtime pass before the final verify rebuild, the ordinary transcript visibly reached the repaired completed state:

- screenshot:
  - `.obsidian-debug/checkpoint-7b-final.png`
- visible transcript summary:
  - `Todos 3/3 ...`
- visible assistant body:
  - all three steps marked `completed`
  - final answer `12 + 30 = 42`

This is strong evidence that the stale `1/3` transcript summary bug was fixed.

### Message-layer persisted proof

In a fresh Codex conversation using an explicit tool-targeted prompt, persisted conversation state contained:

- backend: `codex`
- a `tool_use` block with:
  - `toolName: 'todowrite'`
  - `toolStatus: 'completed'`
  - `toolInput.todos`: 3 items, all `completed`

This proves the completed snapshot now persists as a completed `todowrite` tool block in message data.

### Latest-build runtime proof

After the initial post-deploy control-surface instability, Codex restarted Obsidian and re-ran the proof path on the latest loaded plugin build.

Latest loaded runtime evidence:

- loaded build identity read from plugin runtime:
  - `OpenCodian 1.0.0 BUILD_ID=feature-codex-sdk-capability.202606092115`
- latest-build screenshot:
  - `.obsidian-debug/checkpoint-7b-latest-build-runtime.png`
- visible transcript chrome in that latest-build UI:
  - `Todos 3/3 · Identify the numbers to add: 12 and 30 · Compute the sum of 12 + 30 · +1`
  - tool status: `completed`
  - final answer visible: `12 + 30 = 42`

Additional runtime notes:

- `obsidian dev:errors` returned `No errors captured.`
- after all todos are complete, `SessionTodoDock` is expected to hide again by current product behavior (`SessionTodoDock.update()` hides when there are no incomplete todos)
- console-error capture was not re-established with `dev:debug on` after the app restart, so the final latest-build evidence relies on:
  - loaded runtime `BUILD_ID`
  - visible UI screenshot
  - `dev:errors`
  - persisted conversation/tool-block state

## 6. Honest Verdict

Checkpoint 7B materially fixes the stale completed snapshot bug and now satisfies the lane's acceptance bar.

Accepted truth:

- code/test/build/deploy are verified
- latest loaded runtime `BUILD_ID` is verified
- latest-build ordinary transcript UI visibly reaches `Todos 3/3 ... Status: completed`
- persisted message data for the repaired seam contains a completed `todowrite` snapshot with all three todos completed

Checkpoint status:

- **approved**
- Codex ordinary todo transcript/product-surface seam: **已 pass**
- caveat: model invocation remains prompt-dependent, so `todo_list` should be treated as a proven product seam when emitted, not as a guarantee that every Codex prompt will choose that tool

## 7. Next Smallest Recommendation

Do not open a broader batch automatically.

If another checkpoint is approved later, choose a new smallest seam from the remaining backlog rather than revisiting 7B.
