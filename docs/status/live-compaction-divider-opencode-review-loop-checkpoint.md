# Live Compaction Divider OpenCode Review Loop Checkpoint

Track each bounded `opencode run` round here so a truncated session can resume safely.

## 2026-04-23 23:56:00 +08:00
- Current branch: `feat/live-compaction-divider-opencode-review-loop`
- OpenCode CLI ask: preflight only; verify repo state, create dedicated branch, seed checkpoint.
- Changed: created this checkpoint file.
- Reviewed: confirmed current branch switched off `main`; confirmed pre-existing untracked spec/plan files remain untouched; confirmed `opencode 1.14.21` is available.
- Problems found: none.
- Exact next corrective prompt: first bounded test-only round; no corrective prompt yet.
- Verification: passed (`git status --short --branch`, branch switch, `opencode --version`, `opencode session list --format json -n 5`).

## 2026-04-24 00:13:00 +08:00
- Current branch: `feat/live-compaction-divider-opencode-review-loop`
- OpenCode CLI ask: bounded slice 1 test-only round for live compaction divider + streaming summary UX.
- Changed: modified `tests/unit/core/opencode/OpenCodeMessageNormalizationMapper.test.ts`; added `tests/unit/features/chat/ConversationRenderRuntime.test.ts`; added `tests/unit/features/chat/OpenCodianView.test.ts`; also created stray zero-byte file `nul`.
- Reviewed: checked `git diff --stat`; inspected all touched test files; ran targeted tests for mapper/runtime/view slice.
- Problems found:
  - mapper assertions still target current runtime incorrectly (`content` still expected non-empty while asking for structured divider metadata).
  - `OpenCodianView.test.ts` imports `ConversationTabLifecycleRecoveryCoordinator` as a type-only import, so it fails at runtime.
  - the new view test is scoped too broadly; the approved first slice should prefer existing owners like `ConversationTabRuntimeCoordinator`, `renderGroups`, and `ConversationSyncBridge.compaction`.
  - no coverage yet for "divider must not be a notice card" or for `session.compacted` staying on compaction render semantics.
  - stray file `nul` must be removed.
- Exact next corrective prompt: continue same session; keep this slice test-only. Remove the stray `nul` file. Do not touch production code yet. Fix the failing-test slice so it is review-clean and bounded: (1) in `OpenCodeMessageNormalizationMapper.test.ts`, assert a structured `compactionDivider` render concept and hidden `compaction_continue`, with content expectations matching the approved design; (2) replace the broad `OpenCodianView.test.ts` with narrower tests in the correct owners—`renderGroups`, `ConversationRenderRuntime` incremental-update helper, `ConversationTabRuntimeCoordinator`, and `ConversationSyncBridge.compaction`—instead of a view-level monolith; (3) ensure the tests explicitly guard that compaction is not modeled as a notice card and that live-summary expectations apply only to compaction summaries; (4) stop once the tests fail for the intended missing behavior, with no production code changes.
- Verification: failed (`npm test -- --runTestsByPath ...` exposed mapper assertion mismatch and runtime import errors).

## 2026-04-24 00:23:00 +08:00
- Current branch: `feat/live-compaction-divider-opencode-review-loop`
- OpenCode CLI ask: cleanup the failing-test slice, stay test-only, remove `nul`, narrow tests to correct owners.
- Changed: removed `tests/unit/features/chat/OpenCodianView.test.ts` and `nul`; updated `tests/unit/core/opencode/OpenCodeMessageNormalizationMapper.test.ts`, `tests/unit/features/chat/renderGroups.test.ts`, `tests/unit/features/chat/ConversationTabRuntimeCoordinator.test.ts`, `tests/unit/features/chat/ConversationSyncBridge.compaction.test.ts`; kept `tests/unit/features/chat/ConversationRenderRuntime.test.ts`.
- Reviewed: reopened all touched tests; reran the targeted slice suite with `node scripts/run-jest.js ...`.
- Problems found:
  - `tests/unit/core/opencode/OpenCodeMessageNormalizationMapper.test.ts` has duplicated blocks / mismatched braces and fails TypeScript parse.
  - `tests/unit/features/chat/ConversationTabRuntimeCoordinator.test.ts` uses a fake `SessionActivityStatus` variant (`type: 'compacting'`) that the current contract does not support; that makes the test awkward for this first slice.
  - the slice still needs one explicit negative assertion that non-compaction summaries do not get the special live-summary expectation.
- Exact next corrective prompt: continue the same session and stay test-only. Fix `tests/unit/core/opencode/OpenCodeMessageNormalizationMapper.test.ts` so it parses cleanly and contains each compaction test only once. In `tests/unit/features/chat/ConversationTabRuntimeCoordinator.test.ts`, remove the fake `type: 'compacting'` discriminant test; replace it with a review-clean regression around existing busy close protection, or another compaction-adjacent test that compiles against today’s contracts. Add one narrow test in the runtime/render slice that explicitly guards that ordinary non-compaction summaries do not get the special live-summary path. Do not touch production code. Stop when the targeted test suite fails only for intended missing behavior, not syntax/type mistakes.
- Verification: failed (`node scripts/run-jest.js tests/unit/core/opencode/OpenCodeMessageNormalizationMapper.test.ts tests/unit/features/chat/renderGroups.test.ts tests/unit/features/chat/ConversationRenderRuntime.test.ts tests/unit/features/chat/ConversationTabRuntimeCoordinator.test.ts tests/unit/features/chat/ConversationSyncBridge.compaction.test.ts`).

