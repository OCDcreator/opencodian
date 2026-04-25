# Autopilot Phase 2 — `a3-formatter-settings`

## Round Design

- **Exact `[NEXT]` slice**: `F2 - Add the Formatter top-level settings UI`
- **Active spec file**: `docs/superpowers/specs/2026-04-25-formatter-settings-design.md`
- **External reference file(s)**:
  - `/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/opencode-formatter-doc.md`
  - `/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/opencode/packages/opencode/src/format/index.ts`
  - `/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/opencode/packages/sdk/js/src/v2/gen/types.gen.ts`
- **Targeted files/modules**:
  - `src/features/settings/SettingsFormatterSection.ts`
  - `src/features/settings/settingsLayoutRegistry.ts`
  - `src/features/settings/SettingsTabbedRenderer.ts`
  - `src/features/settings/OpenCodianSettings.ts`
  - `src/i18n/locales/en.ts`
  - `src/i18n/locales/zh.ts`
  - `tests/unit/features/settings/SettingsFormatterSection.test.ts`
  - `tests/unit/features/settings/settingsLayoutRegistry.test.ts`
  - `tests/unit/features/settings/SettingsTabbedRenderer.test.ts`
  - `tests/unit/features/settings/OpenCodianSettings.test.ts`
  - `docs/modules/features/settings/SettingsFormatterSection.md`
  - `docs/modules/features/settings/settingsLayoutRegistry.md`
  - `docs/modules/features/settings/SettingsTabbedRenderer.md`
  - `docs/modules/features/settings/OpenCodianSettings.md`
- **Upstream/runtime contract to confirm**:
  - `client.formatter.status()` / `OpenCodeService.getFormatterStatus()` returns `Array<{ name: string; extensions: string[]; enabled: boolean }>`
  - Formatter project config stays local to `.opencode/opencode.json > formatter` via `OpencodeConfigManager.getFormatterConfig()` / `updateFormatterConfig()`
  - F2 mode switching maps exactly to config intent: default deletes `formatter`, disabled writes `false`, custom writes `{}` when no object config exists yet
  - Runtime formatter detection remains read-only UI state and must not be conflated with project config intent
- **Targeted tests to run**:
  - `npm test -- --runInBand tests/unit/features/settings/SettingsFormatterSection.test.ts`
  - `npm test -- --runInBand tests/unit/features/settings/settingsLayoutRegistry.test.ts tests/unit/features/settings/SettingsTabbedRenderer.test.ts tests/unit/features/settings/OpenCodianSettings.test.ts`
  - `npm run check:module-docs`
  - `npm run verify`
- **Deploy-required paths likely touched**: `Yes` — this slice should touch `src/features/settings/` and locale files, so a successful verified build will require Test Vault deployment and `BUILD_ID` verification
- **Non-goals / boundaries**:
  - Do not start F3 builtin/custom formatter editors, advanced JSON editing, or delete/add custom formatter row management
  - Do not change formatter runtime detection semantics beyond presenting the confirmed status shape and tolerant error/offline state
  - Do not move formatter config into plugin-global settings or add new formatter subpages beyond `overview` and `config`
  - Do not lane-hop into MCP or agent surface work, and do not refactor unrelated settings owners

## Design Review Result

- **Verdict**: `PASS`
- **Checks**:
  - Queue scope stays on roadmap F2 only: add the top-level Formatter page, wire classic/tabbed layouts, present runtime status, and implement top-level mode switching
  - Ownership stays in existing seams: a new `SettingsFormatterSection` owns formatter UI while `OpenCodianSettings.ts` and `SettingsTabbedRenderer.ts` only wire the section into classic/tabbed navigation
  - Config-vs-runtime separation is explicit: runtime formatter status is read-only and project config mutations go only through `OpencodeConfigManager` helpers from F1
  - The F2/F3 boundary is preserved: overview/runtime status and mode switching land now; builtin/custom entry editors and advanced JSON remain deferred to F3
  - Because `src/features/settings/` and locale files are in scope, deploy verification is correctly planned after a green `npm run verify`

## Implementation Summary

- OpenCode implemented the queued F2 slice by:
  - adding `formatter` as a top-level primary settings tab with `overview` / `config` secondary tabs
  - creating `SettingsFormatterSection` to render the new classic and tabbed Formatter page
  - wiring Formatter into `OpenCodianSettings.ts` and `SettingsTabbedRenderer.ts`
  - adding formatter i18n keys, focused tests, module docs, devlog, and roadmap promotion to F3
