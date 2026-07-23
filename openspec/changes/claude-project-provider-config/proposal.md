# Proposal: Claude Project-Level Provider Config

## Problem

The Claude Code backend currently has no guided way to use third-party API providers (Anthropic-compatible gateways such as LiteLLM, or community relays for GLM/Kimi/DeepSeek-style models). Users must hand-edit `.claude/settings.local.json` or shell env vars with no visibility into what is globally configured, no validation, and no way to switch providers.

Secondary problems:

- Model selection (`model` / `fallbackModel`) lives in plugin settings (`data.json`) and is passed as an SDK programmatic option, which **overrides any filesystem settings** — so even a hand-written project config loses to the plugin. The plugin's default `settingSources: ['project']` also excludes `local`, meaning `.claude/settings.local.json` is not loaded at all by default.
- The `resources` secondary tab crams commands, skills, and agents into one page, while MCP config is buried inside the `tools` tab. The user wants four focused sub-tabs: **Tools / MCP / Skills & Commands / Agents** (skills and commands share one tab because both are slash-invoked).

## Governing Constraints

This change must obey:

- `AGENTS.md` (no thin helper/adapter files unless a durable boundary; keep new runtime ownership out of `OpenCodianView.ts` / `OpenCodeService.ts`; module docs + graphify gates)
- `docs/status/development-maintainability-rules.md`

Hard constraints:

- Global Claude resources and global settings files (`~/.claude/**`) are strictly read-only — consistent with the existing policy in `ProjectResourceSecureWrite.ts` and `ClaudeCodeProcessResolver.ts`.
- All user edits land at **project level only**: `<vault>/.claude/settings.local.json`.
- Codex backend is out of scope for this change.
- This proposal covers spec + plan only; implementation happens under `/opsx-apply`.

## Proposed Solution

Nine decisions locked via grilling and research reconciliation with the user (2026-07-23):

1. **Project-level landing mechanism**: plugin UI acts as a guided editor for `<vault>/.claude/settings.local.json` (official Claude Code local-settings layer; highest-priority filesystem scope; also effective for terminal `claude` runs in the vault). Writes are merge-style: only an enumerated set of managed keys is touched, unknown user keys are preserved, writes go through the existing atomic-write seam (`ProjectResourceSecureWrite.ts`).
2. **Provider presets**: cc-switch-style named presets (name / baseUrl / authToken / model / optional fallbackModel / haiku-level model / extra env) stored in plugin `data.json`. Activating a preset rewrites the managed keys in `settings.local.json`. A built-in "Anthropic Official" preset removes the managed keys (clean restore).
3. **Model truth source moves to project level**: `model` + `fallbackModel` migrate from plugin settings into `settings.local.json` (`model` / `fallbackModel` top-level fields). The plugin stops passing the SDK `model` option once migrated (the OptionsBuilder already omits empty values), and the model UI leaves the `model-thinking` tab, which keeps only thinking/effort.
4. **Global read-only visibility**: the new Providers tab shows per-field inline read-only "global effective value" (masked), plus a read-only modal rendering the full precedence chain — `~/.claude/settings.json`, `<vault>/.claude/settings.json`, `<vault>/.claude/settings.local.json` — and shell `ANTHROPIC_*` / `CLAUDE_CODE_*` env vars.
5. **Guidance**: warn + one-click fix when `settingSources` lacks `local` (project file would be dead config); warn when baseUrl is set without a token (saved claude.ai OAuth stays the active credential per official rules); note that `ANTHROPIC_AUTH_TOKEN` immediately takes precedence over a saved login (no `/logout` needed).
6. **Tab restructure (Claude backend only)**: `tools` keeps built-in tool policy + question UX; new `mcp` tab takes the mcp-runtime group; `resources` tab is replaced by `skills-commands` and `agents` tabs.
7. **Fallback serialization**: a non-empty preset `fallbackModel` is written as the one-element `fallbackModel` array required by Claude Code settings.
8. **Local-source gate**: absent `settingSources: ['local']`, migration and every provider-file write are blocked; the only available action is the ordered one-click enablement repair.
9. **Current Anthropic small-model key**: preset haiku routing uses `ANTHROPIC_DEFAULT_HAIKU_MODEL`; deprecated `ANTHROPIC_SMALL_FAST_MODEL` is never written.

