# Model Popover Final Code Review

- Review date: 2026-07-18
- Worktree: `/Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/.worktrees/composer-popover-card-unification`
- Goal: independently review the final uncommitted Model popover changes, with emphasis on per-instance ARIA identity, closed/refresh active-descendant behavior, combobox/listbox semantics, three-column rows, the rendered 280px viewport, and preservation of search/sticky-group/current-tab override behavior.
- Review mode: read-only. No source or test implementation was changed.
- Attempt directory resolution: `omo ulw-loop status --json` returned `ULW_LOOP_PLAN_MISSING`, so this report uses the requested fallback path under `.omo/evidence/`.

## Verdict

**APPROVED**

- `codeQualityStatus`: **WATCH**
- `recommendation`: **APPROVE**
- `blockers`: **None**

No CRITICAL or HIGH finding remains. The findings below are non-blocking maintainability/accessibility follow-ups.

## Findings

### CRITICAL

None.

### HIGH

None.

### MEDIUM

1. Exact ARIA-ID format assertions overfit the implementation even though the same suite already proves the user-visible relationship.

   - References:
     - `tests/unit/features/chat/ChatSelectionControlsCoordinator.test.ts:222`
     - `tests/unit/features/chat/ChatSelectionControlsCoordinator.test.ts:231-233`
     - `tests/unit/features/chat/modelSelectorRenderer.test.ts:139`
   - Evidence: these assertions pin the private `opencodian-model-selector-<number>` counter format and `%3A%3A` encoding. A safe future change to UUIDs, element-derived IDs, or a different escaping strategy would fail them even if every combobox still uniquely controlled its own listbox and `aria-activedescendant` still resolved to the highlighted option.
   - Why this is non-blocking: `ChatSelectionControlsCoordinator.test.ts:263-290` is the valuable regression test. It creates two coordinators, proves distinct listbox IDs, proves each `aria-controls` points to its own listbox, proves each active descendant equals the actual highlighted row ID, and resolves that ID through `document.getElementById`.
   - Suggested fix: remove the exact-format regex/equality checks and assert behavior instead: non-empty IDs, uniqueness within/across instances, `aria-controls === listbox.id`, `aria-activedescendant === highlighted.id`, and successful DOM resolution. Keep an encoder-format test only if the encoding itself becomes a documented public contract.

2. The change continues growing an already oversized selection-controls owner.

   - Reference: `src/features/chat/services/ChatSelectionControlsCoordinator.ts:161-185,525-748`
   - Evidence: the module measures about 760 non-blank/non-comment lines and the current uncommitted diff adds Model ARIA lifecycle logic on top of catalog, permission, badges, layout, and icon ownership. This violates the `programming` / `remove-ai-slops` 250-pure-LOC perspective even though the new logic itself is cohesive and small.
   - Why this is non-blocking: the project plan explicitly assigns Model popover lifecycle to this coordinator, the repo guardrails prefer extending existing coordinators over thin one-off helpers, and extracting an accessibility-only wrapper now would be scope-expanding indirection. No correctness regression is demonstrated by the added method.
   - Suggested fix: track a follow-up responsibility split only when it can move a complete concept, for example the full Model popover DOM/open-close/search/ARIA lifecycle, rather than extracting a pass-through ID or active-descendant helper.

### LOW

1. Locale refresh updates the visible Model frame and search placeholder, but leaves the listbox's localized accessible label in the old locale.

   - References:
     - `src/features/chat/services/ChatSelectionControlsCoordinator.ts:317-320`
     - `src/features/chat/services/ChatSelectionControlsCoordinator.ts:571-577`
   - Evidence: `aria-label` is assigned once when the listbox is built, while `applyLocaleTexts()` refreshes the frame and search placeholder and rerenders the options without resetting that label. After a live locale switch, the title/placeholder can be in the new locale while a screen reader still announces the old `Choose model` label.
   - Suggested fix: in `applyLocaleTexts()`, also set `modelSelectorScrollContainer`'s `aria-label` from `t('chat.composerPopover.modelTitle')`. Add one locale-refresh test that also confirms a closed combobox remains without `aria-activedescendant`.

## Required Behavior Review

### 1. Multiple views/selectors receive unique ARIA IDs — PASS

- `src/features/chat/services/ChatSelectionControlsCoordinator.ts:55,164` assigns one monotonically unique instance prefix per coordinator.
- `src/features/chat/services/ChatSelectionControlsCoordinator.ts:541-578` binds the combobox to the instance listbox.
- `src/features/chat/ui/modelSelector/ModelSelectorRenderer.ts:115-125` derives every option ID from the instance prefix plus model value.
- The two-instance regression at `tests/unit/features/chat/ChatSelectionControlsCoordinator.test.ts:263-290` verifies isolation against actual DOM lookup, not just string inequality.

### 2. Close/catalog/locale refresh cannot restore `aria-activedescendant` while closed — PASS

- `src/features/chat/services/ChatSelectionControlsCoordinator.ts:642-651` clears the attribute during close.
- `src/features/chat/services/ChatSelectionControlsCoordinator.ts:719-731` refuses to set it whenever `isModelDropdownOpen` is false.
- Both catalog refresh (`reloadModelCatalog()` -> `refreshModelOptions()`) and locale refresh (`applyLocaleTexts()` -> `refreshModelOptions()`) converge on `renderModelList()` and therefore the same open-state guard.
- `tests/unit/features/chat/ChatSelectionControlsCoordinator.test.ts:292-304` directly proves close followed by option refresh remains collapsed and has no active descendant.

