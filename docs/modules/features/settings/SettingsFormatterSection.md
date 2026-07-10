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
- Adds a shared help button to the formatter and LSP mode settings; it opens `OpenCodeProjectConfigHelpModal` with the `formatterLsp` topic and links to official OpenCode formatter / LSP documentation
- Builtin formatter editing: per-formatter action dropdown (use-default / disable / override), status rendered as a chip next to the formatter name, with command/environment/extensions override fields that start expanded and can be collapsed by clicking the row
- Builtin LSP editing: per-server action dropdown (use-default / disable / override), status rendered as a chip next to the server name, with command/extensions/env/initialization override fields that start expanded and can be collapsed by clicking the row
- Builtin formatter and LSP lists include a shared custom fuzzy-search control: typing filters rows immediately, a status dropdown filters by use-default / project override / project disabled state, the suggestions popover supports arrow-key navigation, Enter selection, Escape dismissal, and mouse selection. The suggestion popover is now re-parented to `document.body` via `SettingsPopoverController` (body-level fixed positioning, z-index 2280) to avoid clipping by scroll containers or sticky toolbars
- Custom formatter CRUD: add by name, edit command/environment/extensions, delete; names are normalized (trim, lowercase, spaces-to-hyphens)
- Custom LSP CRUD: add/edit/delete project-local language servers; custom entries require `extensions`
- Advanced JSON editors: direct `formatter` and `lsp` subtree editing with format/reload/save; preserves unknown entry fields
- Formatter/LSP project config writes restart the local OpenCode service after saving, so the server-side formatter and LSP instance state reloads the edited `.opencode/opencode.json`; remote server mode shows the standard remote-management notice instead.
- Formatter/LSP project config writes are OpenCode-owned. Mode switches, builtin/custom visual edits, advanced JSON saves, and the restart path re-check the active backend at callback time; if the settings pane was mounted while OpenCode was active and the user switches to Claude Code before a stale callback fires, the callback shows the Formatter/LSP OpenCode-only notice and returns before writing `.opencode/opencode.json` or calling OpenCode runtime restart APIs.
- Formatter/LSP config changes refresh only the active formatter subtree. The section renders the next subtree into a detached staging element, then swaps it into the visible container while preserving outer settings scroll and temporary min-height, so add/delete/mode-save actions do not clear the full settings page or flash the panel.

## Layout

### Classic
- Section heading with quick-nav tooltip
- Three blocks rendered in sequence: overview + formatter config + LSP config

### Tabbed
- `overview` secondary tab: no extra full-card wrapper around the entire pane; starts with a 2x2 meta-card grid for formatter mode / LSP mode / config path / combined runtime health, then renders formatter summary cards, detected formatter table, and LSP runtime summary as separate sections
  - the overview cards are intentionally structured, not plain desc strings: mode cards split primary mode label from the explanatory sentence, config path uses a monospace primary value, and runtime health renders separate Formatter / LSP status pills instead of one long combined sentence
  - detected formatter runtime now lives inside a native summary panel that is open by default; the whole title row is clickable and collapses the table without changing runtime data semantics
  - the detected formatter table includes local fuzzy search across formatter names/extensions, clickable sortable `Name` / `Extensions` / `Status` headers, a matching-count meta chip, and an empty row when the current search has no matches
  - runtime table cells expose compact styling hooks (`opencodian-formatter-table-name`, `-extensions`, `-status`, and column header classes), allowing CSS to keep extensions monospace, status chips right-aligned, and the sortable header controls visually native instead of inheriting Obsidian's full button chrome
  - detected formatter search now uses the same custom fuzzy combobox vocabulary as builtin formatter / LSP search: inline label, count chip, clear button, styled suggestions popover, arrow-key movement, Enter selection, Escape dismissal, and mouse selection
  - the formatter and LSP runtime blocks share the same panel-header vocabulary and body spacing, so both cards use the same title / meta chip hierarchy even though only the formatter table is collapsible
