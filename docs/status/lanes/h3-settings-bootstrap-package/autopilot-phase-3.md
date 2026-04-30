## Round Design

- Exact `[NEXT]` slice: `[NEXT] Task 3 - Package model-catalog presentation pressure and checkpoint settings-shell deltas` in lane `h3-settings-bootstrap-package` / `H3 - Package the settings and bootstrap hotspot`.
- Goal: tighten the boundary between `SettingsModelCatalogPresenter.ts` and adjacent owners so presentation state becomes more focused, without smearing config semantics across UI helpers, and record before/after hotspot deltas for the checkpoint lane.
- Targeted hotspot files: `src/features/settings/SettingsModelCatalogPresenter.ts`, `src/features/settings/SettingsModelSection.ts`, and `src/core/config/ModelConfigService.ts`.
- Adjacent owners to lean on: keep `SettingsModelSection.ts` as the settings shell/callback bridge, keep `ModelConfigService.ts` as the config semantics owner, and extract only catalog availability presentation descriptors into a durable settings-model presentation owner if the presenter contains enough repeated descriptor logic to justify it.
- Before ownership surface: `SettingsModelCatalogPresenter.ts` owns DOM rendering, presenter state, provider/model toggle events, provider probe execution, provider availability labels/classes/details, catalog placeholder reasons, disabled-scope priority, and model-summary text.
- After ownership surface: `SettingsModelCatalogPresenter.ts` should keep DOM rendering, local render state, semantic toggle/probe events, and scroll/search state; a focused catalog-availability presentation module should own derived labels/classes/details, disabled-scope priority, placeholder reasons, and summary text. `SettingsModelSection.ts` should not gain new catalog semantics, and `ModelConfigService.ts` should remain the source of runtime/catalog config semantics only.
- Tests likely to change: `tests/unit/features/settings/SettingsModelCatalogPresenter.test.ts` for the public rendered availability/probe behavior and, if a pure presentation owner is introduced, a focused unit test for its descriptor functions. The configured validation remains `npm test -- --runInBand tests/unit/features/settings/SettingsModelCatalogPresenter.test.ts tests/unit/features/settings/SettingsModelSection.test.ts tests/unit/features/settings/modelConfigWorkspace.test.ts`.
- Docs likely to change: `docs/modules/features/settings/SettingsModelCatalogPresenter.md`, possibly `docs/modules/features/settings/SettingsModelCatalogAvailability.md` and `docs/modules/README.md` if a source module is added, plus refreshed graphify artifacts for any `src/` change.
- Explicit non-goals: do not alter provider/model availability merge semantics, do not change `.opencode` writes, do not change `ModelConfigService` catalog rules, do not add runtime ownership to `OpenCodianView.ts` or `OpenCodeService.ts`, do not start another queued slice, and do not deploy because this is a maintainability packaging round.

## Hotspot Baseline

- Lane queue cites Task 3 key files: `src/features/settings/SettingsModelCatalogPresenter.ts`, `src/features/settings/SettingsModelSection.ts`, `src/core/config/ModelConfigService.ts`, with matching tests/docs.
- Current line counts: `SettingsModelCatalogPresenter.ts` = 1362 lines, `SettingsModelSection.ts` = 352 lines, `ModelConfigService.ts` = 307 lines, `OpenCodianSettings.ts` = 483 lines.
- Current import counts: `SettingsModelCatalogPresenter.ts` = 7 `import` declarations, `SettingsModelSection.ts` = 8, `ModelConfigService.ts` = 8, `OpenCodianSettings.ts` = 19.
- Current presenter pressure evidence: `SettingsModelCatalogPresenter.ts` has 46 class methods/major private helpers and directly owns provider availability descriptor methods: `getProviderPrimaryDisabledReason`, `getProviderAvailabilityStatusClass`, `getProviderAvailabilityStatusLabel`, `getProviderServerConstraintBadge`, `getProviderAvailabilityProbeBadge`, `describeProviderAvailabilityProbe`, `describeProviderModels`, and `getCatalogPlaceholderReason`.
- Module-doc baseline: `docs/modules/features/settings/SettingsModelCatalogPresenter.md` says the presenter is a thick owner for provider accordion, search, catalog summary cards, bulk toggles, provider probe badge/detail, and filter state; it should present `ModelCatalogState` and emit semantic events, not modify `ModelConfigService` merge rules or write persistent config directly.

## Design Review Result

- Verdict: PASS.
- Review: The design targets exactly Task 3 and shrinks presenter pressure by moving repeated provider availability/probe descriptor logic into a durable presentation-semantics owner. The seam is not an anemic one-method wrapper because it owns multiple derived display contracts used by provider headers, badges, probe details, placeholder text, and model summaries. It does not push config merge semantics into UI helpers: the new owner consumes already-built `ModelCatalogProvider` and `ProviderAvailabilityProbe` state, while `ModelConfigService` remains unchanged. `SettingsModelSection.ts` remains the shell/callback bridge and should only change if tests or types require it.

## Implementation Summary

