# Composer Popover Card Unification — Final Design-System Gate

- reviewDate: 2026-07-19
- recommendation: **APPROVE**
- blockers: **none**
- worktree: `/Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/.worktrees/composer-popover-card-unification`
- reviewedRuntimeBuild: `codex-composer-popover-card-unification.202607190105`
- independentlyRebuiltBuild: `codex-composer-popover-card-unification.202607190125`
- ulwAttemptResolution: `omo ulw-loop status --json` returned `ULW_LOOP_PLAN_MISSING`; this fallback evidence path is therefore used.

## originalIntent

Keep Agent, Permission, and Model as three independent Composer controls while making their opened cards feel like one restrained, Obsidian-native shadcn-inspired `Popover + Command` family. Preserve selector-specific content, widths, state ownership, persistence, keyboard behavior, Model search/grouping/sticky scrolling, Permission risk semantics, Chat-container clamping, and focus restoration. Do not install UI frameworks, create glass/gradient decoration, merge the controls, or fake the result with screenshots.

## desiredOutcome

1. One real shared DOM frame supplies the title, visible `Esc` keycap, content slot, and truthful `Arrow / Enter / Escape` shortcut footer to all three popovers.
2. All three use one quiet surface, one border/shadow hierarchy, consistent compact row geometry, and neutral hover/highlight/selection treatment in light and dark themes.
3. Agent and Permission preserve roving focus and transactional selection behavior; failed Permission writes keep the old selected state and the card open.
4. Model retains its full-width unboxed search, per-instance combobox/listbox ownership, active-descendant lifecycle, 280px scroll viewport, sticky provider headings, provider icons, and current-tab override behavior.
5. Permission danger/safe color remains localized to icon, label, and check instead of flooding the row.
6. Escape closes the open local popover and restores its trigger before falling through to streaming cancellation.
7. Tests, docs, generated CSS, graph artifacts, lint, typecheck, full suite, production build, Test Vault deployment, and live visual evidence are complete.

## userOutcomeReview

**PASS.** The shipped runtime visibly reads as one component family without flattening the three controls into one menu. The seven final captures show the same 10px-radius, single-border, restrained-shadow frame in both themes. Default rows are transparent; selected/highlighted rows use a single low-chroma neutral surface without colored rails, nested cards, gradients, glass, row outlines, or row shadows. CJK copy wraps without clipping. The footer consistently exposes `↑↓ 导航`, `Enter 选择`, and `Esc 关闭`.

Agent retains its default row, badges, descriptions, candidate list, and trailing selected check. Permission retains explicit risk descriptions while danger color stays localized to the icon/label/check. Model retains an unboxed full-width search strip, provider grouping, provider icons, a real 280px scroll owner, visible scrollbar, sticky headings, and a clearly readable dark-theme selected check. Runtime assertions bind all six base captures to the expected card kind, theme, expanded state, title, zero captured errors, and BUILD_ID; the extra scrolled capture and JSON readback prove scroll/sticky behavior.

The implementation is token-driven DOM/CSS, not raster substitution. `ComposerPopoverFrame` is reused by exactly the intended three consumers and remains presentation-only. Selector coordinators retain data and persistence ownership. No new dependency, untyped production escape hatch, needless parsing/normalization, or speculative generic dropdown framework was introduced.

## Success-Criterion Review

| Criterion | Result | Evidence |
| --- | --- | --- |
| Three independent cards use one real shared frame | PASS | `src/features/chat/ui/ComposerPopoverFrame.ts`; Agent, Permission, and Model coordinator call sites; six asserted runtime captures |
| Unified restrained Popover + Command visual system | PASS | `src/style/components/composer-popover-frame.css`; selector CSS; seven inspected PNGs |
| No glass, gradients, nested row cards, colored selection rails, or semantic row flooding | PASS | scoped CSS inspection, style-contract tests, light/dark captures |
| Agent keyboard/async/locale lifecycle | PASS | `ChatAgentSelectionCoordinator.test.ts`; final Agent remediation review; live Agent captures |
| Permission transactional failure and risk semantics | PASS | OpenCode/Claude/Codex tests; `task-4-permission-popover-code-review.md` remediation section; live Permission captures |
| Model ARIA ownership, search, groups, sticky scroll, viewport, override | PASS | two-instance and closed-refresh tests; Puppeteer viewport test; `runtime-model-scroll.json`; Model captures |
| Escape closes local card before streaming cancellation | PASS | `OpenCodianView.escapeScope.test.ts`; coordinator trigger-focus tests |
| Light/dark Test Vault visual proof | PASS | `composer-popover-final-202607190105/captures/*`; all `assert-*.json` are `ok: true` with zero errors |
| Repository verification | PASS with auditable owner approval | `OWNER_GUARD_APPROVED='Composer popover Escape scope routing required by approved design' npm run verify`: 567 suites / 5368 tests, lint/typecheck/docs/graph/devlog/build all pass |

## Direct Programming And Remove-AI-Slops Pass

### Production code

