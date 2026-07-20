# Agent / Composer Popover Card Code Review

## Outcome

- `codeQualityStatus`: **WATCH**
- `recommendation`: **REQUEST_CHANGES**
- Scope: final-current Agent card, shared frame, Agent CSS/locales, and focused Agent/frame tests in the worktree at `b52190bd` plus unstaged changes.
- Verification: `npm test -- --runInBand --runTestsByPath tests/unit/features/chat/ChatAgentSelectionCoordinator.test.ts tests/unit/features/chat/ui/ComposerPopoverFrame.test.ts tests/unit/features/chat/ui/ComposerPopoverListNavigation.test.ts tests/unit/features/chat/ui/ComposerPopoverFrameStyleContract.test.ts` passed: 4 suites, 24 tests.
- Skill-perspective check: `omo:programming` TypeScript criteria and `omo:remove-ai-slops` overfit/slop criteria were consulted. The production diff has an async focus-timing violation; the tests include implementation-mirroring/tautological coverage described below. No untyped escape hatch was introduced in the reviewed Agent/frame changes.

## CRITICAL

None.

## HIGH

None.

## MEDIUM

### M1. Locale rebuild can apply keyboard focus before the async catalog settles

`src/features/chat/services/ChatAgentSelectionCoordinator.ts:166-170` rebuilds the list and calls `focusSelectedOptionAfterCatalogReload()` whenever the card was keyboard-opened. Unlike `openDropdown()` (`lines 410-412`), this locale path has no `status !== 'loading'` guard. A locale refresh during a pending catalog load therefore focuses the default option immediately, before candidates resolve, contrary to the approved requirement that Agent async keyboard focus be applied after candidates resolve (`docs/superpowers/specs/2026-07-18-composer-popover-card-unification-design.md:129`).

The test at `tests/unit/features/chat/ChatAgentSelectionCoordinator.test.ts:340-352` waits for the catalog to settle before refreshing, so it never exercises this timing boundary.

Required change: keep focus deferred while `status === 'loading'`, then restore it after the authoritative reload render. Add a pending-load locale-refresh test that proves focus remains outside the list until the catalog settles.

### M2. The reduced-motion Agent CSS test is source-text overfit and contains a tautological assertion

`tests/unit/features/chat/ui/ComposerPopoverFrameStyleContract.test.ts:17-32` slices from the first reduced-motion marker to end-of-file rather than isolating the relevant media block. A matching `.opencodian-agent-dropdown { animation: none; }` later outside that block could still satisfy the test. Lines 25-32 then replace the exact regex match and assert that the same regex no longer matches; this only proves the replacement removed the text it matched, not runtime CSS behavior or media scoping.

The production CSS at `src/style/components/agent-selector.css:321-331` is correct, but the test violates the remove-ai-slops/programming perspective by mirroring an implementation string and adding a tautological negative check.

Required change: isolate/parse the specific `@media (prefers-reduced-motion: reduce)` block (or assert computed behavior in a CSS-capable runtime) and remove the self-replacement assertion.

## LOW

None.

## Blockers

1. Keep locale-refresh focus deferred while the Agent catalog is loading and add coverage for that timing boundary.
2. Replace the reduced-motion source-text tautology with a scoped media-block assertion, then re-run the focused Agent/frame suites.

## Remaining Runtime Limitations

- No live Obsidian/Test Vault keyboard or reduced-motion inspection was run, per the request not to run broad gates. The review is based on source, contract, and focused Jest/jsdom coverage.
