# Checkpoint 9B Standalone SDK Reproduction

> **Date**: 2026-06-09
> **Worktree**: `codex-sdk-capability`
> **Purpose**: Compare standalone ordinary Codex SDK send vs. standalone structured-output send outside the plugin runtime

## Command Shape

Ran a minimal Node reproduction from the worktree using `@openai/codex-sdk`:

- `new Codex()`
- `startThread({ model: "o4-mini", skipGitRepoCheck: true, workingDirectory: process.cwd() })`
- ordinary case: `runStreamed("Say hello briefly.")`
- structured case: `runStreamed("Say hello briefly.", { outputSchema: schema })`

## Key Result

Both cases failed.

This weakens the earlier hypothesis that `outputSchema` alone explains the `/json` failure.

## Ordinary Case Signals

- `CASE:ordinary:EVENT {"type":"thread.started", ...}`
- `CASE:ordinary:EVENT {"type":"turn.started"}`
- repeated retry errors:
  - `503 Service Unavailable: No available channel for model o4-mini under group default (distributor)`
- terminal failure:
  - `Codex Exec exited with code 1: Reading prompt from stdin...`
- CLI stderr included:
  - `failed to refresh available models: ... missing field \`models\``
  - `Unknown model o4-mini is used. This will use fallback model metadata.`

## Structured Case Signals

- `CASE:schema:EVENT {"type":"thread.started", ...}`
- `CASE:schema:EVENT {"type":"turn.started"}`
- retry / rate-limit style failure:
  - `exceeded retry limit, last status: 429 Too Many Requests`
- terminal failure:
  - `Codex Exec exited with code 1: Reading prompt from stdin...`
- CLI stderr again included:
  - `failed to refresh available models: ... missing field \`models\``
  - `Unknown model o4-mini is used. This will use fallback model metadata.`

## Takeaway

At the current evidence level, the stronger suspect is the explicit model / gateway / model-catalog path around `o4-mini`, not a pure plugin-side structured-output wiring bug.