- No `as any`, `@ts-ignore`, `@ts-expect-error`, dependency addition, raster fake, general-purpose popover framework, or unnecessary data parser/normalizer was added.
- The shared frame is justified by three production consumers and owns only presentation structure.
- The Model renderer's option-ID builder is a narrow accessibility requirement, not speculative abstraction.
- Permission rollback catches occur at persistence/adapter boundaries and preserve the prior typed state; they are not redundant defensive checks.
- Existing large coordinators remain oversized under the generic 250-pure-LOC skill threshold. This is a maintenance NOTE, not a blocker: the approved architecture explicitly assigns these responsibilities to existing owners, and extracting single-use pass-through helpers would violate the repository's own abstraction guardrail.
- `OpenCodianView.ts` receives only the minimal shared Escape dispatcher and rollback seam required by the approved interaction contract. Bare owner-guard intentionally blocks this Class B touch; the repository-supported explicit approval makes the change auditable and the complete gate green.

### Tests

- Valuable behavior-sensitive coverage includes: mixed pointer/keyboard Agent navigation, async/locale focus restoration, failed Permission mutation rollback, multi-instance Model ARIA resolution, closed-state active-descendant suppression, scope Escape ordering, and a Chromium-measured 280px viewport.
- No deletion-only, requested-removal-only, snapshot-only, prose-pinning, or removal-verification test blocks completion.
- The style-contract test necessarily inspects CSS source, but its reduced-motion check is scoped to the actual media block after remediation; it is not the earlier tautological keyword-only assertion.
- Exact private Model ID-format assertions are redundant implementation-mirroring coverage because behavioral relationship tests already exist. This is a non-blocking NOTE; deleting those exact-format assertions later would reduce test churn without changing confidence.
- The code-review artifacts explicitly record both `omo:programming` and `omo:remove-ai-slops` perspectives, including overfit/tautology/constant-only criteria. Their reports agree with this direct pass after remediation.

## Independent Verification Reproduced

- `npm test -- --runInBand --runTestsByPath ...` focused integration set: **10 suites / 92 tests PASS**.
- `npm run check:module-docs`: **PASS**, 504 source modules / 504 mapped docs, 13 required targets.
- `npm run check:graphify`: **PASS**.
- `npm run lint`: **PASS**, 0 errors / 0 warnings.
- `npm run typecheck`: **PASS**.
- `git diff --check`: **PASS**.
- `npm run build`: **PASS**.
- Full approved gate: **567 suites / 5368 tests PASS**, production build PASS.
- Direct visual inspection: all seven final PNGs PASS.
- Runtime JSON: six base states, Model scroll/sticky, and dark selected-check contrast all report `ok: true`; Test Vault errors report `No errors captured.`

## Checked Artifact Paths

- `docs/superpowers/specs/2026-07-18-composer-popover-card-unification-design.md`
- `docs/superpowers/plans/2026-07-18-composer-popover-card-unification.md`
- `DESIGN.md`
- `src/features/chat/ui/ComposerPopoverFrame.ts`
- `src/features/chat/services/ChatAgentSelectionCoordinator.ts`
- `src/features/chat/services/PermissionModeSelectorCoordinator.ts`
- `src/features/chat/services/ChatSelectionControlsCoordinator.ts`
- `src/features/chat/services/ComposerInputShellCoordinator.ts`
- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/ui/modelSelector/ModelSelectorRenderer.ts`
- `src/style/components/composer-popover-frame.css`
- `src/style/components/agent-selector.css`
- `src/style/components/permission-mode-selector.css`
- `src/style/components/model-selector.css`
- `tests/unit/features/chat/OpenCodianView.escapeScope.test.ts`
- `tests/unit/infrastructure/model-popover-viewport-render.test.mjs`
- relevant Agent, Permission, Model, frame, and navigation Jest suites
- `.omo/evidence/agent-card-review-code-review.md`
- `.omo/evidence/composer-popover-card-unification-agent-code-review-remediation.md`
- `.omo/evidence/task-4-permission-popover-code-review.md`
- `.omo/evidence/model-popover-remediation-code-review.md`
- `.omo/evidence/model-popover-final-code-review.md`
- `.obsidian-debug/composer-popover-final-202607190105/evidence-manifest.json`
- `.obsidian-debug/composer-popover-final-202607190105/assert-*.json`
- `.obsidian-debug/composer-popover-final-202607190105/runtime-model-scroll.json`
- `.obsidian-debug/composer-popover-final-202607190105/runtime-dark-model-check-contrast.json`
- `.obsidian-debug/composer-popover-final-202607190105/captures/*.png`

## exactEvidenceGaps

- No blocking gap remains.
- The visual packet is tied to BUILD_ID `202607190105`; the independent full verification rebuild emitted `202607190125` from the same unchanged production source. The rebuild changed the build identity/artifacts, not the reviewed DOM/CSS implementation, so the `202607190105` live screenshots remain representative. A new screenshot set for the reviewer-triggered rebuild is unnecessary for the stated criteria.
- The packet does not include a separate narrow-sidebar screenshot. Existing layout ownership and tests were preserved, but the final visual packet concentrates on the three cards in light/dark plus Model scrolling. This is a NOTE because the current goal's final visual correction concerned the shared card system and dark Model check contrast, and no evidence demonstrates a clamping regression.
- The exact Model ID string format assertions are overfit but backed by stronger multi-instance DOM-resolution tests; no user-visible criterion fails.

## blockers

None.
