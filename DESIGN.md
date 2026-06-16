---
name: OpenCodian
description: Obsidian-native OpenCode workbench with restrained glass, dense controls, and explicit runtime state.
colors:
  accent-slate: "#64748b"
  accent-slate-hover: "#475569"
  accent-ocean: "#2563eb"
  accent-mint: "#14b8a6"
  accent-amber: "#f59e0b"
  accent-rose: "#e11d48"
  accent-cyan: "#06b6d4"
  accent-magenta: "#d946ef"
  ink-graphite: "#0f172a"
  ink-void: "#020617"
  canvas-light: "#f8fafc"
  lavender-tint: "#f5f3ff"
  rose-tint: "#fff1f2"
typography:
  display:
    fontFamily: "var(--font-interface), -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "16px"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "normal"
  title:
    fontFamily: "var(--font-interface), -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "14px"
    fontWeight: 700
    lineHeight: 1.35
    letterSpacing: "normal"
  body:
    fontFamily: "var(--font-interface), -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "var(--font-interface), -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "0.02em"
  mono:
    fontFamily: "var(--font-monospace), ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  xs: "3px"
  sm: "4px"
  md: "6px"
  lg: "8px"
  xl: "10px"
  message: "14px"
  bubble: "16px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "12px"
  section: "16px"
  panel: "28px"
  codex-card-gap: "12px"
  codex-group-header-gap: "16px"
  codex-card-title-body-gap: "8px"
  codex-card-body-gap: "10px"
  modal-content-padding-x: "22px"
  modal-content-padding-y: "22px"
  modal-header-body-gap: "16px"
  modal-section-gap: "20px"
  modal-section-inner-gap: "12px"
  modal-card-gap: "12px"
  modal-form-row-gap: "12px"
  modal-form-label-control-gap: "16px"
  modal-action-gap: "8px"
  help-modal-max-width: "720px"
  help-modal-section-gap: "16px"
components:
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.accent-slate}"
    rounded: "{rounded.md}"
    padding: "4px 8px"
  dropdown-panel:
    backgroundColor: "{colors.canvas-light}"
    textColor: "{colors.ink-graphite}"
    rounded: "{rounded.message}"
    padding: "4px 0"
  message-user:
    backgroundColor: "{colors.canvas-light}"
    textColor: "{colors.ink-graphite}"
    rounded: "{rounded.bubble}"
    padding: "6px 14px 7px"
  notice-card:
    backgroundColor: "{colors.canvas-light}"
    textColor: "{colors.ink-graphite}"
    rounded: "{rounded.message}"
    padding: "14px 16px"
  codex-settings-card:
    backgroundColor: "var(--background-secondary)"
    textColor: "var(--text-normal)"
    rounded: "{rounded.xl}"
    border: "1px solid var(--background-modifier-border)"
    padding: "14px 16px"
  settings-dropdown:
    triggerWidth: "field-width"
    menuWidth: "max(trigger-width, content-estimate), clamped to viewport"
    menuPadding: "5px"
    optionPadding: "5px 8px 5px 10px"
    optionFill: "stretch to menu content track"
    labelOverflow: "wrap only when viewport clamping requires it"
    scrollBehavior: "hide vertical scrollbar until content exceeds max height"
---

# Design System: OpenCodian

## 1. Overview

**Creative North Star: "The Vault Workbench"**

OpenCodian should feel like a focused workbench mounted inside Obsidian, not a separate web app pasted into a pane. The interface inherits Obsidian's theme, text rhythm, and density, then adds just enough glass, accent, and tool-state structure to make OpenCode activity legible.

The system is product-register design. It serves repeated expert workflows: chat, model selection, permission changes, vault context, slash commands, background work, and server health. Surfaces should be quiet at rest and precise under interaction. Visual richness belongs around composer focus, popovers, active state, and background imagery, while messages and tool results remain readable first.

OpenCodian rejects generic SaaS ornament, large marketing panels, decorative gradient text, and card grids that make every control look equally important. It also rejects hiding complex runtime state. If a task, provider, session, or permission mode changes what the user can safely do, the UI should expose that state near the decision point.

**Key Characteristics:**

- Obsidian-native theming through `var(--background-*)`, `var(--text-*)`, and `var(--interactive-accent)`.
- Compact product controls with icon-first triggers, short labels, and hover/focus clarity.
- Layered surfaces using tonal mixing, blur, and restrained shadows.
- Clear state color for permission, warning, success, error, provider, and background-task signals.
- Dense message rendering with selectable text, readable code, and stable scroll behavior.

