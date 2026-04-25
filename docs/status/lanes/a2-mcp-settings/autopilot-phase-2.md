# Autopilot Phase 2 — `a2-mcp-settings`

## Round Design

- **Queued slice**: `[NEXT] M2 - Implement MCP server operations and add-server forms`
- **Active spec**: `docs/superpowers/specs/2026-04-25-opencodian-mcp-settings-and-tooling-design.md`
- **External reference**: `/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/opencode-mcp-servers-doc.md`
- **Targeted files/modules**:
  - `src/features/settings/SettingsMcpSection.ts`
  - `src/core/opencode/OpenCodeService.ts` only for bounded façade helpers/types if the current MCP surface proves insufficient
  - `src/core/opencode/OpenCodeCatalogQueryCoordinator.ts` only if mutation return handling or refresh seams need minimal extension
  - `src/i18n/locales/en.ts` and `src/i18n/locales/zh.ts`
  - matching tests under `tests/unit/features/settings/` and `tests/unit/core/opencode/`
  - matching module docs under `docs/modules/features/settings/`, `docs/modules/core/opencode/`, and locale docs if locale keys change materially
- **Upstream/runtime contract to confirm**:
  - Keep MCP ownership inside the existing `Server > MCP` settings owner and existing `OpenCodeService` façade; no direct SDK namespace calls from the UI.
  - Use the already-exposed MCP service actions as the truth source: `addMcpServer()`, `connectMcpServer()`, `disconnectMcpServer()`, `authenticateMcp()`, and `removeMcpAuth()`, with runtime status continuing to come from `refreshMcpServerStatus()` / `getMcpServerSnapshot()`.
  - Support only the queued add-server flows: `local` and `remote`, with minimal schema fields from the spec/reference (`command[]`, `environment`, `url`, `headers`, optional OAuth config, `enabled`, `timeout`) and user-facing validation before submission.
  - Keep OAuth handling at the trigger/feedback layer for this slice: surface `Authenticate` / `Clear Auth`, but do not add a manual callback/code form or a full MCP editor for existing entries.
  - After successful add/connect/disconnect/auth/clear-auth actions, refresh runtime MCP status and let the existing catalog subscription update the UI; do not invent optimistic fake state.
- **Targeted tests to run**:
  - focused Jest for `SettingsMcpSection`
  - focused Jest for `OpenCodeCatalogQueryCoordinator` if the coordinator/facade contract changes
  - `npm run check:module-docs`
  - `npm run verify`
- **Deploy-required paths likely touched**: `Yes`. The slice is expected to touch `src/features/settings/` and locale files, so a successful verified round will require Test Vault deployment and `BUILD_ID` verification.
- **Non-goals / boundaries**:
  - no MCP tool identity / hydrate / streaming work; that remains `M3`
  - no MCP resources or prompts browser
  - no advanced editor for existing MCP entries
  - no new top-level MCP settings page
  - no direct server / SDK protocol changes

## Design Review Result

- **Verdict**: `PASS`
- **Why this design is ready**:
  - The queue/spec/reference align cleanly on a bounded M2 slice: extend the new `SettingsMcpSection` owner with server actions plus add-local/add-remote forms, while deferring tool identity consistency to `M3`.
  - The current codebase already exposes the needed runtime contract. `OpenCodeService` has the full MCP façade (`addMcpServer`, `connectMcpServer`, `disconnectMcpServer`, `authenticateMcp`, `removeMcpAuth`), and `OpenCodeCatalogQueryCoordinator` already refreshes MCP status after those mutations, so the UI can stay inside existing service/query seams.
  - `SettingsMcpSection` already owns MCP snapshot rendering, refresh triggering, and catalog subscriptions, making it the correct place to add action buttons and form state without regrowing `OpenCodianSettings.ts` or introducing a separate MCP management owner.
  - The design keeps the UI scope deliberately small: local/remote add forms only, per-status action visibility, Notice-based error feedback, and runtime-truth refresh after successful actions. That satisfies the acceptance criteria without spilling into an advanced config editor or OAuth browser flow.
- **Risks watched during implementation**:
  - action visibility must stay status-aware (`connected`, `disabled`, `failed`, `needs_auth`, `needs_client_registration`) and not offer unsupported fixes for client-registration errors
  - add-form validation must block duplicate names, empty command/header/env keys, invalid URLs, and non-positive timeout values before hitting the service façade
  - post-action refresh behavior must remain single-source-of-truth via runtime snapshot updates rather than local optimistic mutation

