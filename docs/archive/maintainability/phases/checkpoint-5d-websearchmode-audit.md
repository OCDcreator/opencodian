# Checkpoint 5D: webSearchMode Mode Differentiation Audit

## 1. Files Changed

No code changes. Diagnostics-only audit.

## 2. Capabilities Diagnosed

| Mode | Current Evidence | Status |
|------|-----------------|--------|
| `disabled` | No runtime proof that web_search blocks are suppressed | unproven |
| `cached` | 5C proved visible web_search tool blocks with this mode | proven for tool visibility only |
| `live` | No runtime proof of behavior difference vs `cached` | unproven |

## 3. Strongest Evidence

### What IS proven
- **SDK plumbing**: `webSearchMode` maps to `--config web_search="<mode>"` in CLI args (`CodexAdapter.ts:376-378`, SDK `dist/index.js` verified)
- **Tool visibility**: Checkpoint 5C proved `web_search` items render as visible `WebSearch` tool blocks in ordinary chat transcript
- **Current Test Vault setting**: `webSearchMode: "cached"` (`settings.core.json:101`)

### What is NOT proven
- **No UI indicator**: Zero chat-panel UI surfaces expose the active `webSearchMode` value to users (grep of `src/features/chat` shows no references)
- **No `disabled` suppression proof**: No runtime test confirms that `disabled` prevents `web_search` items from being emitted
- **No `cached` vs `live` differentiation**: The CLI only documents `--search` (live); `cached` semantic is undocumented. Both modes would likely emit identical-looking `WebSearch` tool blocks in the transcript

## 4. Remaining Gaps

| Gap | Detail |
|-----|--------|
| `disabled` suppression | Need runtime proof that `disabled` prevents web_search tool blocks |
| `cached` vs `live` semantics | CLI docs don't define `cached` behavior; both may emit identical tool blocks |
| UI exposure | No chat surface shows current mode; users can't tell which mode is active |

## 5. Current Blockers

- **No runtime testing performed**: This audit is code-analysis only; no Test Vault chat runs were executed with mode variations
- **CLI documentation gap**: Codex CLI only documents `--search` (live); `disabled` and `cached` are SDK-only config values with no public semantic definition
- **Ambiguous visible differentiation**: Even if all three modes work, `cached` vs `live` may produce identical visible transcript surfaces (same tool block type, same query text)
- **OpenCode MCP workflow instability during this round**: `opencode_ask` hit `POST /session/{id}/message` 500s, and an `opencode_run` MCP probe completed without persisting an assistant reply. The successful audit execution for this checkpoint used the OpenCode CLI fallback instead.

## 6. Next Smallest Recommendation

**Conclusion: INCONCLUSIVE / UNPROVEN**

Three-mode differentiation is **not proven**. The strongest honest verdict is:
- `disabled` vs `cached`/`live`: Theoretically distinguishable by presence/absence of tool blocks, but **not runtime proven**
- `cached` vs `live`: **Not visibly distinguishable** in ordinary chat based on current evidence

**Recommended next steps (pick one):**
1. **Runtime smoke test**: Manually switch Test Vault `webSearchMode` to `disabled`, send a web-search-likely prompt, verify no `WebSearch` tool blocks appear
2. **Accept partial pass**: Productize `disabled` vs `enabled` (binary) if `cached`/`live` semantic differentiation remains unprovable
3. **Keep readback**: Leave `webSearchMode` at `readback` until Codex CLI documents `cached` semantics or visible mode differentiation is runtime proven

---
*Audit completed without code changes. Honest boundary: `web_search` tool visibility is already product-path proven from Checkpoint 5C, so `webSearchMode` remains `readback`, not `hidden`.*

### Delegation Note

- `mcp__opencode.opencode_ask(...)` was not reliable in this environment during the 2026-06-09 continuation: the server returned `500 Unexpected server error` from `/session/{id}/message`.
- `mcp__opencode.opencode_run(...)` could create a session through `prompt_async`, but a probe session persisted only the user message and no assistant reply, so the workflow-tool result could not be trusted as the sole source of truth.
- `~/.opencode/bin/opencode run --model kimi-for-coding/k2p6 ...` succeeded in the same worktree, so the working fallback for this checkpoint was **OpenCode CLI with the fixed `kimi-for-coding/k2p6` model**, not the MCP workflow tools.
