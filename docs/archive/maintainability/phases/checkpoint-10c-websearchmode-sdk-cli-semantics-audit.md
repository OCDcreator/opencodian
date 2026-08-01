# Checkpoint 10C: `webSearchMode` SDK / CLI Semantics Audit

## 1. Files Changed

| File | Action |
|------|--------|
| `docs/status/checkpoint-10c-websearchmode-sdk-cli-semantics-audit.md` | **Created** (this document) |
| `docs/status/codex-sdk-current-state-2026-06-09.md` | **Updated** §25 with sharper conclusion |

No repo source files changed.

## 2. What Was Diagnosed

**Question**: Does the official Codex SDK documentation and installed SDK confirm a real semantic distinction between `webSearchMode=cached` and `webSearchMode=live`? And does the plugin's adapter wiring pass that distinction through correctly?

**Procedure**:
1. Read official OpenAI Codex configuration reference documentation
2. Read installed SDK type definitions (`index.d.ts`) and implementation (`index.js`)
3. Read Codex CLI `--help` output and binary strings
4. Inspect plugin adapter wiring (`CodexAdapter.ts`, `AgentAdapterWiring.ts`)
5. Compare findings against Checkpoint 10B runtime audit results

## 3. Strongest Evidence

### 3.1 Official Documentation Confirms Real Semantic Distinction

Source: [OpenAI Developers — Codex Configuration Reference](https://developers.openai.com/codex/config-reference)

> `web_search` — Web search mode (default: `"cached"`; **cached uses an OpenAI-maintained index and does not fetch live pages**; if you use `--yolo` or another full access sandbox setting, it defaults to `"live"`). **Use `"live"` to fetch the most recent data from the web**, or `"disabled"` to remove the tool.

This is unambiguous:
- **`cached`**: Uses OpenAI-maintained index cache; does NOT fetch live pages
- **`live`**: Fetches most recent data directly from the web
- **`disabled`**: Removes the web_search tool entirely

### 3.2 SDK Passes Distinct Values Through to CLI

**Type definition** (`node_modules/@openai/codex-sdk/dist/index.d.ts:238`):
```typescript
type WebSearchMode = "disabled" | "cached" | "live";
```

**SDK implementation** (`node_modules/@openai/codex-sdk/dist/index.js:213-214`):
```javascript
if (args.webSearchMode) {
  commandArgs.push("--config", `web_search="${args.webSearchMode}"`);
}
```

The SDK faithfully forwards the provided value to the Codex CLI as `--config web_search="<value>"`. There is no normalization, coercion, or silent override.

### 3.3 CLI Help Documents `--search` as "Live Web Search"

```
--search
    Enable live web search. When enabled, the native Responses `web_search` tool is available
    to the model (no per‑call approval)
```

The CLI only documents `--search` (live mode). The `--config web_search="..."` path is the programmatic equivalent.

### 3.4 Plugin Adapter Wiring is Correct

**Adapter** (`src/core/agents/backend/CodexAdapter.ts:422-424`):
```typescript
...(this.options.webSearchMode
  ? { webSearchMode: this.options.webSearchMode }
  : {}),
```

**Wiring** (`src/core/agents/backend/AgentAdapterWiring.ts:122-124`):
```typescript
...(codexSettings?.webSearchMode
  ? { webSearchMode: codexSettings.webSearchMode }
  : {}),
```

**Default** (`src/core/types/settings.ts:399`):
```typescript
webSearchMode: 'cached',
```

The value flows cleanly from settings → adapter options → ThreadOptions → SDK → CLI `--config` argument. No leaks, no overrides, no silent defaults that would mask the user's choice.

### 3.5 Why Checkpoint 10B Found No Visible Difference

The official docs explain exactly why:

- Both `cached` and `live` **enable the `web_search` tool**
- Both modes emit `WebSearch` tool calls in the transcript
- The semantic difference is in **data freshness and source**, not in **tool invocation pattern**
- `cached` searches an OpenAI-maintained index; `live` fetches current web pages
- From the user's perspective in ordinary chat, both show identical `WebSearch` blocks
- The difference would only be visible in the **quality/recency of search results**, which is inherently non-deterministic and prompt-dependent

## 4. Remaining Gaps

- No quantitative measurement of result freshness difference between modes
- No user-visible indicator in OpenCodian of which mode is active during chat
- No mechanism for the user to observe whether results came from cache vs live fetch
- The `cached` vs `live` distinction may be further blurred by model behavior (same prompt can trigger different numbers of searches regardless of mode, as seen in 10B)

## 5. Blockers

- **None for the semantics audit itself**
- The only blocker to productizing a `cached`/`live` selector is that ordinary chat cannot honestly expose the distinction in a user-meaningful way

## 6. Next Smallest Suggestion

- **Accept the current state**: `webSearchMode` remains `readback`, but now with a sharper, evidence-based reason
- **Do NOT add a three-mode settings selector** until there is a user-visible way to surface the distinction
- If future Codex CLI versions add transcript-level indicators (e.g., "fetched live" vs "from cache" badges), revisit this decision

## 7. Explicit Truth-Bucket Conclusion for `webSearchMode`

| Bucket | Status | Evidence | Rationale |
|--------|--------|----------|-----------|
| `disabled` suppression | **Runtime proven** (Checkpoint 5E) | Zero visible WebSearch blocks under `disabled` | CLI removes the tool entirely |
| `cached` vs `live` semantic distinction | **Docs/SDK proven REAL** | Official docs + SDK types + CLI config path all confirm distinct semantics | Cached = OpenAI index; Live = fresh web fetch |
| `cached` vs `live` ordinary-chat visibility | **NOT exposeable** | Both modes produce identical visible `WebSearch` transcript blocks | Distinction is in data freshness, not transcript shape |
| `webSearchMode` overall | **`readback`** | Semantics are real and wiring is correct, but current ordinary chat cannot honestly expose `cached` vs `live` | Keep as readback; do not productize a three-mode selector |

**Key insight**: The lack of visible difference in 10B was NOT a wiring failure — it was expected product behavior. The distinction genuinely exists below the transcript surface, and the current OpenCodian chat UI has no honest way to surface it.
