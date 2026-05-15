# SettingsFormatterSection

**Path**: `src/features/settings/SettingsFormatterSection.ts`

Owns the top-level `Formatter & LSP` settings page in both classic and tabbed layouts.

## Responsibilities

- Renders the `Formatter & LSP` primary settings section with three secondary views: `overview`, `formatter`, and `lsp`
- Displays runtime formatter status (read-only) fetched via `OpenCodeService.getFormatterStatus()`
- Displays project formatter config read from `OpencodeConfigManager.getFormatterConfig()`
- Displays runtime LSP status (read-only) fetched via `OpenCodeService.getLspStatus()`
- Displays project LSP config read from `OpencodeConfigManager.getLspConfig()`
- Supports top-level mode switching between `default` / `disabled` / `custom` via `OpencodeConfigManager.updateFormatterConfig()`
- Supports the same top-level mode switching semantics for the `lsp` subtree via `OpencodeConfigManager.updateLspConfig()`
- Builtin formatter editing: per-formatter action dropdown (use-default / disable / override), with command/environment/extensions override fields
- Builtin LSP editing: per-server action dropdown (use-default / disable / override), with command/extensions/env/initialization override fields
- Custom formatter CRUD: add by name, edit command/environment/extensions, delete; names are normalized (trim, lowercase, spaces-to-hyphens)
- Custom LSP CRUD: add/edit/delete project-local language servers; custom entries require `extensions`
- Advanced JSON editors: direct `formatter` and `lsp` subtree editing with format/reload/save; preserves unknown entry fields

## Layout

### Classic
- Section heading with quick-nav tooltip
- Three blocks rendered in sequence: overview + formatter config + LSP config

### Tabbed
- `overview` secondary tab: no extra full-card wrapper around the entire pane; starts with a 2x2 meta-card grid for formatter mode / LSP mode / config path / combined runtime health, then renders formatter summary cards, detected formatter table, and LSP runtime summary as separate sections
  - the overview cards are intentionally structured, not plain desc strings: mode cards split primary mode label from the explanatory sentence, config path uses a monospace primary value, and runtime health renders separate Formatter / LSP status pills instead of one long combined sentence
  - detected formatter runtime now lives inside a native `details > summary` panel that is open by default; the whole title row is clickable and collapses the table without changing runtime data semantics
  - the formatter and LSP runtime blocks share the same panel-header vocabulary, so both cards use the same title / meta chip hierarchy even though only the formatter table is collapsible
- `formatter` secondary tab: mode switch dropdown, then when custom mode active:
  - Builtin formatter editors sourced from the upstream builtin catalog, so they still render even when runtime status is offline
  - Custom formatter list with add/edit/delete
  - Advanced JSON textarea with format/reload/save
- `lsp` secondary tab: mode switch dropdown, then when custom mode active:
  - Builtin LSP editors sourced from a repo-maintained builtin catalog plus runtime-discovered entries
  - Custom LSP list with add/edit/delete
  - `initialization` JSON field per entry
  - Advanced JSON textarea with format/reload/save

Tabbed formatter / LSP panes intentionally avoid an extra outer `.opencodian-settings-block` wrapper because the secondary-tab shell already provides the top-level grouping; only meaningful inner groups keep object-card treatment.

## Key Dependencies

- `OpencodeConfigManager` — reads/writes `.opencode/opencode.json > formatter`
- `OpencodeConfigManager` — reads/writes `.opencode/opencode.json > lsp`
- `OpenCodeService.getFormatterStatus()` — SDK `formatter.status()` via catalog query coordinator
- `OpenCodeService.getLspStatus()` — SDK `lsp.status()` via catalog query coordinator
- `OpencodeFormatterConfig`, `OpencodeFormatterEntryConfig`, `OpencodeFormatterStatus`, `OpencodeLspConfig`, `OpencodeLspEntryConfig`, and `OpencodeLspStatus` types from `src/core/types/opencodeConfig.ts`

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

## LSP Notes

- Top-level LSP mode mirrors formatter: missing key = default, `false` = fully disabled, object = custom
- Entry-level `disabled: true` only disables a specific server; it is distinct from top-level `lsp: false`
- Builtin LSP rows use the same use-default / disable / override action model as formatters
- Custom LSP entries must provide at least one extension in the visual editor, even though the upstream type keeps `extensions` optional
- The visual editor preserves unknown fields and only normalizes known writable fields: `command`, `extensions`, `env`, and `initialization`

## Runtime Failure Handling

When runtime status fetch fails:
- Overview shows "Fetch failed" badge and runtime-unavailable notice
- Config tab shows offline note but all editing sections remain functional
- Local config save is never blocked by runtime failures

## Overview Presentation

- Overview meta cards use stable DOM contracts under `.opencodian-formatter-overview-meta-*`
- Card content is split into label / primary value / optional description / optional pills so CSS can improve scanability without changing config or runtime semantics
- Combined runtime health intentionally stays read-only and separated from project config state; pill colors communicate runtime success/failure, while formatter/LSP config editors remain the place for project intent
