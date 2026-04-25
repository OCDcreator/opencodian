# Autopilot Master Plan — Agent Surface, MCP, Formatter

> **Preset**: `Review-gated implementation queue (OpenCode implementation + Codex review)`
> **Repository**: `opencodian`
> **Controller mode**: Explicit sequential lanes from `automation/agent-mcp-formatter-config.json`
> **Primary source specs**:
> - `docs/superpowers/specs/2026-04-25-opencode-agent-surface-design.md`
> - `docs/superpowers/specs/2026-04-25-opencodian-mcp-settings-and-tooling-design.md`
> - `docs/superpowers/specs/2026-04-25-formatter-settings-design.md`

## Overall objective

- Implement the just-committed agent surface mapping, MCP settings/tooling, and formatter settings specs in strict order.
- Keep every round on the same unattended loop: phase-doc design -> OpenCode implementation pass -> Codex review -> targeted tests -> repair if needed -> full verification -> deploy verification when repo rules require it -> commit.
- Preserve overnight continuity: do not treat slow OpenCode reasoning as a failure until a single implementation pass has been given up to `3600` seconds.

## Lane order

- `a1-agent-surface` — complete the agent surface mapping spec first
- `a2-mcp-settings` — complete MCP settings and tool rendering second
- `a3-formatter-settings` — complete formatter settings integration third and close the queue

## Shared entrypoints

- `AGENTS.md`
- `automation/agent-mcp-formatter-config.json`
- `automation/agent-mcp-formatter-round-prompt.md`
- `automation/run_opencode_implementation.py`
- `docs/superpowers/specs/2026-04-25-opencode-agent-surface-design.md`
- `docs/superpowers/specs/2026-04-25-opencodian-mcp-settings-and-tooling-design.md`
- `docs/superpowers/specs/2026-04-25-formatter-settings-design.md`
- `/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/opencode-agent-mechanism-and-sdk.md`
- `/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/opencode-mcp-servers-doc.md`
- `/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/opencode-formatter-doc.md`

## Shared execution contract

- OpenCode performs implementation work; Codex is the final review gate.
- No lane advance until the active slice has a `PASS` design review, a `PASS` code review, green targeted tests, green `npm run verify`, and required deploy verification.
- Every OpenCode implementation pass must be invoked through `automation/run_opencode_implementation.py` with `--timeout-seconds 3600`.
- If OpenCode times out, inspect the partial diff and retry with a narrower brief before declaring a blocker.
- Do not abort an OpenCode pass early only because it is still reading references or the repo diff is empty; as long as the wrapper log is advancing or the child PID is alive, that counts as active work until timeout or a concrete blocker.
- The controller keeps queue truth in the lane roadmap files only. Do not invent new work once a roadmap is empty.

## Shared validation baseline

- Run targeted Jest coverage for touched code before the final round verdict.
- Run `npm run verify` for every successful round.
- If the round changes deploy-relevant paths (`src/main.ts`, `manifest.json`, `styles.css`, `assets/`, `src/style/`, `src/core/theme/`, `src/features/settings/`), deploy the verified `dist/` artifacts to `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/` immediately after the successful validation run and verify `BUILD_ID`.
- Keep build and copy as separate sequential steps; never chain them with `&&`.

## Guardrails

- Only one lane is active at a time.
- The lane roadmap is the queue truth source.
- No app-code edits before the phase doc exists and the design review passes.
- No commit before the code review passes.
- No unrelated refactors, queue expansion, or speculative architecture work outside the active slice.
- Respect root architecture guardrails: do not regrow `OpenCodianView.ts` or `OpenCodeService.ts` with new ownership when an adjacent owner is the correct home.
