# Settings in Editor Area — Design Spec

**Date:** 2026-05-12
**Status:** REVIEW
**Scope:** Add a toggle + command to open the full settings UI as an editor-area Leaf, enabling split-screen settings viewing alongside chat.

## Problem

The current settings UI renders inside Obsidian's standard `PluginSettingTab` (a modal-like sidebar pane). Users cannot see both settings and the chat view simultaneously, making it hard to tweak appearance or behavior while observing the effect in real time.

## Solution

Register a new Obsidian `ItemView` (`OpenCodianSettingsView`) that renders the same settings content inside an editor-area leaf. A toggle in the UI section enables the feature, and a command palette entry opens it.

## Architecture

### New Setting

Add `settingsInEditorArea: boolean` (default `false`) to `OpenCodianSettings` in `src/core/types/settings.ts`.

Place the toggle in the **UI** section (`SettingsUiSection.ts`), next to the existing `openInMainTab` toggle. This groups all "where does X open" settings together.

### New View Type

Add `VIEW_TYPE_OPENCODIAN_SETTINGS = 'opencodian-settings-view'` constant alongside the existing `VIEW_TYPE_OPENCODIAN` in `src/core/types/chat.ts`.

### View Registration (Always)

`Plugin.registerView()` has no unregister API. Register `VIEW_TYPE_OPENCODIAN_SETTINGS` **unconditionally** in `onload()`. The toggle only gates the **command** visibility, not the view registration.

### New View

Create `src/features/settings/OpenCodianSettingsView.ts`:

```
class OpenCodianSettingsView extends ItemView
```

- `getViewType()` returns `VIEW_TYPE_OPENCODIAN_SETTINGS`
- `getDisplayText()` returns localized title "OpenCodian Settings"
- `getIcon()` returns `settings`
- `onOpen()` renders the full settings content and subscribes to refresh events
- `onClose()` cleans up sections, dropdown enhancer, and event subscriptions

#### Lifecycle & Refresh (Council Fix #1)

`ItemView.onOpen()` fires only once at creation, unlike `PluginSettingTab.display()` which fires on each reveal. The view handles staleness by:

1. Re-rendering from scratch on each `onOpen()` call
2. Listening to plugin `setting-saved` events (or a custom `settings-changed` event) to trigger `refresh()` which calls the same rendering logic
3. Calling `refresh()` on explicit user action (leaf activation is not reliable for this)

The `refresh()` method mirrors `OpenCodianSettingTab.display()`: clear container, dispose sections, re-render, re-enhance dropdowns.

### Command

Add a command `"Open Settings in Editor Area"` in `main.ts`:

- Uses `checkCallback` that returns `true` only when `plugin.settings.settingsInEditorArea` is `true`
- When invoked: uses `workspace.getLeaf('tab')` to open in the main editor area
- If an existing settings leaf is already open, reveal it instead of creating a duplicate

### Reuse Strategy

The view does not extend `PluginSettingTab`. Instead, it:

1. Creates its own `containerEl` subtree inside the leaf
2. Instantiates the same section classes with matching option objects
3. Applies the same `.opencodian-settings` / `.opencodian-settings--classic` / `.opencodian-settings--tabbed` CSS classes
4. Calls `enhanceSettingsDropdowns()` after rendering, identical to `OpenCodianSettingTab.display()`

The existing section classes already accept `containerEl` and `plugin` as constructor options — they have no direct dependency on `PluginSettingTab`.

### Scroll State Isolation (Council Fix #4)

The editor-area view does **NOT** share `settingsPanelScrollTop` with the standard settings tab. Instead:

- The view skips scroll persistence entirely — it always starts at the top
- `SettingsSectionCoordinator` in this context does not read/write `plugin.settings.settingsPanelScrollTop`
- This avoids collision between the two surfaces

### Model & Server Status Refresh (Council Fix #5)

`main.ts` currently only notifies `this.settingsTab` for `onModelsLoaded()` and `refreshServerStatusDisplay()`. Update to broadcast to all active settings surfaces:

- Add a helper method `refreshAllSettingsSurfaces()` that iterates `workspace.getLeavesOfType(VIEW_TYPE_OPENCODIAN_SETTINGS)` and calls refresh on each
- Also call `this.settingsTab.onModelsLoaded()` / `refreshServerStatusDisplay()` as before
- The `OpenCodianSettingsView` exposes `onModelsLoaded()` and `refreshServerStatusDisplay()` methods matching the tab's interface

### Style (Council Fix #3)

Add CSS targeting the leaf container in `src/style/components/model-selector.css`:

```css
.workspace-leaf-content[data-type="opencodian-settings-view"] {
  padding: 0;
  overflow: hidden;
}
.workspace-leaf-content[data-type="opencodian-settings-view"] .opencodian-settings {
  max-height: 100%;
  overflow-y: auto;
}
```

This ensures no double padding and no nested scrollbar issues in the leaf context.

## Files to Modify

| File | Change |
|------|--------|
| `src/core/types/settings.ts` | Add `settingsInEditorArea: boolean` to interface + default |
| `src/core/types/chat.ts` | Add `VIEW_TYPE_OPENCODIAN_SETTINGS` constant |
| `src/core/types/index.ts` | Re-export `VIEW_TYPE_OPENCODIAN_SETTINGS` |
| `src/features/settings/OpenCodianSettingsView.ts` | **New file** — ItemView subclass |
| `src/features/settings/SettingsUiSection.ts` | Add toggle for `settingsInEditorArea` |
| `src/main.ts` | Register view unconditionally + command with checkCallback + broadcast helpers |
| `src/i18n/locales/en.ts` | Add locale strings |
| `src/i18n/locales/zh.ts` | Add locale strings |
| `src/style/components/model-selector.css` | Leaf container CSS for padding/overflow |

## Failure Scenarios

1. **Section class instantiation fails outside PluginSettingTab context** — Section classes only take `plugin` + callbacks; no `PluginSettingTab` dependency. Risk is low.
2. **Obsidian `Setting` component doesn't render in ItemView** — Obsidian's `Setting` class works on any `HTMLElement`, not just setting tab containers. Verified by existing patterns.
3. **Settings view becomes stale after changes** — The view subscribes to refresh events and provides a `refresh()` method for full re-render.
4. **Multiple settings leaves open simultaneously** — The command checks for existing leaves of the type and reveals the existing one instead of creating duplicates.
5. **View unregistration impossible** — View is registered unconditionally; only the command is gated by the toggle. Closing leaves on toggle-off is handled by iterating and detaching.

## Out of Scope

- No partial/filtered settings — full content only
- No sync between standard settings tab and editor-area settings view (they are independent instances)
- No changes to the existing `PluginSettingTab` settings behavior
- No mobile-specific considerations (Obsidian mobile handles leaf layout differently)
- No shared `SettingsContentRenderer` extraction in this iteration — kept as future refactor to minimize scope
