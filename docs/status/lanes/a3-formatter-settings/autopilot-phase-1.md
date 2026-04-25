# Autopilot Phase 1 — `a3-formatter-settings`

## Round Design

- **Exact `[NEXT]` slice**: `F1 - Add formatter config types and runtime/config helpers`
- **Active spec file**: `docs/superpowers/specs/2026-04-25-formatter-settings-design.md`
- **External reference file(s)**:
  - `/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/opencode-formatter-doc.md`
  - `/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/opencode/packages/opencode/src/format/index.ts`
  - `/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/opencode/packages/opencode/src/config/formatter.ts`
  - `/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/opencode/packages/sdk/js/src/v2/gen/types.gen.ts`
- **Targeted files/modules**:
  - `src/core/types/opencodeConfig.ts`
  - `src/core/types/index.ts`
  - `src/core/config/OpencodeConfigManager.ts`
  - `tests/unit/core/config/OpencodeConfigManager.test.ts`
  - `docs/modules/core/types/opencodeConfig.md`
  - `docs/modules/core/types/index.md`
  - `docs/modules/core/config/OpencodeConfigManager.md`
- **Upstream/runtime contract to confirm**:
  - OpenCode config accepts `formatter?: boolean | Record<string, { disabled?: boolean; command?: string[]; environment?: Record<string, string>; extensions?: string[] }>`
  - `formatter.status()` returns `Array<{ name: string; extensions: string[]; enabled: boolean }>`
  - Formatter config helpers must preserve unknown top-level config fields and unknown per-entry fields when reading/updating the formatter subtree
- **Targeted tests to run**:
  - `npm test -- --runInBand tests/unit/core/config/OpencodeConfigManager.test.ts`
  - `npm run check:module-docs`
  - `npm run verify`
- **Deploy-required paths likely touched**: `No` — this slice is limited to config/types/tests/docs and should not require Test Vault deployment
- **Non-goals / boundaries**:
  - Do not start the `Formatter` settings UI page or any classic/tabbed settings wiring
  - Do not change runtime formatter querying beyond confirming its response shape for future slices
  - Do not edit locale files or broader settings ownership
  - Do not reshape unrelated config helpers or lane-hop into F2/F3

## Design Review Result

- **Verdict**: `PASS`
- **Checks**:
  - Queue scope matches roadmap F1 only: typed formatter config + minimal config-manager helpers + tests/docs
  - Ownership stays in existing seams: config typing in `src/core/types/*`, formatter subtree reads/writes in `OpencodeConfigManager`
  - Upstream contract was verified against OpenCode source: config schema is boolean-or-record, and runtime status is an array of `{ name, extensions, enabled }`
  - Preservation requirement is clear: manager helpers must merge object patches and avoid stripping unknown formatter entry fields
  - No deploy-required files are part of this slice, so deployment is correctly out of scope unless implementation unexpectedly expands

## Implementation Summary

- OpenCode implemented the queued F1 slice in the existing config/type seams only:
  - added explicit formatter config/status typing in `src/core/types/opencodeConfig.ts`
  - re-exported formatter types from `src/core/types/index.ts`
  - added `getFormatterConfig()` / `updateFormatterConfig()` in `src/core/config/OpencodeConfigManager.ts`
  - added focused formatter read/write coverage in `tests/unit/core/config/OpencodeConfigManager.test.ts`
  - synced the matching module docs
- Codex review found one semantic mismatch after the OpenCode pass: `updateFormatterConfig({})` was deleting the formatter field instead of preserving the spec’s explicit empty custom-mode object.
- Codex applied the smallest direct follow-up fix:
  - preserve `{}` as an exact formatter subtree write
  - update the focused test and module docs to match that contract

## Files Changed

- `src/core/types/opencodeConfig.ts`
- `src/core/types/index.ts`
- `src/core/config/OpencodeConfigManager.ts`
- `tests/unit/core/config/OpencodeConfigManager.test.ts`
- `docs/modules/core/types/opencodeConfig.md`
- `docs/modules/core/types/index.md`
- `docs/modules/core/config/OpencodeConfigManager.md`
- `docs/status/lanes/a3-formatter-settings/autopilot-round-roadmap.md`
- `docs/status/lanes/a3-formatter-settings/autopilot-phase-1.md`

## Validation

- OpenCode pass validation:
  - `npm test -- --runInBand tests/unit/core/config/OpencodeConfigManager.test.ts`
  - `npm run check:module-docs`
  - `npm run lint`
  - `npm run typecheck`
  - `npm test`
  - `npm run build`
- Codex validation:
  - `npm test -- --runInBand tests/unit/core/config/OpencodeConfigManager.test.ts`
  - `npm run verify`
- Result:
  - targeted formatter manager tests pass
  - `npm run verify` exits successfully and produces build `autopilot-agent-mcp-formatter-review-loop.202604252030`
  - lint still reports two pre-existing `max-lines` warnings on long-lived touched files; no new warning classes remain after the Codex follow-up fix

## Code Review Result

- **Verdict**: `PASS`
- **Checks**:
  - Active slice stays within F1: types, config-manager helpers, tests, and module docs only
  - Formatter typing now matches the verified upstream contract: config accepts boolean-or-record, runtime status is `{ name, extensions, enabled }`
  - `updateFormatterConfig()` now preserves exact subtree intent, including explicit empty-object custom mode and entry deletion by replacement
  - Unknown formatter entry fields and unrelated top-level config fields remain preserved by read/write helpers
  - No formatter UI, locale, or deploy-required paths were touched

## Outcome

- `F1 - Add formatter config types and runtime/config helpers` is complete and ready to mark `[DONE]`.
- No deploy step is required for this slice.

## Next Recommended Slice

- If this slice passes, promote `F2 - Add the Formatter top-level settings UI` to `[NEXT]`.
