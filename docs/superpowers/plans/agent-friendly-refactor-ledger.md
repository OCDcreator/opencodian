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
- **Status:** Phase 3 Tasks 10–13 are **CLOSED / APPROVED** at `e0a008a3`; Phase 4 has not started and was not entered.

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

### Task 12 — Introduce ChatDiagnosticsCoordinator — APPROVED
- **Range:** `7b577e98..80421a8d` (5 commits, runtime source changed).
- **Commits:**
  | SHA | Type | Subject |
  |---|---|---|
  | `c1964e26` | test(diagnostics) | pin OpenCode chat behavior before Task 12 |
  | `3616886d` | refactor(diagnostics) | centralize OpenCode chat diagnostics |
  | `b73754d6` | refactor(diagnostics) | centralize Codex chat diagnostics |
  | `55dc1804` | refactor(diagnostics) | centralize Claude chat diagnostics |
  | `80421a8d` | fix(architecture) | address Task 12 review findings |
- **Sol independent review — APPROVED (2 rounds).**
  - Round 1 returned **CHANGES REQUESTED** with 2 Important findings: `ChatDiagnosticsCoordinator` was incorrectly owned by `feature.chat-shell` without `diagnostics-safety`; the constructor-cleanup test used an arbitrary 20 ms wait and could miss the actual partial OpenCode disposal promise.
  - Repair commit `80421a8d` moved the coordinator to `feature.chat-diagnostics`, updated the owner manifest, owner overview, focused tests, and inspector regression, and replaced the fixed wait with deterministic interception/await of the real partial-disposal promise. Production fire-and-forget behavior stayed unchanged.
  - Round 2 final reviewer: Codex CLI `gpt-5.6-sol`, session `019fb73c-9c33-7fd1-9761-bf52100ea350`; literal decision **APPROVED**. Findings: Blocker 0, Important 0; two non-blocking Minors (one-shot diagnostics factory stored as a field; a `CodexDiagnosticsHost` test reaches through private layers). Spec findings: none.
- **Acceptance status:**
  - [x] Diagnostics failures do not escape chat hooks.
  - [x] `OpenCodianView` has zero direct backend trace service/store/report-builder access.
  - [x] The coordinator exposes backend operations rather than a mutable service map; deletion remains zero trace interaction.
  - [x] OpenCode → Codex → Claude landed as individually green slices.
- **Gate evidence:** root `npm run verify` passed all 15 gates, 716/716 suites, 6893/6893 tests, production build, and generated styles. The root canonical 22-suite matrix passed three consecutive parallel runs without ENOENT or late Jest logging. The final Sol reviewer independently ran 22/22 suites (327/327 tests), focused 8/8 suites (167/167 tests), and historical snapshots of OpenCode 101, Codex 61, and Claude 111 tests. All four negative mutations (owner drift, missing partial cleanup, escaping fail-closed claim, deletion trace interaction) failed as required and were restored.
- **CodeGraph evidence (depth 2, from Sol):** claim 3 direct callers / 10 nodes; deletion 3 / 7; constructor 0 / 1.
- **Deployment:** runtime slices were deployed to the macOS Test Vault with `BUILD_ID main.202607311541`; dist/Test Vault hashes matched at deployment time. The repair commit changed no production source and required no new deployment. Later verification rebuilt the current `dist/main.js` as `main.202607311612`, so this ledger records the verified-at-deployment evidence and does not claim a current byte-match with the still-deployed `1541` file.

### Task 13 — Split backend debug panels into complete owners — APPROVED
- **Range:** `91fc3b7f..e0a008a3` (6 commits).
- **Commits:**
  | SHA | Subject |
  |---|---|
  | `4201793c` | `refactor(settings): extract OpenCode debug panel` |
  | `94cfdd75` | `refactor(settings): extract Codex debug panel` |
  | `2c2bd00f` | `refactor(settings): extract Claude Code debug panel` |
  | `74a4f422` | `docs(architecture): close Task 13 debug index gap` |
  | `cdebc97b` | `docs(settings): correct Task 13 port documentation` |
  | `e0a008a3` | `docs(settings): correct debug module ownership guidance` |