### 3. Search combobox/listbox relationship — PASS

- Search input: `role="combobox"`, `aria-autocomplete="list"`, instance `aria-controls`, and synchronized `aria-expanded` at `src/features/chat/services/ChatSelectionControlsCoordinator.ts:541-550,621-624,648-651`.
- Controlled element: unique `id`, `role="listbox"`, accessible label at `src/features/chat/services/ChatSelectionControlsCoordinator.ts:571-577`.
- Rows: stable ID, `role="option"`, accurate `aria-selected`, and `tabindex="-1"` at `src/features/chat/ui/modelSelector/ModelSelectorRenderer.ts:115-125`.
- Highlight synchronization is centralized at `src/features/chat/services/ChatSelectionControlsCoordinator.ts:719-731`.

### 4. Provider icon / text / check use three grid segments — PASS

- DOM slots are explicit at `src/features/chat/ui/modelSelector/ModelSelectorRenderer.ts:135-157`.
- Shared grid is `22px minmax(0, 1fr) 18px` at `src/style/components/composer-popover-frame.css:62-71`.
- Model-specific placement pins icon/text/check to columns 1/2/3 at `src/style/components/model-selector.css:377-408`.
- Chromium readback produced `22px 264px 18px`, with the three child elements in distinct columns.

### 5. Rendered 280px viewport test is meaningful — PASS

- `tests/unit/infrastructure/model-popover-viewport-render.test.mjs:9-72` launches Chromium, loads the shared frame CSS plus Model CSS, renders the actual frame/search/scroll hierarchy, and measures `getBoundingClientRect().height`.
- The focused test passed with an actual 280px viewport.
- Mutation sensitivity was independently checked without editing files: replacing the frame budget `432px` with the old `360px` in memory changed the measured viewport from `280px` to `233px`. The test would catch the regression and is not merely checking the same constant as text.
- Root `styles.css` contains the same 432px frame and 280px scroll rules.

### 6. Search, sticky groups, and current-tab override remain intact — PASS

- Search filtering and grouped rendering remain in `ModelSelectorRenderer`; no interaction algorithm was replaced.
- Sticky headers remain in the scroll container and still bind through `bindModelSelectorStickyHeaders()` at `src/features/chat/ui/modelSelector/ModelSelectorRenderer.ts:93-113,169-170`.
- Arrow behavior remains clamped, not wrapped, and is covered by `tests/unit/features/chat/modelSelectorInteractions.test.ts:17-36`.
- The successful search/Arrow/Enter path writes a distinct active-tab override and restores composer focus in `tests/unit/features/chat/ChatSelectionControlsCoordinator.test.ts:182-249`.
- Refused override keeps the card open and does not steal focus in `tests/unit/features/chat/ChatSelectionControlsCoordinator.test.ts:306-316`.

## Slop / Programming Skill-Perspective Check

- Check ran: **Yes**. The `remove-ai-slops` and `programming` skills, including the TypeScript test-shape rules, were explicitly consulted before judging maintainability and test relevance.
- Production-code result: no needless parsing/normalization, untyped escape hatch, new dependency, or Model-specific thin abstraction was found. The renderer additions are directly required by the visual and ARIA contracts. The oversized coordinator remains a `programming` / `remove-ai-slops` perspective violation, recorded as MEDIUM because the focused diff does not create a new correctness failure and the repo-local ownership rule points to this coordinator.
- Test result: the rendered viewport test is behavior-sensitive and valuable; the multi-instance ARIA test is also behavior-focused. The exact private-ID-format assertions listed as MEDIUM are an implementation-mirroring violation of both skill perspectives and should be simplified when convenient.
- No deletion-only, requested-removal-only, tautological, or constant-only Model test was found beyond those redundant format assertions.

## Verification Evidence

- Focused tests:
  - Command: `npm test -- --runInBand --runTestsByPath tests/unit/features/chat/ChatSelectionControlsCoordinator.test.ts tests/unit/features/chat/modelSelectorRenderer.test.ts tests/unit/features/chat/modelSelectorInteractions.test.ts tests/unit/features/chat/modelSelectorStickyHeaders.test.ts tests/unit/infrastructure/model-popover-viewport-render.test.mjs`
  - Result: **5 suites passed, 39 tests passed**.
- TypeScript: `npm run typecheck` — **PASS**.
- Lint: `npm run lint -- --quiet` — **PASS**, no errors/warnings emitted.
- Module docs: `npm run check:module-docs` — **PASS**, 504/504 coverage and 11 required diff targets.
- Graph freshness: `npm run check:graphify` — **PASS**.
- Patch hygiene: `git diff --check` — **PASS**.
- Browser counterfactual: current CSS measured 280px; old 360px frame budget measured 233px.

## Evidence Trust Notes

- `/tmp/composer-popover-current.patch` was read but was not treated as authoritative: it is a focused tracked patch and does not include the untracked Chromium viewport test or all current generated/doc changes.
- The actual worktree status, current files, tests, generated CSS, and targeted commands above were inspected independently.
- Prior `.omo/evidence/*model*review*.md` reports were not reused for judgment.
