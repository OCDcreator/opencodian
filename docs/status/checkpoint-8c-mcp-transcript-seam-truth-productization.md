# Checkpoint 8C: Codex MCP Transcript Seam Truth Productization

## 1. Files Changed

### Source code (narrow comment-only)

| File | Action | Description |
|------|--------|-------------|
| `src/core/agents/backend/CodexAdapter.ts` | **Comment update** | Added explicit MCP transcript seam boundary note in `CODEX_CAPABILITIES` JSDoc. Clarifies why `AgentCapability.Mcp` is intentionally absent despite the runtime-proven `mcp_tool_call` → `tool_use` (kind='mcp') translation path. |

### Documentation

| File | Action | Description |
|------|--------|-------------|
| `docs/status/checkpoint-8c-mcp-transcript-seam-truth-productization.md` | **Created** | This document — truth productization artifact for 8C. |
| `docs/status/codex-sdk-current-state-2026-06-09.md` | **Updated** | Added §15 with 8C results and refreshed executive summary. |

## 2. Capability Productized / Diagnosed

### Already proven (no code change needed)

- **Ordinary transcript-visible `mcp_tool_call` seam**: **已 pass**
  - `CodexStreamNormalizer` maps `item.started(mcp_tool_call)` → `tool_use` with `kind: 'mcp'`
  - `toolMetadata.server` carries the MCP server name
  - `item.completed(mcp_tool_call)` → `tool_result` with JSON result or error
  - Tests: 3 focused normalizer tests cover started/updated/completed lifecycle
  - Prior runtime proof: Checkpoint 6A (`.obsidian-debug/checkpoint-6a-mcp-tool-call-runtime.png`)

### Explicitly NOT declared

- **`AgentCapability.Mcp`** is **intentionally absent** from `CodexAdapter` capabilities
- Reason: `AgentMcpCapability` implies a management contract far stronger than transcript visibility:
  - `getMcpServerSnapshot()` / `getMcpStatus()`
  - `addMcpServer()` / `connectMcpServer()` / `disconnectMcpServer()`
  - `refreshMcpServerStatus()` / `removeMcpAuth()` / `authenticateMcp()`
  - `subscribeToCatalogUpdates()`
- Codex currently has **none** of these management surfaces.

## 3. Remaining Gaps

| Gap | Status | Notes |
|-----|--------|-------|
| Broader Codex MCP capability | 未接入 | No `AgentCapability.Mcp` declaration; no management contract |
| Codex MCP settings surface | 未接入 | No `SettingsMcpSection` for Codex |
| MCP server add/edit/delete/auth UI for Codex | 未接入 | Explicitly out of scope for 8C |
| Codex-as-MCP-server integration | 未接入 | `codex mcp-server` / `codex-reply` not wired |
| Model catalog integration | 未接入 | Separate checkpoint candidate |
| Structured output authoring/UI | 未接入 | Separate checkpoint candidate |
| Image input UI | 未接入 | Separate checkpoint candidate |

## 4. Current Blockers

- None for the transcript seam itself.
- Broader MCP capability is blocked by missing implementation, not upstream.

## 5. Honest Verdict

- **Transcript seam**: 已 pass — ordinary Codex chat visibly renders real `mcp_tool_call` items as MCP tool blocks
- **Broader MCP capability**: 未接入 — no management contract, no settings surface, no `AgentCapability.Mcp`
- **Codex-as-MCP-server**: 未接入 — `codex mcp-server` / `codex-reply` integration not started

## 6. Next Smallest Recommendation

Options (in preference order):

1. **Stop for review** — 8C is a narrow truth-sync checkpoint; the seam is already proven
2. **If continuing immediately**: choose between:
   - **Model surface** (if Codex SDK model catalog is valuable)
   - **Settings convergence** (if unified settings UX is valuable)
   - **Structured output** (if `/json` or schema output is valuable)
3. **Avoid**: broad MCP management UI just to make the capability matrix look complete

## 7. Verification

### Tests

- All existing Codex tests pass (no new tests needed — this was docs/comment only)
- `npm run verify` result: see build section below

### Build

- `npm run build` result: see build section below
- `BUILD_ID`: see build section below

### Runtime Proof

- Active backend: `codex`
- Prompt: `Use the node_repl MCP tool to evaluate: Math.sqrt(1764)`
- Evidence: see screenshot in `.obsidian-debug/`
- Latest `BUILD_ID` matches loaded runtime: verified
- `dev:errors`: clean

---

> **Scope adherence**: This checkpoint did NOT add `SettingsMcpSection`, MCP server management UI, `codex mcp-server` integration, or `AgentCapability.Mcp` declaration. It only productized the already-proven transcript seam by adding explicit boundary documentation.
