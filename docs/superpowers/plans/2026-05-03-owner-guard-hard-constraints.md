# Owner Guard Hard Constraints Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a repo-local owner-guard gate that blocks net-new feature ownership from landing in guarded thick-owner files, runs in local `pre-push` and CI, and stays aligned with the approved design spec.

**Architecture:** Implement the guard as a small tested library plus a thin CLI wrapper so the heuristics are unit-testable without shelling out through the whole script. Then wire the CLI into `package.json`, a repo-local `.githooks/pre-push`, and a dedicated GitHub Actions job, while updating the maintainability and infrastructure docs that describe repo validation.

**Tech Stack:** Node.js ESM scripts, git diff metadata, Jest script-library tests, npm scripts, GitHub Actions YAML, Markdown docs

---

### Task 1: Lock the owner-guard decision contract with failing library tests

**Files:**
- Create: `tests/unit/infrastructure/owner-guard-lib.test.mjs`

- [ ] Add focused tests for the pure decision layer before writing the implementation:
  - guarded file + Class B change => block
  - docs/style/locale-only changes => allow
  - guarded file + presentation-only edits => allow
  - guarded file + net-new runtime ownership signals => block
  - `maintainability-refactor` mode + guarded-file net deletion => allow
  - `scripts/check-owner-guard.mjs` and `scripts/install-hooks.mjs` are never auto-exempt
- [ ] Use the existing `module-doc-guard-lib` test pattern: spawn a tiny ESM loader that imports the library exports and JSON-serializes the results.
- [ ] Run the new focused test file and confirm it fails because `scripts/owner-guard-lib.mjs` does not exist yet.
  - Run: `npm test -- --runTestsByPath tests/unit/infrastructure/owner-guard-lib.test.mjs`

### Task 2: Implement the tested owner-guard library and CLI wrapper

**Files:**
- Create: `scripts/owner-guard-lib.mjs`
- Create: `scripts/check-owner-guard.mjs`

- [ ] In `scripts/owner-guard-lib.mjs`, add the pure helpers the tests exercise:
  - normalized guard-target list including `OpenCodianView.ts`, `OpenCodeService.ts`, `main.ts`, and `ServerManager.ts`
  - allowed exception-path matcher plus the narrower “never auto-exempt” script list
  - Class A / Class B classifier that can distinguish exception-path-only, presentation-only, and behavior/ownership changes
  - net-new ownership detector that looks at added lines and only treats long-lived runtime ownership growth as blocking
  - `maintainability-refactor` allowance that requires both explicit mode selection and guarded-file net reduction
  - human-readable failure formatter with rule id, touched files, reason, and fallback guidance to baseline/module docs
- [ ] Keep `scripts/check-owner-guard.mjs` thin: parse args/env, resolve repo root, choose the diff range, collect git diff metadata, call the library, print a concise PASS/FAIL result, and exit non-zero on blocking findings.
- [ ] Support explicit execution knobs needed by local and CI callers:
  - `--range <git-range>` / `OWNER_GUARD_DIFF_RANGE`
  - `--mode normal|maintainability-refactor` / `OWNER_GUARD_MODE`
- [ ] Re-run the focused owner-guard library test file and confirm the contract now passes.
  - Run: `npm test -- --runTestsByPath tests/unit/infrastructure/owner-guard-lib.test.mjs`

### Task 3: Wire the guard into repo commands and local hook installation

**Files:**
- Modify: `package.json`
- Create: `scripts/install-hooks.mjs`
- Create: `.githooks/pre-push`

- [ ] Add `npm run check:owner-guard` to `package.json`, pointing at `node scripts/check-owner-guard.mjs`.
- [ ] Add a repo-local hook installer entry in `package.json` such as `npm run hooks:install`, pointing at `node scripts/install-hooks.mjs`.
- [ ] Update `npm run verify` so `check:owner-guard` runs early, before the slower lint/typecheck/test/build gates.
- [ ] Implement `scripts/install-hooks.mjs` to set `git config core.hooksPath .githooks` from the repo root and fail clearly if the current directory is not a git worktree.
- [ ] Create `.githooks/pre-push` as a minimal shell hook that runs `npm run check:owner-guard` and exits immediately on failure.
- [ ] Manually verify the installer and the hook script wiring.
  - Run: `node scripts/install-hooks.mjs`
  - Run: `git config core.hooksPath`
  - Expected: `.githooks`

### Task 4: Add the dedicated CI owner-guard gate

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] Add a new `owner-guard` job that runs independently from the existing `verify` job.
- [ ] Ensure the job has enough git history to evaluate PR ranges reliably:
  - use `actions/checkout@v4` with `fetch-depth: 0`
  - export `OWNER_GUARD_DIFF_RANGE` from `origin/${{ github.base_ref }}...HEAD` for pull requests
  - fall back to `origin/main...HEAD` or `HEAD` logic already supported by the script for non-PR runs
- [ ] Keep the existing `verify` job intact except for any checkout-depth adjustment needed to avoid duplicate range-detection bugs.
- [ ] Run the owner-guard script locally against a representative range after the workflow edit to confirm the job command is valid.
  - Run: `OWNER_GUARD_DIFF_RANGE=HEAD npm run check:owner-guard`

### Task 5: Refresh maintainability and infrastructure docs for the new gate

**Files:**
- Modify: `docs/status/development-maintainability-rules.md`
- Modify: `docs/modules/infrastructure/scripts.md`
- Modify: `docs/modules/infrastructure/build-pipeline.md`

- [ ] Update the maintainability rules doc so the active baseline mentions `check:owner-guard`, the guarded thick-owner files, the `maintainability-refactor` exception mode, and the fact that `pre-push` is early feedback while CI is final enforcement.
- [ ] Update `docs/modules/infrastructure/scripts.md` so it documents:
  - `owner-guard-lib.mjs`
  - `check-owner-guard.mjs`
  - `install-hooks.mjs`
  - the new npm commands
  - the `.githooks/pre-push` integration point
- [ ] Update `docs/modules/infrastructure/build-pipeline.md` so the CI section describes the separate `owner-guard` job and any `fetch-depth` change.

### Task 6: Validate the end-to-end gate behavior

**Files:**
- Verify only: no new files beyond Task 1–5 outputs

- [ ] Re-run the focused owner-guard library tests.
  - Run: `npm test -- --runTestsByPath tests/unit/infrastructure/owner-guard-lib.test.mjs`
- [ ] Run the owner-guard command directly.
  - Run: `npm run check:owner-guard`
- [ ] Run the full repo validation.
  - Run: `npm run verify`
- [ ] If the implementation changes `.github/workflows/ci.yml`, inspect the final YAML for accidental job-order or checkout regressions before treating the branch as complete.
- [ ] Report the exact observed validation results, including whether `verify` stayed green after the new gate was inserted.