- **Sol independent review — APPROVED (4 rounds).**
  - Round 1: session `019fb7c9-69d4-7ec0-9abb-1f39bf238d1f`, HEAD `2c2bd00f`, **CHANGES REQUESTED**. Important findings: required aggregate module indexes were missing, and the owner overview omitted the Claude entrypoint/focused test. `74a4f422` added/synced the aggregate debug index, `docs/modules/README.md`, the owner overview, and the exact module-docs `docIgnore` closure.
  - Round 2: session `019fb7e9-8fa4-76b0-ace7-76381329de15`, HEAD `74a4f422`, **CHANGES REQUESTED**. `OpenCodianSettings.md` and `SettingsTabbedRenderer.md` inaccurately described three-port composition/factory ownership. `cdebc97b` corrected the port documentation.
  - Round 3: session `019fb7fa-2343-7293-9516-6159247108d4`, HEAD `cdebc97b`, **CHANGES REQUESTED**. Hard docs-sync breach: `SettingsDebugSection.md` still routed all future debug-module keys to the section instead of the actual owners. `e0a008a3` corrected the debug module ownership guidance.
  - Round 4: session `019fb80c-725d-7e10-9794-a8acd48cd73a`, range `91fc3b7f..e0a008a3`, literal **APPROVED**; Standards 0 findings, Spec 0 findings.
- **Acceptance status:**
  - [x] OpenCode, Codex, and Claude panels are complete owners for render/settings/status/actions/catalog lifecycle, use narrow typed settings/diagnostics ports and callbacks, and receive neither the full plugin nor a mutable service map.
  - [x] `SettingsDebugSection` retains the shared shell/router and platform/dialog/path/action/module helpers; it has zero direct backend trace-service/store/report-builder access.
  - [x] Claude console `debugChannels` remain separate from `sessionTrace.consoleChannels`.
  - [x] The legacy classic attach Codex omission is unchanged; the tabbed route still mounts Codex; `src/i18n` has zero Task 13 diff.
  - [x] The plugin export contract is byte-for-byte unchanged: base/HEAD `src/main.ts` and Task 10 contract blobs match; canonical order, LF, UTF-8, filename, and build-before-write remain pinned.
- **Gate evidence recorded after the final documentation repairs:**
  - Root full `npm run verify`: 15/15 gates PASS; 719/719 suites; 6907/6907 tests; lint 0 errors/0 warnings; typecheck, production build, and generated styles clean.
  - Final Sol focused gates: owner manifest 550/550; module docs 584/584; module-doc owner impact PASS; Graphify digest `79e7fb99d938edad83b7f6d9f9164d63475c400ec6c5c0153ff8a5a8967b2267`.
  - Final focused matrix: 14/14 suites, 187/187 tests. Intermediate slices: OpenCode 12/12 suites, 177/177 tests; Codex 13/13, 182/182; Claude 14/14, 187/187.
  - Four final Sol CodeGraph-bounded mutation proofs each followed fail → restore → pass with final SHA/Git blob/diff-clean restoration: Claude catalog removal (render direct method/function callers 0, impact depth 2, blast 2; 3/5 failed, restored 5/5); console/trace channel crossover (`addCodeChannelSettings` direct callers 1, depth 2, blast 3; 1/5 failed, restored 5/5); LF→CRLF (`buildDiagnosticReport` direct callers 3, depth 1, blast 5; 1/48 failed, restored 48/48); direct trace-service access in the `SettingsDebugSection` constructor (direct callers 0, depth 1, blast 1; 1/11 failed, restored 11/11).
  - At the implementation closure snapshot, affected scope was empty, staged/unstaged diffs were clean, and HEAD remained `e0a008a3`.