- Completed Task 3 by extracting provider availability presentation descriptors from `SettingsModelCatalogPresenter.ts` into the durable `SettingsModelCatalogAvailability.ts` owner.
- The presenter now keeps DOM rendering, accordion/search/filter/scroll state, semantic toggle callbacks, and provider probe triggering, while delegating status classes, status labels, server-disabled badges, probe badge/detail descriptors, disabled-scope priority, placeholder reasons, and provider model preview strings.
- `SettingsModelSection.ts` and `ModelConfigService.ts` were left semantically unchanged: the section remains the settings shell/callback bridge, and model config merge/probe semantics remain in the config layer.
- Added focused tests for the new availability descriptor owner and migrated the former private-method presenter assertion to the new public descriptor seam.

## Files Changed

- `src/features/settings/SettingsModelCatalogAvailability.ts`: added the focused availability presentation owner for provider/model status descriptors, probe descriptors, disabled-scope priority, placeholder reasons, and model preview text.
- `src/features/settings/SettingsModelCatalogPresenter.ts`: removed direct ownership of availability/probe descriptor methods and now consumes the new owner while retaining render and event orchestration.
- `tests/unit/features/settings/SettingsModelCatalogAvailability.test.ts`: added descriptor coverage for project-disabled priority, inherited server-disabled badges, catalog-only probe detail, placeholder reasons, and long model previews.
- `tests/unit/features/settings/SettingsModelCatalogPresenter.test.ts`: updated the disabled-scope priority assertion to use the new public descriptor owner instead of a private presenter method.
- `docs/modules/features/settings/SettingsModelCatalogAvailability.md`: documented the new owner boundary and guardrails.
- `docs/modules/features/settings/SettingsModelCatalogPresenter.md`: documented that availability descriptor rules now live outside the presenter.
- `docs/modules/README.md`: added the new module-doc entry.
- `graphify-out/GRAPH_REPORT.md`, `graphify-out/graph.json`: refreshed src-scoped graph artifacts after adding the source module.
- `docs/status/lanes/h3-settings-bootstrap-package/autopilot-round-roadmap.md`: marked Task 3 `[DONE]`; no queued H3 item remains.

## Validation

- `npm test -- --runInBand tests/unit/features/settings/SettingsModelCatalogAvailability.test.ts tests/unit/features/settings/SettingsModelCatalogPresenter.test.ts tests/unit/features/settings/SettingsModelSection.test.ts tests/unit/features/settings/modelConfigWorkspace.test.ts` — initially failed because migrated tests still asserted old private presenter internals and raw i18n keys; repaired the tests to target the new owner and translated strings.
- `npm test -- --runInBand tests/unit/features/settings/SettingsModelCatalogAvailability.test.ts tests/unit/features/settings/SettingsModelCatalogPresenter.test.ts tests/unit/features/settings/SettingsModelSection.test.ts tests/unit/features/settings/modelConfigWorkspace.test.ts` — PASS, 4 suites / 20 tests.
- `npm run graphify:update:src` — PASS, rebuilt and synced src-scoped graph artifacts.
- `npm run check:module-docs` — PASS, 375 source modules / 375 mapped docs and required docs OK.
- `npm run lint` — PASS.
- `npm run typecheck` — PASS.
- `npm test` — PASS, 341 suites / 1740 tests.
- `npm run build` — PASS, `BUILD_ID: autopilot-hotspot-core-packaging-review-loop.202604302109`.
- `npm run check:graphify` — PASS.
- Vulture validation command is blank in round configuration, so no substitute command was run.
- No deploy step was required because this maintainability packaging round did not touch deploy-relevant runtime files under the Test Vault deployment rule.

## Code Review Result

- Verdict: PASS.
- Review: The diff implements exactly H3 Task 3 and does not start another lane. `SettingsModelCatalogPresenter.ts` shrinks from 1362 to 1043 lines by removing eight availability/probe descriptor helpers and keeping only render/event state. The new `SettingsModelCatalogAvailability.ts` is durable rather than thin because it owns multiple related display contracts across provider headers, badges, probe details, placeholder text, disabled-scope priority, and model previews. Config semantics remain in `ModelConfigService.ts`, settings-shell behavior remains in `SettingsModelSection.ts`, no ownership was added to `OpenCodianView.ts` or `OpenCodeService.ts`, module docs and graphify were refreshed, and all configured gates passed. No background or detached work was used.

## Outcome

- Completed roadmap item: `[DONE] Task 3 - Package model-catalog presentation pressure and checkpoint settings-shell deltas`.
- Hotspot delta: `SettingsModelCatalogPresenter.ts` changed from 1362 to 1043 lines and 7 to 8 imports; `SettingsModelCatalogAvailability.ts` adds 339 lines and 3 imports as the new descriptor owner; `SettingsModelSection.ts` stayed 352 lines / 8 imports; `ModelConfigService.ts` stayed 307 lines / 8 imports.
- Acceptance: presenter pressure decreased without moving config semantics into UI helpers, and the lane records before/after deltas needed by the checkpoint lane.

## Next Recommended Slice

- H3 queue is complete: Task 1, Task 2, and Task 3 are all `[DONE]`. The next controller slice should switch to `h4-checkpoint` per the lane-state note.
