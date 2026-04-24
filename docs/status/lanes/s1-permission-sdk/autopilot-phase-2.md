## Round Design

- **Exact `[NEXT]` slice**: `P2 - Align security settings wording and config semantics`
- **Targeted files/modules**:
  - `src/features/settings/SettingsSecuritySection.ts`
  - `src/core/config/OpencodeConfigManager.ts`
  - `src/i18n/locales/en.ts`
  - `src/i18n/locales/zh.ts`
  - `tests/unit/core/config/OpencodeConfigManager.permissionSummary.test.ts`
  - `tests/unit/features/settings/SettingsSecuritySection.test.ts`
  - `docs/modules/features/settings/SettingsSecuritySection.md`
  - `docs/modules/core/config/OpencodeConfigManager.md`
  - `docs/modules/core/types/settings.md`
  - `docs/modules/i18n/locales/en.md`
  - `docs/modules/i18n/locales/zh.md`
- **Upstream SDK / command contract to confirm**:
  - OpenCode permission config is rule-based, not only mode-based: patterned rules such as `external_directory` directory globs and task allowlists are custom permission contracts, not shorthand “plan mode”.
  - OpenCode evaluates the last matching permission rule, so broad templates and explicit custom rules must stay distinguishable in OpenCodian’s config-status wording.
  - `external_directory` semantics are directory-glob based and should be described as such; this round stays in the permission lane and does not change slash-command runtime behavior.
- **Tests to run**:
  - Targeted red/green: `npm test -- --runInBand tests/unit/core/config/OpencodeConfigManager.test.ts tests/unit/features/settings/SettingsSecuritySection.test.ts`
  - Full validation: `npm run verify`
  - Validation gaps from controller config: no separate lint, typecheck, build, or vulture command is configured for this round.
- **Non-goals / boundaries**:
  - No slash-command runtime or slash settings work.
  - No permission transport / reply / stream changes from `P1`.
  - No deploy step.
  - Keep the slice behavior-preserving except where settings wording or config-status semantics are currently misleading.

## Design Review Result

- `PASS` — `automation/opencode-review.sh plan` produced a PASS review in `automation/runtime/opencode-reviews/20260424-114416-plan.txt`.
- The helper still exited with “verdict missing” because the reviewer emitted markdown `**Verdict: PASS**` instead of the wrapper’s exact sentinel line, so this round followed the review log content as the source of truth.
- The reviewer specifically called out the old `hasDeny => plan` heuristic as the main semantic mismatch and recommended descriptive config summaries over fuzzy mode bucketing.

## Implementation Summary

- Centralized OpenCodian permission-template semantics in `OpencodeConfigManager.ts` with `getPermissionTemplate()` and `summarizePermissionConfig()`, so the settings UI now recognizes only exact template matches and surfaces custom rule features like `external_directory`, task allowlists, and other patterned rules.
- Reworked `SettingsSecuritySection.ts` to use the new summary helper for config-status copy, switched permission-mode notices to human labels, and removed the remaining hardcoded English restart/config strings in favor of locale keys.
- Reframed `settings.security.*` copy in both locale tables from “permission mode” wording to “permission template / config summary” wording, and clarified that the external-access toggle and saved paths are plugin-side helpers rather than direct runtime permission writes.
- Added focused regression coverage for template recognition and custom-status rendering, then updated the matching module docs to reflect the new shorthand-template mental model.

## Files Changed

- `src/core/config/OpencodeConfigManager.ts`
- `src/features/settings/SettingsSecuritySection.ts`
- `src/i18n/locales/en.ts`
- `src/i18n/locales/zh.ts`
- `tests/unit/core/config/OpencodeConfigManager.permissionSummary.test.ts`
- `tests/unit/features/settings/SettingsSecuritySection.test.ts`
- `docs/modules/core/config/OpencodeConfigManager.md`
- `docs/modules/core/types/settings.md`
- `docs/modules/features/settings/SettingsSecuritySection.md`
- `docs/modules/i18n/locales/en.md`
- `docs/modules/i18n/locales/zh.md`

## Validation

- Red state: `npm test -- --runInBand tests/unit/core/config/OpencodeConfigManager.test.ts tests/unit/features/settings/SettingsSecuritySection.test.ts`
- Green targeted tests: `npm test -- --runInBand tests/unit/core/config/OpencodeConfigManager.test.ts tests/unit/core/config/OpencodeConfigManager.permissionSummary.test.ts tests/unit/features/settings/SettingsSecuritySection.test.ts`
- Green docs sync check: `npm run check:module-docs`
- Green full validation: `npm run verify`
- Validation note: the first `npm run verify` surfaced lint blockers (import order, locale escapes, and max-lines warnings). This round fixed those issues, reran targeted tests, reran the code review, and then reran `npm run verify` successfully.

## Code Review Result

- `PASS` — `automation/opencode-review.sh code` produced a PASS review in `automation/runtime/opencode-reviews/20260424-120752-code.txt`.
- Like the plan review helper, the wrapper printed “verdict missing” because the reviewer emitted markdown-style PASS text instead of the exact sentinel line; the saved review log still contains a PASS outcome with no blockers.
- Non-blocking notes left for later: `notifyRestartRequired()` still has one old hardcoded notice, and the Chinese locale intentionally keeps a couple of technical terms untranslated in the custom-status detail list.

## Outcome

- Lane `s1-permission-sdk` now finishes `P2` with security settings and config-status wording that match the actual OpenCode rule model, without expanding the slice into slash-command work.
- The old “any deny means plan mode” drift is gone; custom patterned rules now stay visibly custom.
- With `P1` and `P2` both complete, lane `s1-permission-sdk` is ready to hand off to the next lane controller.

## Next Recommended Slice

- `s2-slash-sdk` → `C1 - Complete runtime slash catalog and execution alignment`
