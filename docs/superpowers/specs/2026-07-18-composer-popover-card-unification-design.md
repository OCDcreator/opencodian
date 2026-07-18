# Composer Popover Card Unification Design

## Goal

Unify the internal visual system of the three Composer runtime popovers while preserving their independent behavior and entry points:

1. **Agent** — primary-Agent selection.
2. **Permission** — OpenCode permission, Claude Code permission, or Codex sandbox selection.
3. **Provider / model** — current-tab model override selection.

Each Composer button continues to open only its own card. This work does not merge controls, change their trigger appearance, or introduce a combined configuration menu.

## Approved Experience

Every popover uses one complete card frame:

- A compact title bar with a localized menu title and visible `Esc` keycap.
- A content slot owned by the existing selector implementation.
- A shared footer that truthfully advertises `↑↓` navigation, `Enter` selection, and `Esc` close.
- A common flat, Obsidian-native surface: background, border, 14px radius, shadow, spacing, option geometry, icon slot, checkmark slot, hover, selected, focus, and opening motion.

The runtime-dock triggers remain unchanged. Each popover keeps its existing functional content and its current width/anchoring policy:

| Popover | Preserved content | Preferred width |
| --- | --- | --- |
| Agent | Project default row, candidate Agent rows, mode badge, loading/empty/failed states | 340px |
| Permission | Backend-specific mode list, descriptions, mode semantic colors | 280px |
| Model | Search, provider groups, sticky provider headers, scroll list, current-tab override behavior | 340px |

`AnchoredOverlayLayoutController` remains the sole owner of horizontal clamping, including the existing 8px Chat-container safe inset. The current minimum widths remain unchanged: 272px for Agent, 220px for Permission, and 280px for Model, with continued shrinkage for a narrower sidebar.

## Visual Contract

### Shared card frame

The common frame is a flat surface, not glass:

- `var(--background-primary)` surface with `var(--background-modifier-border)` border.
- No gradients and no backdrop blur.
- 14px radius and the existing restrained flat-popover shadow hierarchy.
- A 36px title bar with uppercase/compact section treatment, menu title at start, and a bordered `Esc` keycap at end.
- A footer separated by the normal modifier border; it uses low-emphasis text and does not create a fourth interactive row.
- Reduced-motion mode removes frame and row entrance transitions.

The frame must not force equal height. The content slot sizes naturally: Agent and Permission are short lists; Model can grow to its existing scroll limit.

### Shared option geometry

All selectable rows use the same layout contract:

```text
22px icon slot | 8px gap | flexible primary + secondary text | 18px checkmark slot
```

- Minimum row height: 48px. A row may grow when its localized secondary text wraps.
- Padding, corner radius, icon treatment, checkmark placement, hover fill, focus ring, and selected structure are identical.
- `:focus-visible` is high contrast and does not depend on hover.
- Agent default badge, Agent mode badge, Permission description, and Model metadata remain inside the flexible content area. They do not create alternate row shells.
- Loading, empty, and failure messages use the same frame content padding but are not presented as selectable rows.

### Selected-state semantics

Agent and Model selected rows use the product `--interactive-accent` selected treatment: low-tint fill, accent start indicator, and accent checkmark.

Permission uses the identical row structure but retains its existing backend/mode semantic color mapping for the selected row and icon. High-risk choices such as OpenCode YOLO, Claude Code `bypassPermissions`, and Codex `danger-full-access` must remain visibly distinct from normal/plan/read-only choices. Text descriptions remain explicit; color is never the only risk signal.

## Component and Runtime Ownership

Add `src/features/chat/ui/ComposerPopoverFrame.ts`, a Composer-only reusable UI unit used in exactly three places. This satisfies the project rule against thin one-off helpers while avoiding a general dropdown framework.

`ComposerPopoverFrame` owns only shared presentation structure:

```ts
type ComposerPopoverFrameOptions = {
  title: string;
  footer: { navigate: string; select: string; close: string };
};

type ComposerPopoverFrameHandle = {
  contentEl: HTMLElement;
  refreshLocale(options: ComposerPopoverFrameOptions): void;
};
```

The exact exported names may follow project naming conventions, but the unit must provide a stable content slot and locale-refresh seam without taking ownership of model catalogs, selection state, or persistence.

| Existing owner | Remains responsible for | Frame responsibility |
| --- | --- | --- |
| `ChatAgentSelectionCoordinator` | Async candidate loading, default row, Agent selection, invocation intent, focus restoration | Header/content/footer shell and common row classes |
| `PermissionModeSelectorCoordinator` | OpenCode/Claude Code/Codex option config, mode writeback, backend-specific error handling | Header/content/footer shell and common row classes |
| `ChatSelectionControlsCoordinator` + model selector renderer | Catalog, search, provider groups, sticky headers, highlight, current-tab model override | Header/content/footer shell and common row classes |

The frame must not call OpenCode SDK APIs, write plugin settings, subscribe to model catalogs, or decide whether a mode is risky. Existing coordinators continue to own all of those paths.

## DOM and CSS Plan

Add `src/style/components/composer-popover-frame.css`, imported from `src/style/index.css`. It defines scoped `opencodian-composer-popover-*` tokens and classes for the common frame, title bar, keycap, footer, content slot, and option geometry.

