# SettingsCodexLegacyCredentialControl

**File:** `src/features/settings/SettingsCodexLegacyCredentialControl.ts`
**Status:** ACTIVE

## Purpose

High-risk, masked control for the backward-compatible Codex `apiKey` setting. It
keeps credential rendering, confirmation, persistence rollback, and the
post-success callback in one owner so `SettingsCodexSection` remains a tab
router rather than a secret lifecycle implementation.

## Contract

- `render(containerEl)` mounts a status region and renders only localized masked
  status text. A configured credential gets a confirmation-gated clear button;
  an empty credential has no write control.
- `dispose()` releases DOM references before the settings surface is rerendered.
- Clearing snapshots the existing secret in memory, asks for explicit browser
  confirmation, writes the empty value, and awaits `saveSettings()`.
- A rejected save restores the prior secret, leaves the success callback and
  runtime/auth-source updates untouched, enables the replacement clear button,
  and shows only the localized failure message. When the removed clear button
  had focus, focus is restored to the newly rendered clear button. The
  exception object is neither rendered nor logged.
- A successful save rerenders the empty masked state and invokes `onAfterClear`
  once. The callback is the section-owned boundary for connection-summary,
  account auth-source, and adapter updates.

## Accessibility and safety

- The status host uses `role="status"`, `aria-live="polite"`, and a localized
  `aria-label`.
- The clear action is a native type-button with a localized accessible name and
  explicit `aria-disabled` synchronization while persistence is pending.
- Persistence failures render a `role="alert"` announcement while preserving
  deterministic keyboard focus on the replacement clear action.
- The credential value never enters DOM text, attributes, notices, logs, or
  error output. Native Codex Provider configuration remains outside this
  control and is not exposed as local CRUD.

## Tests

`tests/unit/features/settings/SettingsCodexLegacyCredentialControl.test.ts`
verifies confirmation gating, successful clearing, failure rollback, localized
failure rendering, callback suppression on rejection, disabled-state reset, and
focus/announcement behavior after a rejected save.
