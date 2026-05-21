# Claude Code Remaining Gaps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill the remaining backend wiring gaps for Claude Code full capability integration: real runtime smoke, allowedTools/disallowedTools, maxTurns/maxBudgetUsd/env/betas backend wiring, and confirm hooks/skills/agents remain doc-only.

**Architecture:** Extend existing `ClaudeCodeOptionsBuilder`, `ClaudeCodeBackendSettings`, `ClaudeCodeAdapter`, and `SettingsClaudeCodeSection` with type-safe SDK options that are backed by the official `@anthropic-ai/claude-agent-sdk@0.3.145` types. No premature UI exposure for unverified capabilities.

**Tech Stack:** TypeScript, Jest, Claude Agent SDK types, Obsidian plugin, esbuild.

---

## Global Constraints

- Do not expose any UI for capabilities without runtime proof (hooks, skills, agents, JSONL, session store remain doc-only).
- All new settings fields must have normalization functions and focused tests.
- After any `src/**` change, run `npm run graphify:update:src`.
- Final gate: `OWNER_GUARD_APPROVED=1 npm run verify` must pass.
- Build and deploy must be sequential; do not chain with `&&`.

## SDK Type Evidence

From `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts`, the `Options` type confirms:

| Option | Type | Status |
|---|---|---|
| `allowedTools` | `string[]` | ✅ Official SDK type |
| `disallowedTools` | `string[]` | ✅ Official SDK type |
| `maxTurns` | `number` | ✅ Official SDK type |
| `maxBudgetUsd` | `number` | ✅ Official SDK type |
| `env` | `{ [envVar: string]: string \| undefined }` | ✅ Official SDK type |
| `betas` | `SdkBeta[]` (= `'context-1m-2025-08-07'[]`) | ✅ Official SDK type |
| `tools` | `string[] \| { type: 'preset'; preset: 'claude_code' }` | ✅ Official SDK type |
| `hooks` | `Partial<Record<HookEvent, HookCallbackMatcher[]>>` | ✅ Official SDK type |
| `agents` | `Record<string, AgentDefinition>` | ✅ Official SDK type |
| `skills` | `string[] \| 'all'` | ✅ Official SDK type |
| `systemPrompt` | Various | ✅ Official SDK type |
| `sandbox` | `SandboxSettings` | ✅ Official SDK type |
| `sessionStore` | `SessionStore` | ✅ Official SDK type (alpha) |
| `forwardSubagentText` | `boolean` | ✅ Official SDK type |
| `agentProgressSummaries` | `boolean` | ✅ Official SDK type |
| `promptSuggestions` | `boolean` | ✅ Official SDK type |

## File Structure

- Modify: `src/core/types/settings.ts` — Add new backend settings fields + normalization
- Modify: `src/core/agents/backend/ClaudeCodeOptionsBuilder.ts` — Wire new options to SDK
- Modify: `src/features/settings/SettingsClaudeCodeSection.ts` — Add backend-only settings (no complex UI)
- Modify: `docs/status/claude-code-backend-capabilities-2026-05-21.md` — Update status
- Create: `scripts/claude-code-smoke.mjs` — Reproducible real runtime smoke script
- Modify: `docs/modules/**` — Update module docs for changed files
- Test: `tests/unit/core/agents/backend/ClaudeCodeOptionsBuilder.test.ts` — New test cases
- Test: `tests/unit/core/types/settingsLoadNormalization.test.ts` — New normalization tests

---

## Task 1: Add allowedTools/disallowedTools Backend Settings + Options Builder Wiring

**Files:**
- Modify: `src/core/types/settings.ts`
- Modify: `src/core/agents/backend/ClaudeCodeOptionsBuilder.ts`
- Test: `tests/unit/core/types/settingsLoadNormalization.test.ts`
- Test: `tests/unit/core/agents/backend/ClaudeCodeOptionsBuilder.test.ts`
- Docs: `docs/modules/core/types/settings.md`, `docs/modules/core/agents/backend/ClaudeCodeOptionsBuilder.md`