- **Test Vault evidence:** runtime code was deployed on macOS with BUILD_ID `main.202607311845`. Test Vault SHA-256: `main.js` `f0df3b4b420b50162e0e1c71467d64fbb9987858574a7d7f9cd60998d3f32440`; `manifest.json` `3a47461c4a27d35efbe7afde5be9c124e4a7599550d330626f81efb0f8c0be88`; `styles.css` `1e4aa7b41de2c2eadfb5ec7bbc7f6eac6256b795d4c7990b12848747b164e4a7`. The final three commits are docs/config only, so no redeployment was required; a later local `dist` BUILD_ID may differ and is not byte-equal evidence for the deployed runtime.

## Phase 4–6
- **Status:** Task 14 **CLOSED / APPROVED** at `6773dfa1`; Task 15 **CLOSED / APPROVED** at `b0e7c450`; Phase 4 **CLOSED / APPROVED**. Task 16 is **CLOSED / APPROVED** at `6b98d4c9`; Task 17 is **CLOSED / APPROVED** (convergence inventory, zero-source-change). Phase 5 Task 18 and Phase 6 remain not started. No push is claimed.

### Task 14 — Replace plugin-shaped seams with consumer-owned ports and move runtime orchestration — CLOSED / APPROVED
- **Range:** `73a30557..6773dfa1` (6 commits).
- **Commits:**
  | SHA | Type | Subject |
  |---|---|---|
  | `c58458c6` | `test(architecture)` | `characterize Task 14 plugin seams` |
  | `ae1088d9` | `refactor(storage)` | `replace plugin type with narrow port` |
  | `9f3e7731` | `refactor(chat)` | `narrow title generation plugin port` |
  | `2f1ae721` | `refactor(chat)` | `narrow view plugin port` |
  | `e2ca9d75` | `refactor(runtime)` | `move plugin orchestration to app layer` |
  | `6773dfa1` | `chore(architecture)` | `consolidate Task 14 shared snapshots` |

- **Sol independent review — APPROVED (2 rounds).**
  - Round 1: `/root/task14_review_r1` (gpt-5.6-sol) initially returned **CHANGES REQUESTED** on the old `d6e029db`: shared baseline/Graphify artifacts made the port commits reverse-merge-conflicting when selectively replayed.
  - After historical reorganization and shared-snapshot consolidation, fresh round 2 `/root/task14_review_r2` (gpt-5.6-sol) reviewed `6773dfa1` and returned literal **APPROVED**; Standards findings 0, Spec findings 0. The round-1 recalibration is not the final gate.

- **Acceptance status:**
  - [x] Four behavior commits (`ae1088d9`, `9f3e7731`, `2f1ae721`, `e2ca9d75`) each independently `git revert --no-commit` from final HEAD with exit 0, zero unmerged paths, and exact scope; shared snapshots remain separated from behavior.
  - [x] `src/core/**` → `main` runtime/type edges: 0; targeted Storage/View/Title → `main` direct edges: 0; View/Title plugin-class direct imports: 0.
  - [x] Old `core/runtime` → `features/chat` runtime edges: 0; new `app.runtime` owns both `OpenCodianView` and `UserMessageFooterRenderer`; runtime SCC: 0; type/mixed debt remains 4/12; `dependencyExceptions=[]`.
  - [x] Storage, title-generation, and chat ports are consumer-owned structural/type seams with no runtime forwarding, duplicated state, service locator, key/type lookup, or plugin-shaped mega-interface.

- **Gate evidence (fresh final closure snapshot):**
  - Focused matrix: 16/16 suites, 228/228 tests.
  - Full `npm run verify`: 15/15 gates; 723/723 suites; 6915/6915 tests; lint 0 errors/0 warnings; typecheck, production build, and generated styles clean.
  - Raw classified edges: 2574, unresolved 0; baseline generator parity: 2247/2247; owner manifest: 553/553; module docs: 587/587; Graphify digest: `c779838439a60328f69bb2282d972be3ecd384345ab3a70e69af0557f745065b`.
  - Three negative mutation proofs all fail → restore → pass: model reload call removal, Storage → `main.ts` type import, and core runtime → `OpenCodianView` runtime import. Final SHA values and status were restored clean.