## Scope

### In Scope

- New `providers` secondary tab under the Claude Code backend settings section: preset CRUD, activate/switch, official restore, inline global comparison, global-files read-only modal, guidance banners.
- New core owner for reading/writing Claude settings files (project read-write, global read-only) with managed-key merge semantics.
- One-time migration of plugin `model` / `fallbackModel` into `settings.local.json`; removal of model selection UI from `model-thinking` tab (thinking/effort stay).
- Secondary tab restructure: `tools` / `mcp` / `skills-commands` / `agents`; `settingsLayoutRegistry.ts` update; `SettingsClaudeResourcesSection` parameterized by resource-kind subset.
- Locale (zh/en), styles, module docs, graphify refresh, tests.

### Out of Scope

- Codex backend changes.
- Writing to `~/.claude/**` or any global file.
- Gateway model discovery (`CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY`) and `/v1/models` probing — free-text model fields only in v1.
- Bedrock / Vertex / Foundry first-class presets (env keys remain available via preset extra-env).
- `apiKeyHelper` script management.

## Acceptance Criteria

- Activating a preset rewrites only the managed keys in `<vault>/.claude/settings.local.json`; unknown pre-existing keys survive; write is atomic.
- Activating the built-in official preset removes all managed keys (and an emptied `env` object), leaving other content intact.
- After migration, the plugin no longer passes `model` / `fallbackModel` SDK options; effective model comes from the project file.
- When `settingSources` lacks `local`, the Providers tab shows a blocking warning with a one-click fix that adds it.
- Global layers are displayed read-only with secrets masked; no UI path writes outside the vault.
- Four-tab split renders exactly: Tools (tool policy + question UX), MCP (mcp-runtime), Skills & Commands, Agents; the old `resources` tab id is gone from the registry.
- `npm run verify` green; module docs and graphify refreshed.

## Verification

```bash
npm run verify
node scripts/run-jest.js tests/unit/features/settings/ tests/unit/core/agents/backend/
npm run check:module-docs
```

## References

- Research basis (official docs):
  - Settings precedence & paths: <https://code.claude.com/docs/en/settings>
  - Env vars (`ANTHROPIC_BASE_URL` / `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_DEFAULT_HAIKU_MODEL` …): <https://code.claude.com/docs/en/env-vars>
  - Model precedence & `fallbackModel`: <https://code.claude.com/docs/en/model-config>
  - Gateway connection, credential conflict rules, SDK env semantics: <https://code.claude.com/docs/en/llm-gateway-connect>
  - SDK `settingSources` / `env` / settings precedence: <https://code.claude.com/docs/en/agent-sdk/typescript>
- cc-switch reference (preset model, backfill discipline, official-restore semantics): `reference-projects/cc-switch` (upstream `farion1231/cc-switch`)
- Current code seams:
  - `src/features/settings/SettingsClaudeCodeSection.ts` (tabs L265, model UI L2021-2089 + L2540-2600, mcp-runtime L2741-2756, tool-policy L2747-2752, resources dispatch L326-336 + L379-393)
  - `src/features/settings/settingsLayoutRegistry.ts:52` (resources tab registration)
  - `src/features/settings/SettingsClaudeResourcesSection.ts` (`ClaudeResourceKind` L55)
  - `src/core/agents/backend/ClaudeCodeOptionsBuilder.ts` (options build L201, model L223-227, env merge L306-312)
  - `src/core/agents/backend/ClaudeProjectSettingsDiscovery.ts` (project settings read/create L190/L204)
  - `src/core/agents/backend/ProjectResourceSecureWrite.ts` (atomic write seam)
  - `src/core/types/settings.ts` (`ClaudeCodeSettingSource` L39, `ClaudeCodeBackendSettings` L137, `settingSources` default L359)
