# Settings Agents UI audit, 2026-06-28

## Current problems

The Agents settings surface had the right behavior but did not match the quieter base Settings and Claude Code control surfaces. The default-agent row, expert-mode row, catalog, project-agent editor, Markdown workspace, and the screenshot-owned `General > Agent Management` backend list were visually separate blocks with inconsistent rhythm. In the shared screenshot the backend management section read as oversized tinted cards and isolated controls instead of a mature settings control surface.

The most distracting issues were:

- oversized block/card treatment around simple rows;
- backend and catalog entries rendered as ordinary setting rows without a scannable data-row model;
- status text packed into long descriptions instead of structured low-weight badges;
- Markdown workspace create/edit controls presented like normal settings instead of a local toolbar and list;
- advanced editor controls folded with browser-default disclosure chrome instead of a Radix-style disclosure affordance;
- empty/load-failure states appearing as plain text or full setting rows.

## shadcn/Radix patterns adopted

- **Card/Form row:** default agent, expert mode, and editor fields now use compact row-card structure with copy and controls in predictable columns.
- **Badge:** backend active/enabled/off, agent mode, source, runtime, disabled, visibility, workspace scope, parse status, and runtime seen are exposed as quiet chips.
- **ScrollArea/List:** backend management, catalog, and workspace lists use bounded or grouped list surfaces so many rows do not read as standalone cards.
- **Accordion/Disclosure:** advanced project-agent fields keep a native disclosure with `aria-expanded` and `aria-controls`.
- **Button/Input/Select/Switch:** controls remain Obsidian-native but are placed in shadcn-like row geometry.
- **Alert/Empty:** empty catalog/workspace and load failure use a low-contrast alert/empty surface.

## Patterns intentionally skipped

- **Sheet/Drawer:** not appropriate for this phase because agent editing already lives in Settings and should not introduce another side-panel workflow.
- **Dialog:** not used for Markdown file editing because inline editing keeps context and avoids modal sprawl.
- **Full shadcn/Radix dependency:** not added. This is an Obsidian plugin using TypeScript DOM and CSS, so only the interaction and layout models are borrowed.

## First-phase scope

This phase updates `SettingsBackendSection` for the screenshot-owned `General > Agent Management` backend surface, plus `SettingsAgentsSection`, `SettingsProjectAgentEditor`, and the matching settings CSS/docs for the OpenCode native agent surfaces. It does not change agent config schema, runtime catalog merging, Markdown agent file format, Skills/Tools/ACP settings, chat agent selector, i18n semantics, or backend write flows.

## Design decisions

- Keep `.opencodian-agent-settings-shell` as layout only, not another card.
- Treat backend management as the primary screenshot target: default backend selection is a compact control row, enabled backends are list rows, and active/enabled/off state lives in low-weight badges plus data attributes.
- Keep catalog and workspace rows as real DOM/Obsidian controls so existing toggles, buttons, save callbacks, and tests remain stable.
- Move status hierarchy into badge strips while preserving existing description text for screen readers, tests, and quick scanning.
- Preserve the positive subagent visibility switch semantics.
- Align desktop rows to `minmax(0, 1fr) / minmax(220px, max-content)` and collapse below `720px`.
- Use Obsidian theme variables and existing `--opencodian-settings-*` tokens; no raw color system or marketing gradient was added.