## 2026-04-24 00:31:00 +08:00
- Current branch: `feat/live-compaction-divider-opencode-review-loop`
- OpenCode CLI ask: final cleanup for the red test slice; keep test-only; eliminate syntax/type noise and leave only intentional missing-behavior failures.
- Changed: cleaned `tests/unit/core/opencode/OpenCodeMessageNormalizationMapper.test.ts`; kept narrow compaction tests in `tests/unit/features/chat/renderGroups.test.ts`, `tests/unit/features/chat/ConversationRenderRuntime.test.ts`, `tests/unit/features/chat/ConversationTabRuntimeCoordinator.test.ts`, and `tests/unit/features/chat/ConversationSyncBridge.compaction.test.ts`.
- Reviewed: reran the targeted suite locally after the worker round and confirmed only mapper missing-behavior assertions fail.
- Problems found:
  - no more syntax/type noise in the test slice.
  - remaining failures are intentional: mapper does not yet emit structured `compactionDivider` metadata.
- Exact next corrective prompt: bounded production slice for the render model only. Implement `ChatMessage` compaction divider metadata and any minimal summary-kind metadata needed for this slice. Map user `part.type === "compaction"` into structured metadata, keep `compaction_continue` hidden, and do not render compaction as a notice card or plain markdown text. Do not touch live divider insertion, tab bridge, or summary streaming yet except for the minimum types needed by the mapper tests.
- Verification: passed for review shape; failed intentionally for missing behavior (`node scripts/run-jest.js tests/unit/core/opencode/OpenCodeMessageNormalizationMapper.test.ts tests/unit/features/chat/renderGroups.test.ts tests/unit/features/chat/ConversationRenderRuntime.test.ts tests/unit/features/chat/ConversationTabRuntimeCoordinator.test.ts tests/unit/features/chat/ConversationSyncBridge.compaction.test.ts`).

## 2026-04-24 00:42:00 +08:00
- Current branch: `feat/live-compaction-divider-opencode-review-loop`
- OpenCode CLI ask: bounded production slice for compaction render model / normalization only.
- Changed: updated `src/core/types/chat.ts`, `src/core/types/index.ts`, `src/core/opencode/OpenCodeMessageContextOmoAssembler.ts`, `src/core/opencode/OpenCodeMessageNormalizationMapper.ts`, matching module docs, and refreshed mapper tests to the new structured behavior.
- Reviewed: diff is scoped to types + mapper/assembler + mapped docs; targeted compaction suite passes; `check:module-docs` passes.
- Problems found:
  - the worker broadened scope by updating docs earlier than planned and by running full `verify`; the code/docs themselves look aligned, so no revert is needed.
  - lint still reports 2 warnings in `tests/unit/core/opencode/OpenCodeMessageNormalizationMapper.test.ts` (`max-lines` / `max-lines-per-function`), which violates repo guardrails for a clean merge.
- Exact next corrective prompt: keep the production code unchanged. Do a bounded cleanup round that moves the newly added compaction mapper tests into a dedicated focused test file (for example `tests/unit/core/opencode/OpenCodeMessageNormalizationMapper.compaction.test.ts`) or otherwise reduces `OpenCodeMessageNormalizationMapper.test.ts` below the lint thresholds. Preserve the same assertions, keep the targeted suite green, and stop once `npm run lint -- --quiet` is clean.
- Verification: passed (`node scripts/run-jest.js ...`, `npm run check:module-docs`); failed guardrail cleanliness on lint warnings (`npm run lint -- --quiet`).

## 2026-04-24 00:47:00 +08:00
- Current branch: `feat/live-compaction-divider-opencode-review-loop`
- OpenCode CLI ask: bounded warning-cleanup round only; keep production code unchanged and split the new compaction mapper tests into a dedicated file.
- Changed: extracted compaction mapper assertions into `tests/unit/core/opencode/OpenCodeMessageNormalizationMapper.compaction.test.ts`; shrank `tests/unit/core/opencode/OpenCodeMessageNormalizationMapper.test.ts`; kept the mapper production slice unchanged.
- Reviewed: reran the focused compaction suite including the new test file; reran quiet lint locally.
- Problems found: none for this slice. The earlier early-doc-sync scope drift is acceptable because the mapped docs now match the production change and guardrails are green.
- Exact next corrective prompt: bounded divider/render slice. Implement the lightweight compaction divider render path and minimal i18n/style hooks, plus the narrow render/runtime behavior needed so compaction divider messages render as in-chat dividers rather than ordinary user markdown. Do not implement live `compactingAt` injection or tab bridge yet unless the divider render path strictly needs shared plumbing.
- Verification: passed (`node scripts/run-jest.js tests/unit/core/opencode/OpenCodeMessageNormalizationMapper.test.ts tests/unit/core/opencode/OpenCodeMessageNormalizationMapper.compaction.test.ts tests/unit/features/chat/renderGroups.test.ts tests/unit/features/chat/ConversationRenderRuntime.test.ts tests/unit/features/chat/ConversationTabRuntimeCoordinator.test.ts tests/unit/features/chat/ConversationSyncBridge.compaction.test.ts`, `npm run lint -- --quiet`).
