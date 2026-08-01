# Autopilot Lane Map — SDK Permission And Slash Alignment

> **Preset**: `Bugfix / Backlog (review-gated custom queue)`
> **Scheduling**: Sequential lane controller
> **Seed authority**: `docs/superpowers/plans/2026-04-24-opencode-sdk-permission-slash-alignment.md`
> **Config file**: `automation/sdk-permission-slash-config.json`

## Lane directories

- `s1-permission-sdk`
  - roadmap: `docs/status/lanes/s1-permission-sdk/autopilot-round-roadmap.md`
  - baseline: `docs/status/lanes/s1-permission-sdk/autopilot-phase-0.md`
- `s2-slash-sdk`
  - roadmap: `docs/status/lanes/s2-slash-sdk/autopilot-round-roadmap.md`
  - baseline: `docs/status/lanes/s2-slash-sdk/autopilot-phase-0.md`
- `s3-checkpoint`
  - roadmap: `docs/status/lanes/s3-checkpoint/autopilot-round-roadmap.md`
  - baseline: `docs/status/lanes/s3-checkpoint/autopilot-phase-0.md`

## Shared references

- `docs/superpowers/plans/2026-04-24-opencode-sdk-permission-slash-alignment.md`
- `/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/opencode-permission-mechanism.md`
- `/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/OpenCode-Slash-Command-Architecture.md`

## Boundaries

- No queue expansion unless a human edits the lane roadmaps
- Keep OpenCode CLI review usage on the scripted helpers instead of rediscovering invocation details
- Keep `automation/runtime/` local-only
