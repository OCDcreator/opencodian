# Claude Code Phase 1+ Smoke Status — 2026-05-21

> ⚠️ **Partially outdated.** This file predates runtime wiring for hooks, session store, structured output, skills, plugins, and agent options. Prefer `docs/status/claude-code-current-state-2026-05-22.md` for present-state judgments. Kept for historical reference.

## Summary

Real runtime smoke executed against `@anthropic-ai/claude-agent-sdk@0.3.145` on macOS arm64 with Node v25.9.0.

## Environment

- **Node:** v25.9.0
- **Platform:** darwin arm64
- **SDK version:** 0.3.145
- **Script:** `scripts/claude-code-smoke.mjs`
- **Timestamp:** 2026-05-21T05:07:12Z (latest run)

## Results

| Scenario | Status | Detail |
|---|---|---|
| SDK Import | ✅ PASS | query, listSessions, forkSession, getSessionInfo, renameSession, startup, resolveSettings, createSdkMcpServer all present |
| Bundled Executable | ⏭️ SKIP | No platform-specific binary in dev context; uses bundled SDK directly |
| Query Text Stream | ✅ PASS | Received real text response. 4 events total |
| MCP Config Pass-through | ✅ PASS | MCP config accepted; session init received with `opencodian_smoke_test` server |
| Supported Models | ✅ PASS | 4 models available: default, sonnet, sonnet[1m], haiku |

## Smoke Script

Run with:
```bash
node scripts/claude-code-smoke.mjs
node scripts/claude-code-smoke.mjs --json > smoke-result.json
```

## Not Runtime-Verified (Auth/Tool Execution)

The following remain unverified because they require interactive tool execution or specific Claude auth states that are not reproducible in an automated smoke script:

1. **canUseTool approval** — Requires a prompt that triggers real tool execution, which needs file/permission context
2. **AskUserQuestion** — Requires SDK to invoke the AskUserQuestion tool, which needs multi-turn context
3. **MCP stdio server tool execution** — Config acceptance verified, but actual MCP tool calls need a real stdio server
4. **Session resume after Obsidian reload** — Requires Obsidian runtime context; unit-tested via fixture smoke harness
5. **Long-lived persistent query with multiple turns** — Requires multi-turn conversation context

## What Changed Since Previous Smoke (2026-05-20)

Previous smoke on 2026-05-20 reported `authentication_failed` / `apiKeySource: "none"`. The current smoke shows the SDK is now authenticated and returns real responses. This suggests the local Claude Code authentication was completed between smoke runs.

## Backend Wiring Completed

Since the previous status, the following backend wiring has been added:

| Capability | SDK Option | Settings Field | Normalization | Options Builder | UI |
|---|---|---|---|---|---|
| `allowedTools` | ✅ `string[]` | ✅ `ClaudeCodeBackendSettings.allowedTools` | ✅ `normalizeClaudeCodeStringArray` | ✅ Wired | ✅ MCP / Advanced section; options-only, not a sandbox proof |
| `disallowedTools` | ✅ `string[]` | ✅ `ClaudeCodeBackendSettings.disallowedTools` | ✅ `normalizeClaudeCodeStringArray` | ✅ Wired | ✅ MCP / Advanced section |
| `maxTurns` | ✅ `number` | ✅ `ClaudeCodeBackendSettings.maxTurns` | ✅ `normalizeClaudeCodeNullablePositiveInt` | ✅ Wired | ✅ MCP / Advanced section |
| `maxBudgetUsd` | ✅ `number` | ✅ `ClaudeCodeBackendSettings.maxBudgetUsd` | ✅ `normalizeClaudeCodeNullablePositiveNumber` | ✅ Wired | ✅ MCP / Advanced section |
| `env` | ✅ `Record<string, string>` | ✅ `ClaudeCodeBackendSettings.env` | ✅ `normalizeClaudeCodeEnv` | ✅ Wired | ✅ MCP / Advanced section |

## 2026-05-21 Review Fix Follow-up

- `supportedModels()` now reads from the SDK `Query` handle and normalizes official `ModelInfo.value/displayName` fields instead of assuming a top-level SDK method.
- Persisted Claude `backendSessionId` values are restored as SDK session ids after adapter restart, so the next SDK `query()` receives `options.resume`.
- Claude permission `session` approvals stay session-scoped; they are no longer widened to `always`.
- Claude `AskUserQuestion` and MCP `onElicitation` now enter the existing question resolution flow instead of bypassing dock/above-input resolution state.
- Classic settings now expose Runtime, Model & Thinking, Permissions, Context & Sources, and MCP / Advanced sections with stable `data-settings-target` / `data-claude-code-section` hooks.

These fixes are unit/typecheck validated. They are not a new claim that all Claude Code capabilities have completed authenticated Obsidian runtime proof.

## Intentionally Not Wired (Phase Later)

| Capability | SDK Type Exists | Wiring Status | Rationale |
|---|---|---|---|
| `hooks` | ✅ | ❌ No wiring | Phase 4: Requires hook callback infrastructure |
| `skills` | ✅ | ❌ No wiring | Phase 4: Filesystem discovery + authoring |
| `agents` | ✅ | ❌ No wiring | Phase 4: Agent catalog + file-agent management |
| `sessionStore` | ✅ | ❌ No wiring | Phase 5: External storage adapter |
| `systemPrompt` | ✅ | ❌ No wiring | Phase 2+: Advanced configuration |
| `sandbox` | ✅ | ⚠️ Readback (2026-06-02: top-level booleans wired, readback only) | Phase 5: network/filesystem sub-policies |
| `outputFormat` | ✅ | ❌ No wiring | Phase 4+: Structured output |
| `plugins` | ✅ | ❌ No wiring | Phase 5: Plugin system |
| `betas` | ✅ | ❌ No settings field | Semver-sensitive; should be programmatic only |
| `forwardSubagentText` | ✅ | ❌ No wiring | Phase 4: Subagent rendering |
| `agentProgressSummaries` | ✅ | ❌ No wiring | Phase 4: Subagent progress |
| `promptSuggestions` | ✅ | ❌ No wiring | Phase 2+: UX feature |