The existing `.opencodian-agent-*`, `.opencodian-permission-*`, and `.opencodian-model-*` classes remain public implementation hooks. Their style sheets retain only selector-specific content rules and semantic modifiers; duplicate container, row, and animation rules move to the common frame layer.

The resulting stable DOM shape is:

```text
.opencodian-*-dropdown
  .opencodian-composer-popover-frame
    .opencodian-composer-popover-header
      [localized title]
      kbd Esc
    .opencodian-composer-popover-content
      [selector-specific controls, groups, options, or states]
    .opencodian-composer-popover-footer
      ↑↓ navigate · Enter select · Esc close
```

The Model search input remains the first element in its content slot. Provider sticky headers remain inside its existing scroll area. The frame does not wrap or move the model scroll area in a way that breaks sticky positioning.

## Keyboard, Focus, and Accessibility

Existing trigger and list semantics stay in place: triggers retain `role="button"`, `aria-haspopup="listbox"`, and accurate `aria-expanded`; selectable items remain `role="option"` with accurate `aria-selected`.

Agent and Permission gain roving keyboard focus:

1. Opening from the keyboard focuses the current selected option; if no current option is available, focus the first selectable option once content is ready.
2. `ArrowDown` and `ArrowUp` move focus within selectable options and wrap at the list boundaries.
3. `Enter` selects the focused option through the same existing click/selection path.
4. `Escape` closes the popover and returns focus to its trigger.
5. A successful selection closes the popover, refreshes selected state, and restores Composer input focus. A failed write leaves the popover and selected state intact so the user retains context.

Mouse behavior and click-outside closing continue to work. For Agent asynchronous loading, keyboard focus is applied after candidates resolve only when the popover is still open and was opened by the keyboard; loading/empty/failure states are not focus traps.

Model keeps its existing search-first keyboard path. Arrow keys and Enter inside the search input continue to drive the current highlighted model option; Escape closes the card. The shared footer documents the same commands without replacing the search field's focus model.

Add localized strings in both `src/i18n/locales/zh.ts` and `src/i18n/locales/en.ts` for the shared popover footer and any new menu titles. Existing Agent titles and mode descriptions are reused where their wording is already correct.

## State and Error Handling

- Agent loading, empty, and failed content continues to be rendered by `ChatAgentSelectionCoordinator` inside the shared content slot.
- Model loading, no-model, and no-search-result content continues to be rendered by `ModelSelectorRenderer` inside the shared content slot.
- Permission write failures continue through existing backend-specific write/error paths. The common frame never optimistically changes selected state.
- Closing by outside click or `Esc` must remove listeners and preserve the existing overlay-layout controller lifecycle.
- Backend hot-switch and locale refresh rebuild/relabel the same frame through the existing selection-control refresh lifecycle; no stale title, footer, `aria-expanded`, or keyboard listener may remain.

## Tests and Manual Verification

### Unit coverage

- Add a focused `ComposerPopoverFrame` test for header, `Esc` keycap, content slot, footer localization refresh, and no interactive ownership.
- Extend `ChatAgentSelectionCoordinator.test.ts` for keyboard-open, async-focus timing, wrap-around Arrow navigation, Enter selection, Escape focus return, and preserved loading/empty/failed state rendering.
- Extend Permission selector tests for shared-frame markup and keyboard navigation across OpenCode, Claude Code, and Codex configurations; retain semantic selected modifiers for each risk level.
- Extend model selector renderer/interactions tests to prove header/footer coexist with search, groups, sticky headers, current selection, Arrow navigation, and Enter selection.

### Build gates

Run the targeted unit tests, `npm run build`, `npm run graphify:update:src`, and `npm run verify`. Module documentation must stay synchronized and lint must finish at `0 errors / 0 warnings`.

### Test Vault manual QA

After the successful build, deploy sequentially to the available Test Vault and verify its deployed `main.js` contains the latest `BUILD_ID`. In the live Obsidian surface:

1. Open each Agent, Permission, and Model card from the Composer and confirm the same frame, title bar, `Esc` keycap, footer, option geometry, hover, selected, and focus styling.
2. Confirm all three remain inside the Chat container at a narrow sidebar width; no card is clipped or forced past its 8px safe inset.
3. Verify Agent loading/empty/failure states and selection, Model search/provider sticky headers/current-tab override, and each backend's Permission modes.
4. Verify Agent and Permission `ArrowUp`, `ArrowDown`, `Enter`, and `Escape`; verify Model search keyboard behavior remains intact.
5. Check light and dark themes plus Obsidian console errors using Obsidian Plugin Autodebug. Capture screenshots and DOM/computed-style evidence for each popover.

## Documentation Impact

Create matching module docs for the new TypeScript frame and CSS component. Update the module docs for:

- `ChatAgentSelectionCoordinator`
- `PermissionModeSelectorCoordinator`
- `ChatSelectionControlsCoordinator`
- Model selector renderer/display as applicable
- Agent, Permission, and Model selector CSS
- `AnchoredOverlayLayoutController` only if its interface or lifecycle changes (this design expects no such change)

No implementation begins until the user reviews this committed specification and approves the next implementation-planning step.
