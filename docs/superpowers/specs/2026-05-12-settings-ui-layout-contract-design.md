# Settings UI layout contract design

## Status

Approved exploration direction: refactor the settings interface UI and layout without changing settings behavior.

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

Existing class names can be preserved during migration, but their styles should map to this vocabulary. New names should only be introduced where they reduce duplication or make the contract enforceable.

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

1. Shell normalization:
   - Make the tabbed content shell visually lighter.
   - Remove the full-card-inside-full-card effect.
   - Preserve tab state, scrolling behavior, layout mode switching, and dropdown enhancement.

2. Shared section block and setting row styling:
   - Standardize `.opencodian-settings-block`, `.opencodian-settings-block-body`, headings, descriptions, and ordinary `.setting-item` rows inside settings sections.
   - Keep ordinary settings lightly carded and comfortable, not cramped.
   - Verify both classic and tabbed surfaces.

3. High-noise object sections:
   - Migrate MCP overview/server cards, model provider cards, model availability lists, formatter runtime rows, agents, commands, and plugin surfaces toward the shared object-card vocabulary.
   - Preserve their current data, actions, async behavior, and modals.

4. Style settings special case:
   - Align style groups, sliders, numeric controls, color controls, preset cards, background cards, and input panel settings with the same surface weights.
   - Do not change chat appearance setting semantics.

5. Documentation and visual QA:
   - Update matching `docs/modules/**` pages when source or style module behavior changes.
   - Refresh graphify artifacts if `src/` changes.
   - Use screenshots or Obsidian/Test Vault checks for final UI confidence when implementation begins.

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

## Verification plan for implementation

- Run focused tests for any touched settings owner.
- Run `npm run build` after UI/style changes.
- Run `npm run verify` before merge.
- If `src/` changes, run `npm run graphify:update:src` before `npm run verify`.
- If deploy-relevant runtime or style files change and deployment is requested, build first, copy `dist/main.js`, `dist/manifest.json`, and `dist/styles.css` to the Test Vault plugin directory, then verify the deployed `BUILD_ID`.

## Open implementation notes

- `SettingsTabbedRenderer.shouldUsePanelShell()` is a likely first implementation hotspot because it currently applies different shell behavior by primary tab.
- `SettingsPanelChrome.createSettingsBlock()` is the natural place to keep shared section block semantics.
- `.opencodian-settings-tab-panel`, `.opencodian-settings-block`, and settings-local object card classes should be reconciled as a styling contract before deeper section migration.
- Modal-specific settings surfaces should follow the same vocabulary when they share settings controls, but they do not need to be solved in the first slice.
