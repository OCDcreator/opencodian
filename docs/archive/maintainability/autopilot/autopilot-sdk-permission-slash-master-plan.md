# Autopilot Master Plan — SDK Permission And Slash Alignment

> **Preset**: `Bugfix / Backlog (review-gated custom queue)`
> **Repository**: `opencodian`
> **Controller mode**: Explicit sequential lanes from `automation/sdk-permission-slash-config.json`
> **Seed authority**: `docs/superpowers/plans/2026-04-24-opencode-sdk-permission-slash-alignment.md`

## Overall objective

- Complete a queue-driven SDK-first alignment of permission handling and slash command handling
- Keep security/settings wording and command/settings wording aligned with runtime truth
- Require an OpenCode CLI plan review before code changes and an OpenCode CLI code review before final validation every round

## Lane order

- `s1-permission-sdk` — permission runtime and settings alignment
- `s2-slash-sdk` — slash command runtime and settings alignment
- `s3-checkpoint` — final review and verification checkpoint

## Shared entrypoints

- `AGENTS.md`
- `docs/superpowers/plans/2026-04-24-opencode-sdk-permission-slash-alignment.md`
- `/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/opencode-permission-mechanism.md`
- `/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/OpenCode-Slash-Command-Architecture.md`
- `automation/opencode-review.sh`
- `.opencode/commands/autopilot-plan-review.md`
- `.opencode/commands/autopilot-code-review.md`

## Shared validation baseline

- Use targeted tests for changed code before the post-change review loop
- Run `npm run verify` after the post-change review passes
- Keep deploy out of scope unless a later human explicitly changes that policy

## Guardrails

- Only one lane is active at a time
- The lane roadmap is the queue truth source
- No unrelated cleanup or broad refactors
- No app-code edits before the plan review passes
- No commit before the code review passes
