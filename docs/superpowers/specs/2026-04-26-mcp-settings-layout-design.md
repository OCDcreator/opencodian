# MCP Settings Layout Design

## Goal

Bring the dedicated MCP settings page up to the same visual and information-architecture standard as the rest of OpenCodian settings without changing the underlying MCP runtime behaviors.

## Accepted Scope

- Keep MCP as its own primary settings page.
- Preserve the current three functional surfaces:
  - overview and refresh
  - runtime server status list and per-server actions
  - add-server form
- Preserve existing runtime actions and validation behavior.
- Improve layout, grouping, scanability, and visual consistency only where needed to support a more normal card-based settings experience.

## Design

### Overview Card

- Keep the existing `opencodian-settings-block` wrapper.
- Inside the block body, add an MCP-specific layout shell with:
  - a top bar for summary copy and refresh action
  - a responsive row of metric cards
  - a quieter footer row for the last refresh timestamp

### Server List Card

- Turn the runtime server list into a dedicated card shell instead of a bare list.
- Use a stable three-column row structure: name, status, actions.
- Move row errors into a second line that spans the full row so failures read as details instead of breaking the main alignment.
- Keep the empty state inside the same card shell.

### Add Server Card

- Keep Obsidian `Setting` controls for compatibility.
- Wrap the form in MCP-specific grouped containers:
  - Basics
  - Connection
  - OAuth (remote only)
- Keep conditional field visibility but make the hierarchy explicit through grouped-card wrappers and section labels.

## Constraints

- Follow the existing OpenCodian settings visual language instead of introducing a new design system.
- Prefer extending `SettingsMcpSection` and `SettingsMcpAddForm` over adding new owners.
- Add tests that lock the new structural DOM hooks in place.
- Update module docs if source structure or behavior documentation changes materially.
