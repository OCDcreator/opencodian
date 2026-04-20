# Autopilot Master Plan — OpenCode Session Message Alignment

> **Preset**: `Maintainability / Refactor`
> **Repository**: `opencodian`
> **Controller mode**: Explicit sequential lanes from `automation/autopilot-config.json`
> **Live plan source**: `docs/superpowers/plans/2026-04-21-opencode-session-message-alignment.md`
> **Important**: `docs/status/maintainability-*.md` is historical completed maintainability state and is not the live queue for this run.

## Overall Objective

Implement the OpenCode session/message/part alignment plan one queued task at a time:

- Build a canonical `session/message/part` truth layer.
- Route send, stream, sync-event, reload, command, shell, and plugin-injection flows through structured parts.
- Preserve OpenCodian's existing chat UI shell, styles, cards, footer, and theme behavior.
- Keep targeted tests and docs aligned after each landed slice.

## Lane Order

1. `m1-hotspot-slice` — session graph, send, and sync foundations.
2. `m2-followup-slice` — stream, render, and command/plugin structured parts.
3. `m3-checkpoint` — reload/finalization compensation, diagnostics, and final verification.

## Required Reading At Every Round

- `AGENTS.md`
- `docs/superpowers/plans/2026-04-21-opencode-session-message-alignment.md`
- `docs/status/autopilot-master-plan.md`
- `docs/status/autopilot-lane-map.md`
- the active `docs/status/lanes/<lane-id>/autopilot-round-roadmap.md`
- the active lane's latest `autopilot-phase-*.md`

## Validation Baseline

- Targeted tests named in each queued task are required when that task changes code/tests.
- `npm run verify` is the final gate after the full plan lands or before merging back to main.
- `npm run check:module-docs` is required when source module boundaries are added, changed, renamed, or deleted.
- Build/Test Vault deployment is not required for this automation setup change; follow `AGENTS.md` if runtime plugin files change during later implementation rounds.

## Guardrails

- Do not modify `reference-projects/`.
- Do not start from `ConversationRenderService` DOM patching; follow the plan order from state/sync toward rendering.
- Do not reintroduce a third source of truth via ad-hoc `ChatMessage.content` concatenation.
- Commit every successful round with the configured `autopilot:` prefix.