## 2. Colors

The palette is semantic and host-aware: Obsidian theme variables are the source of truth, and OpenCodian tokens shape them into workbench surfaces.

### Primary

- **Obsidian Accent Proxy** (`var(--interactive-accent)`, represented by `#64748b` in neutral presets): primary actions, selected model/provider state, focus outlines, and subtle active borders.
- **Ocean Accent** (`#2563eb`): optional flat preset for users who want a clearer blue product signal.
- **Mint Accent** (`#14b8a6`): optional glass preset for a calmer local-first signal.

### Secondary

- **Amber Signal** (`#f59e0b`): warning, agent emphasis, active background-task state, and high-attention workflow markers.
- **Rose Signal** (`#e11d48`): destructive or misconfigured states.
- **Cyan to Magenta Neon Pair** (`#06b6d4`, `#d946ef`): sharp preset only. Use sparingly for advanced or experimental themes, not as default product color.

### Neutral

- **Graphite Ink** (`#0f172a`): dark structural preset and high-contrast text reference.
- **Void Ink** (`#020617`): deepest sharp preset, reserved for contrast anchoring.
- **Canvas Light** (`#f8fafc`): light high-contrast surface reference.
- **Lavender Tint** (`#f5f3ff`) and **Rose Tint** (`#fff1f2`): soft status/tint references drawn from built-in presets.

### Named Rules

**The Host Theme Rule.** Do not hard-code a full color world for stable UI. Prefer Obsidian variables, then mix them through OpenCodian semantic variables.

**The Accent Rarity Rule.** Accent color should mark decisions and state, not decorate every panel.

**The Status Honesty Rule.** Warning, error, success, and permission colors must not be softened so much that users miss risk.

## 3. Typography

**Display Font:** `var(--font-interface)` with system UI fallback.
**Body Font:** `var(--font-interface)` with system UI fallback.
**Label/Mono Font:** `var(--font-monospace)` for tools, code, paths, model ids, and raw protocol content.

**Character:** Compact, readable, and interface-native. The type scale should feel like Obsidian plus a coding console, not a landing page.

### Hierarchy

- **Display** (700, 16px, 1.3): rare pane or modal titles. Do not use hero-scale type inside plugin surfaces.
- **Title** (700, 14px, 1.35): notice cards, server action titles, settings section anchors, and important inline status.
- **Body** (400, 13px, 1.5): default chat, dropdown options, settings descriptions, tool summaries, and inline explanations.
- **Label** (700, 10-11px, 1.4, slight positive letter spacing): badges, compact metadata, model/provider modes, and status chips.
- **Mono** (400, 11-13px, 1.4-1.5): code blocks, tool names, file paths, raw messages, and JSON-like configuration previews.

### Named Rules

**The 13px Workbench Rule.** Most product UI sits at 13px. Use 10-11px for metadata and 14-16px for titles only when hierarchy requires it.

**The Mono Evidence Rule.** Use monospace for exact things: tools, paths, commands, model ids, and raw structured output.

## 4. Elevation

OpenCodian uses a hybrid elevation system. Default Obsidian surfaces are mostly flat and tonal. Chat bubbles, popovers, composer surfaces, and opt-in theme backgrounds use glass layering, blur, inset highlights, and restrained shadows. Elevation should clarify stacking, not make the whole app float.

### Shadow Vocabulary

- **Subtle Surface** (`var(--opencodian-shadow-xs)`): small inline controls and low-risk hover response.
- **Card Surface** (`var(--opencodian-shadow)`): notice cards and server action panels.
- **Popover Surface** (`0 22px 44px color-mix(in srgb, var(--opencodian-glass-shadow-strong) 88%, transparent)`): model, agent, and permission dropdowns.
- **Message Bubble** (`0 10px var(--opencodian-user-shadow-blur) var(--opencodian-glass-shadow)`): user bubbles and theme-background chat surfaces.
- **Experimental Glass** (`backdrop-filter` plus saturation): composer themes and demos only, never required for basic readability.

### Named Rules

**The Flat-Until-Useful Rule.** A surface is flat or tonal unless it is stacked, interactive, floating, or part of an explicitly selected glass theme.

**The Blur Must Pay Rent Rule.** Blur is acceptable around composer focus, popovers, and theme backgrounds. It must not reduce message or permission readability.

## 5. Components

### Buttons

