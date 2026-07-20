# Model Popover Remediation Code Review

## Verdict

- Result: **FAIL**
- `codeQualityStatus`: **BLOCK**
- `recommendation`: **REQUEST_CHANGES**
- Review target: current files in `.worktrees/composer-popover-card-unification` against `docs/superpowers/specs/2026-07-18-composer-popover-card-unification-design.md` and `.omo/evidence/task-5-model-popover-code-review.md`

## CRITICAL

None.

## HIGH

1. **The combobox/listbox composite is not instance-safe and can restore `aria-activedescendant` after the popover has closed.**

   `src/features/chat/services/ChatSelectionControlsCoordinator.ts:539-576` gives every Model combobox/listbox pair the same document IDs (`opencodian-model-options`), while `src/features/chat/ui/modelSelector/ModelSelectorRenderer.ts:29-30,115-123` gives equivalent model options the same document IDs in every coordinator. OpenCodian constructs a coordinator per `OpenCodianView` (`src/features/chat/OpenCodianView.ts:1924-1926`), and the plugin explicitly supports multiple OpenCodian leaves (`src/main.ts:618-624,683-689`). With two views, the second combobox's `aria-controls` and `aria-activedescendant` resolve through `document.getElementById()` to the first view's duplicate IDs, so the relationship is not valid for the second composite. A headless-Chromium reproduction with the production ID pattern confirmed two matching listboxes/options and both references resolving to the first elements.

   Close-state synchronization is also incomplete. `closeModelDropdown()` removes `aria-activedescendant` at `src/features/chat/services/ChatSelectionControlsCoordinator.ts:640-649`, but it leaves the highlighted row in the DOM. Any later render captures that highlight at `:665-667` and unconditionally re-adds the attribute at `:694-723`, even while `aria-expanded="false"`. Such renders occur through asynchronous catalog reload (`:223-227`) and locale refresh (`:315-319`). The focused test only proves ArrowDown sets the attribute (`tests/unit/features/chat/ChatSelectionControlsCoordinator.test.ts:229-234`); it does not prove unique ownership or that closed-state renders keep it cleared.

## MEDIUM

1. **The new viewport regression test mirrors CSS constants instead of testing the rendered viewport.**

   `tests/unit/features/chat/ChatSelectionControlsCoordinator.test.ts:251-264` reads the stylesheet and asserts literal `432px` and `280px` declarations. This would remain green if future header/footer/search sizing again compressed the actual scroll area, which is exactly the regression the test claims to lock. This violates the `remove-ai-slops` implementation-constant test rule and the `programming` requirement to test observable behavior rather than implementation text. Current production-equivalent Chromium layout is correct, but this test provides false regression confidence.

## LOW

None.

## Verified Remediation / Non-Blockers

- Shared row geometry is corrected: renderer supplies icon/text/check children, and Chromium computed `22px 266px 18px`; the model name no longer collapses.
- The frame now preserves the full 280px scroll region under the 36px header, 52px search area, and 36px footer; Chromium measured a 280px scroll viewport.
- Trigger semantics are unchanged; search remains first; provider headers remain within the scroll owner; current-tab override write behavior, clamped non-wrapping arrows, successful selection focus behavior, and Escape trigger-focus restoration remain intact.

## Skill-Perspective Check

- `omo:programming`: **ran**. The production TypeScript remains typed and avoids new escape hatches or needless parsing/abstraction. It fails the perspective because the ARIA ownership/lifecycle is not correct across supported view instances, and the CSS-text test mirrors implementation rather than behavior.
- `omo:remove-ai-slops`: **ran** over production and tests. Production remediation is scoped and not needlessly abstract. The viewport test is an implementation-constant-mirroring test and is therefore slop under this perspective.

## Verification Evidence

- PASS: focused Jest suites — 4 suites, 39 tests.
- PASS: `npm run typecheck`.
- PASS: `npm run lint -- --quiet`.
- PASS: `npm run check:module-docs`.
- PASS: `git diff --check`.
- PASS: headless Chromium production-equivalent layout — row grid `22px 266px 18px`, scroll viewport `280px`.
- FAIL: headless Chromium duplicate-ID ownership reproduction — two listboxes/options with the second combobox resolving both ARIA IDREFs to the first view's nodes.

## Blockers Before Approval

1. Scope the listbox and option IDs uniquely per Model selector instance, and test two coordinators in one document so each combobox resolves only to its own listbox and highlighted option.
2. Gate active-descendant synchronization on the open state (including async/locale re-renders) and test that Escape/close plus a subsequent render leaves `aria-activedescendant` absent.
3. Replace or supplement the CSS-literal viewport test with computed-layout/runtime evidence that fails when the actual list viewport drops below 280px.
