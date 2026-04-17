# Feature Agents / Commands Phase 14

> Date: 2026-04-17
> Status: completed
> Slice: ordered plan item 6 — runtime placeholder expansion at the session command execution seam

## Completed slice

- Added typed runtime placeholder context support to `OpenCodeSessionControlOrchestrator.runSessionCommand()` so command templates can expand `{{vault_path}}`, `{{current_note_path}}`, `{{current_selection}}`, `{{external_context_paths}}`, and `{{conversation_title}}` immediately before SDK execution.
- Normalized path-like placeholder values through the shared context-path helper and joined persistent external context paths as newline-delimited text.
- Kept placeholder expansion non-recursive so placeholder-looking text inside the actual selection or conversation title is preserved literally.
- Stripped the helper-only placeholder context payload before forwarding the command request to the SDK.

## Scope and boundaries

- Stayed inside ordered plan item 6 and only extended the existing session command execution seam shared by `OpenCodeService` and `OpenCodeSessionControlOrchestrator`.
- Kept runtime ownership out of `OpenCodianView` and did not add new slash UI/autocomplete owners.
- Did not start slash menu wiring, command-owned hidden agent generation, or any settings-surface changes beyond the already completed placeholder reference work.
- Updated only directly related core opencode module docs, focused tests, and this phase note. No Test Vault deployment was run.

## Files changed

- `src/core/opencode/OpenCodeSessionControlOrchestrator.ts`
- `src/core/opencode/OpenCodeService.ts`
- `tests/unit/core/opencode/OpenCodeSessionControlOrchestrator.test.ts`
- `docs/modules/core/opencode/OpenCodeSessionControlOrchestrator.md`
- `docs/modules/core/opencode/OpenCodeService.md`
- `docs/status/feature-agents-commands-phase-14.md`

## Validation

- Targeted: `npm test -- --runInBand tests/unit/core/opencode/OpenCodeSessionControlOrchestrator.test.ts tests/unit/core/opencode/OpenCodeService.sdkCompat.test.ts`
- Lint: `npm run lint`
- Typecheck: `npm run typecheck`
- Full tests: `npm test`
- Build: `npm run build`

## Next recommended slice

- Continue ordered plan item 6 by adding a chat-side slash command execution owner that gathers the active conversation’s runtime placeholder context and calls `OpenCodeService.runSessionCommand()` for project/runtime commands, while still leaving slash autocomplete UI and command-owned hidden agent generation for later slices.
