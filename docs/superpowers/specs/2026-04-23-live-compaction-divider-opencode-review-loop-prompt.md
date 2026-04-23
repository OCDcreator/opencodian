# Prompt For A New Session: OpenCode Review Loop Implementation

把下面整段提示词发给新会话即可。

---

You are working in `C:\\Users\\lt\\Desktop\\Write\\custom-project\\opencodian`.

Goal: implement the approved “live compaction divider + streaming compaction summary” UX in this repo, but do it through an **OpenCode CLI implementation + self-review loop**, not as a single direct edit pass.

You must follow this workflow exactly:

## 0. Read context first

Before changing code, read:

- `AGENTS.md`
- `docs/superpowers/specs/2026-04-23-live-compaction-divider-streaming-summary-design.md`
- `docs/superpowers/plans/2026-04-23-live-compaction-divider-streaming-summary.md`
- `docs/status/opencode-auto-compaction-debug-handoff-2026-04-23.md`

Then summarize the task back to yourself in 5-10 bullets before starting implementation.

## 1. Use a dedicated branch and durable checkpoints

- Create or switch to a dedicated branch for this work.
- Because the implementation/review loop may take a long time and the session may get truncated, maintain a durable checkpoint file:
  - `docs/status/live-compaction-divider-opencode-review-loop-checkpoint.md`
- After every meaningful round, append:
  - timestamp
  - current branch
  - what OpenCode CLI was asked to do
  - what changed
  - what you reviewed
  - problems found
  - exact next corrective prompt
  - whether verification passed/failed

If the session gets interrupted, recover by reading that checkpoint first.

## 2. Use OpenCode CLI from shell, not the TUI

Use `opencode run`, not the interactive TUI.

Verified available commands include:

- `opencode run [message..]`
- `opencode session list --format json -n 5`

Preferred pattern:

- first implementation round: `opencode run --dir . --dangerously-skip-permissions "<task prompt>"`
- later corrective rounds: continue the same OpenCode work with either:
  - `opencode run --continue --dir . --dangerously-skip-permissions "<follow-up prompt>"`
  - or if needed recover the exact session via `opencode session list --format json -n 5` and use `--session <id>`

Keep each OpenCode round bounded. Do **not** send one giant “implement everything” prompt and trust it blindly.

## 3. Work in review loops, not one pass

For each round:

1. Pick one bounded slice from the approved plan.
2. Ask OpenCode CLI to implement only that slice.
3. When OpenCode finishes, do **your own review**:
   - inspect `git diff --stat`
   - inspect the touched files
   - inspect whether architecture drifted from the approved design
   - inspect whether it violated repo guardrails
   - run targeted tests first
4. If you find problems, write a **precise corrective prompt** and send it back to OpenCode CLI.
5. Repeat until that slice is acceptable.
6. Only then move to the next slice.

Do not trust OpenCode’s “done” claim without inspection.

## 4. Implementation order

Use this order unless review reveals a blocking dependency:

1. failing tests for compaction transcript + live UX
2. compaction render model / normalization
3. divider UI + styles + i18n
4. `compactingAt` -> tab runtime bridge
5. streaming summary rendering
6. `session.compacted` reload stabilization
7. docs sync
8. final verification

## 5. UX rules you must preserve

- Show an in-chat divider immediately when compaction starts.
- Divider style: light, pretty, in-chat, not a heavy warning/notice card.
- Summary should visibly generate under that divider.
- The divider belongs to the owning conversation tab.
- Switching tabs is allowed; the state stays with the original tab.
- Closing a busy/compacting tab should remain blocked.
- Do not re-expose `compaction_continue` synthetic user text.
- Do not regress ordinary assistant merge/notice/question rendering.

## 6. Anti-truncation operating rules

Because this may be long-running:

- keep rounds small
- checkpoint after every round
- commit after every clearly successful round if the repo state is clean enough for a task-local checkpoint
- if there are unrelated pending changes, do not sweep them in
- if you are about to run out of context, stop after updating the checkpoint with an explicit “next prompt to send to OpenCode CLI”

## 7. Required review checklist after every OpenCode round

After every OpenCode CLI run, explicitly check:

- Did it keep compaction as a dedicated render concept instead of plain markdown text?
- Did it accidentally turn the divider into a notice card?
- Did it accidentally apply the live-summary path to non-compaction summaries?
- Did it break tab ownership or tab-close protection?
- Did it skip docs/tests?
- Did it add thin helper files that violate repo maintainability guidance?

If any answer is “yes”, send a corrective prompt to OpenCode CLI and loop again.

## 8. Final verification

Do not stop until you have:

- run targeted tests for the changed behavior
- run `npm run verify`
- if runtime/deploy-relevant files changed, decide whether Test Vault deploy is required under repo rules
- reviewed the final diff yourself
- updated the checkpoint file with final status

## 9. Final output format

When you finally report back, include:

- branch name
- OpenCode CLI rounds executed
- whether any corrective loops were needed
- files changed
- tests run
- final remaining risks
- exact current status

Important: you are the reviewer/orchestrator. OpenCode CLI is the implementation worker. Keep looping until the result is truly acceptable, and keep enough checkpoint state on disk that a truncated session can resume cleanly.
