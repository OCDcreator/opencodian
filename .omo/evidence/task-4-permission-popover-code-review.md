# Task 4 Permission Popover Code Review

Review range: `2a1f05d198dc6febd6f0f67a73da0ca077f9e76d..183ba38cce62d597fcf50184c76f5d557313278c`

## Verdict

- Spec compliance: **FAIL**
- `codeQualityStatus`: **BLOCK**
- `recommendation`: **REQUEST_CHANGES**
- `reportPath`: `.omo/evidence/task-4-permission-popover-code-review.md`

The shared frame, roving focus, successful-selection focus return, boolean host seam, generated CSS, and module documentation are present. However, the real backend write paths do not uphold the new failed-write contract, and the selected-row semantic colors conflict with retained mode-level icon/check colors.

## Findings

### CRITICAL

None.

### HIGH

1. **A failed backend write can change the source-of-truth mode even though the card reports failure and visually keeps the old selection.**

   - `src/features/chat/OpenCodianView.ts:4713-4736` assigns `plugin.settings.permissionMode = mode` before persistence/restart, then returns `false` from the catch without restoring the previous mode. If save, health-check, stop, or start fails, `PermissionModeSelectorCoordinator` keeps the card open but `host.getPermissionMode()` now returns the attempted mode. The DOM remains on the old row only until the next locale/display refresh, after which it jumps to the supposedly failed mode.
   - `src/features/chat/services/ChatSelectionControlsCoordinator.ts:97-111` and `:124-139` likewise mutate Claude/Codex settings before awaited persistence/adapter work. Rejections are not converted to the promised boolean failure outcome and the previous value is not restored, so the event-handler-launched promise can reject while settings are already mutated.
   - `src/features/chat/services/PermissionModeSelectorCoordinator.ts:498-505` assumes `false` means the host state stayed unchanged. The new tests use mocks that return `false` without mutating state (`tests/unit/features/chat/claudePermissionModeSelector.test.ts:178-195`, `tests/unit/features/chat/ChatSelectionControlsCoordinator.test.ts:369-380`), so they do not exercise the real failure ordering.

   This violates the approved contract that a failed write leaves both the popover and current selected state intact. The write owners need a transactional outcome: retain the previous mode, catch expected persistence/adapter/restart failures, restore the previous source-of-truth value as needed, and return `false`; tests should fail if the host value changes on failure.

### MEDIUM

1. **The new semantic selected row can show contradictory icon/check colors.**

   - `src/features/chat/services/PermissionModeSelectorCoordinator.ts:453-460` correctly classifies YOLO as `danger` and Plan as `safe`.
   - `src/style/components/permission-mode-selector.css:323-333` therefore renders the YOLO selected shell in error red and Plan in success green, but retained rules at `:399-418` render YOLO's check/icon in success green and Plan's check/icon in error red. Claude `bypassPermissions` and Codex `danger-full-access` receive the red row shell but keep generic muted/accent icon/check colors.

   This conflicts with the design requirement that the selected row **and icon** retain one backend/mode semantic mapping, and it produces mixed safety signals on the most sensitive choices. Add semantic icon/check overrides keyed by `data-permission-semantic` and focused tests for OpenCode YOLO/Plan plus Claude/Codex danger modes.

### LOW

1. **The changed permission coordinator remains oversized.** `src/features/chat/services/PermissionModeSelectorCoordinator.ts` is about 456 nonblank/non-comment lines after this task. The added frame/navigation behavior is cohesive and reuses the shared helpers, so no speculative split is recommended inside this review, but it violates the `omo:programming` 250-LOC perspective and raises future maintenance cost.

## Scope and quality review

- Frame ownership remains presentation-only; backend catalogs and persistence stay in the existing owners.
- Keyboard opening focuses the selected option, arrows wrap through the shared DOM helper, Enter reuses the click path, and Escape restores trigger focus (`PermissionModeSelectorCoordinator.ts:237-267`, `:475-520`).
- Option accessibility attributes and roving `tabIndex` are implemented (`PermissionModeSelectorCoordinator.ts:386-395`, `:425-440`).
- The Claude-specific outer-card exception and duplicate common row geometry were removed; width/min-width/safe-inset ownership remains unchanged.
- No new `any`, non-null assertion, suppression, prompt/prose assertion, deletion-only test, tautological test, or unnecessary production parsing/normalization was introduced in the Task 4 diff.

## Skill-perspective check

- `omo:programming`: **ran**, including the TypeScript reference. Violations: the failed-write boolean contract is not made state-safe, and the changed coordinator remains over 250 pure LOC. No new untyped escape hatch was found.
- `omo:remove-ai-slops`: **ran** over production and tests. No deletion-only/removal-only tests, prompt tests, snapshots, speculative abstraction, or irrelevant normalization were found. The failure mocks are too weak because they cannot expose mutation-before-failure; this contributes to the HIGH finding.

## Verification evidence

- I inspected the approved spec/Task 4 plan, `.superpowers/sdd/task-4-review-package.md`, the exact Git diff, current source, generated CSS, docs, and tests.
- The controller reports 116/116 focused tests, lint, typecheck, `build:css`, and module-doc listing passed. Per instruction, I did not rerun those already-green gates because the blockers are visible in source ordering and CSS semantics.
- Live Obsidian visual QA is not part of this Task 4 review package and remains a final branch gate.

## Blockers before approval

1. Make OpenCode, Claude, and Codex failure outcomes preserve/restore the previous source-of-truth mode and resolve `false` instead of leaking rejected event-handler promises.
2. Align danger/safe selected icon and checkmark colors with the semantic row shell, and add tests that would catch the current YOLO/Plan contradiction.

## Remediation Re-review — 2026-07-18

### Verdict

- Spec compliance: PASS for both prior blockers.
- Code quality status: PASS.
- Recommendation: APPROVE.

### Verified remediation

- OpenCodianView.switchPermissionMode() now preserves the prior OpenCode mode, restores it after save or restart failure, and makes a best-effort rollback save. The regression test records the required save-new, restart-new, save-old sequence.
- The Claude and Codex writer seams retain the required assignment, save, adapter sequence, catch save/adapter failures, restore the previous setting, make a best-effort rollback save, and resolve false rather than rejecting the click path. Regression tests use distinct old/new modes and assert the real order.
- Failed writes retain an open card, the old selected option, and no Composer focus restoration.
- Selected semantic colors now consistently use data-permission-semantic: danger shell/icon/check uses the error token; safe uses the success token. The reversed YOLO/Plan rules are removed. DOM coverage exists for OpenCode (danger/neutral/safe), Claude (danger plus safe), and Codex (danger/neutral/safe).

### Fresh evidence

- Focused selector and coordinator test command: 4 suites, 123 tests passed.
- git diff --check passed.
- Independent delegate re-review could not start because the local OpenCode MCP server at 127.0.0.1:4096 is unreachable; this review is therefore based on the current source diff plus fresh mutation-order regression evidence. Live Obsidian QA remains the branch-level gate.
