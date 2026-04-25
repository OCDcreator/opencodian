# MarkdownAgentWorkspaceService

> File: `src/core/agents/MarkdownAgentWorkspaceService.ts`
> Status: [DRAFT]

Manages the file-truth layer for Markdown agent definitions.

## Purpose

Scans, parses, creates, updates, and deletes Markdown agent files in the four
directory roots that OpenCode monitors: `.opencode/agent/`, `.opencode/agents/`,
`agent/`, and `agents/`.

## Key exports

- `MarkdownAgentWorkspaceService` — main service class
- `AGENT_FILE_ROOTS` — the four directory roots
- `AgentFileRoot` — root directory type
- `MarkdownAgentFs` — file system interface (dependency injection)
- `MarkdownAgentFileInput` — input for create/update operations
- `MarkdownAgentScanResult` — scan output with files, duplicates, parse errors

## Upstream contract

Agent IDs come from the path segment under the four roots, not from a
plugin-private registry. The upstream OpenCode config/agent.ts uses
`configEntryNameFromPath()` with the same patterns.

Markdown files are frontmatter + prompt-body. This service now uses a real YAML
parser for the frontmatter block, so malformed YAML becomes an explicit
`parse-error` result instead of being silently ignored. The SDK/config API does not write
them — file CRUD must remain plugin-owned.

## Truth separation

This service only manages the file layer. Runtime truth comes from `app.agents()`,
config truth from `.opencode/opencode.json`. The `AgentCatalogService` merges all
three layers into the unified catalog.

File write success and runtime visibility are separate states:
- `runtimeSeen: false` after a file write means the file exists but the runtime
  has not yet confirmed it.
- `runtimeSeen: true` only after runtime data confirms the agent ID.
