# Design: Claude Project-Level Provider Config

## Research Findings That Shape The Design

### Official configuration layers (code.claude.com/docs/en/settings)

Precedence, high → low: **managed policy → CLI/session flags → `.claude/settings.local.json` → `.claude/settings.json` → `~/.claude/settings.json`**. `settings.local.json` is the highest-priority filesystem layer and is gitignored by convention — it is the correct project-level write target. On Windows `~/.claude` resolves to `%USERPROFILE%\.claude`.

Relevant schema fields:

- `env` (object): applied to every session and spawned subprocess; **a settings-file `env` value beats a shell export of the same variable**. Setting `""` unsets for provider selection.
- `model` (string): default model; `--model` / `ANTHROPIC_MODEL` override it per session; read once at session start.
- `fallbackModel` (array, max 3; not merged across files — highest-priority file wins wholesale).
- `ANTHROPIC_DEFAULT_HAIKU_MODEL` is the current env for the small/fast tier; `ANTHROPIC_SMALL_FAST_MODEL` is **deprecated** (this supersedes the earlier grilling note naming it).

### Third-party provider mechanics (env-vars, llm-gateway-connect, model-config)

- `ANTHROPIC_BASE_URL` must point at an Anthropic-Messages-API-compatible endpoint **without** a `/v1` suffix (Claude Code appends `/v1/messages` itself).
- `ANTHROPIC_AUTH_TOKEN` is sent as `Authorization: Bearer <token>` (prefix added automatically; users must not paste `Bearer ` into the value). `ANTHROPIC_API_KEY` goes to `x-api-key` and needs one-time interactive approval — the wrong choice for a plugin-driven flow.
- Credential conflict rule: **a gateway credential variable immediately takes precedence over a saved claude.ai login; the login stays saved but unused while the variable is set.** But `ANTHROPIC_BASE_URL` alone (no credential) keeps the saved OAuth login as the active credential — the main misconfiguration to warn about.
- Model name strings are not validated against non-Anthropic gateways; free-text model input is acceptable.

### SDK semantics (agent-sdk/typescript)

- `options.env` **replaces** the subprocess environment (TS SDK); the plugin already merges `{...processEnv, ...settings.env}` in `ClaudeCodeOptionsBuilder.ts:306-312`.
- `settingSources: 'user' | 'project' | 'local'`; `'local'` covers `<cwd>/.claude/settings.local.json`. **Plugin default is `['project']` only (`settings.ts:359`)** — so the write target is dead config unless `local` is enabled. This is the single most important guidance gap.
- Programmatic SDK options (incl. `model`) override filesystem settings. The plugin currently passes `settings.model` whenever non-empty (`ClaudeCodeOptionsBuilder.ts:223-227`) — after migration it must stay empty so the project file wins.
- Managed policy settings always load and always win; if a managed deployment pins these keys, our writes lose silently → note in docs, not enforced in v1.

### cc-switch reference

- Preset = free JSON snapshot of the target settings file; we adopt a **structured subset** (named fields + extra-env map) instead of full snapshots, per grilling Q2.
- Official restore via empty-env preset + whole-file replace; we instead do **managed-key removal** because we merge-write a shared file rather than owning it wholesale.
- Managed-key ownership is defined by enumeration of provider-specific keys + sensitive-key patterns; we use a fixed enumeration plus a recorded list of last-applied extra-env keys.
- Worth borrowing: env-conflict scanning (shell `ANTHROPIC_*` display), first-run import notice, atomic writes (already have via `ProjectResourceSecureWrite.ts`).

## Data Model (plugin `data.json`, `ClaudeCodeBackendSettings` extension)

```ts
interface ClaudeProviderPreset {
  id: string;                    // stable id; built-in official = 'official'
  name: string;
  baseUrl: string;               // '' on the official preset
  authToken: string;             // written as ANTHROPIC_AUTH_TOKEN
  model: string;                 // written as top-level `model`
  fallbackModel: string;         // optional; written as a one-element `fallbackModel` array
  haikuModel: string;            // written as env.ANTHROPIC_DEFAULT_HAIKU_MODEL
  extraEnv: Record<string, string>;
}
interface ClaudeProviderSettings {
  presets: ClaudeProviderPreset[];        // always contains the immutable official preset entry
  activePresetId: string;                 // default 'official'
  lastAppliedManagedEnvKeys: string[];    // extra-env keys written by the previous apply
  modelMigrationDone: boolean;
}
```

Normalization lives beside the existing `normalizeClaudeCodeBackendSettings` in `src/core/types/settings.ts`.

## Managed Keys And Write Semantics

Managed top-level keys: `model`, `fallbackModel`.
Managed env keys: `ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_DEFAULT_HAIKU_MODEL`, plus every key in the active preset's `extraEnv`.

Apply algorithm (activate preset P):

1. Read `<vault>/.claude/settings.local.json` (tolerate missing/invalid → start from `{}`; invalid JSON → back up to `settings.local.json.bak` and warn).
2. Remove previously managed keys: managed top-level keys + managed env keys + `lastAppliedManagedEnvKeys`.
3. If P is not official: set non-empty `model` and `fallbackModel` (the latter as a one-element array), set `env.ANTHROPIC_BASE_URL` / `env.ANTHROPIC_AUTH_TOKEN` / `env.ANTHROPIC_DEFAULT_HAIKU_MODEL` for non-empty fields, merge `extraEnv` into `env`; record `extraEnv` keys into `lastAppliedManagedEnvKeys`.
4. Delete `env` if it became empty. Never touch any other key.
5. Atomic write via the `ProjectResourceSecureWrite.ts` seam (temp + rename, path-traversal-safe). Global files never pass through this seam (existing policy).

