# Lane Baseline — `a3-formatter-settings`

## Scope

- Execute formatter settings work only after the MCP lane is closed.
- Keep formatter runtime detection and project config intent visibly separate throughout the UI and config helpers.

## References

- `docs/superpowers/specs/2026-04-25-formatter-settings-design.md`
- `/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/opencode-formatter-doc.md`

## Round rules

- Use OpenCode for implementation passes with a `3600` second timeout.
- Use Codex for both the design review and the final code review.
- Preserve unknown formatter fields in advanced JSON editing and do not leak formatter config into plugin-global settings.
