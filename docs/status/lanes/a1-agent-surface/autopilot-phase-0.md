# Lane Baseline — `a1-agent-surface`

## Scope

- Execute the agent surface mapping spec before any MCP or formatter work starts.
- Keep the implementation strictly native to OpenCode semantics: runtime truth, config truth, file truth, and child-session truth must stay distinct.

## References

- `docs/superpowers/specs/2026-04-25-opencode-agent-surface-design.md`
- `/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/opencode-agent-mechanism-and-sdk.md`

## Round rules

- Use OpenCode for implementation passes with a `3600` second timeout.
- Use Codex for both the design review and the final code review.
- Update matching module docs whenever the slice changes ownership or user-visible semantics.
