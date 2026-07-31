# Agent-Friendly Architecture Refactor — Phase Ledger

> Single concise ledger for the `2026-07-30-agent-friendly-architecture-and-governance-refactor.md` plan. No per-phase history documents; progress and review verdicts live here.

## Plan reference
`docs/superpowers/plans/2026-07-30-agent-friendly-architecture-and-governance-refactor.md`

## Phase 0 — Canonical ownership and measurements (Task 1A, 1B, 2)

- **PHASE_BASE:** `4c2f3567a65b7bf93b74187874420fa99cd04f08`
- **PHASE_HEAD:** `14bcdda1b51310abb3d6d8d87f90d5259732d5ae`
- **Range:** `4c2f3567..14bcdda1` (6 commits, 60 files, runtime source untouched)

### Commits
| SHA | Type | Subject |
|---|---|---|
| `d574d358` | feat(architecture) | add canonical owner manifest tooling (Task 1A/1B) |
| `1994ebfd` | feat(architecture) | add agent owner inspector (Task 2) |
| `49d20ed6` | docs(architecture) | owner model, overview pages, AGENTS routing |
| `fde80fb7` | docs(devlog) | record Phase 0 architecture baseline |
| `a8e72175` | docs(superpowers) | add Phase ledger |
| `14bcdda1` | fix(architecture) | normalize AGENTS.md Owner Routing section to LF (review fix) |

### Codex independent review — APPROVED
- **Reviewer:** Codex CLI (gpt-5.6-sol), read-only sandbox, session `019fb3c1-0ed1-7552-b352-3860c1b642be` (initial review truncated by timeout; resumed to completion).
- **Verdict:** **APPROVED** (Critical 0, Important 0, Minor 0).
- **Review fix round:** The initial truncated review flagged `AGENTS.md` CRLF/trailing-whitespace (the `\r` byte read as trailing whitespace by `git diff --check`). Implementer fixed it in `14bcdda1` (normalized the Owner Routing section to LF to match the surrounding file). Resumed review re-ran `git diff --check 4c2f3567..14bcdda1` (clean) and confirmed the fix before APPROVED.
- **Independently verified by Codex:** `check:owner-manifest` (542/542, 0 ambiguous, 0 unassigned), `--strict-paths` PASS, representative path resolution (chat/settings/OpenCode/Codex/Claude/storage/main/SendPipelineRuntime all unique owner; `ws-shim.d.ts` correctly excluded), `check:module-docs` (576/576), `check:devlog-order` (500), `check:graphify` (freshness ok), no `src/` changes in range, no reverse deps/runtime SCC/service locator/mega port/documentation theater/scope creep.
- **Caveat noted, not blocking:** Codex's read-only sandbox could not write the Jest haste-map (EPERM), so it could not re-run the focused Jest suite inside its sandbox. Jest-pass evidence comes from the implementer's real `npm test` run (706 suites / 6708 tests, incl. 37 new infra tests); `14bcdda1` only changes AGENTS.md line endings, so test outcome is unaffected.

### Acceptance status
- [x] Task 1A: strict schema green; 100% path accounted (542/542); 0 ambiguous; 0 unknown keys; unassigned baseline locked at 0.
- [x] Task 1B: `legacy.unassigned.explicitPaths` = 0 (reached zero directly during 1A classification).
- [x] Task 2: `inspect:owner` resolves representative chat/OpenCode/Codex/Claude/storage/settings/main paths to one owner with actionable focused gates.

### Gate evidence (all run on clean tree at PHASE_HEAD)
- `npm run check:owner-manifest` → PASS (managed 542, covered 542, ambiguous 0, unassigned explicit 0, unassigned real 0). `--strict-paths` → PASS.
- `npm run check:module-docs` → OK (576/576).
- `npm run check:graphify` → freshness ok.
- `npm run check:devlog-order` → OK (500 sections descending).
- `npm run lint` → 0 errors / 0 warnings.
- `npm run typecheck` → pass.
- `npm test` → 706 suites / 6708 tests pass (incl. 37 new infrastructure tests).
- `npm run build` → BUILD_ID main.202607302355.
- `npm run verify` → all gates green.
- Focused infra tests → 37/37 pass.

### Runtime files changed
None. No Test Vault deployment required (infrastructure/docs-only phase).

### Codex independent review
- Status: **APPROVED** (see above).

---

## Phase 1 — Trustworthy diff and architecture gates (Task 3–6)

- **PHASE_BASE:** `14bcdda1b51310abb3d6d8d87f90d5259732d5ae`
- **PHASE_HEAD:** `07b86e6c348381e3acaf5a840cf52467acd3323d`
- **Range:** `14bcdda1..07b86e6c` (7 commits, runtime source untouched)