## Implementation Summary

- **OpenCode pass 1**:
  - added the initial MCP actions/forms implementation, locale strings, focused tests, and docs updates inside `SettingsMcpSection`
  - Codex review then flagged two real spec blockers: dropped `enabled: false` and missing configured-OAuth `redirectUri`
- **OpenCode pass 2 + tiny Codex patch**:
  - repaired explicit `enabled` preservation, added `redirectUri`, and added regression coverage for configured OAuth payload semantics
  - Codex then found `npm run verify` still emitted lint warnings because `SettingsMcpSection.ts` and its single test file had grown past the repo max-line thresholds
- **OpenCode pass 3**:
  - extracted the add-server form into `src/features/settings/SettingsMcpAddForm.ts`
  - split the bulky settings test into `SettingsMcpSection.test.ts`, `SettingsMcpSection.actions.test.ts`, and shared test helpers under `tests/unit/features/settings/helpers/`
  - added `docs/modules/features/settings/SettingsMcpAddForm.md` and refreshed the existing settings/locale docs

## Files Changed

- `src/features/settings/SettingsMcpSection.ts`
- `src/features/settings/SettingsMcpAddForm.ts`
- `src/i18n/locales/en.ts`
- `src/i18n/locales/zh.ts`
- `tests/unit/features/settings/SettingsMcpSection.test.ts`
- `tests/unit/features/settings/SettingsMcpSection.actions.test.ts`
- `tests/unit/features/settings/helpers/mcpSectionTestHelpers.ts`
- `docs/modules/features/settings/SettingsMcpSection.md`
- `docs/modules/features/settings/SettingsMcpAddForm.md`
- `docs/modules/i18n/locales/en.md`
- `docs/modules/i18n/locales/zh.md`
- `docs/status/lanes/a2-mcp-settings/autopilot-round-roadmap.md`
- `docs/status/lanes/a2-mcp-settings/autopilot-phase-2.md`

## Validation

- **Focused Jest**
  - `npm test -- --runInBand --runTestsByPath tests/unit/features/settings/SettingsMcpSection.test.ts`
  - `18` tests passed after the configured-OAuth / enabled-state repair
  - `npm test -- --runInBand --runTestsByPath tests/unit/features/settings/SettingsMcpSection.test.ts tests/unit/features/settings/SettingsMcpSection.actions.test.ts`
  - `2` suites / `18` tests passed after the lint-driven test split
- **Module docs**
  - `npm run check:module-docs`
  - coverage OK and diff OK after the extracted `SettingsMcpAddForm` module/doc landed
- **Full verification**
  - first `npm run verify` built successfully but exposed lint warnings (`max-lines` / `max-lines-per-function`), so the round stayed open
  - final `npm run verify` passed cleanly: module docs, lint, typecheck, full Jest (`332` suites / `1619` tests), and production build all succeeded
  - extracted `BUILD_ID`: `autopilot-agent-mcp-formatter-review-loop.202604251643`
- **Deploy verification**
  - copied verified `dist/main.js`, `dist/manifest.json`, and `dist/styles.css` to `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/`
  - verified deployed `main.js` contains `BUILD_ID` `autopilot-agent-mcp-formatter-review-loop.202604251643`

## Code Review Result

- **Verdict**: `PASS`
- **Why the slice now passes review**:
  - `M2` stays inside queue scope: it adds only MCP server actions/forms plus the docs/tests needed to keep the new settings surface truthful and maintainable
  - the add-server form now preserves explicit `enabled` state for both local and remote payloads, keeps configured OAuth distinct from auto, and includes the full queued configured-OAuth field set including `redirectUri`
  - the refactor to `SettingsMcpAddForm` and split test files fixes the repo-enforced lint warnings without changing the queued M2 behavior or hopping into `M3`
  - the roadmap only advances to `M3` after Codex review, focused tests, `check:module-docs`, `npm run verify`, and Test Vault deploy verification all passed

## Outcome

- `M2` is complete and verified. The `Server > MCP` settings surface now supports runtime-aware MCP connect/disconnect/auth flows plus validated local/remote add-server forms, with docs/tests synced and lint-clean.

## Next Recommended Slice

- `[NEXT] M3 - Stabilize MCP tool identity across history and streaming`
