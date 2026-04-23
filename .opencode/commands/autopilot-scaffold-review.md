---
description: Review the autopilot seed plan, config, and queue docs before unattended execution
subtask: true
---

You are reviewing a repo-local autopilot scaffold before unattended execution starts.

Review these files in order:

Seed implementation plan:
!`cat "$1"`

Autopilot config:
!`cat "$2"`

Round prompt:
!`cat "$3"`

Master plan:
!`cat "$4"`

Lane map:
!`cat "$5"`

Permission lane roadmap:
!`cat "$6"`

Slash lane roadmap:
!`cat "$7"`

Checkpoint lane roadmap:
!`cat "$8"`

Review goals:

- Confirm the queue is coherent, minimal, and sequenced sensibly
- Confirm the prompt and config really enforce the required plan-review and code-review loops
- Confirm the docs point to the correct repo paths and upstream reference docs
- Confirm the validation/deploy policy is coherent for this repo
- Flag missing guardrails, contradictory instructions, or obvious operational risks

If the scaffold is not ready, return FAIL with concrete blockers.
If it is ready for unattended execution, return PASS.

Output exactly in this format:

VERDICT: PASS|FAIL
BLOCKERS:
- item or `- none`
MINORS:
- item or `- none`
