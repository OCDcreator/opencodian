# OpencodeConfigModal

> **源码**: `src/features/settings/OpencodeConfigModal.ts`
> **状态**: [REVIEW]

## 概述

OpenCode Project/Global/managed configuration source modal. The modal consumes
`OpencodeConfigManager`'s P1-B source APIs and keeps source choice explicit;
it does not assume that the legacy project path is the target.

## Configuration source loop

1. Inventory candidates and render backend-provided `scope`, `source`, exact
   path, existence, editability, revision, parse/read error, and the
   persistence/application/runtime evidence axes.
2. Require a source selection before loading an editor. Missing editable
   Project/Global defaults are selectable and receive a small JSONC creation
   template with `expectedRevision: null`.
3. Read through `readConfigurationSource()`. Existing bytes are assigned to the
   textarea verbatim, including comments and malformed JSONC; a confinement or
   safe-read failure (`persistence: failed`, no revision) leaves the editor and
   mutation actions disabled without a fallback template.
4. Write/delete through the captured target path and revision. Conflicts keep
   the modal and textarea draft open; success reports persistence verified,
   application pending, and runtime unavailable. The modal never restarts the
   service automatically.
5. Managed candidates are preview-only. History is loaded only for the explicit
   selected candidate target, never through a scope-wide catalog, so unrelated
   vault or test-fixture archives cannot poison its entries. Restore maps a
   canonical archived target back to the selected lexical source and passes the
   revision captured at selection time, never a freshly read revision that
   could bypass a conflict. Malformed or tampered archive history for that
   selected target is still rendered as a failure rather than an empty history.

## DOM contract

- `[data-config-source-select]` — explicit source selector (`aria-label` from
  the source section title); option labels are
  `<localized scope> · <source> · <basename>` with the full exact path on
  `option.title` (the metadata block always shows the complete path).
- `[data-config-editor]` — raw JSONC textarea (`aria-label` from the editor
  section title).
- `[data-config-scope]`, `[data-config-source]`, `[data-config-path]`,
  `[data-config-revision]`, `[data-config-evidence]` — selected-source metadata.
  Scope, exists/editable, missing revision, and the evidence axis statuses are
  localized; known backend evidence detail strings map to localized text and
  unknown details pass through verbatim.
- `.opencodian-config-source-status` — `role="status"` + `aria-live="polite"`
  live region for read/save/conflict state.
- `[data-config-save]`, `[data-config-delete]`, `[data-config-history]`, and
  `[data-config-restore]` — mutation/history actions, rendered only when the
  source is ready and editable (never for managed or unsafe-read sources).
  Save disables itself while a write is in flight so a double-click cannot
  race a second mutation against the just-advanced revision.
- `[data-config-close]` — always rendered, including unselected, failed-read,
  and managed read-only states.

## Related modules

- `OpencodeConfigManager` / `OpencodeConfigSourceService`: inventory, exact
  reads, revision-guarded JSONC writes, archive, delete, history, and restore.
- `SettingsSecuritySection`: source-modal entry point and the independent
  Restart service application boundary.
