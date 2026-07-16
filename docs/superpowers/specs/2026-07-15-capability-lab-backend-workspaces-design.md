# Capability Lab Backend Workspaces Design

## Goal

Refactor Debug > Capability Lab so Claude Code, OpenCode, and Codex capabilities are presented as three consecutive peer workspaces. No backend may be represented inside another backend's card or table.

## Approved Information Architecture

The Capability Lab body renders in this order:

1. Diagnostic warning and boundary summary.
2. Claude Code capability workspace.
3. OpenCode capability workspace.
4. Codex capability workspace.
5. Existing deep diagnostic blocks.

The backend workspaces are direct children of `.opencodian-capability-lab-body` and use the fixed order `claude-code`, `opencode`, `codex`.

## Surface Ownership

Each `[data-capability-backend]` section is the only bordered, rounded, tonal surface for that backend branch. Its heading, status, description, table shell, empty state, and actions are flat descendants.

The implementation must satisfy:

- No `[data-capability-backend] [data-capability-backend]` descendants.
- No `.opencodian-capability-lab-matrix-separator` row.
- Claude Code and Codex use separate capability tables.
- OpenCode retains its production SDK snapshot, safe refresh, and sanitized evidence export.
- Existing capability classification, probes, adapter behavior, and settings persistence remain unchanged.

## Backend States

- Claude Code and Codex show `available` when their adapter is configured and `unconfigured` when it is absent. Static contract rows remain visible in both states; the section status makes their evidence boundary explicit.
- OpenCode shows `available` when any capability is available, `unknown` when no capability is available but at least one remains unknown, and `empty` only for a generated snapshot with neither available nor unknown capabilities. Before a usable snapshot exists it remains `unknown`.
- Capability-level blocked, hidden, unsupported, or failed states remain on their own rows and do not color the entire backend workspace as an error.

Every state is expressed with text as well as styling.

## Accessibility

- Each backend section is a semantic `section` with a unique heading and `aria-labelledby`.
- Backend state uses `data-backend-state` and visible localized text.
- Capability tables have localized accessible labels; column headers use `scope="col"`.
- Refresh uses `disabled` and `aria-busy` while running.
- Refresh feedback uses a polite live status region; failures use an alert region.
- A successful refresh restores keyboard focus to the replacement refresh button after the capability content rerenders.
- All actions are explicit `type="button"` controls.

## Responsive Rules

- The Capability Lab body and each backend workspace stay within their container width.
- Only the table shell may scroll horizontally.
- At narrow widths, the backend header becomes a single column and actions stretch without changing font size.
- At narrow container widths, the diagnostic summary becomes a single column and its values wrap without ellipsis.
- The design uses Obsidian and OpenCodian semantic variables, restrained color, compact 13px product typography, and no decorative gradients or nested cards.

## Stable DOM Contract

```text
.opencodian-capability-lab-body > [data-capability-backend]
[data-capability-backend="claude-code"]
[data-capability-backend="opencode"]
[data-capability-backend="codex"]
[data-backend-state]
[data-capability-matrix="claude-code"]
[data-capability-matrix="codex"]
[data-opencode-sdk-capability]
[data-backend-action="refresh"]
[data-backend-action="copy-evidence"]
```

## Verification

- Unit tests prove peer order, direct ownership, no nested backend section, no separator row, per-backend table ownership, backend states, accessible headings, and existing refresh/export behavior.
- `npm run graphify:update:src` refreshes the committed source graph.
- `npm run verify` passes with zero lint warnings.
- Test Vault validation uses `obsidian-plugin-autodebug` for BUILD_ID verification, active-tab proof, DOM assertions, console/error capture, and light/dark screenshots.