### Commits
| SHA | Type | Subject |
|---|---|---|
| `d3c8f8ea` | feat(gates) | add unified change scope (Task 3) |
| `4a90511e` | feat(gates) | add owner-boundary evaluation, deprecate path guard (Task 4) |
| `b6bdc0e3` | feat(gates) | add dependency-direction and cycle baseline (Task 5) |
| `645c936a` | feat(gates) | add structured diff-bound approvals (Task 6) |
| `e5b93f10` | docs(devlog) | record Phase 1 architecture gates |
| `ccc39f16` | docs(superpowers) | record Phase 1 completion in ledger |
| `e2d69662` | fix(gates) | re-export in runtime edges + EOF blank lines (review round 1) |
| `0aae0469` | fix(gates) | Codex round-2 review (ESM require, digest exclusion, fail-closed, main.ts glob, verify wiring) |
| `07b86e6c` | fix(gates) | import computeChangeScope + wire approvals into verify (review round 3) |

### Acceptance status
- [x] Task 3: non-empty `origin/main...HEAD` can never become Class A "no changes" because worktree is clean. committed/staged/unstaged/untracked equivalence proven.
- [x] Task 4: no hard-coded four-file list; no pass/fail based solely on line count; composition-line-growth passes, duplicated-state hints, thin-layer is a hint not blocker.
- [x] Task 5: baseline runtime/type debt precisely classified (0 runtime SCC, 4 type-only, 11 mixed); new reverse edges and runtime cycles are non-waivable; type-only SCC never reported as runtime cycle.
- [x] Task 6: repo-writable JSON alone never PASS; external authority is the trust root; never-approvable rules rejected.

### Gate evidence (run on clean tree at PHASE_HEAD)
- `verify:architecture` → owner-manifest / owner-boundaries / dependency-direction / architecture-cycles all PASS.
- `check:dependency-direction` → 0 new reverse-layer edges, 0 unresolved.
- `check:architecture-cycles` → 0 runtime SCC, 4 type-only, 11 mixed; 0 new runtime SCC, 0 new type-coupling members.
- `check:architecture-approvals` → PASS (no pending requests).
- Infrastructure Jest → 17 suites / 150 tests.
- Full `npm test` → 711 suites / 6756 tests.
- `check:module-docs` (576/576), `check:graphify`, `check:devlog-order` (501), lint 0/0, typecheck, build all green.

### Runtime files changed
None. No Test Vault deployment required.

### Architecture baseline snapshot (Phase 1 entry)
- Runtime SCCs: 0 (frozen).
- Type-only SCCs: 4 (debt).
- Mixed SCCs: 12 (debt).
- Internal edges: 2187 (542 managed files; the round-2 fix corrected a glob that had missed src/main.ts, 541→542).
- These confirm the plan's finding that Graphify's 14 mixed SCCs are type/mixed coupling, not runtime cycles.

### Codex independent review — APPROVED
- **Reviewer:** Codex CLI (gpt-5.6-sol), writable sandbox (workspace-write) so Jest could actually run.
- **Verdict:** **APPROVED** (Critical 0, Important 0, Minor 0).
- **Review-fix rounds:** Three rounds of Codex review found and fixed 6 real issues (read-only sandbox had hidden Jest failures):
  1. Round 1 (re-export): `RUNTIME_EDGE_KINDS` omitted `re-export` → value re-export cycles misclassified as mixed; + 2 EOF blank-line `git diff --check` failures.
  2. Round 2 (writable sandbox): `check-architecture-approvals.mjs` used `require()` in an ESM file (crash); `candidateDigest` did not exclude approval-request metadata (self-referential binding); unresolved internal imports mislabeled `external` (would hide cycles); `git ls-files 'src/**/*.ts'` glob missed `src/main.ts` (541 vs 542 files, made all `../../main` imports spurious-unresolved); default `verify` still ran the deprecated owner-guard.
  3. Round 3: `computeChangeScope` called without import (ReferenceError on pending request); default `verify` did not include `check:architecture-approvals`.
- **Independently verified by Codex:** all 9 gates incl. Jest (9 suites / 122 tests in the Phase 1 focused set), spot-checks A (fail-closed internal / vendored / external classification), B (digest excludes approvals), C (no require() / computeChangeScope imported).
- **Environment caveat:** browser/network-sensitive suites (capability-lab render, release-automation, model-popover) cannot run inside the Codex sandbox (EPERM on browser/port bind); verified green locally (6759 tests). These are pre-existing environment-sensitive tests, not Phase 1 work.

---

## Phase 2 — Graphify, module docs, CI, and documentation truth (Task 7–9)

- **PHASE_BASE:** `07b86e6c348381e3acaf5a840cf52467acd3323d`
- **PHASE_HEAD:** `2e962d4e48a5653f6decac51e2ef3dd78968c794`
- **Range:** `07b86e6c..2e962d4e` (7 commits, runtime source untouched)

