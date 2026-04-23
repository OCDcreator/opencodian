---
description: Review the current autopilot round changes before final validation and commit
subtask: true
---

You are reviewing the current uncommitted autopilot round changes.

Current lane roadmap:
!`cat "$1"`

Current phase draft:
!`cat "$2"`

Approved implementation plan:
!`cat "$3"`

Git status:
!`git status --short`

Unstaged diff stat:
!`git diff --stat`

Unstaged diff:
!`git diff`

Staged diff stat:
!`git diff --cached --stat`

Staged diff:
!`git diff --cached`

Review goals:

- Review only the current uncommitted changes
- Read full files with tools when needed before calling something a bug
- Focus on SDK parity regressions, broken permission/command behavior, settings or locale mismatches, UI consistency regressions, missing tests, and queue drift
- Treat missing or weak validation as a blocker when the changed files require it
- If the changes are ready to proceed, return PASS

Output exactly in this format:

VERDICT: PASS|FAIL
BLOCKERS:
- item or `- none`
MINORS:
- item or `- none`
