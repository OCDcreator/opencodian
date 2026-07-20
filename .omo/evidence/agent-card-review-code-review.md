# Task 3 Agent Popover Code Review

Review target: Agent-card scope in `b403f597..HEAD`, with Agent implementation commits ending at `2a1f05d1`.

## Result

- `codeQualityStatus`: **BLOCK**
- `recommendation`: **REQUEST_CHANGES**
- Skill-perspective check: **ran** for `omo:programming` and `omo:remove-ai-slops`.
- Programming perspective: production types and ownership are generally sound, but keyboard/focus state is not async/lifecycle-correct across all supported entry/refresh paths.
- Remove-AI-slops perspective: the CSS style-contract test is implementation-mirroring false confidence; it checks that a `prefers-reduced-motion` string exists without proving the opening animation is disabled.

## Findings

### CRITICAL

None.

### HIGH

1. **A mouse-opened Agent card cannot transition into keyboard navigation; Arrow keys close it.**

   - Code: `src/features/chat/services/ChatAgentSelectionCoordinator.ts:74-82`, `:369-374`.
   - The click path opens with `toggleDropdown(false)`. Browser click leaves focus on the trigger. A subsequent `ArrowDown` or `ArrowUp` reaches the trigger handler, which calls `toggleDropdown(true)`; because the card is already open, `toggleDropdown` closes it instead of focusing an option.
   - Repro evidence from a jsdom runtime harness against the current source:

     ```json
     {"afterClickOpen":true,"focusedClass":null,"expanded":"true"}
     {"afterArrowOpen":false,"focusedClass":null,"expanded":"false"}
     ```

   - This violates the approved Arrow navigation contract and breaks mixed pointer/keyboard use. The focused test suite only dispatches Arrow events to the dropdown after a keyboard-open (`tests/unit/features/chat/ChatAgentSelectionCoordinator.test.ts:275-291`), so it does not cover the real trigger-focused path.

2. **Reduced-motion users still receive the Agent dropdown entrance animation.**

   - Code: `src/style/components/agent-selector.css:154-179`, `:321-326`.
   - `.opencodian-agent-dropdown` always applies `agent-dropdown-open 0.18s`; the reduced-motion block disables only transitions on the trigger/chevron/option and never sets `animation: none` on the dropdown/frame.
   - Static repro result against the current stylesheet: `disables animation: false`, `dropdown keeps animation: true`.
   - This directly violates the design requirement that reduced-motion removes frame/row entrance motion.
   - The test is misleading: `tests/unit/features/chat/ui/ComposerPopoverFrameStyleContract.test.ts:4-13` merely checks that the stylesheet contains the literal `prefers-reduced-motion`. It passes while the accessibility behavior is broken, which violates the remove-ai-slops test-truthfulness perspective.

### MEDIUM

1. **Locale refresh destroys roving focus while leaving the card open.**

   - Code: `src/features/chat/services/ChatAgentSelectionCoordinator.ts:153-156`, `:241-246`, `:425-441`.
   - `applyLocaleTexts()` refreshes the frame and calls `renderList()`, which replaces every focused option, but it does not re-run the focus restoration used after catalog reload. `openedWithKeyboard` and `focusedOptionIndex` remain live while DOM focus falls to `body` and all replacement options have `tabindex=-1`.
   - Repro evidence from a jsdom runtime harness:

     ```json
     {"before":{"focus":"","tabs":[0,-1]},"after":{"tag":"BODY","focus":null,"tabs":[-1,-1],"open":true}}
     ```

   - This conflicts with the locale-refresh lifecycle requirement and leaves an open listbox with no active roving option. There is no Agent locale-refresh focus test.

2. **The Agent footer does not advertise the commands promised by the approved frame contract.**

   - Code: `src/features/chat/ui/ComposerPopoverFrame.ts:22-30`; locale keys at `src/i18n/locales/en.ts:1956-1957` and `src/i18n/locales/zh.ts:1956-1957`.
   - The footer renders only the words `Navigate` and `Select`. It contains no `↑↓`, no `Enter`, and no `Esc close` hint. The only visible `Esc` is the header keycap.
   - The design explicitly requires the footer to advertise `↑↓` navigation, `Enter` selection, and `Esc` close. Current tests (`ComposerPopoverFrame.test.ts:13-21`, `ChatAgentSelectionCoordinator.test.ts:163-167`) assert the incomplete implementation rather than the full user-visible command contract.

### LOW

None.

## Verification

- PASS: focused Jest suites — 4 suites, 21 tests.
- PASS: `npm run typecheck`.
- PASS: ESLint on Agent/frame/navigation production and focused test files, 0 errors / 0 warnings.
- PASS: `git diff --check b403f597..2a1f05d1`.
- Runtime/static repros above independently demonstrate the uncovered failures.

## Blockers

- Keep an already-open, trigger-focused card open when Arrow navigation begins, and focus the appropriate roving option.
- Disable the Agent opening animation under `prefers-reduced-motion: reduce`, with a behavioral CSS assertion rather than a keyword-presence assertion.
- Preserve/re-establish the active roving option when locale refresh rebuilds an open keyboard-operated Agent list.
- Render truthful footer command hints for Arrow navigation, Enter selection, and Escape close, then test that visible contract.