### Commits
| SHA | Type | Subject |
|---|---|---|
| `4e0c6e00` | feat(graphify) | content-addressed graph-input digest (Task 7) |
| `88526478` | feat(gates) | module-doc owner-aware + scope-correct (Task 8) |
| `687d6ed6` | feat(governance) | unify CI/pre-push/verify + retire old owner-guard (Task 9) |
| `d5a6a2e9` | docs(devlog) | record Phase 2 |

### Acceptance status
- [x] Task 7: `check:graphify` passes iff artifacts identify the exact current source/config/tool envelope; comment-only changes conservatively require refresh; the stale `921a9742` metadata mismatch can no longer pass.
- [x] Task 8: multi-commit PR cannot hide an undocumented source change in an earlier commit; module-doc config strict; owner-boundary change requires owner-overview + mapped-doc update.
- [x] Task 9: local/hook/CI produce identical decision on the same normalized candidate tree; old GUARD_TARGETS / OWNER_GUARD_APPROVED / deprecated command removed; no workflow/hook still sets HEAD as empty diff range.

### Gate evidence (run on clean tree at PHASE_HEAD)
- `verify:architecture` → 4 PASS.
- `check:graphify` → content digest match ( regenerated after envelope changes).
- `check:module-docs` → OK; `check:module-doc-owner-impact` → PASS.
- Infrastructure Jest → 17 suites / 157 tests (owner-guard-lib suite retired).
- Full `npm test` → 6738 tests.
- lint 0/0, typecheck, build all green.

### Codex independent review — APPROVED
- **Reviewer:** Codex CLI (gpt-5.6-sol), writable sandbox.
- **Verdict:** **APPROVED** (Critical 0, Important 0, Minor 0).
- **Review-fix rounds:** Three rounds found and fixed real issues:
  1. Round 1 (6 Important): graphify version probe used system python3 (no graphify) → 'unknown'; `git ls-files src/` missed untracked files; owner-impact gate missed manifest-only boundary changes; default `verify` still serial (not the unified runner); CI push used origin/main not event.before; old OWNER_GUARD tokens lingered in comments.
  2. Round 2 (1 Important): listTsconfigs only name-matched, did not resolve the `extends` chain; digest library itself was outside the envelope.
  3. Round 3 (2 Important): `verify:architecture` omitted `check:architecture-approvals`; `plugin-package.yml` ran verify without event base.
- **Independently verified:** all 10 gates incl. canary (comment-add fails graphify, restore passes), 5/5 architecture gates, 124/124 focused tests, zero src change, full owner-guard retirement (gate 10 zero-match).
- **Deferred (non-blocking, owner: Phase 6):** `.gitea/workflows/plugin-package.yml` is a mirror that also runs `npm run verify` without event base; the canonical `.github/workflows/plugin-package.yml` is fixed. Phase 6 doc/link sweep will reconcile the mirror.

---

## Phase 3 — Diagnostics vertical slice (Task 10–13)
- **PHASE_BASE:** `2e962d4e48a5653f6decac51e2ef3dd78968c794`
- **Status:** unblocked; Phase 2 APPROVED. This is the FIRST runtime-change phase.

### Task 10 — Characterize the three-backend diagnostics contract — APPROVED
- **Range:** `2e962d4e..05bdf53e` (7 commits, runtime source untouched — characterization only).
- **Commits:**
  | SHA | Type | Subject |
  |---|---|---|
  | `fb1aa03a` | test(diagnostics) | characterize three-backend diagnostics contract (Task 10) |
  | `013fde93` | test(diagnostics) | strengthen characterization per Codex round-1 review |
  | `56cdc253` | fix(test) | dispose created trace services + raise timeouts |
  | `f8304f03` | fix(test) | resolve Codex round-2 review findings |
  | `8e950166` | fix(test+docs) | resolve Codex round-3 review findings + correct Phase 2/3 SHA |
  | `e26fa61e` | fix(test) | resolve Codex round-4 review findings |
  | `3583ca5d` | fix(test) | resolve Codex round-5 review findings |
  | `05bdf53e` | fix(test) | resolve Codex round-6 review findings |
- **Codex independent review — APPROVED** (7 rounds; Critical 0, Important 0, Minor 0).
  - Reviewer: Codex CLI (gpt-5.6-sol), writable sandbox (workspace-write) so Jest + negative mutations could run.
  - Round 1–6 each returned CHANGES REQUESTED with real defects (tautological canaries, false-passing source contracts, storage races, unbounded method slices, incomplete option/header pinning). Round 7 APPROVED.
  - Independently verified: all prescribed negative mutations fail (Codex removed lines/calls in isolated temp copies and confirmed the tests catch them); all 8 plugin module keys individually pinned; 75/75 tests pass; zero src/ changes in range.