- **CodeGraph evidence (depth 2):** `StorageService` constructor has 0 direct function/method callers, nodeCount 1; `TitleGenerationService` constructor has 0 direct function/method callers, nodeCount 1; `OpenCodianView` constructor has 0 direct function/method callers, nodeCount 1; `PluginRuntimeCoordinator` constructor has 0 direct function/method callers, nodeCount 1; `getOpenCodianViews` has 2 direct callers (`refreshOpenCodianViews`, `invalidateSlashCommandMenuCatalogs`), nodeCount 11.

- **Test Vault deployment:** BUILD_ID `main.202607312330`; source and macOS Test Vault hashes match: `main.js` `117d02e452af5cb9ea6c80b9e1b734f9ab84001d25e9c4af6468f19632dc9239`, `manifest.json` `3a47461c4a27d35efbe7afde5be9c124e4a7599550d330626f81efb0f8c0be88`, `styles.css` `1e4aa7b41de2c2eadfb5ec7bbc7f6eac6256b795d4c7990b12848747b164e4a7`. No push is claimed.

### Task 15 — Create a chat runtime composition owner — CLOSED / APPROVED
- **Range:** `ccbd758a..b0e7c450` (inventory + characterization + code move + 8 codex review rounds).
- **Inventory (MANDATORY BLOCK, plan step 2):** `docs/superpowers/plans/task15-chat-runtime-composition-inventory.md` — APPROVED by codex/terra (gpt-5.6-terra) over 4 independent read-only review rounds (2 Critical + 4 Important + 1 Minor → 5 Minor → APPROVED). The inventory lists every concrete coordinator constructor/import to move, the exact retained ItemView responsibilities, the 26-step onClose disposal-order contract, the `view: this` → `TabRuntimeViewSource` god-object guard (§2.2c), and the rollback story.

- **Implementation:** new `src/features/chat/runtime/ChatRuntimeComposition.ts` composition owner. Relocated the four `create*RuntimeWiring()` methods + `createBackgroundTaskInfrastructure` + `createSendPipelineHostDependencies` + the constructor's inline identity/render constructions out of `OpenCodianView`. The view passes itself as the structural `ChatRuntimeCompositionHost` and destructures the assembled `ChatRuntime` into its existing private fields. Faithful `this.→host.` rewrite; cross-phase coordinators threaded as compose() locals; lazily-read view state resolves via `host.X`; synchronously-invoked closures (e.g. `createSendPipelineShellPort`) read surface-built locals. `view: this` → narrow `tabRuntimeViewSource` getter.

- **Codex independent review — APPROVED (8 rounds; gpt-5.6-terra, workspace-write sandbox).**
  - Rounds 1–7 returned CHANGES REQUESTED with real defects, each fixed:
    1. Round 1 (3 Critical): eager `host.X` capture of compose-set coordinators in interaction/send-pipeline → routed through surface/conversation/background locals; `host.showQuestionDialog` forwarded to a nonexistent view method → inlined via questionRuntimeServices local; fabricated baselineEdgeId → corrected.
    2. Round 2 (3 Critical): conversationIdentityRuntime eager capture → threaded as local; tabRuntimeViewSource mutation not caught → added source-contract test; baselineEdgeId truncated → set to full SCC id.
    3. Round 3 (1 Critical): mutation-run review prompt omitted ChatRuntimeComposition.test.ts → added; the guards were verified to catch the mutations directly.
    4. Round 4 (regression + 4 Important): **the round-1 sed delete (1956–2527) had accidentally removed 5 view-private methods** (`getCurrentConversationForkService`, `getCurrentConversationBranchService`, `routeConversationRevertSession`, `routeConversationUnrevertSession`, `routeConversationForkSession`) that sat between the wiring methods — restored verbatim. Also: owner deps added to `feature.chat-runtime`; SCC exception reason corrected; silent no-op render path restored to direct call.
    5. Rounds 5–7: removed stale host members; converted type-only coordinator imports to `import type`; tightened all 35 host-factory return types from `unknown` to concrete host-interface types (removed ~31 as-never casts).
  - Round 8: literal **APPROVED**, 0 findings. Independently verified: focused suite 40/40 passing; typecheck + lint clean; worktree clean; all three required negative mutations (shouldUseAboveInputQuestionDock, tabRuntimeViewSource, createSendPipelineShellPort) failed as expected and were restored; dependency-direction 0 new reverse edges; architecture-cycles 0 runtime SCCs.

