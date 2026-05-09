# OpenCodian Autodebug Notes

## Purpose

This note records how OpenCodian-specific Obsidian autodebug assets are scoped. Reusable scripts, assertions, signatures, and playbooks that should travel with the shared skill live in the skill's project profile, while architecture notes and repo-owned conventions stay here.

Skill project profile:

- `/Volumes/SDD2T/obsidian-vault-write/custom-project/my-skills/custom/obsidian-plugin-autodebug/projects/opencodian/`

## Current Stable Surface Checks

- `opencodian:open-view` is the command used to open the plugin view in Test Vault smoke runs.
- A successful view smoke should verify that at least one `opencodian-view` leaf exists and that the visible DOM contains `OpenCodian`.
- Do not rely on the historical `opencodian-container` text/selector as a generic root assertion; it can be stale even when the view is open.
- For stateful composer behavior, prefer the reusable project-profile JavaScript assertion run through `obsidian eval` over static DOM text checks. The assertion opens the view, interacts with `.opencodian-input`, waits for the menu to settle, throws on failure, and restores changed plugin settings.

## Project-Specific Diagnosis Patterns

- `ERR_CONNECTION_REFUSED` or `SDK health check failed, falling back to ServerManager health probe`: usually means the UI or SDK health probe raced ahead of managed OpenCode server cold start.
- `SDK session.messages failed`, `SDK session.get failed`, `Failed to sync conversation messages from server`, or `Request failed, status 404`: usually means restored conversation/session metadata is stale relative to the local server session catalog.
- `OPENCODE_SERVER_PASSWORD is not set; server is unsecured.`: expected only for isolated local test vaults; do not treat it as a generic Obsidian plugin issue.
- Slow `serverReadyMs` / `chatReadyDelayMs`: separate visible shell readiness from backend warmup before changing UI code.

## Reusable Triage Moves

- Compare persisted conversation/session metadata with the runtime catalog before changing SDK or network code.
- Use a clean plugin-state run to separate stale local Test Vault state from code regressions.
- Keep visible shell state writes synchronous; move server snapshots and non-critical enrichments to background refreshes where safe.
- Save warm-start and cold-start evidence separately so backend startup cost does not hide frontend regressions.
