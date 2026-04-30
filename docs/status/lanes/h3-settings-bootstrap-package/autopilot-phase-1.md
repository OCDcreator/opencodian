# Autopilot Phase 1 — `h3-settings-bootstrap-package`

## Round Design

- Exact `[NEXT]` slice: Task 1 - Package `OpenCodianSettings` section-shell bridges.
- Lane: `h3-settings-bootstrap-package` / H3 - Package the settings and bootstrap hotspot.
- Goal: remove one durable cross-section bridge or shell-construction slice from `OpenCodianSettings.ts` by leaning harder on existing section owners and chrome helpers.
- Targeted hotspot files: `src/features/settings/OpenCodianSettings.ts`, `src/features/settings/SettingsTabbedRenderer.ts`, and the existing `src/features/settings/SettingsUserSection.ts` owner.
- Adjacent owners: `SettingsSectionCoordinator` remains the quick-nav/heading coordinator; `SettingsTabbedRenderer` remains the tabbed-shell owner; `SettingsUserSection` should own user-settings section rendering for both classic and tabbed paths.
- Intended before/after ownership surface: before, `OpenCodianSettings.ts` imports individual user setting render functions, injects three user render callbacks into `SettingsTabbedRenderer`, and assembles the classic User heading/body itself; after, `OpenCodianSettings.ts` delegates the durable user section bridge to `SettingsUserSection`, and `SettingsTabbedRenderer` receives a single tabbed user-panel renderer instead of three leaf callbacks.
- Tests likely to change: settings layout shell tests and tabbed renderer dependency fixtures if they assert or construct the old user callback surface.
- Docs likely to change: `docs/modules/features/settings/OpenCodianSettings.md`, `docs/modules/features/settings/SettingsTabbedRenderer.md`, and `docs/modules/features/settings/SettingsUserSection.md`.
- Explicit non-goals: do not start H3 Task 2 or Task 3, do not introduce a new settings shell/helper file, do not change settings behavior or layout order, do not touch `OpenCodianView.ts` or `OpenCodeService.ts`, and do not use OpenCode.

## Hotspot Baseline

- Lane baseline says `src/features/settings/OpenCodianSettings.ts` had `96` touches in the last 120 days and remains the settings-shell bridge despite existing section owners.
- Current `src/features/settings/OpenCodianSettings.ts`: `488` lines and `19` import statements.
- Current adjacent surfaces: `SettingsTabbedRenderer.ts` has `391` lines and `17` import statements; `SettingsSectionCoordinator.ts` has `739` lines and `2` import statements.
- Current user bridge evidence: `OpenCodianSettings.ts` imports `renderUserProfileSetting`, `renderUserPromptSetting`, and `renderUserExcludedTagsSetting`, wires the same three callbacks into `SettingsTabbedRenderer`, and has its own `addUserSettings()` section assembly method.

## Design Review Result

- Verdict: PASS.
- Review: The design targets one queued H3 Task 1 slice and shrinks a real `OpenCodianSettings.ts` cross-section bridge by strengthening the existing `SettingsUserSection` owner rather than adding a thin new shell. It keeps tabbed/classic behavior at the same owner boundary, has clear tests/docs to update, and avoids the forbidden chat/service hotspots.

## Implementation Summary

- Completed Task 1 by packaging the user-settings section shell out of `OpenCodianSettings.ts` and into the existing `SettingsUserSection` owner.
- `OpenCodianSettings.ts` no longer imports or wires the three leaf user render functions directly; it creates a durable `SettingsUserSection` owner and delegates both classic section assembly and tabbed user-panel rendering through that owner.
- `SettingsTabbedRenderer.ts` now receives one `renderUserContent(containerEl, secondaryTabId)` seam instead of three profile/prompt/tags leaf callbacks, so tabbed renderer remains a router rather than the owner of user-field routing.
- `SettingsUserSection.ts` now owns the classic User heading/body shell plus tabbed `profile` / `prompt` / `tags` content routing while retaining the existing field render functions.

## Files Changed

- `src/features/settings/OpenCodianSettings.ts`: reduced direct user-section assembly and callback wiring.
- `src/features/settings/SettingsTabbedRenderer.ts`: collapsed user rendering dependency surface to one content seam.
- `src/features/settings/SettingsUserSection.ts`: added durable section owner class for classic and tabbed user settings content.
- `tests/unit/features/settings/SettingsTabbedRenderer.test.ts`: added coverage for the single user content seam.
- `docs/modules/features/settings/OpenCodianSettings.md`: documented the user-section owner boundary.
- `docs/modules/features/settings/SettingsTabbedRenderer.md`: documented the single user content callback seam.
- `docs/modules/features/settings/SettingsUserSection.md`: documented classic section shell and tabbed routing ownership.
- `graphify-out/GRAPH_REPORT.md`, `graphify-out/graph.json`: refreshed src-scoped graph artifacts.
- `docs/status/lanes/h3-settings-bootstrap-package/autopilot-round-roadmap.md`: marked Task 1 `[DONE]` and promoted Task 2 to `[NEXT]`.

## Validation

- `npm test -- --runInBand tests/unit/features/settings/SettingsTabbedRenderer.test.ts` — PASS, 1 suite / 10 tests.
- `npm test -- --runInBand tests/unit/features/settings/OpenCodianSettings.test.ts tests/unit/features/settings/SettingsTabbedRenderer.test.ts tests/unit/features/settings/SettingsModelSection.test.ts tests/unit/features/settings/SettingsCommandsSection.test.ts` — PASS, 4 suites / 31 tests.
- `npm run graphify:update:src` — PASS, rebuilt and synced src-scoped graph artifacts.
- `npm run check:module-docs` — PASS, 373 source modules / 373 mapped docs and required docs OK.
- `npm run lint` — PASS.
- `npm run typecheck` — PASS.
- `npm test` — PASS, 340 suites / 1736 tests.
- `npm run build` — PASS, `BUILD_ID: autopilot-hotspot-core-packaging-review-loop.202604302024`.
- `npm run check:graphify` — PASS.
- Vulture validation command is blank in round configuration, so no substitute command was run.

## Code Review Result

- Verdict: PASS.
- Review: The diff implements exactly H3 Task 1 and does not touch queued Task 2/3 work. It strengthens an existing owner instead of creating a new thin helper, removes direct user-section shell assembly from `OpenCodianSettings.ts`, reduces `SettingsTabbedRenderer` user dependency surface, updates matching module docs, refreshes graphify after `src/` edits, and passes the targeted and configured validation gates. No background or detached work was used.

## Outcome

- Completed roadmap item: `[DONE] Task 1 - Package OpenCodianSettings section-shell bridges`.
- Hotspot delta: `OpenCodianSettings.ts` changed from `488` to `483` lines while moving the durable User section shell and tabbed secondary routing into `SettingsUserSection`; `SettingsTabbedRenderer.ts` changed from `391` to `379` lines by replacing three leaf user callbacks with one owner-backed content seam.
- Acceptance: `OpenCodianSettings.ts` loses measurable direct assembly work, and no new settings shell file was introduced.

## Next Recommended Slice

- Continue with `[NEXT] Task 2 - Package plugin startup, warmup, and refresh orchestration out of main.ts` in the next round only.
