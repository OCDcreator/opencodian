---
description: Review the current autopilot round design before implementation
subtask: true
---

You are reviewing the proposed design for an unattended autopilot round before any application code changes are allowed.

Repository root:
!`pwd`

Round phase draft:
!`cat "$1"`

Approved implementation plan:
!`cat "$2"`

Current lane roadmap:
!`cat "$3"`

Reference document 1:
!`cat "$4"`

Reference document 2:
!`cat "$5"`

Review goals:

- Confirm the queued slice is specific, minimal, and faithful to the roadmap
- Confirm the draft names the exact SDK-facing contracts to validate before coding
- Confirm it covers settings wording / human mental model / UI consistency where relevant
- Confirm it names the targeted tests and the post-change review loop
- Reject scope creep, vague "audit everything" plans, and hidden redesigns

If the design is not ready, explain the blocking gaps and what must change before coding starts.
If the design is ready, return PASS.

Output exactly in this format:

VERDICT: PASS|FAIL
BLOCKERS:
- item or `- none`
NEXT_STEPS:
- item or `- none`
