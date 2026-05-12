# Settings UI layout contract design

## Status

Approved exploration direction: refactor the settings interface UI and layout without changing settings behavior.

Council review incorporated: `/Users/dht/council-review-settings-ui-layout-contract.md`.

The refactor keeps both current layout modes as first-class surfaces:

- `classic`: the flat, scrollable settings sequence with quick navigation.
- `tabbed`: the primary / secondary tab settings surface.

The goal is not to make one mode imitate the other. The goal is to give both modes the same visual hierarchy, component vocabulary, spacing rhythm, and interaction affordances.

## Problem

The current settings surface mixes several visual systems:

- Some tabbed sections render inside `.opencodian-settings-tab-panel`, then render `.opencodian-settings-block` inside it, producing a full-card-inside-full-card effect.
- Other tabbed sections skip the tab panel shell, so tabbed mode has inconsistent depth between primary tabs.
- Classic mode and tabbed mode do not share the same outer shell rules, even when they render the same settings.
- Individual sections invent local card, row, toolbar, and list styles. This makes ordinary settings, object lists, and status summaries look like unrelated UI families.
- Some ordinary options read as heavy cards, while others read as clean setting rows. The inconsistency is the issue, not the presence of card styling.

## Non-goals

- Do not change setting keys, default values, migrations, save behavior, OpenCode config behavior, model filtering, MCP behavior, or style runtime behavior.
- Do not remove either `classic` or `tabbed`.
- Do not redesign the chat surface, composer, model selector, or runtime panels.
- Do not introduce a new framework, Tailwind, shadcn, or external UI dependency.
- Do not split section owners into many thin helper files just to reduce local line counts.

## Product design direction

OpenCodian settings should feel like an Obsidian-native workbench configuration surface: compact, calm, and explicit. It may keep a light card feel for ordinary settings, but card weight must communicate hierarchy.

The default setting item should feel like a comfortable light card row, not a bare line and not a dense object card. Object collections such as providers, MCP servers, model rows, formatter runtimes, commands, agents, and plugin entries may use richer object cards because they represent entities with identity, status, metadata, and actions.

## Surface hierarchy

Use three surface weights.

### 1. Navigation shell

Purpose: mode-specific navigation and page structure.

- Classic uses a vertical sequence plus quick navigation.
- Tabbed uses primary and secondary tabs.
- This layer should be visually light and structural.
- It must not look like a heavy content card.
- In tabbed mode, the old `.opencodian-settings-tab-panel` should become a structural content region or a very light shell, not a full card competing with section blocks.

### 2. Section block

Purpose: the visible section container shared by both modes.

- A section block is the main content surface.
- Classic and tabbed should render section blocks with the same weight.
- A section block may contain a heading, description, toolbar, setting rows, object lists, summaries, and empty states.
- Section blocks should use one shared radius, border, background, padding, and vertical rhythm.

### 3. Item surfaces

Purpose: content inside a section block.

- Ordinary settings use a light setting-card row: label, description, optional helper, and control.
- Object collections use richer object cards or structured rows.
- Toolbars, metadata strips, inline groups, and empty states are lighter than object cards.
- Nested full cards are not allowed. If content nests inside a section block, the nested surface must step down in weight.

## Component vocabulary

Define and migrate toward these shared primitives:

- `settings-page`: the scroll container and title area.
- `settings-navigation`: quick nav, primary tabs, secondary tabs.
- `settings-content-shell`: layout-only wrapper for tabbed or classic content.
- `settings-section`: the visible section block.
- `settings-section-header`: section title, description, and optional toolbar.
- `settings-row-card`: ordinary setting row with light card treatment.
- `settings-object-card`: provider, MCP server, model, formatter runtime, agent, command, or plugin object.
- `settings-summary-tile`: small metric or status tile. It should be lighter than object cards and must not dominate a section.
- `settings-toolbar`: action row for refresh, add, reset, import, and edit actions.
- `settings-inline-group`: compact nested group for related controls.
- `settings-empty-state`: low-emphasis empty or unavailable state.
- `settings-status-badge`: connected, disabled, warning, error, inherited, runtime-only, or project-owned state.
- `settings-loading-state`: async refresh, catalog loading, and probing placeholders.
- `settings-error-state`: validation, network, config, or runtime failures with a nearby recovery action when available.
- `settings-divider`: internal separation inside a section block without creating another card.
- `settings-toggle-row`: toggle-controlled row that may reveal nested conditional controls.
- `settings-control-group`: related controls without a full section header.
- `settings-preview-card`: visual preview surface for style presets, color/background previews, and other visual configuration examples.

