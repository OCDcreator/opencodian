# Autopilot Round Roadmap — `s3-checkpoint`

## Queue

### [NEXT] F1 - Final verification and review-driven checkpoint

- **Lane**: Final checkpoint
- **Goal**: Finish the queue with full verification, directly related docs updates, and a final statement of what is now SDK-backed versus still intentionally falling back.
- **Priority entrypoints**:
  - files changed by `s1-permission-sdk` and `s2-slash-sdk`
  - directly related `docs/modules/**`
  - `docs/status/lanes/s3-checkpoint/autopilot-phase-*.md`
- **Constraints**:
  - No new broad feature work
  - Only direct follow-up fixes from verification or review blockers
- **Acceptance**:
  - `npm run verify` passes
  - The final OpenCode CLI review passes
  - The lane phase doc clearly records the remaining intentional fallback boundaries, if any

## Lane state

- When this roadmap has no remaining `[NEXT]` or `[QUEUED]` items, the controller may mark the objective complete.