- **Acceptance status:**
  - [x] `src/features/chat/runtime/ChatRuntimeComposition.ts` created; every concrete constructor/import named in the approved move inventory is absent from `OpenCodianView`'s runtime assembly and owned by the composition owner.
  - [x] `OpenCodianView` no longer constructs the chat coordinators inline; it calls `new ChatRuntimeComposition(this as Host).compose()` and destructures.
  - [x] The view does not retrieve services from composition by key/type (returns a struct; structural host). `assembleConversationTabRuntime` receives the narrow `TabRuntimeViewSource`, never the full view.
  - [x] No new thin per-callback files; tab canonical state retained by the view; onClose 26-step disposal order unchanged (owner owns no disposal).
  - [x] View lifecycle tests pass; `ChatRuntimeComposition.test.ts` (plan §768) present with mutation guards.

- **Architecture baseline:** the composition owner inherits membership in the pre-existing OpenCodianView/settings/main.ts mixed SCC because it value-imports coordinators already in that SCC (structural debt inheritance, NOT a new runtime cycle or reverse edge). Recorded as `dependencyException` `task15-chat-runtime-composition-scc-member` (full SCC id, evidence, Phase 5+ retirement phase) and the baseline regenerated via the dedicated `update:architecture-baseline` command (the plan's designed path, §247-254). Baseline counts unchanged: 0 runtime SCC, 4 type-only, 12 mixed.

- **Gate evidence (clean tree at b0e7c450):** full `npm run verify` 15/15 gates PASS; 725/725 suites, 6926/6926 tests; lint 0 errors/0 warnings; typecheck, production build, generated styles clean; 5/5 architecture gates PASS; owner manifest 554/554; module docs 588/588; graphify fresh.

- **Test Vault deployment:** BUILD_ID `main.202608011240`; source and macOS Test Vault `main.js` BUILD_ID match. No push is claimed.

### Phase 4 closure
- **Phase 4 (Task 14 + Task 15): CLOSED / APPROVED** at `b0e7c450`. Phase 5 Tasks 16 and 17 are now closed below; Task 18 (settings inventory) and Phase 6 (Task 19–20: documentation retirement) remain not started.

## Phase 5 — Claude adapter ownership inventory and deferred child plan (Task 16–18)

### Task 16 — Inventory `ClaudeCodeAdapter` and record deferred owner slices — CLOSED / APPROVED
- **Range:** `3f464006..6b98d4c9` (1 docs-only commit; no source, production, test, manifest, or generated-artifact changes).
- **Plan artifact commit:** `6b98d4c9b097dbaa8bc2a9022c599d3865d8568c` (parent `3f46400636429fea6de83a94a394dc47b7966c50`), subject `docs(architecture): record Claude adapter owner plan`.
- **Sol independent review — APPROVED (7 rounds).** Rounds 1–6 returned **CHANGES REQUESTED**; fresh round 7 returned the literal **APPROVED** result. This records the completed review result only; it does not authorize implementation.
- **Scope/result:** all proposed session/runtime, SDK-option, and trace moves remain **deferred**. The inventory is explicitly nonexhaustive; unresolved query/SDK/CodeGraph root and caller ambiguity is a hard stop, and no candidate is called implemented. `core.backend` remains the sole owner and the plan's manifest delta is zero.
- **Unchanged contracts:** the Task 15 `task15-chat-runtime-composition-scc-member` exception remains untouched; incoming Claude-backend `main.ts` type-import metric remains **0 → 0**; no `main.ts` composition reduction is claimed.
- **Gate evidence:** Sol independently rechecked **43/43** material finite-depth CodeGraph rows at depth 2 and its focused matrix passed **3 suites / 197 tests**. It confirmed no `src/` or test diff, owner/module-doc/Graphify checks, and unique valid future manifests. The expected untracked-plan `git diff --no-index --check` exit 1 produced no whitespace diagnostics. Root `npm run verify` passed **15/15 gates**, **725/725 suites**, **6926/6926 tests**; `npm run check:module-docs` passed **588/588**, `npm run check:graphify` passed, and `npm run check:devlog-order` passed **508 sections**.
- **Acceptance status:** [x] dated child plan committed; [x] no production/test implementation or manifest mutation; [x] deferred cards retain explicit re-entry conditions and hard stops; [x] governance evidence recorded. Tasks 17–18 remain pending and must not be inferred from this closure.

### Task 17 — Inventory `OpenCodeService` and author its convergence plan — CLOSED / APPROVED (zero-source-change)
- **Range:** single docs-only artifact; no source, production, test, manifest, barrel, generated-graph, ledger, devlog, or approval change beyond this plan artifact and its own governance record (devlog + this ledger entry).
- **Plan artifact:** `docs/superpowers/plans/2026-08-01-opencode-service-convergence.md`.
- **Decision: no implementation slice is approved.** OpenCodeService's remaining seams all join a complete SDK-first/legacy lifecycle, an active listener/stream lifecycle, or the sole canonical `OpenCodeSessionStateStore`. Until a later inventory pins both transport parity and exclusive state truth, extracting any one seam would duplicate a cache/listener, expose a mutable client/map, or add a runtime forwarding shim — all hard stops. Existing thick coordinators already own lifecycle, session, streaming, sync, question/permission, catalog, and capability units.
- **Owner contract (zero manifest delta):** `core.opencode` remains the sole owner; before-state and after-state manifests are identical (`include: src/core/opencode/**`, `delegatesTo: core.opencode-diagnostics`). The Task 15 `task15-chat-runtime-composition-scc-member` exception is unchanged. Each of the four deferred cards (A: assembly/lifecycle/SDK facade/legacy transport; B: session/message/part/sync/stream; C: prompt/questions/permissions/session-control; D: catalog/config/MCP/capability/action/diagnostics) is a same-owner core.opencode → core.opencode convergence/defer decision, retained through Phase 5 with hard expiry **2026-09-01**; expiry requires a fresh complete inventory + independent Sol read-only review + merge checkpoint, or an explicitly approved deferred-owner/expiry extension before any source move.
- **Public-boundary preservation:** `OpenCodeService.sdk` (public readonly `OpenCodeSdkFacade`) stays public; consumers `OpenCodianView`, `MessageSendPreparationService`, `ChatRuntimeComposition`, `SettingsAgentsSection`, `SettingsCommandsSection`; barrel `src/core/opencode/index.ts` keeps exporting `OpenCodeService`. The plan prohibits only leaking an underlying raw SDK client / mutable catalog state / service locator; it does not privatize/remove/migrate `service.sdk`.
- **Mandatory future commit topology:** every deferred card mandates a C (characterization, retained) → B (behavior, independently reversible) → G (graph snapshot) sequence; rollback is `git revert --no-edit G; git revert --no-edit B; npm run graphify:update:src; npm run check:graphify`. A changed manifest/config/barrel or a digest not matching restored source is an abort, not permission to amend B.
- **CodeGraph evidence:** 21 query/callers/depth-2-impact rows root-confirmed (file/line) with direct function/method callers (excluding file nodes); multi-definition query, root divergence, cross-card radius, and same-name collisions are treated as hard stops. Re-entry must rerun `codegraph query`/`callers`/`impact --depth 2` and record root id/file/line + direct typed callers + nodes/edges before extending any matrix.
- **Current test matrix:** **21/21 suites, 197/197 tests** passing (10 service/lifecycle suites + 11 owner-unit suites).
- **Incoming `main.ts` metric:** baseline **0** → target **0** for OpenCode-domain imports; no main composition reduction claimed.
- **Acceptance status:** [x] dated convergence plan authored; [x] zero production/test/manifest/barrel/generated-graph change; [x] no subowner transfer (same-owner defer with explicit re-entry conditions and hard expiry); [x] public `service.sdk` boundary documented as preserved. Task 18 (settings plugin-type coupling) remains pending; this closure does not close Phase 5.