### Rationale

The official SDK `Options` type defines `allowedTools?: string[]` and `disallowedTools?: string[]`. These are simple string arrays that control tool policy. `allowedTools` auto-approves named tools (not a sandbox!); `disallowedTools` removes tools from context entirely. Both are safe to wire at the backend/options level without requiring complex UI.

- [ ] **Step 1: Extend `ClaudeCodeBackendSettings`**

Add to `src/core/types/settings.ts`:

```ts
// Inside ClaudeCodeBackendSettings interface:
allowedTools: string[];
disallowedTools: string[];
```

Update `getDefaultClaudeCodeBackendSettings()` to return:
```ts
allowedTools: [],
disallowedTools: [],
```

Update `normalizeClaudeCodeBackendSettings()` to normalize:
```ts
allowedTools: normalizeClaudeCodeStringArray(candidate.allowedTools),
disallowedTools: normalizeClaudeCodeStringArray(candidate.disallowedTools),
```

Add helper:
```ts
export function normalizeClaudeCodeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) { return []; }
  return [...new Set(value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0))];
}
```

- [ ] **Step 2: Add normalization tests**

In `tests/unit/core/types/settingsLoadNormalization.test.ts`, add tests:
- `allowedTools` and `disallowedTools` default to `[]`
- Non-array values normalize to `[]`
- Arrays with duplicates and empty strings deduplicate and filter
- Valid arrays pass through

- [ ] **Step 3: Wire to options builder**

In `src/core/agents/backend/ClaudeCodeOptionsBuilder.ts`, extend `ClaudeCodeSdkOptionsShape`:
```ts
allowedTools?: string[];
disallowedTools?: string[];
```

In `buildClaudeCodeOptions()`, after existing wiring:
```ts
if (input.settings.allowedTools.length > 0) {
  options.allowedTools = [...input.settings.allowedTools];
}
if (input.settings.disallowedTools.length > 0) {
  options.disallowedTools = [...input.settings.disallowedTools];
}
```

- [ ] **Step 4: Add options builder tests**

In `tests/unit/core/agents/backend/ClaudeCodeOptionsBuilder.test.ts`:
- Test that empty arrays omit the options
- Test that non-empty arrays pass through correctly
- Test that duplicates are preserved from settings (already deduplicated by normalization)

- [ ] **Step 5: Run tests**

```bash
npx jest --runInBand tests/unit/core/types/settingsLoadNormalization.test.ts tests/unit/core/agents/backend/ClaudeCodeOptionsBuilder.test.ts
```

Expected: PASS.

---

## Task 2: Add maxTurns/maxBudgetUsd/env/betas Backend Settings + Options Builder Wiring

**Files:**
- Modify: `src/core/types/settings.ts`
- Modify: `src/core/agents/backend/ClaudeCodeOptionsBuilder.ts`
- Test: `tests/unit/core/types/settingsLoadNormalization.test.ts`
- Test: `tests/unit/core/agents/backend/ClaudeCodeOptionsBuilder.test.ts`
- Docs: module docs for changed files

### Rationale

The SDK `Options` type defines `maxTurns?: number`, `maxBudgetUsd?: number`, `env?: { [k: string]: string | undefined }`, and `betas?: SdkBeta[]`. These are safety and configuration limits. Wiring them to the backend options is safe and useful for power users, even without explicit UI dropdowns.

- [ ] **Step 1: Extend `ClaudeCodeBackendSettings`**

Add to `src/core/types/settings.ts`:
```ts
// Inside ClaudeCodeBackendSettings:
maxTurns: number | null;
maxBudgetUsd: number | null;
env: Record<string, string>;
```

Update defaults:
```ts
maxTurns: null,
maxBudgetUsd: null,
env: {},
```