Existing class names can be preserved during migration, but their styles should map to this vocabulary. New names should only be introduced where they reduce duplication or make the contract enforceable.

## Design token contract

Slice 0 must introduce a settings-local token layer before visual migration starts. Exact values can be tuned during implementation, but every surface must map through the token names below rather than ad hoc per-section values.

### Surface weights

| Token role | Navigation shell | Section block | Setting row card | Object card | Inline group / metadata |
|---|---|---|---|---|---|
| Background | transparent or host background | `var(--opencodian-settings-section-bg)` | `var(--opencodian-settings-row-bg)` | `var(--opencodian-settings-object-bg)` | `var(--opencodian-settings-inline-bg)` |
| Border | none or transparent | `var(--opencodian-settings-section-border)` | `var(--opencodian-settings-row-border)` | `var(--opencodian-settings-object-border)` | `var(--opencodian-settings-inline-border)` |
| Radius | `0` to `8px` | `12px` | `10px` | `12px` | `6px` |
| Shadow | none | none or very subtle inset highlight | none | subtle only when identity/status density needs lift | none |
| Padding | layout gutters only | `14px 16px 16px` | `12px 14px` | `12px 14px` minimum | `6px 8px` |
| Gap | `8px` to `12px` | `10px` to `14px` | `8px` | `8px` to `12px` | `6px` |

Initial CSS custom property names:

```css
--opencodian-settings-section-bg
--opencodian-settings-section-border
--opencodian-settings-row-bg
--opencodian-settings-row-border
--opencodian-settings-object-bg
--opencodian-settings-object-border
--opencodian-settings-inline-bg
--opencodian-settings-inline-border
--opencodian-settings-radius-section
--opencodian-settings-radius-row
--opencodian-settings-radius-inline
--opencodian-settings-space-xs
--opencodian-settings-space-sm
--opencodian-settings-space-md
--opencodian-settings-space-lg
--opencodian-settings-space-xl
```

All tokens must derive from Obsidian theme variables such as `var(--background-primary)`, `var(--background-secondary)`, `var(--background-modifier-border)`, `var(--background-modifier-border-hover)`, `var(--text-normal)`, `var(--text-muted)`, and `var(--interactive-accent)`.

### Typography and state tokens

- Section headings: 14-15px, weight 700, no negative letter spacing.
- Setting names: 13px, weight 600.
- Descriptions and metadata: 12px, line-height 1.5-1.55.
- Badges: 11px, weight 600-700, semantic color plus text/icon state. Do not rely on color alone.
- Focus: visible focus ring or border shift using `var(--interactive-accent)`.
- Disabled: semantic disabled state plus reduced emphasis; disabled controls must not look tappable.

## Layout mode contract

Classic and tabbed modes must share content primitives.

Classic mode:

- Renders all primary sections in sequence.
- Uses quick navigation for jumping between sections.
- Each primary section owns a heading and one or more shared section blocks.
- Ordinary setting rows and object collections use the same item styles as tabbed mode.

Tabbed mode:

- Renders primary and secondary tabs as navigation.
- The tab content shell is structural, not a heavy card.
- The active secondary tab should render content in the same section block style used by classic mode.
- For secondary tabs that display only one subsection, the subsection still gets the shared section block treatment.

## Migration strategy

Implement in small verified slices.

0. Token and inventory setup:
   - Add the settings token contract in CSS without changing visible behavior.
   - Inventory every settings section, its current surface type, target primitive, migration slice, and risk level.
   - Audit CSS selector specificity and modal class sharing before any broad style changes.

1. Shell normalization:
   - Make the tabbed content shell visually lighter.
   - Remove the full-card-inside-full-card effect.
   - Preserve tab state, scrolling behavior, layout mode switching, and dropdown enhancement.
   - Prefer CSS-only shell changes first; structural DOM changes require focused tests.

2. Shared section block and setting row styling:
   - Standardize `.opencodian-settings-block`, `.opencodian-settings-block-body`, headings, descriptions, and ordinary `.setting-item` rows inside settings sections.
   - Keep ordinary settings lightly carded and comfortable, not cramped.
   - Verify both classic and tabbed surfaces.

3. High-noise object sections:
   - Migrate MCP overview/server cards, model provider cards, model availability lists, formatter runtime rows, agents, commands, and plugin surfaces toward the shared object-card vocabulary.
   - Preserve their current data, actions, async behavior, and modals.

4. Style settings special case:
   - Align style groups, sliders, numeric controls, color controls, preset cards, background cards, and input panel settings with the same surface weights.
   - Style settings are separate because they contain custom visual controls and preview surfaces that do not always fit ordinary `settings-row-card` or `settings-object-card` patterns.
   - Prefer alignment through spacing, typography, tokens, `settings-control-group`, and `settings-preview-card` before forcing identical card treatment.
   - Do not change chat appearance setting semantics.

