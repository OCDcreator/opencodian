# Task 5 Model Popover Code Review

Review range: `183ba38c..b52190bd` (Task 5 commit within requested branch range `b403f597..HEAD`)

## Verdict

- `codeQualityStatus`: **BLOCK**
- `recommendation`: **REQUEST_CHANGES**
- `reportPath`: `.omo/evidence/task-5-model-popover-code-review.md`

The shared frame mount, search-first ordering, provider grouping/sticky-header binding, current-tab `modelOverride` write seam, successful-write-only close/focus behavior, and Escape focus return are present. The migration is not approvable because the Model rows do not satisfy the shared three-column geometry they opt into, and the new listbox semantics do not expose keyboard highlight to assistive technology. The frame height also reduces the former Model scroll viewport despite the explicit preservation contract.

## Findings

### CRITICAL

None.

### HIGH

1. **Every Model row opts into a three-column shared grid but renders only two unassigned children, collapsing the model name into the 22px icon column.**

   `src/features/chat/ui/modelSelector/ModelSelectorRenderer.ts:128-132` renders only the name span and checkmark. The shared class applied at `:111-118` defines `22px minmax(0, 1fr) 18px` columns in `src/style/components/composer-popover-frame.css:62-70`, while `src/style/components/model-selector.css:377-398` assigns neither child to a grid column and does not provide the required icon-slot element. CSS Grid auto-placement therefore puts the name in column 1 (22px), the checkmark in column 2, and leaves the right checkmark slot empty. Headless Chromium computed a 22px name track and placed the 16px checkmark at the start of column 2 for the production-equivalent DOM/CSS. This directly breaks the approved shared option geometry and makes the migrated card visibly unusable.

### MEDIUM

1. **Search-driven keyboard highlight is visual-only and is not exposed through the new listbox semantics.**

   The dropdown is declared `role="listbox"` at `src/features/chat/services/ChatSelectionControlsCoordinator.ts:501-504`, while keyboard focus remains on the plain search input at `:540-546`. Options have no IDs and the input has no `role="combobox"`, `aria-controls`, or `aria-activedescendant`; Arrow navigation only toggles `.is-highlighted` through `ModelSelectorInteractions`. Consequently a screen reader cannot determine which option Enter will activate, and the listbox also contains the frame header, search control, and footer rather than exposing a coherent focused composite. The renderer tests only assert static `role`, `aria-selected`, and `tabindex` attributes (`tests/unit/features/chat/modelSelectorRenderer.test.ts:127-137`), so this behavior is uncovered.

2. **The shared frame reduces the Model list's preserved scroll viewport by roughly 45px.**

   `src/style/components/model-selector.css:181-192` caps the entire frame at 360px, while the frame now includes two 36px chrome rows (`src/style/components/composer-popover-frame.css:9-16`) plus the approximately 52px search block (`model-selector.css:195-213`). The scroll region still declares `max-height: 280px` at `model-selector.css:252-263`, but flex sizing leaves only 236px in a production-equivalent headless Chromium layout. Before Task 5, the 360px cap was on the outer dropdown and the search plus 280px list fit below that cap. This contradicts the design requirement that Model grow to its existing scroll limit and is not covered by the DOM-only tests.

### LOW

None.

## Confirmed Non-Issues

- Search remains the first element in the frame content slot; the scroll container follows it.
- Provider headers remain inside `.opencodian-model-dropdown-scroll`, and `bindModelSelectorStickyHeaders()` is still called with that same scroll owner.
- Escape closes the card and returns focus to the trigger; Chromium confirms `focus()` cannot move focus into the search input after its dropdown ancestor is `display:none`.
- `ModelSelectionRuntime.switchModel()` returns `false` without context-identity sync or Notice when `setActiveTabModelOverride()` refuses, and the coordinator keeps the card open without restoring Composer focus.
- Successful click/Enter writes through the active-tab override seam, closes the card, refreshes trigger state, and restores Composer focus once.
- Model navigation retains the pre-existing clamped, non-wrapping boundary behavior.

## Skill-Perspective Check

- `omo:programming`: **ran**, including the TypeScript reference. No new `any`, suppression, non-null assertion, needless parsing/validation, or speculative abstraction was introduced in Task 5. The incomplete composite-widget semantics violate its accessibility-oriented correctness expectations.
- `omo:remove-ai-slops`: **ran** over production and tests. No deletion-only/removal-only, tautological, prompt/prose, snapshot, implementation-constant-mirroring, or materially useless tests were found.

## Verification Evidence

- PASS: targeted Jest run for `ChatSelectionControlsCoordinator`, `ModelSelectorRenderer`, `ModelSelectorInteractions`, and `ModelSelectionRuntime` — 4 suites, 38 tests.
- PASS: `npm run typecheck`.
- PASS: `npm run lint -- --quiet`.
- PASS: scoped module-doc gate: `node scripts/check-module-doc-diff.mjs --range 183ba38c..b52190bd`.
- PASS: `git diff --check 183ba38c..b52190bd`.
- Reproduced in headless Chromium: Model row name track = 22px with checkmark auto-placed in column 2; framed scroll viewport = 236px rather than 280px.
- No Task 5 live Obsidian screenshot/DOM/computed-style artifact was supplied. The grid and viewport failures are deterministic from the rendered DOM/CSS and should be covered by Task 5 regression evidence before approval.

## Blockers Before Approval

1. Render or explicitly place the Model row's icon/text/check children so it actually fulfills the shared `22px | flexible | 18px` geometry.
2. Make the search-first listbox expose the active highlighted option to assistive technology with a valid combobox/listbox relationship and behavioral test.
3. Preserve the former 280px Model scroll viewport, or adjust the frame height based on the added header/footer chrome and lock the computed layout contract with evidence.