Add normalization helpers:
```ts
export function normalizeClaudeCodeNullableNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  return null;
}

export function normalizeClaudeCodeEnv(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) { return {}; }
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === 'string') {
      result[k] = v;
    }
  }
  return result;
}
```

Update `normalizeClaudeCodeBackendSettings()`.

- [ ] **Step 2: Add normalization tests**

Cover null/non-number → null, positive integer passes, negative/zero/NaN → null, env normalization.

- [ ] **Step 3: Wire to options builder**

Extend `ClaudeCodeSdkOptionsShape`:
```ts
maxTurns?: number;
maxBudgetUsd?: number;
env?: Record<string, string | undefined>;
```

In `buildClaudeCodeOptions()`:
```ts
if (input.settings.maxTurns !== null) {
  options.maxTurns = input.settings.maxTurns;
}
if (input.settings.maxBudgetUsd !== null) {
  options.maxBudgetUsd = input.settings.maxBudgetUsd;
}
if (Object.keys(input.settings.env).length > 0) {
  options.env = input.settings.env;
}
```

Note: `betas` is intentionally excluded from settings persistence because it is a semver-sensitive feature flag that should only be set programmatically, not stored as user-facing configuration. If a user needs `context-1m-2025-08-07`, it should come from `managedSettings` or `settings` programmatic options, not from the plugin settings UI.

- [ ] **Step 4: Add options builder tests**

Cover null values omitted, positive values passed through, empty env omitted, non-empty env passed.

- [ ] **Step 5: Run tests**

```bash
npx jest --runInBand tests/unit/core/types/settingsLoadNormalization.test.ts tests/unit/core/agents/backend/ClaudeCodeOptionsBuilder.test.ts
```

Expected: PASS.

---

## Task 3: Add Backend-Only Advanced Settings to Settings UI (Read-Only / Hidden)

**Files:**
- Modify: `src/features/settings/SettingsClaudeCodeSection.ts`

### Rationale

The new settings fields (allowedTools, disallowedTools, maxTurns, maxBudgetUsd, env) should NOT have visible UI controls until they have runtime proof. However, the settings object must accept them so they can be set programmatically or via manual settings.json editing. The UI should remain unchanged.

- [ ] **Step 1: Verify no UI exposure needed**

Confirm that the settings UI only renders what was already there. The new fields are backend-only and require no UI changes. Users who want to set them can edit `data.json` directly or use future UI when runtime proof exists.

- [ ] **Step 2: No code change needed, document in capabilities doc**

Update `docs/status/claude-code-backend-capabilities-2026-05-21.md` to reflect the new wiring status.

---

## Task 4: Create Reproducible Real Runtime Smoke Script

**Files:**
- Create: `scripts/claude-code-smoke.mjs`
- Create: `docs/status/claude-code-phase1-smoke-status-2026-05-21.md`

### Rationale

The spec requires real runtime smoke: stream text/thinking, tool use/result, canUseTool approval, AskUserQuestion, MCP stdio server, resume after reload, OpenCode still works. Since the current machine had auth issues (`apiKeySource: "none"`), the smoke script should be runnable when auth is available and report clear failure reasons when not.

- [ ] **Step 1: Create smoke script**

Create `scripts/claude-code-smoke.mjs` that:
1. Imports `@anthropic-ai/claude-agent-sdk`
2. Runs `query()` with a simple text prompt
3. Attempts to collect streaming events
4. Reports success/failure with exact error messages
5. Tests MCP server config pass-through (config acceptance only)
6. Tests session resume with a session ID
7. Outputs a JSON result file with all outcomes

The script must NOT fake success. It must report the real SDK output including auth failures.

- [ ] **Step 2: Run the smoke script and capture output**

```bash
node scripts/claude-code-smoke.mjs 2>&1 | tee .obsidian-debug/claude-code-smoke-2026-05-21.log
```

Expected: Records real SDK behavior. If auth fails, records `authentication_failed` with exact message.

- [ ] **Step 3: Create smoke status doc**

