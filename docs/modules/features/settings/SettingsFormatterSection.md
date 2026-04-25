# SettingsFormatterSection

**Path**: `src/features/settings/SettingsFormatterSection.ts`

Owns the top-level Formatter settings page in both classic and tabbed layouts.

## Responsibilities

- Renders the Formatter primary settings section with two secondary views: `overview` and `config`
- Displays runtime formatter status (read-only) fetched via `OpenCodeService.getFormatterStatus()`
- Displays project formatter config read from `OpencodeConfigManager.getFormatterConfig()`
- Supports top-level mode switching between `default` / `disabled` / `custom` via `OpencodeConfigManager.updateFormatterConfig()`
- Builtin formatter editing: per-formatter action dropdown (use-default / disable / override), with command/environment/extensions override fields
- Custom formatter CRUD: add by name, edit command/environment/extensions, delete; names are normalized (trim, lowercase, spaces-to-hyphens)
- Advanced JSON editor: direct formatter subtree editing with format/reload/save; preserves unknown entry fields

## Layout

### Classic
- Section heading with quick-nav tooltip
- Two blocks: overview + config

### Tabbed
- `overview` secondary tab: runtime status, summary cards, detected formatter table
- `config` secondary tab: mode switch dropdown, then when custom mode active:
  - Builtin formatter editors sourced from the upstream builtin catalog, so they still render even when runtime status is offline
  - Custom formatter list with add/edit/delete
  - Advanced JSON textarea with format/reload/save

## Key Dependencies

- `OpencodeConfigManager` — reads/writes `.opencode/opencode.json > formatter`
- `OpenCodeService.getFormatterStatus()` — SDK `formatter.status()` via catalog query coordinator
- `OpencodeFormatterConfig`, `OpencodeFormatterEntryConfig`, `OpencodeFormatterStatus` types from `src/core/types/opencodeConfig.ts`

## Mode Switch Mapping

| Mode | Config Value |
|------|-------------|
| `default` | `formatter` key deleted (null write) |
| `disabled` | `formatter: false` |
| `custom` | `formatter: { ... }` (preserves existing object or initializes `{}`) |

## Builtin Formatter Editing

Each builtin formatter (from the upstream builtin catalog, with runtime badges merged in when available) shows an action dropdown:

| Action | Config Effect |
|--------|--------------|
| `default` | Deletes the entry from `formatter` object |
| `disable` | Writes `{ disabled: true }` preserving unknown fields |
| `override` | Opens command/environment/extensions fields; saves override to config |

Override fields: `command` (space-split string → array), `environment` (key/value rows), `extensions` (space-split, auto-dot-prefix, dedup).

If override fields are cleared and saved with no content, the entry is removed from config (reverts to default).

## Custom Formatter Editing

Custom formatters are config entries whose key does not match any builtin catalog entry and are not `disabled: true`.

- Add: name input → normalized → validates no conflict with builtin or existing custom → writes `{ command: [] }`
- Edit: command, environment, and extensions fields; save updates the entry
- Delete: removes the entry from formatter config
- Command is required; save rejects if empty

## Advanced JSON Editor

A textarea shows the current `formatter` subtree as formatted JSON. Actions:

- **Format**: parses and re-stringifies; shows notice on invalid JSON
- **Reload from disk**: re-reads config and replaces textarea content
- **Save**: validates JSON structure (must be object or `false`), then writes via `updateFormatterConfig`; refreshes display on success

Unknown fields in formatter entries are preserved through both visual editors and the JSON editor.

## Runtime Failure Handling

When runtime status fetch fails:
- Overview shows "Fetch failed" badge and runtime-unavailable notice
- Config tab shows offline note but all editing sections remain functional
- Local config save is never blocked by runtime failures
