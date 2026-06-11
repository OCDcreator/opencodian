# Checkpoint 13D: Codex `webSearchMode` Truth Resolution

> **Date**: 2026-06-10
> **Branch**: `feature/codex-sdk-capability`
> **Scope**: Truth resolution for `webSearchMode` — determine whether any honest stable ordinary surface exists
> **Outcome**: `readback` — no stable ordinary surface justified; no product code changes

## 1. Files Changed

### Documentation

| File | Action | Description |
|------|--------|-------------|
| `docs/status/checkpoint-13d-codex-websearchmode-truth.md` | **Created** | This document — truth resolution output |
| `docs/status/codex-sdk-current-state-2026-06-09.md` | **Updated** | §1.2 truth snapshot: `webSearchMode` remains `readback` with sharper rationale |
| `devlog.md` | **Updated** | Added Checkpoint 13D entry |

### Source code

**None.** No product code changes justified.

## 2. What Was Diagnosed

### 2.1 Fresh SDK / Type Verification

**Installed SDK type check** (`node_modules/@openai/codex-sdk/dist/index.d.ts:238`):

```typescript
type WebSearchMode = "disabled" | "cached" | "live";
```

**ThreadOptions field** (`node_modules/@openai/codex-sdk/dist/index.d.ts:246`):

```typescript
webSearchMode?: WebSearchMode;
```

**SDK passthrough** (`node_modules/@openai/codex-sdk/dist/index.js:213-214`):

```javascript
if (args.webSearchMode) {
  commandArgs.push("--config", `web_search="${args.webSearchMode}"`);
}
```

### 2.2 Fresh Adapter Wiring Check

**Settings type** (`src/core/types/settings.ts:115-116, 399`):
- `webSearchMode: CodexWebSearchMode` with default `'cached'`
- Validation via `VALID_WEB_SEARCH` array

**Adapter options** (`src/core/agents/backend/CodexAdapter.ts:53-54`):
- `webSearchMode?: 'disabled' | 'cached' | 'live'`

**Adapter buildThreadOptions** (`src/core/agents/backend/CodexAdapter.ts:488-490`):
- Clean conditional spread into `ThreadOptions`

**Wiring layer** (`src/core/agents/backend/AgentAdapterWiring.ts:122-124`):
- Clean conditional spread from settings into adapter options

**No leaks, no overrides, no silent defaults.**

### 2.3 Relevant Runtime Evidence Review

Prior checkpoints already established comprehensive evidence:

| Checkpoint | Evidence | Status |
|---|---|---|
| 5E | `disabled` mode suppresses visible `WebSearch` tool blocks in ordinary chat | **Runtime proven** |
| 10B | `cached` vs `live` produces identical visible transcript surfaces (same DOM, same CSS, same tool call blocks) | **Runtime proven** |
| 10C | Official docs confirm semantic distinction (`cached` = OpenAI index, `live` = fresh web fetch), but distinction is in data freshness, not transcript shape | **Docs/SDK proven** |

### 2.4 Current Test Vault State

- **API key**: Empty (`"apiKey": ""` in settings) — cannot run fresh authenticated Codex chats
- **Current `webSearchMode`**: `"cached"`
- **Current `networkAccessEnabled`**: `false`
- **BUILD_ID**: `feature-codex-sdk-capability.202606101423` (from 13C)

## 3. Strongest Evidence

1. **SDK types are unchanged**: `WebSearchMode` is still `"disabled" | "cached" | "live"` in the installed package
2. **Adapter wiring is unchanged**: Clean passthrough from settings → adapter → SDK → CLI `--config` argument
3. **Prior runtime evidence is comprehensive and unchallenged**:
   - `disabled` mode visibly suppresses web search (zero `WebSearch` blocks)
   - `cached` and `live` both produce visible `WebSearch` blocks with identical DOM/CSS
   - No stable user-visible differentiation between `cached` and `live` in ordinary chat
4. **Official docs explain the lack of visible difference**: the distinction is in data freshness/source, not in tool invocation pattern or transcript shape
5. **No code changes since prior evidence**: the adapter, SDK version, and settings types are identical to when Checkpoints 10B/10C were run

## 4. Remaining Gaps

