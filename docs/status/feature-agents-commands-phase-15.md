# Feature Agents / Commands Phase 15

> Date: 2026-04-17
> Status: completed
> Slice: ordered plan item 6 — chat-side slash command execution owner

## Completed slice

- Added `SlashCommandExecutionService` as the dedicated chat-side runtime owner for slash command execution.
- Intercepted composer submissions in `SendPipelineRuntime` before the normal streaming send path so recognized slash commands now delegate to `OpenCodeService.runSessionCommand()`.
- Gathered runtime placeholder context from the active conversation and focus preview before execution:
  - `vaultPath`
  - `currentNotePath`
  - `currentSelection`
  - `externalContextPaths`
  - `conversationTitle`
- Reused existing foreground-busy and server-readiness gates, then started the existing conversation sync loop and triggered a visible background sync after command execution.
- Added focused tests for project/runtime command recognition, MCP/skill exclusion, busy/server failure gates, placeholder-context collection, and send-runtime interception.

## Scope and boundaries

- Stayed inside ordered plan item 6 and only completed the chat-side slash execution seam hinted by phase 14.
- Kept new runtime ownership out of `OpenCodianView` and `OpenCodeService`; `OpenCodianView` only wires the new host.
- Did not start slash autocomplete UI, slash menu rendering, hidden command menu behavior changes, or command-owned hidden agent generation.
- Updated only directly related chat runtime/module docs, locale strings for execution failure notices, focused tests, and this phase note. No Test Vault deployment was run.

## Files changed

- `src/features/chat/services/SlashCommandExecutionService.ts`
- `src/features/chat/runtime/SendPipelineRuntime.ts`
- `src/features/chat/OpenCodianView.ts`
- `src/i18n/locales/en.ts`
- `src/i18n/locales/zh.ts`
- `tests/unit/features/chat/SlashCommandExecutionService.test.ts`
- `tests/unit/features/chat/SendPipelineRuntime.test.ts`
- `docs/modules/features/chat/services/SlashCommandExecutionService.md`
- `docs/modules/features/chat/runtime/SendPipelineRuntime.md`
- `docs/status/feature-agents-commands-phase-15.md`

## Validation

- Targeted: `npm test -- --runInBand tests/unit/features/chat/SlashCommandExecutionService.test.ts tests/unit/features/chat/SendPipelineRuntime.test.ts`
- Lint: `npm run lint`
- Typecheck: `npm run typecheck`
- Full tests: `npm test`
- Build: `npm run build`

## Next recommended slice

- Continue ordered plan item 6 by wiring slash autocomplete/UI to the merged runtime+project command catalog, respecting `hiddenSlashCommands`, while still leaving command-owned hidden agent generation for a later slice.
