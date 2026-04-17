# Feature Agents / Commands Phase 13

> Date: 2026-04-17
> Status: completed
> Slice: ordered plan item 6 — command placeholder reference shell in the Commands editor

## Completed slice

- Added an OpenCodian placeholder reference block inside `SettingsProjectCommandEditor` directly beneath the command template field.
- Listed the currently supported command template tokens: `{{vault_path}}`, `{{current_note_path}}`, `{{current_selection}}`, `{{external_context_paths}}`, and `{{conversation_title}}`.
- Updated Commands editor copy in both locales so the UI now frames these tokens as settings-time guidance, while keeping runtime placeholder expansion and slash execution for later slices.
- Added a focused editor test that asserts the placeholder reference renders all supported tokens.

## Scope and boundaries

- Stayed inside ordered plan item 6 and only extended the existing Commands settings/editor seam created in phase 12.
- Kept ownership in `SettingsProjectCommandEditor` for placeholder reference rendering; no new runtime ownership was added to `OpenCodianView` or `OpenCodeService`.
- Did not start runtime placeholder expansion, slash autocomplete/execution, or command-owned hidden agent generation.
- Updated only directly related settings module docs, locale strings, focused tests, and this phase note. No Test Vault deployment was run.

## Files changed

- `src/features/settings/SettingsProjectCommandEditor.ts`
- `src/i18n/locales/en.ts`
- `src/i18n/locales/zh.ts`
- `tests/unit/features/settings/SettingsProjectCommandEditor.test.ts`
- `docs/modules/features/settings/SettingsCommandsSection.md`
- `docs/modules/features/settings/SettingsProjectCommandEditor.md`
- `docs/modules/features/settings/OpenCodianSettings.md`
- `docs/status/feature-agents-commands-phase-13.md`

## Validation

- Targeted: `npm test -- --runInBand tests/unit/features/settings/SettingsProjectCommandEditor.test.ts tests/unit/features/settings/SettingsCommandsSection.test.ts`
- Lint: `npm run lint`
- Typecheck: `npm run typecheck`
- Full tests: `npm test`
- Build: `npm run build`

## Next recommended slice

- Continue ordered plan item 6 with runtime placeholder expansion helpers for slash command templates (`{{vault_path}}`, `{{current_note_path}}`, `{{current_selection}}`, `{{external_context_paths}}`, `{{conversation_title}}`) in adjacent command execution owners, while still leaving slash autocomplete/execution wiring and command-owned hidden agent generation for later slices.