5. Documentation and visual QA:
   - Update matching `docs/modules/**` pages when source or style module behavior changes.
   - Refresh graphify artifacts if `src/` changes.
   - Use screenshots or Obsidian/Test Vault checks for final UI confidence when implementation begins.

## Section inventory

Slice 0 should refine this table with exact class names and screenshots before implementation.

| Area | Current owner | Current surface type | Target mapping | Complexity |
|---|---|---|---|---|
| General | `OpenCodianSettings` / `OpenCodianSettingsView` | merged block with ordinary settings | `settings-section` + `settings-row-card` | Low |
| Server | `SettingsServerSection` | ordinary settings plus status/actions | `settings-section`, `settings-row-card`, `settings-status-badge`, `settings-toolbar` | Medium |
| Model common/project config | `SettingsModelSection` | shared blocks plus provider/config editors | `settings-section`, `settings-row-card`, `settings-control-group` | Medium |
| Model availability/tools | `SettingsModelSection`, `SettingsModelCatalogPresenter` | catalog summaries, provider/model rows, status badges | `settings-section`, `settings-summary-tile`, `settings-object-card`, `settings-status-badge` | High |
| Conversation | `SettingsConversationSection` | shared blocks and ordinary settings | `settings-section` + `settings-row-card` | Low |
| Agents | `SettingsAgentsSection`, `SettingsProjectAgentEditor` | plugin blocks, catalog lists, editor groups | `settings-section`, `settings-object-card`, `settings-control-group`, `settings-empty-state` | High |
| Commands | `SettingsCommandsSection`, `SettingsProjectCommandEditor` | plugin blocks, catalog lists, editor groups | `settings-section`, `settings-object-card`, `settings-control-group`, `settings-empty-state` | High |
| MCP | `SettingsMcpSection` | overview block, summary tiles, server cards, action grids | `settings-section`, `settings-toolbar`, `settings-summary-tile`, `settings-object-card`, `settings-status-badge` | High |
| Formatter | `SettingsFormatterSection` | overview cards, runtime rows, config rows, JSON editor | `settings-section`, `settings-summary-tile`, `settings-object-card`, `settings-control-group`, `settings-error-state` | High |
| Plugins | `SettingsPluginSection` | plugin blocks and directory/global/OMO surfaces | `settings-section`, `settings-object-card`, `settings-row-card`, `settings-empty-state` | Medium |
| Security | `SettingsSecuritySection` | ordinary settings plus status warnings/actions | `settings-section`, `settings-row-card`, `settings-status-badge`, `settings-error-state` | Medium |
| UI | `SettingsUiSection` | ordinary settings | `settings-section` + `settings-row-card` | Low |
| Style | `SettingsStyleSection` and child owners | style groups, sliders, color controls, preview cards | `settings-section`, `settings-row-card`, `settings-control-group`, `settings-preview-card` | High |
| Debug | `SettingsDebugSection` | debug controls, module lists, help items | `settings-section`, `settings-row-card`, `settings-object-card`, `settings-empty-state` | Medium |
| User | `SettingsUserSection` | ordinary text settings | `settings-section` + `settings-row-card` | Low |

## Behavioral invariants

Shell and layout work must preserve:

- `settingsLayoutMode`, `settingsTabbedPrimaryTab`, and `settingsTabbedSecondaryTabByPrimary` persistence.
- Classic scroll restoration through `settingsPanelScrollTop`.
- Existing `scrollToServerSection()`, `scrollToModelSection()`, and `prepareScrollToConversationOnNextOpen()` behavior.
- Quick navigation jump targets in classic mode.
- Primary and secondary tab click behavior in tabbed mode.
- Dropdown enhancement positioning, keyboard support, and cleanup in `display()` / `hide()`.
- Focus visibility and tab order for all controls.
- Async refresh button states for server, model, MCP, formatter, and catalog sections.
- Modal behavior for provider icons, model config, MCP editor/status, config JSON, and compaction help.
- Obsidian modal settings and editor-area settings view behavior.

## Rollback and partial adoption

- Work in narrow branches or commits per slice, for example `refactor/settings-ui-slice-0-tokens`, `refactor/settings-ui-slice-1-shell`, and so on.
- Each slice must be shippable on its own or explicitly marked experimental before merge.
- Slices 0-2 are the minimum acceptable partial migration: token contract, inventory, shell normalization, and shared section/row styling must land together or in quick succession.
- If a slice breaks dropdown enhancement, keyboard focus, tab persistence, or settings save behavior, revert the slice rather than patching around broken behavior.
- If a slice requires broad selector specificity escalation, stop and reduce existing specificity first.
- If a community theme or Obsidian default theme exposes unreadable contrast that cannot be fixed locally, stop that slice and revise the token mapping.