- **Shape:** compact 6px for toolbar and selector triggers, 8px for command buttons, 999px for chips.
- **Primary:** use `var(--interactive-accent)` or a status color only when an action is decisive.
- **Hover / Focus:** hover should change color, opacity, or tonal background within 150ms. Focus-visible uses a 2px accent outline with offset.
- **Ghost controls:** model, agent, permission, and sidebar controls default to transparent backgrounds and become visible through hover, open, or selected state.

### Chips

- **Style:** 9px to 999px radius, compact height, semantic text color, and tonal background.
- **State:** selection/context chips should truncate safely, show enough path or source identity to be useful, and avoid growing the composer.
- **Risk:** status chips must preserve warning/error contrast.

### Cards / Containers

- **Corner Style:** 10-14px for notice, server, and modal panels. Avoid nesting card surfaces.
- **Background:** use `var(--opencodian-surface-mix)`, `var(--opencodian-surface-mix-soft)`, or a status-tinted mix.
- **Shadow Strategy:** use `var(--opencodian-shadow)` for cards, stronger glass shadows only for popovers.
- **Border:** use `var(--background-modifier-border)` or `var(--opencodian-accent-border)` where state matters.
- **Internal Padding:** 12-16px for cards, 6-10px for compact controls.

### Codex Settings Cards

Codex backend settings use a single, fixed vertical rhythm across the Connection, Resume & Inspect, and Account subtabs. All card-like surfaces (account cards, readback outputs, connection summary) share the same spacing tokens so the three tabs feel like one surface.

- **Group header/description to first card/control stack:** `16px` (`{spacing.codex-group-header-gap}`).
- **Cards/setting rows inside any Codex subtab group:** `12px` vertical gap (`{spacing.codex-card-gap}`).
- **Card title/header to body:** `8px` (`{spacing.codex-card-title-body-gap}`).
- **Card body/readback blocks:** `10px` vertical gap (`{spacing.codex-card-body-gap}`).
- **Card padding:** `14px 16px` (`{components.codex-settings-card.padding}`).
- **Card background:** `var(--background-secondary)` with `1px solid var(--background-modifier-border)` and `10px` radius.
- **Group titles (`h4`) must have `padding-left: 0` / `padding-inline-start: 0` and `margin: 0`; spacing to the description and first control stack comes from the tokens above, not per-element margins.
- **No nested cards:** a readback card may contain rows, but it must not wrap another full card.
- **No ad-hoc margins:** spacing comes from the group stack gap and the tokenized title/body gaps, not per-element margins.

### Modal Layout

All settings modals share a single chrome/layout layer instead of per-modal margin hacks. The system is built on Obsidian's `.modal-content` and reusable OpenCodian shell classes.

- **Modal content padding:** `22px` horizontal and vertical (`{spacing.modal-content-padding-x}` / `{spacing.modal-content-padding-y}`).
- **Header to body:** `16px` (`{spacing.modal-header-body-gap}`).
- **Sections inside modal body:** `20px` vertical gap (`{spacing.modal-section-gap}`).
- **Elements inside a section:** `12px` vertical gap (`{spacing.modal-section-inner-gap}`).
- **Cards inside a section:** `12px` vertical gap (`{spacing.modal-card-gap}`).
- **Form rows:** `12px` vertical gap (`{spacing.modal-form-row-gap}`); label/control columns use `16px` (`{spacing.modal-form-label-control-gap}`).
- **Action rows:** `8px` horizontal gap (`{spacing.modal-action-gap}`), top border separator, right-aligned.
- **Help modals:** max-width `720px`, sections stacked with `16px` gap (`{spacing.help-modal-section-gap}`), compact callouts and lists.
- **Inspection panels:** readback and MCP detail modals use `.opencodian-inspection-panel` with a compact summary band (intro + meta strip), `.opencodian-inspection-row` for item rows, and `.opencodian-inspection-section` for grouped server sections. Spacing follows the modal tokens above; no nested cards.
- **No nested card surfaces:** a card may contain rows or lists, but not another full card.
- **No ad-hoc margins:** spacing comes from the shell/section/card gaps, not per-element margins.
- **Flush headings:** section headings (`h4`, `h5`) must not carry left padding (`padding-left: 0; padding-inline-start: 0`) so they align with the section content and modal edge.

### MCP Inspection Modal

The Codex MCP server inspection modal follows the shared modal/inspection-panel layout with additional fixed-height collapse rules:

- **Collapsed server section height:** fixed at ~96px (`--opencodian-mcp-server-collapsed-height: 96px`). Use `min-height`/`max-height` or an equivalent fixed summary-row height so every collapsed server section has the same visual footprint.
- **Collapsed summary content only:** each folded server row shows display name/version, a short server-id summary when the id differs from the display name, auth badge/auth action, tool/resource count, and an expand button. No tool list, tool description, schema, resource detail, or server description is visible.
- **Expand control:** use a native `<button>` with text labels (i18n `expandServer`/`collapseServer`), `aria-expanded`, and `aria-controls`. Do not rely on icon-only toggles.
- **Expanded content spacing:** use the modal section/card spacing tokens (`--opencodian-modal-section-inner-gap`, `--opencodian-modal-card-gap`). Keep the expanded body as a flat list of rows; no nested cards, no side-stripes, no marketing hero.
- **Tool rows:** default to tool name + a "Tool details" button only. Description and input schema are hidden. Clicking "Tool details" reveals the description and a schema toggle; the full JSON schema requires a second click on the schema toggle. This two-level expansion keeps long schemas from overwhelming the list.
- **Resource rows:** keep the existing view action, but do not expose resource details while the server section is collapsed.
- **Focus server:** when `focusServerName` matches, expand that section by default and apply the existing `.is-focused` highlight ring so the chat deep-link experience remains intact.

### Inputs / Fields

- **Style:** transparent or tonal background, 10-12px radius, Obsidian text colors, compact line height.
- **Focus:** accent outline, border shift, or tonal lift. Do not add large glow.
- **Error / Disabled:** error color must be visible in both light and dark themes; disabled state should reduce contrast but keep labels readable.

### Settings Dropdowns

Settings dropdown menus may be wider than their trigger when option labels need more room. The trigger remains field-sized; the open menu expands to fit readable option content, then clamps to the viewport. The important alignment contract is inside the menu: every option row must fill the menu content track, without a ragged right-side gap.

- **Trigger width:** follows the settings field layout.
- **Menu width:** `max(trigger-width, content-estimate)`, clamped by viewport margins.
- **Menu padding:** `5px`.
- **Option padding:** `5px 8px 5px 10px`, with each option row `width: 100%` and `justify-self: stretch`.
- **Label overflow:** option labels may wrap only when viewport clamping leaves no room; do not force normal-width menus to truncate risk labels such as `危险：完全访问`.
- **No ragged menu rows:** if the menu panel is wider than the trigger, hover and selected option backgrounds still span the full internal menu width.
- **Scrollbar behavior:** short menus must not reserve a vertical scrollbar gutter; enable internal scrolling only when content exceeds the menu max height.

### Navigation

- **Sidebar:** low-opacity by default, reveals on hover or focus, icon-only 28px controls, 6px radius, glass background.
- **Tabs:** preserve per-tab runtime identity. Do not visually imply a single global stream when multiple conversations can be active.
- **Dropdowns:** bottom-aligned near the composer, 14px radius, max-height with internal scrolling, sticky provider headers where needed.

### Chat Messages

- **User messages:** right-aligned glass bubbles with 16px default radius, small tail radius, compact padding, and selectable text.
- **Assistant messages:** full-width readable flow with 13px text, 1.5 line height, transparent default background, and subtle hover elevation when theme backgrounds are active.
- **Streaming and tools:** use inline rows, monospace tool names, muted summaries, and status icons. Structural rails are acceptable for tool/thinking content, but do not use colored side stripes as a generic card accent.
- **Notices:** use cards for actual status or recovery needs, not for decorative grouping.

## 6. Do's and Don'ts

### Do

- Use Obsidian variables as the base palette.
- Keep controls compact and close to the workflow they affect.
- Show model, provider, permission, server, and background-task state where the user makes decisions.
- Preserve selectable text, readable code blocks, and stable scroll behavior.
- Keep visual additions inside existing UI owners and update module docs when behavior changes.
- Prefer one clear owner surface over several tiny helper surfaces.

### Don't

- Do not turn the plugin into a marketing page or generic SaaS dashboard.
- Do not use gradient text, oversized hero type, or decorative card grids.
- Do not add glass, blur, or shadows where they reduce readability.
- Do not hide permission or server risk behind low-contrast styling.
- Do not collapse concurrent tab/session/background behavior into one global stream metaphor.
- Do not introduce broad new visual abstractions when an existing chat, settings, theme, or component owner can carry the change.