- `formatter` secondary tab: mode switch dropdown, then when custom mode active:
  - Builtin formatter editors sourced from the upstream builtin catalog, so they still render even when runtime status is offline
  - Builtin formatter rows live in a fixed-height internal scroll region; the custom search combobox and status filter stay sticky at the top of the section
  - Builtin formatter rows use the Settings Neutral Data Row Surface: a quiet shadcn-style Card + Field row with the formatter name and compact status badge on the left, the action dropdown on the right, muted monospace extensions below, and flat FieldGroup override editors separated by a subtle top rule
  - Custom formatter list with add/edit/delete
  - Advanced JSON editor with plain description copy, a single textarea panel, and a transparent footer ButtonGroup for format/reload/save
- `lsp` secondary tab: mode switch dropdown, then when custom mode active:
  - Builtin LSP editors sourced from a repo-maintained upstream catalog plus runtime-discovered entries
  - Builtin LSP rows use the same fixed-height internal scroll region, sticky search/status filter controls, neutral row-card surface, compact badges, and flat override FieldGroup behavior as formatter rows
  - Custom LSP list with add/edit/delete
  - `initialization` JSON field per entry
  - Advanced JSON editor with the same flat editor panel and footer ButtonGroup contract as formatter

Tabbed formatter / LSP panes intentionally avoid an extra outer `.opencodian-settings-block` wrapper because the secondary-tab shell already provides the top-level grouping; only meaningful inner groups keep object-card treatment.

## Key Dependencies

- `OpencodeConfigManager` — reads/writes `.opencode/opencode.json > formatter`
- `OpencodeConfigManager` — reads/writes `.opencode/opencode.json > lsp`
- `OpenCodeService.getFormatterStatus()` — SDK `formatter.status()` via catalog query coordinator
- `OpenCodeService.getLspStatus()` — SDK `lsp.status()` via catalog query coordinator
- `OpenCodeProjectConfigHelpModal` — plain-language formatter/LSP explanation and official documentation links
- `OpencodeFormatterConfig`, `OpencodeFormatterEntryConfig`, `OpencodeFormatterStatus`, `OpencodeLspConfig`, `OpencodeLspEntryConfig`, and `OpencodeLspStatus` types from `src/core/types/opencodeConfig.ts`

## Mode Switch Mapping

| Mode | Config Value |
|------|-------------|
| `default` | `formatter` key deleted (null write) |
| `disabled` | `formatter: false` |
| `custom` | `formatter: { ... }` (preserves existing object or initializes `{}`) |

## Builtin Formatter Editing

Each builtin formatter (from the upstream builtin catalog, with runtime badges merged in when available) shows an action dropdown. The row is intentionally neutral: default / project override / project disabled state is carried by `.opencodian-builtin-row-status-chip[data-status]`, not by coloring the whole card border or background.

| Action | Config Effect |
|--------|--------------|
| `default` | Deletes the entry from `formatter` object |
| `disable` | Writes `{ disabled: true }` preserving unknown fields |
| `override` | Opens command/environment/extensions fields; saves override to config |

Override fields: `command` (space-split string → array), `environment` (key/value rows), `extensions` (space-split, auto-dot-prefix, dedup). Builtin override rows are collapsible by clicking any non-control area of the row, including the expanded override body; collapsing hides only the override fields and keeps the name, inline status chip, extensions, and action dropdown visible.

If override fields are cleared and saved with no content, the entry is removed from config (reverts to default).

The builtin formatter list has an inline search control before the rows. Its custom popover ranks exact/prefix/name matches before extension-only matches, filters the rendered rows in place, and combines with a native status dropdown for all/default/override/disabled project states. The filter path marks the first and last visible rows for spacing, shows a row-token empty state when no builtin matches, and keeps each row's action dropdown and override fields mounted so project edits are not lost while searching.

## Custom Formatter Editing

