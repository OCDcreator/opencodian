# SettingsFormatterSection

**Path**: `src/features/settings/SettingsFormatterSection.ts`

Owns the top-level Formatter settings page in both classic and tabbed layouts.

## Responsibilities

- Renders the Formatter primary settings section with two secondary views: `overview` and `config`
- Displays runtime formatter status (read-only) fetched via `OpenCodeService.getFormatterStatus()`
- Displays project formatter config read from `OpencodeConfigManager.getFormatterConfig()`
- Supports top-level mode switching between `default` / `disabled` / `custom` via `OpencodeConfigManager.updateFormatterConfig()`

## Layout

### Classic
- Section heading with quick-nav tooltip
- Two blocks: overview + config

### Tabbed
- `overview` secondary tab: runtime status, summary cards, detected formatter table
- `config` secondary tab: mode switch dropdown

## Key Dependencies

- `OpencodeConfigManager` — reads/writes `.opencode/opencode.json > formatter`
- `OpenCodeService.getFormatterStatus()` — SDK `formatter.status()` via catalog query coordinator
- `OpencodeFormatterConfig`, `OpencodeFormatterStatus` types from `src/core/types/opencodeConfig.ts`

## Mode Switch Mapping

| Mode | Config Value |
|------|-------------|
| `default` | `formatter` key deleted (null write) |
| `disabled` | `formatter: false` |
| `custom` | `formatter: { ... }` (preserves existing object or initializes `{}`) |