| Gap | Status | Notes |
|-----|--------|-------|
| Fresh `cached` vs `live` runtime probe | **Blocked by missing API key** | Test Vault has empty API key; cannot run live Codex chats |
| Quantitative result freshness measurement | **Not attempted** | Would require controlled A/B with known-age queries |
| User-visible mode indicator during chat | **Not designed** | No honest way to show active mode without misleading users |

## 5. Current Blockers

- **None for the truth resolution itself**
- The only blocker to productizing a `cached`/`live` selector is that ordinary chat cannot honestly expose the distinction in a user-meaningful way
- Fresh runtime probes are blocked by missing API key, but prior evidence is comprehensive and the codebase is unchanged

## 6. Honest Verdict

**`webSearchMode` remains `readback`. No stable ordinary surface is justified.**

### Why no code changes:

1. The **only** proven user-visible distinction is `disabled` vs `cached`/`live`
2. A binary "Web Search: Enabled/Disabled" surface would be **misleading** because:
   - It collapses two semantically distinct modes (`cached` and `live`) into one "enabled" bucket
   - Users cannot choose between `cached` and `live`, yet the backend behavior differs
   - The `networkAccessEnabled` setting already provides broader network access control
3. A three-mode dropdown would be **dishonest** because:
   - Users cannot see any difference between `cached` and `live` in ordinary chat
   - There is no transcript-level indicator of which mode is active
   - The distinction (data freshness) is inherently non-deterministic and prompt-dependent
4. **The user explicitly requested**: "不要把 hidden / readback / diagnostic-only / supporting evidence 写成 pass" and "最多只允许一个真正诚实的最小面；如果连这个都站不住，就不要改代码"

### What this does NOT mean:

- It does not mean the SDK ignores `webSearchMode` — wiring is proven correct
- It does not mean there is zero backend difference — the semantic distinction is real
- It does not contradict the `disabled` suppression evidence
- It does not prevent future productization if Codex adds transcript-level mode indicators

## 7. Explicit Truth-Bucket Conclusion for `webSearchMode`

| Bucket | Status | Evidence | Rationale |
|--------|--------|----------|-----------|
| `disabled` suppression | **Runtime proven** (Checkpoint 5E) | Zero visible WebSearch blocks under `disabled` for identical prompt | CLI removes the tool entirely |
| `cached` vs `live` semantic distinction | **Docs/SDK proven REAL** | Official docs + SDK types + CLI config path all confirm distinct semantics | Cached = OpenAI index; Live = fresh web fetch |
| `cached` vs `live` ordinary-chat visibility | **NOT exposeable** | Both modes produce identical visible `WebSearch` transcript blocks | Distinction is in data freshness, not transcript shape |
| `webSearchMode` overall | **`readback`** | Semantics are real and wiring is correct, but current ordinary chat cannot honestly expose `cached` vs `live` | Keep as readback; do not productize any mode selector |

## 8. Next Smallest Suggestion

- **Stop here.** `webSearchMode` truth is resolved.
- If future Codex CLI versions add transcript-level indicators (e.g., "fetched live" vs "from cache" badges), revisit this decision.
- If OpenAI publishes clearer user-facing semantics for `cached` vs `live`, revisit.
- Otherwise, accept that `webSearchMode` is a correctly-wired, readback-only seam.

## 9. Verification

### No product code changes

- `npm run verify`: **Not required** — no source code changes
- `npm run build`: **Not required** — no deploy-relevant changes
- Test Vault deploy: **Not required** — no runtime changes

### Documentation verification

- `npm run check:devlog-order`: **Run and pass** (devlog entry added correctly)

## 10. Exact Output Requirements Checklist

- [x] Does `webSearchMode` now justify any stable ordinary surface? **No**
- [x] If no, why does it remain `readback` / `hidden`? **Ordinary chat cannot honestly expose `cached` vs `live`; binary enabled/disabled would misrepresent semantics**
- [x] What code changed, if any? **None — docs only**
- [x] `webSearchMode` final truth bucket: **`readback`**
- [x] Why: **Real semantics exist below transcript surface; no honest ordinary surface available**
- [x] Any stable ordinary surface newly added: **None**

---

**Stop rule applied**: Checkpoint 13D complete. No next checkpoint opened.