## Accessibility contract

- `settings-page`: main settings content region in the settings view. Preserve Obsidian host semantics; add ARIA only where it improves the existing structure.
- `settings-navigation`: quick nav should behave as navigation; tabbed primary/secondary controls should expose tab-like selected state where feasible without fighting Obsidian's settings host.
- `settings-section`: each visible section needs a programmatic label through heading text or `aria-labelledby` if custom roles are introduced.
- `settings-toolbar`: grouped actions should have a clear label when several icon or compact buttons sit together.
- `settings-status-badge`: status must include text or an icon plus accessible label; color alone is insufficient.
- Tab switching should leave focus in a predictable place: the clicked tab remains focused, or focus moves to the active section heading only if implementation intentionally manages focus.
- Reduced-motion preferences must be respected for any added transitions.

## Visual QA checkpoints

During implementation, capture or inspect:

- Classic and tabbed modes in Obsidian default light and dark themes.
- Editor-area settings view if touched.
- Narrow settings pane around 720px and desktop-width settings pane around 1280px or wider.
- At least three common theme contexts when feasible: Obsidian default, Minimal, and one additional installed/community theme available in the test vault.
- Before/after screenshots for classic mode and tabbed mode after slices 1 and 2.
- MCP, model availability, formatter, style presets/background, agents, and commands after their migration slices.

Visual QA artifacts do not need to be committed unless the implementation task explicitly creates a visual regression baseline.

## Acceptance criteria

- Classic and tabbed both look intentional and complete.
- Switching between layout modes does not make the same content feel like a different design system.
- Tabbed mode no longer shows a heavy tab panel containing equally heavy section cards.
- Ordinary settings have a consistent light card-row treatment with comfortable spacing.
- Object collections are clearly richer than ordinary setting rows, but still obey the same radius, border, background, typography, and action rhythm.
- No full-card-inside-full-card patterns remain in stable settings surfaces.
- Dropdown enhancement, keyboard focus, hover, disabled states, and Obsidian theme compatibility still work.
- Light and dark themes remain readable through Obsidian variables.
- No behavior, settings persistence, or runtime configuration semantics change.

Structural checks for each migrated slice:

- Section blocks in classic and tabbed use the same token-backed `padding`, `border-radius`, `border`, and `background`.
- No visible `settings-section` equivalent is a descendant of another visible `settings-section` equivalent.
- All ordinary settings in migrated sections map to `settings-row-card` styling.
- Object cards use token-backed object surface values and do not invent unrelated radii, borders, or shadows.
- Loading, error, disabled, and empty states are represented with the expanded vocabulary.
- New CSS stays scoped to settings surfaces and does not restyle unrelated chat or modal surfaces by accident.

## Verification plan for implementation

- Run focused tests for any touched settings owner.
- Run `npm run build` after UI/style changes.
- Run `npm run verify` before merge.
- If `src/` changes, run `npm run graphify:update:src` before `npm run verify`.
- If deploy-relevant runtime or style files change and deployment is requested, build first, copy `dist/main.js`, `dist/manifest.json`, and `dist/styles.css` to the Test Vault plugin directory, then verify the deployed `BUILD_ID`.

## Definition of done

- Token names and section inventory are present before visible CSS migration.
- Classic and tabbed pass the same visual QA checklist.
- `settings-row-card`, `settings-object-card`, `settings-summary-tile`, `settings-toolbar`, and state primitives are represented in migrated CSS or mapped from existing classes.
- No stable settings path depends on a heavy tab panel containing an equally heavy section block.
- No behavior, persistence, runtime config, or settings migration semantics changed.
- Module docs are updated for changed source/style modules.
- `npm run build` passes after style changes.
- `npm run verify` passes before merge.
- If shipped plugin assets are deployed, the deployed Test Vault `main.js` contains the current `BUILD_ID`.

## Open implementation notes

- `SettingsTabbedRenderer.shouldUsePanelShell()` is a likely first implementation hotspot because it currently applies different shell behavior by primary tab.
- `SettingsPanelChrome.createSettingsBlock()` is the natural place to keep shared section block semantics.
- `.opencodian-settings-tab-panel`, `.opencodian-settings-block`, and settings-local object card classes should be reconciled as a styling contract before deeper section migration.
- Modal-specific settings surfaces should follow the same vocabulary when they share settings controls, but they do not need to be solved in the first slice.
