# Autopilot Lane Map — Agent Surface, MCP, Formatter

> **Preset**: `Review-gated implementation queue (OpenCode implementation + Codex review)`
> **Scheduling**: Sequential lane controller
> **Config file**: `automation/agent-mcp-formatter-config.json`

## Lane directories

- `a1-agent-surface`
  - roadmap: `docs/status/lanes/a1-agent-surface/autopilot-round-roadmap.md`
  - baseline: `docs/status/lanes/a1-agent-surface/autopilot-phase-0.md`
- `a2-mcp-settings`
  - roadmap: `docs/status/lanes/a2-mcp-settings/autopilot-round-roadmap.md`
  - baseline: `docs/status/lanes/a2-mcp-settings/autopilot-phase-0.md`
- `a3-formatter-settings`
  - roadmap: `docs/status/lanes/a3-formatter-settings/autopilot-round-roadmap.md`
  - baseline: `docs/status/lanes/a3-formatter-settings/autopilot-phase-0.md`

## Shared references

- `docs/superpowers/specs/2026-04-25-opencode-agent-surface-design.md`
- `docs/superpowers/specs/2026-04-25-opencodian-mcp-settings-and-tooling-design.md`
- `docs/superpowers/specs/2026-04-25-formatter-settings-design.md`
- `/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/opencode-agent-mechanism-and-sdk.md`
- `/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/opencode-mcp-servers-doc.md`
- `/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/opencode-formatter-doc.md`
- `automation/run_opencode_implementation.py`

## Boundaries

- Complete the three product lanes in order; no lane hopping.
- Every slice must use OpenCode for implementation work and Codex for the final review gate.
- Keep `automation/runtime/` local-only.
- Preserve Test Vault deployment verification for settings/runtime rounds that touch deploy-required files.
