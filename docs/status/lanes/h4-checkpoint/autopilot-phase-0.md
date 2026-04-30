# Autopilot Phase 0 — `h4-checkpoint`

## Mission

Close the hotspot queue only after recomputing hotspot evidence, trimming any thin seams introduced by prior rounds, and confirming that the branch has reached a credible maintainability checkpoint.

## Baseline Inputs

- The lane inherits before/after hotspot notes from `h1`, `h2`, and `h3`.
- The queue should reach this lane only after the earlier roadmaps are done.
- The checkpoint must prefer evidence from current file metrics, validation output, and docs status rather than vague judgment.

## Success Signals

- Fresh hotspot metrics show real improvement or explain the remaining residual hotspots clearly.
- No accidental thin-wrapper debris remains from earlier rounds.
- The queue can stop on a clean branch with green validation and clear next steps for future manual reprioritization.

## Guardrails

- Do not invent new feature work in the checkpoint lane.
- Only take residual cleanup that directly supports the maintainability checkpoint.

## Queue Entry

Start from `docs/status/lanes/h4-checkpoint/autopilot-round-roadmap.md` and execute the first `[NEXT]` item only.
