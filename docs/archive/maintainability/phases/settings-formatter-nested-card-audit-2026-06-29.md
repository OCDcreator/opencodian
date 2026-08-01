# Settings Formatter/LSP Nested Card Audit

Date: 2026-06-29

## Problem

`Settings > Formatter / LSP` still had several ordinary `Setting` rows rendered inside section panels and editor panels. The visible symptom was a large section card containing smaller description, textarea, or button cards. This violated the current Settings design contract: one owner surface should carry border/background/radius, while children should be flat Fields, editor content, ButtonGroups, or inline empty alerts.

## Fixed Surfaces

- Formatter builtin empty state now uses `.opencodian-settings-inline-empty opencodian-formatter-inline-empty`.
- Formatter custom empty state now uses the same inline empty-alert surface.
- Formatter builtin override, custom formatter, LSP custom, and environment editors keep their `Setting` controls but render inside `.opencodian-formatter-field-group` as flat Field rows.
- Formatter and LSP advanced JSON editors now use plain `.opencodian-formatter-section-description`, a single `.opencodian-formatter-json-editor` textarea panel, and `.opencodian-formatter-json-buttons` as a transparent `role="group"` footer.
- LSP custom rows now share `.opencodian-formatter-row-field` / `.opencodian-formatter-row-control`, matching formatter custom rows and builtin rows.

## Wider Settings Audit

The selector audit checked Settings CSS and section owners for nested `setting-item` patterns. The following are intentionally not swept into this Formatter/LSP slice:

- Debug panels in `settings-layout-contract.css`: these are scoped debug workbench rows with their own panel owner.
- Claude/Codex backend settings rows: already documented owner-specific control rows.
- Agent editor/workspace rows: covered by the Agents settings surface contract.
- MCP form group body rows: already intentionally flattened with `border: none` and row separators.
- Chat/composer, permission dialogs, runtime failure/readback panels, and destructive confirmations: excluded because their surfaces have separate semantic state.

## Guardrail

Future Formatter/LSP edits should not use `new Setting(sectionEl).setDesc(...)` for empty or helper copy inside card-like sections, and should not use `new Setting(buttonBar)` for editor actions. Use plain copy, inline empty alert, flat FieldGroup rows, or a transparent ButtonGroup footer instead.
