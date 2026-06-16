# CodexReadbackModal

**File:** `src/features/settings/CodexReadbackModal.ts`
**Status:** ACTIVE

## Purpose

A generic Obsidian modal for rendering Codex diagnostic readbacks. It replaces the previous inline readback cards in the Codex settings panel with a focused, scrollable, product-grade modal that supports loading, unavailable, failed, empty, and success states.

The modal is intentionally generic so that `SettingsCodexReadbackControls` can reuse it for the model catalog, permission profiles, and loaded threads readbacks without each surface reimplementing state handling.

## Exports

| Export | Kind | Notes |
|--------|------|-------|
| `CodexReadbackModal` | Class | Generic modal extending Obsidian `Modal` |
| `CodexReadbackModalOptions` | Interface | Constructor options: title, intro, notes, state messages, fetch/render callbacks |
| `CodexReadbackModalState` | Type | `'loading' \| 'unavailable' \| 'failed' \| 'empty' \| 'success'` |

## Modal structure

The modal follows the shared inspection-panel layout (`opencodian-inspection-panel`):

1. **Summary section** — purpose text plus a compact meta strip: status badge, read-only note, refresh note.
2. **Content area** — a compact state block for non-success states, or a rendered `opencodian-inspection-list` for success.

The legacy `.opencodian-codex-readback-*` class hooks are preserved for tests and downstream consumers, but the visual rhythm is now driven by the shared `.opencodian-inspection-*` tokens.

## States

| State | Trigger | Rendered content |
|-------|---------|------------------|
| `loading` | Initial open, before `fetchItems` resolves | `loadingText` |
| `unavailable` | `fetchItems` returns `null` | `unavailableText` |
| `empty` | `fetchItems` returns an empty array | `emptyText` |
| `failed` | `fetchItems` throws | `failedText` |
| `success` | `fetchItems` returns a non-empty array | `renderItems(container, items)` plus count in the status badge |

## Usage

```typescript
new CodexReadbackModal<Model>({
  app: plugin.app,
  title: t('settings.codex.modelList.modalTitle'),
  intro: t('settings.codex.modelList.intro'),
  readonlyNote: t('settings.codex.modelList.readonlyNote'),
  refreshNote: t('settings.codex.modelList.refreshNote'),
  loadingText: t('settings.codex.modelList.loading'),
  unavailableText: t('settings.codex.modelList.unavailable'),
  failedText: t('settings.codex.modelList.failed'),
  emptyText: t('settings.codex.modelList.empty'),
  fetchItems: async () => adapter.getModelList(),
  renderItems: (listEl, models) => { /* render rows */ },
}).open();
```

## Boundaries

- The modal is read-only; it never writes settings or backend configuration.
- It does not know about Codex adapter internals — all data access is injected through `fetchItems`.
- Rendering is delegated to `renderItems` so each readback surface controls its own row structure and proof markers.
- Refresh happens on every open; there is no in-modal refresh button.
- Status labels are localized through the shared `settings.codex.readback.status*` keys, so Chinese settings modals do not fall back to English state text.

## Related modules

- `SettingsCodexReadbackControls` — creates and opens one `CodexReadbackModal` per readback button.
- `SettingsCodexSection` — hosts the Resume & Inspect tab where the buttons live.

## 2026-06-16 Introduced

Extracted from the inline readback rendering in `SettingsCodexReadbackControls` to support the new modal-first diagnostic UX.

## 2026-06-16 Inspection panel refactor

Replaced the separate status bar + loose paragraphs with a compact inspection-panel summary band and shared `.opencodian-inspection-*` layout classes. Loaded threads now render as rows with a collapsible raw-JSON detail instead of a full JSON dump.