Create `docs/status/claude-code-phase1-smoke-status-2026-05-21.md` documenting:
- Which smoke scenarios passed
- Which are blocked by auth/runtime conditions
- Exact error messages for blocked scenarios
- Instructions for reproducing when conditions are met

---

## Task 5: Verify Hooks/Skills/Agents/JSONL Remain Doc-Only

**Files:**
- Verify: `src/features/settings/SettingsClaudeCodeSection.ts`
- Verify: `src/core/agents/backend/ClaudeCodeOptionsBuilder.ts`
- Update: `docs/status/claude-code-backend-capabilities-2026-05-21.md`

### Rationale

The spec explicitly says: "hooks/skills/agents/subagents/JSONL/sessionStore: only implement if official SDK types AND runtime proof exist; no editable UI."

- [ ] **Step 1: Verify no premature UI**

```bash
rg -n "hooks|skills|agents|JSONL|sessionStore|subagent" src/features/settings/SettingsClaudeCodeSection.ts
```

Expected: No matches (these should not appear in settings UI).

- [ ] **Step 2: Verify options builder does not wire them**

```bash
rg -n "hooks|skills|agents|JSONL|sessionStore|forwardSubagent|promptSuggestion" src/core/agents/backend/ClaudeCodeOptionsBuilder.ts
```

Expected: No matches (not wired in options builder).

- [ ] **Step 3: Update capabilities doc**

Mark hooks, skills, agents, JSONL, sessionStore as intentionally not wired with rationale.

---

## Task 6: OpenCode Regression Verification

**Files:**
- Test: `tests/unit/core/agents/backend/OpenCodeAdapter.test.ts`
- Test: existing chat/send/main tests

### Rationale

The spec requires: "at least keep/run focused OpenCode adapter/send tests; do not break OpenCode-only UI gate."

- [ ] **Step 1: Run focused OpenCode tests**

```bash
npx jest --runInBand tests/unit/core/agents/backend/OpenCodeAdapter.test.ts tests/unit/core/agents/backend/AgentServiceRegistry.test.ts
```

Expected: PASS.

- [ ] **Step 2: Verify IMPLEMENTED_AGENT_BACKENDS includes both**

```bash
rg -n "IMPLEMENTED_AGENT_BACKENDS" src/core/agents/backend/index.ts
```

Expected: `['opencode', 'claude-code']`.

- [ ] **Step 3: Run chat/send tests**

```bash
npx jest --runInBand tests/unit/features/chat tests/unit/main.test.ts
```

Expected: PASS.

---

## Task 7: Final Gates — Graphify, Verify, Build, Deploy

**Files:**
- All `src/**` files changed in tasks 1-2
- `docs/modules/**` for changed files
- `graphify-out/**`

- [ ] **Step 1: Update graphify**

```bash
npm run graphify:update:src
```

- [ ] **Step 2: Update module docs for changed files**

Update `docs/modules/core/types/settings.md`, `docs/modules/core/agents/backend/ClaudeCodeOptionsBuilder.md`, and any other changed module docs.

- [ ] **Step 3: Full verify**

```bash
OWNER_GUARD_APPROVED=1 npm run verify
```

Expected: PASS (lint, typecheck, tests, build).

- [ ] **Step 4: Record BUILD_ID**

```bash
rg "BUILD_ID" dist/main.js | head -1
```

- [ ] **Step 5: Deploy to Test Vault**

```bash
cp dist/main.js /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/main.js
cp dist/manifest.json /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/manifest.json
cp dist/styles.css /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/styles.css
```

Then verify BUILD_ID in Test Vault:
```bash
rg "BUILD_ID" /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/main.js | head -1
```

- [ ] **Step 6: Write final status report**

Update `docs/status/claude-code-backend-capabilities-2026-05-21.md` with:
- Completed gaps
- Remaining auth-blocked gaps
- BUILD_ID
- Commands run
- Explicit statement that full capability is NOT complete until real runtime smoke passes