Fallback model: each preset owns an optional `fallbackModel` string; it is written as a one-element array per the official schema.

## Ownership / Module Boundaries

- **New durable owner** `src/core/agents/backend/ClaudeProjectProviderConfig.ts` (or absorbed into `ClaudeProjectSettingsDiscovery.ts` if review prefers extending the existing settings-file owner): layered read (user/project/local + shell env), merge-write of managed keys, masking helpers, preset → managed-key projection. This is a complete responsibility boundary, not a thin helper.
- **New UI section** `src/features/settings/SettingsClaudeProvidersSection.ts`, following the established `SettingsClaudeResourcesSection` pattern (group headers, row cards, modals); styles in a new `src/style/settings-claude-providers.css` (or the existing claude settings stylesheet if the module-doc gate prefers consolidation).
- `SettingsClaudeCodeSection.ts`: registers the new tab render, loses the model UI methods (L2021-2089, L2540-2600) and the mcp-runtime group (moved, not rewritten), loses the resources dispatch.
- `SettingsClaudeResourcesSection.ts`: constructor takes a kind subset (`['command','skill']` / `['agent']`); no logic rewrite.
- `settingsLayoutRegistry.ts`: secondary tab list updated; `resources` id removed, `providers` / `mcp` / `skills-commands` / `agents` added.

Final Claude secondary tabs: `runtime` · `providers` (new) · `model-thinking` (thinking/effort only) · `permissions` · `context-sources` · `tools` · `mcp` (new) · `skills-commands` (new) · `agents` (new).

## Migration

On first Providers-tab render after upgrade (guarded by `modelMigrationDone`):

- If plugin `model` / `fallbackModel` are non-empty: merge-write them into `settings.local.json` (`model`, `fallbackModel: [v]` — skipped when the file already defines `model`), clear the plugin fields, set the flag, and show a notice with an undo-free explanation. Until migration runs, legacy behavior is unchanged (SDK option still passed), so there is no silent behavior break.
- The model-selection UI is removed from `model-thinking` in the same release; `modelCatalogLoadPromise` machinery stays only if reused by the Providers tab quick-pick (free-text input with datalist suggestions from the existing catalog loader).

## Guidance Rules (Providers tab)

1. **`settingSources` lacks `local`** → blocking warning banner + one-click button that updates the plugin setting to include `local` (this is a plugin `data.json` change, not a file write). Without it the project file is never loaded.
2. **baseUrl set, token empty** → warning: saved claude.ai login remains the active credential (official rule); the gateway only receives routing.
3. **token set + OAuth login detected** (via existing `adapter.getAccountInfo()`) → informational note: the token immediately takes precedence; the login stays saved but unused; `/logout` not required.
4. **plugin `settings.env` contains `ANTHROPIC_*` keys** → warning that the legacy env map also feeds the subprocess; settings-file env wins inside Claude Code, but recommend removing duplicates.
5. **baseUrl sanity hint**: must be Anthropic-Messages-compatible and must not end with `/v1`; token must not include a `Bearer ` prefix. Inline validation messages, non-blocking.

## Global Read-Only Display

- New read path: `~/.claude/settings.json` (`os.homedir()`, Windows-safe), `<vault>/.claude/settings.json`, `<vault>/.claude/settings.local.json`, plus `process.env` filtered to `ANTHROPIC_*` / `CLAUDE_CODE_*`. All read-only; secrets masked (`sk-ant-oat01-…•••`).
- Inline comparison: beside each preset field on the active configuration, a muted read-only line shows the effective value across user + project-shared layers (and shell env when set), labeled as the global effective value.
- "View global configuration" button opens a read-only modal with three syntax-highlighted JSON panes (one per layer, marked read-only / editable) and the shell env list. Modal follows the existing settings modal patterns.

## Tab Restructure Details

- `tools` tab keeps: `tool-policy` group (allowed/disallowed/restricted builtin tools, aliases) and `question-ux` group.
- New `mcp` tab receives the `mcp-runtime` group verbatim (runtime status, reload, strict MCP JSON toggle).
- `skills-commands` tab renders `SettingsClaudeResourcesSection` with kinds `['skill','command']`; `agents` tab with `['agent']`. Section headers/counts adapt to the subset. Existing source badges (`is-project` / `is-global` / `is-global-disabled`) and the global-read-only resource policy are unchanged.
- Old `resources` tab id and its locale keys are removed; `data-claude-code-section` attributes use the new ids.

## Testing Strategy

- Unit: managed-key apply/remove matrix (unknown keys preserved, empty-env cleanup, extra-env key tracking, invalid JSON backup), migration (with/without existing file model), normalization of new settings fields, masked display helpers, guidance-rule evaluators (pure functions over {settingSources, preset, accountInfo, legacy env}).
- Mutation/DOM: Providers tab render + preset CRUD + activate flow via real DOM clicks (pattern from `SettingsCodexResourcesSection.mutation.test.ts`); tab registry contains the four new ids and not `resources`.
- Regression: existing settings-section suites (`tests/unit/features/settings/`, 89 files) must stay green with the tab split.

## Risks

- **Managed policy deployments** silently override project files — documented limitation, v1 shows file layers so users can self-diagnose.
- **`/model` writes back to user settings** (v2.1.153+): in-chat model switching lands in `~/.claude/settings.json`, outside our project story; the global modal makes this visible.
- **Another session's uncommitted WIP** touches adjacent settings files (resources sections); implementation must rebase carefully and only stage its own files.
