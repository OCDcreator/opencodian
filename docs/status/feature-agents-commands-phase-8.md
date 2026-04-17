# Feature Agents / Commands Phase 8

> Date: 2026-04-17
> Status: completed
> Slice: ordered plan item 5 — Agents settings project-agent disable editing

## Completed slice

- Extended the existing project-agent editor with project-scoped `disable` editing for `agent.<id>.disable`.
- Preserved the existing default-agent eligibility rule: disabled `primary` / `all` agents stay out of the normal default dropdown, but an already-selected `default_agent` still renders as an unavailable fallback option instead of being silently dropped.
- Kept writes limited to the current vault’s `.opencode/opencode.json` by continuing to route saves through `OpencodeConfigManager.upsertAgentConfig()`.

## Scope and boundaries

- Stayed inside ordered plan item 5 and did not start `permission.task` allowlists, `options`, commands, or slash-command runtime.
- Extended the existing `SettingsProjectAgentEditor` + `SettingsAgentsSection` seam instead of adding ownership to `OpenCodianView.ts` or `OpenCodeService.ts`.
- Updated only the directly related module docs plus this phase note.
- Did not touch `reference-projects/`, deployment flow, or unrelated feature tracks.

## Files changed

- `src/features/settings/SettingsProjectAgentEditor.ts`
- `src/i18n/locales/en.ts`
- `src/i18n/locales/zh.ts`
- `tests/unit/features/settings/SettingsAgentsSection.test.ts`
- `docs/modules/features/settings/SettingsAgentsSection.md`
- `docs/modules/features/settings/SettingsProjectAgentEditor.md`
- `docs/modules/features/settings/OpenCodianSettings.md`
- `docs/status/feature-agents-commands-phase-8.md`

## Validation

- Targeted: `npm test -- --runInBand tests/unit/features/settings/SettingsAgentsSection.test.ts`
- Lint: `npm run lint`
- Typecheck: `npm run typecheck`
- Full tests: `npm test`
- Build: `npm run build`

## Next recommended slice

- Continue ordered plan item 5 with project-agent `permission.task` allowlist editing in the Agents settings flow, keeping writes project-scoped to `.opencode/opencode.json` and leaving `options` plus commands/slash runtime for later slices.