- Codex review found one semantic issue after the OpenCode pass:
  - the overview rendered an empty dropdown for mode display
  - a successful empty `formatter.status()` result was incorrectly shown as offline/unavailable
- Codex applied the smallest direct follow-up fix:
  - replaced the empty overview dropdown with a read-only mode summary
  - distinguished runtime fetch failures from successful empty formatter detection
  - added focused regression coverage for the corrected overview/runtime behavior and tabbed formatter routing

## Files Changed

- `devlog.md`
- `docs/modules/features/settings/OpenCodianSettings.md`
- `docs/modules/features/settings/SettingsFormatterSection.md`
- `docs/modules/features/settings/SettingsTabbedRenderer.md`
- `docs/modules/features/settings/settingsLayoutRegistry.md`
- `docs/modules/i18n/locales/en.md`
- `docs/modules/i18n/locales/zh.md`
- `docs/status/lanes/a3-formatter-settings/autopilot-phase-2.md`
- `docs/status/lanes/a3-formatter-settings/autopilot-round-roadmap.md`
- `src/features/settings/OpenCodianSettings.ts`
- `src/features/settings/SettingsFormatterSection.ts`
- `src/features/settings/SettingsTabbedRenderer.ts`
- `src/features/settings/settingsLayoutRegistry.ts`
- `src/i18n/locales/en.ts`
- `src/i18n/locales/zh.ts`
- `tests/unit/features/settings/OpenCodianSettings.test.ts`
- `tests/unit/features/settings/SettingsFormatterSection.test.ts`
- `tests/unit/features/settings/SettingsTabbedRenderer.test.ts`
- `tests/unit/features/settings/settingsLayoutRegistry.test.ts`

## Validation

- OpenCode pass validation:
  - `npm test -- --runInBand tests/unit/features/settings/settingsLayoutRegistry.test.ts`
  - `npm test -- --runInBand tests/unit/features/settings/OpenCodianSettings.test.ts`
  - `npm test -- --runInBand tests/unit/features/settings/settingsLayoutRegistry.test.ts tests/unit/features/settings/SettingsTabbedRenderer.test.ts tests/unit/features/settings/OpenCodianSettings.test.ts`
  - `npm test -- --runInBand tests/unit/features/settings/SettingsFormatterSection.test.ts`
  - `npm run check:module-docs`
  - `npm run verify`
- Codex follow-up validation:
  - `npm test -- --runInBand tests/unit/features/settings/SettingsFormatterSection.test.ts tests/unit/features/settings/SettingsTabbedRenderer.test.ts tests/unit/features/settings/settingsLayoutRegistry.test.ts tests/unit/features/settings/OpenCodianSettings.test.ts`
  - `npm run check:module-docs`
  - `npm run verify`
  - `perl -ne 'if(/BUILD_ID=\\$\\{\"([^\"]+)\"\\}/){print \"$1\\n\"; exit}' dist/main.js`
  - `cp dist/main.js /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/main.js`
  - `cp dist/manifest.json /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/manifest.json`
  - `cp dist/styles.css /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/styles.css`
  - `rg -n "autopilot-agent-mcp-formatter-review-loop.202604252104" /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/main.js`
  - `git diff --check`
- Result:
  - focused formatter/settings tests pass (`47 passed`)
  - `npm run check:module-docs` passes (`coverage` + `diff`)
  - `npm run verify` passes and produces build `autopilot-agent-mcp-formatter-review-loop.202604252104`
  - lint output still contains the same two pre-existing `max-lines` warnings in `OpencodeConfigManager.ts` and `OpencodeConfigManager.test.ts`; no new warning classes remain
  - Test Vault deployment succeeded and the deployed `main.js` contains the same `BUILD_ID`

## Code Review Result

- **Verdict**: `PASS`
- **Checks**:
  - Active slice stays within F2: top-level Formatter navigation, overview/config rendering, mode switching, tests, docs, roadmap/devlog
  - Runtime state remains read-only and separate from project config intent; mode switching still writes only the formatter subtree through `OpencodeConfigManager`
  - Formatter overview now reports successful empty runtime status as online instead of conflating it with offline/error state
  - Classic and tabbed layout coverage exists across `SettingsFormatterSection`, `SettingsTabbedRenderer`, `settingsLayoutRegistry`, and `OpenCodianSettings` tests
  - Required deploy verification is complete for touched `src/features/settings/` and locale files

## Outcome

- `F2 - Add the Formatter top-level settings UI` is complete and ready to keep marked `[DONE]`.
- Required deploy verification is complete for the verified build.

## Next Recommended Slice

- Promote and execute `F3 - Finish formatter editors, advanced JSON, and closeout verification` next.