Custom formatters are config entries whose key does not match any builtin catalog entry and are not `disabled: true`.

- Add: name input → normalized → validates no conflict with builtin or existing custom → writes `{ command: [] }`
- Edit: command, environment, and extensions fields; save updates the entry
- Delete: removes the entry from formatter config
- Command is required; save rejects if empty
- The add-new row is a shadcn-style CardFooter / Field action row inside the custom formatter section, not a nested formatter row-card. `.opencodian-formatter-add-custom-row` stays transparent with only a subtle top separator and section margins so it does not touch the parent card edge.

## Advanced JSON Editor

A textarea shows the current `formatter` subtree as formatted JSON. LSP uses the same structure for the `lsp` subtree. The editor is intentionally not a stack of nested `Setting` cards: `.opencodian-formatter-section-description` renders the description as plain muted copy, `.opencodian-formatter-json-editor` is the only editor panel boundary, and `.opencodian-formatter-json-buttons` is a transparent `role="group"` footer with native buttons.

Actions:

- **Format**: parses and re-stringifies; shows notice on invalid JSON
- **Reload from disk**: re-reads config and replaces textarea content
- **Save**: validates JSON structure (must be object or `false`), then writes via `updateFormatterConfig`; refreshes display on success

Unknown fields in formatter entries are preserved through both visual editors and the JSON editor.

Empty custom formatter / LSP lists and no-match builtin search states use quiet inline empty surfaces rather than ordinary setting cards. This keeps section panels from becoming card-within-card stacks while preserving the same copy and i18n keys.

Successful formatter custom add/edit/delete, builtin action changes, mode switches, and advanced JSON saves first write project config, then restart the local OpenCode service when the settings page is managing a local server. After that they call the section-local content refresh path instead of `requestDisplayRefresh()`. If the section is already detached, the code falls back to the parent display refresh as a safety net.

## LSP Notes

- Top-level LSP mode mirrors formatter: missing key = default, `false` = fully disabled, object = custom
- Entry-level `disabled: true` only disables a specific server; it is distinct from top-level `lsp: false`
- Builtin LSP rows use the same use-default / disable / override action model as formatters
- Builtin LSP rows share the same inline name status chip and override-field collapse behavior as builtin formatter rows
- LSP visual edits, mode switches, and advanced JSON saves share the formatter reload path, so local OpenCode is restarted after project config writes and remote mode is left to the externally managed server
- The static builtin LSP catalog mirrors upstream OpenCode server ids so the UI can browse/edit builtin servers even before `lsp.status()` is available; runtime-only ids are still merged in afterward
- The builtin LSP list reuses the same custom fuzzy-search and status-filter controls as formatter rows, including keyboard selection and Escape dismissal
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

## Tab Hierarchy Contract

- The three secondary tabs now share one explicit settings rhythm instead of mixing summary and editor weight ad hoc.
- `overview` is summary-first. Its shell uses `.opencodian-formatter-overview-shell`, and high-value readback sits inside `.opencodian-formatter-overview-summary-band`; it does not mount formatter/LSP mode dropdowns or editor-heavy builtin/custom sections.
- `formatter` and `lsp` are structurally parallel. Their tabbed and classic bodies now route through `.opencodian-formatter-tab-config-shell`, with a top `.opencodian-formatter-tab-summary-band` for mode/runtime intent and a lower `.opencodian-formatter-tab-content-shell` for editable content.
- Editable content stays split by responsibility:
  - `.opencodian-formatter-builtin-list-shell` for builtin row-card lists and inline override editors
  - `.opencodian-formatter-custom-list-shell` for custom formatter/LSP entry lists
  - `.opencodian-formatter-advanced-editor-shell` for the JSON editor panel
- Builtin override editors remain inline field groups inside the row owner. `.opencodian-formatter-builtin-editor-shell` is a structural alias on the existing override-field container, not a new nested-card surface.
