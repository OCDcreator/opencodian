# Spec: Claude Project-Level Provider Config

## ADDED Requirements

### Requirement: provider preset management

The Claude backend settings MUST provide a Providers secondary tab where the user manages named third-party provider presets stored in plugin settings.

Each preset MUST carry: name, baseUrl, authToken, model, optional fallbackModel, haiku-level model, and an extra-env map. A built-in, immutable "Anthropic Official" preset MUST always exist and MUST be the default active preset.

#### Scenario: user creates and activates a preset
- **WHEN** the user creates a preset with baseUrl `https://gateway.example.com`, a token, and model `claude-sonnet-4-5`, then activates it
- **THEN** the preset is persisted in plugin settings
- **AND** it becomes the active preset
- **AND** the project file write requirement applies with that preset's values

#### Scenario: official preset cannot be edited or deleted
- **WHEN** the user attempts to edit or delete the built-in official preset
- **THEN** the UI offers no such action

### Requirement: project-level managed-key writes

Applying a preset MUST rewrite only the managed keys of `<vault>/.claude/settings.local.json`: top-level `model` and `fallbackModel`, and env keys `ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_DEFAULT_HAIKU_MODEL`, plus any keys in the active preset's extra-env map.

The write MUST preserve all pre-existing unmanaged keys, MUST be atomic, and MUST never target any file outside the vault. Previously applied extra-env keys MUST be removed when they are absent from the newly applied preset.

#### Scenario: file already contains user keys
- **WHEN** `settings.local.json` contains `{"permissions": {...}, "env": {"MY_FLAG": "1"}}` and a preset with baseUrl+token is activated
- **THEN** the result still contains `permissions` and `MY_FLAG`
- **AND** `env` additionally contains `ANTHROPIC_BASE_URL` and `ANTHROPIC_AUTH_TOKEN`

#### Scenario: switching presets drops stale extra-env keys
- **WHEN** preset A (extra-env `FOO=1`) was applied and the user activates preset B (no extra-env)
- **THEN** `FOO` is removed and `MY_FLAG`-style user keys remain

#### Scenario: invalid existing file
- **WHEN** `settings.local.json` exists but is not valid JSON
- **THEN** it is backed up to `settings.local.json.bak`, the user is warned, and the apply proceeds from an empty object

### Requirement: official restore

Activating the built-in official preset MUST remove all managed keys (and an emptied `env` object) from `settings.local.json` while preserving all other content.

#### Scenario: restore after third-party use
- **WHEN** a third-party preset was applied and the user activates the official preset
- **THEN** `model`, `fallbackModel`, and the managed env keys are gone from the file
- **AND** unrelated keys are untouched

### Requirement: model configuration migration to project level

The plugin's legacy `model` / `fallbackModel` settings MUST migrate into `settings.local.json` exactly once, and afterwards the plugin MUST NOT pass `model` / `fallbackModel` SDK options. The model-thinking tab MUST no longer render model selection UI; thinking and effort settings remain.

#### Scenario: first Providers-tab render with legacy values
- **WHEN** plugin settings contain `model = "claude-opus-4-1"` and the Providers tab renders for the first time after upgrade
- **THEN** `model` is merge-written into `settings.local.json` (unless the file already defines `model`)
- **AND** the plugin field is cleared and a notice explains the migration
- **AND** subsequent chat sessions send no `model` SDK option

#### Scenario: legacy values empty
- **WHEN** plugin `model` and `fallbackModel` are already empty
- **THEN** migration writes nothing and only sets the done flag

### Requirement: settingSources guidance

When the plugin's `settingSources` does not include `local`, the Providers tab MUST show a blocking warning explaining that the project file is never loaded, with a one-click action that adds `local` to `settingSources`.

#### Scenario: default settingSources
- **WHEN** `settingSources` is `['project']` (the current default) and the user opens the Providers tab
- **THEN** the warning banner is visible
- **AND** clicking the fix action updates the setting to include `local` and dismisses the banner

### Requirement: auth conflict guidance

The Providers tab MUST surface official credential rules: warn when baseUrl is set without a token (saved claude.ai login remains the active credential), and inform when a token coexists with a detected OAuth login (the token immediately takes precedence; no logout required).

#### Scenario: baseUrl without token
- **WHEN** the active preset has a baseUrl and an empty token
- **THEN** a warning explains the saved claude.ai login is still used as the credential

### Requirement: global read-only visibility

The Providers tab MUST display, read-only and secret-masked: per-field global effective values (user + project-shared layers and shell env), and a modal showing the full contents of `~/.claude/settings.json`, `<vault>/.claude/settings.json`, `<vault>/.claude/settings.local.json`, plus shell `ANTHROPIC_*` / `CLAUDE_CODE_*` variables. No UI path MAY write to global files.

#### Scenario: user inspects the precedence chain
- **WHEN** the user opens the global configuration modal
- **THEN** all three layers are shown with the editable layer labeled and the others marked read-only
- **AND** token-like values are masked

### Requirement: secondary tab restructure

The Claude backend settings MUST present these resource-related secondary tabs: `tools` (built-in tool policy + question UX), `mcp` (mcp-runtime group), `skills-commands`, and `agents`. The former `resources` tab id MUST be removed from the registry. Global-sourced resources remain read-only with the existing source badges.

#### Scenario: tab list after the change
- **WHEN** the Claude backend settings render
- **THEN** `mcp`, `skills-commands`, and `agents` tabs exist alongside `tools`
- **AND** no `resources` tab id remains
- **AND** the MCP runtime controls render under `mcp`, commands and skills under `skills-commands`, agents under `agents`

### Requirement: Codex backend untouched

This change MUST NOT alter Codex backend settings tabs, Codex resources UI, or Codex provider handling.

#### Scenario: Codex settings render
- **WHEN** the Codex backend settings render after the change
- **THEN** its tab structure and resources section behave exactly as before
