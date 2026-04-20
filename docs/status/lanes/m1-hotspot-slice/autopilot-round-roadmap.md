# Autopilot Round Roadmap — `m1-hotspot-slice`

## Queue

### [NEXT] R1 - First maintainability / refactor slice

- **Lane**: Maintainability / ownership reduction
- **Goal**: Choose one high-value, low-risk maintainability slice from the suggested entrypoints and measurably reduce direct ownership, assembly surface, or validation churn without changing behavior.
- **Priority entrypoints**:
- `AGENTS.md`
- `README.md`
- `docs/`
- `src/`
- `tests/`
- `main.js`
- `src/utils/icons/lobehubIconManifest.ts`
- `reference-projects/opencode/packages/sdk/js/src/v2/gen/types.gen.ts`
- **Constraints**:
  - Stay inside one bounded slice
  - Do not create thin wrappers that only rename pass-through ownership
  - Preserve existing runtime behavior
- **Acceptance**:
  - The chosen owner or assembly surface is measurably smaller or clearer
  - The phase doc records scope, changed files, and validation results
  - Every configured validation command passes

## Lane state

- This roadmap is lane-local.
- When it has no remaining `[NEXT]` or `[QUEUED]` items, the controller switches to `m2-followup-slice`.
