# Lane Baseline — `a2-mcp-settings`

## Scope

- Execute MCP settings and tool-rendering work only after the agent surface lane is closed.
- Keep MCP settings inside the existing Server domain and reuse the current OpenCode service/query seams instead of bypassing them from UI code.

## References

- `docs/superpowers/specs/2026-04-25-opencodian-mcp-settings-and-tooling-design.md`
- `/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/opencode-mcp-servers-doc.md`

## Round rules

- Use OpenCode for implementation passes with a `3600` second timeout.
- Use Codex for both the design review and the final code review.
- Keep MCP server management and MCP tool-call rendering in the same lane, but do not expand into MCP resources or prompts.