- **Acceptance status:**
  - [x] construction options, dynamic knownSecrets, enabled/disabled, dispose/flush ordering pinned (incl. the OpenCode static-snapshot vs Claude/Codex dynamic-getter asymmetry).
  - [x] main.ts construction/injection/dispose wiring points pinned (field declarations, construction order, tracePort injection, onunload void+catch order, all 5 option keys × 3 services with real values).
  - [x] header/menu/send claim/cancel, tab-cleanup capture cancel, fail-closed behavior; delete-conversation performs NO trace interaction (StorageService + ConversationMetadataCache + OpenCodianPlugin.deleteConversation).
  - [x] secret/path canaries for disk, console, report, exported bundle (incl. [REDACTED] presence proof).
  - [x] five attachTabbed shells + six debug secondary tabs (registry) + legacy attach Codex omission + backend block sub-method calls + exact DEBUG_MODULE_GROUPS pinning.
  - [x] plugin export source-structure contract (filename pattern, utf-8 encoding, build-then-write ordering, full report header, LF join); per-backend export/flush ordering asymmetry (Codex/Claude flush-before-build, OpenCode no pre-flush).
- **Gate evidence (run on clean tree at 05bdf53e):** all 15 verify gates green; 75 characterization tests pass; lint 0/0.
- **Runtime files changed:** none (characterization only). No Test Vault deployment required.

### Task 11 — Introduce DiagnosticsRuntimeCoordinator — APPROVED (with documented sandbox exception)
- **Range:** `0ce55280..479f3c31` (7 commits, runtime source changed — FIRST runtime move of Phase 3).
- **Commits:**
  | SHA | Type | Subject |
  |---|---|---|
  | `36bf55fc` | refactor(diagnostics) | centralize runtime composition in DiagnosticsRuntimeCoordinator (Task 11) |
  | `587932f6` | fix(diagnostics) | round-1: bootstrap-timing getter + injected logger scope |
  | `903d5681` | fix(diagnostics) | round-2: construction-failure leak + complete redaction tests + dispose order |
  | `173452d7` | fix(diagnostics) | round-3: dispose teardown flush + doc accuracy |
  | `35533159` | fix(diagnostics) | round-4: awaitable dispose() for deterministic teardown |
  | `93a870a8` | fix(diagnostics) | round-5: stale dispose docs + bootstrap test leak |
  | `479f3c31` | fix(test) | round-6: raise bootstrap afterEach timeout for coordinator dispose |
- **Codex independent review — APPROVED (7 rounds; sandbox exception documented).**
  - Reviewer: Codex CLI (gpt-5.6-sol), writable sandbox.
  - Rounds 1–6 each returned CHANGES REQUESTED with real defects (Critical: bootstrap-timing getter throw breaking optional chaining; logger scope byte change; construction-failure service leak; fire-and-forget dispose teardown race; stale docs). Round 7: the focused command (92/92) passes clean 3× in Codex's sandbox; all negative mutations caught; static review clean. The sole remaining "failure" is Codex's sandbox EPERM/SIGSEGV on environment-sensitive Puppeteer/socket tests (pre-existing, documented in Phase 0/1 ledger, not Task 11 work; Codex explicitly stated these "do not implicate commit 479f3c31").
  - Independently verified by Codex: zero direct `new *SessionTraceService` in main.ts; coordinator construction order + all option getters correct; dispose awaits each backend sequentially (opencode→codex→claude) with per-backend .catch + injected logger; construction-failure try/catch disposes partial services; all negative mutations (option swap, order swap, await removal, empty knownSecrets, throwing getter, logger removal) fail their tests.
- **Acceptance status:**
  - [x] main.ts has zero direct `new *SessionTraceService`.
  - [x] Runtime behavior + redaction byte-for-byte compatible at public boundaries (Task 10 characterization passes; coordinator behavior suite catches swapped options).
  - [x] Coordinator exposes typed backend ports (no generic mutable service map).
  - [x] Dispose ordering preserved (sequential await; main.ts onunload `void`).
  - [x] Bootstrap-timing semantics preserved (getters return undefined pre-bootstrap, matching prior uninitialized fields).
- **Gate evidence (run on clean tree at 479f3c31):** local `npm run verify` 15/15 green (6855 tests); Codex sandbox focused command 92/92 clean 3× (sandbox full-verify blocked by pre-existing Puppeteer/socket EPERM, not Task 11).
- **Runtime files changed:** src/main.ts, src/app/diagnostics/** (deploy-relevant). Test Vault deployed (BUILD_ID main.202607311224).

### Task 12–13 — pending
- **Status:** blocked on Task 11 (now unblocked).

## Phase 4–6
- **Status:** blocked on preceding phase APPROVED.
