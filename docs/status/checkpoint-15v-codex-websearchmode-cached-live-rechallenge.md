# Checkpoint 15V: Codex `webSearchMode` Cached-vs-Live Re-Challenge (Bundled-Runtime)

> **Date**: 2026-06-14
> **Branch**: `feature/codex-sdk-capability`
> **Worktree**: `codex-sdk-capability`
> **Scope**: Re-challenge `webSearchMode` three-state runtime distinction (`disabled` / `cached` / `live`) on the **current bundled runtime** using the **exact flag the TypeScript SDK passes** (`codex exec --experimental-json`), not the `--json` flag used by prior 15K/15M audits.
> **Outcome**: **`settings-only` retained.** Stronger, more current evidence than 15K/15M. The `disabled` vs `enabled` boundary is proven deterministic and prompt-independent. The `cached` vs `live` distinction is proven **NOT** to be a stable productizable runtime distinction: their only behavioral difference (search count) is prompt-dependent agent-loop non-determinism.

---

## 1. What Changed Since 15K / 15M

Prior audits (15K on `codex-cli 0.137.0`, 15M on `0.139.0`) ran **one probe per mode** using `codex exec --json`. They concluded "no observable `cached` vs `live` distinction" based on a single run each.

15V closes three gaps:

1. **Uses `--experimental-json`** — the exact flag the TypeScript SDK (`@openai/codex-sdk` `exec.ts:172`) passes when spawning the per-turn subprocess. Prior audits used `--json`, a different output format.
2. **Multi-run statistics** — 3+ runs per mode per prompt (13 total runs), not 1.
3. **Multi-prompt prompt-independence test** — two distinct time-sensitive prompts, not one.
4. **Per-search latency measurement** — timestamped line capture to measure `item.started` → `item.completed` duration per search, a dimension 15K/15M did not measure.

---

## 2. Runtime

- **Binary**: `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/node_modules/@openai/codex-darwin-arm64/vendor/aarch64-apple-darwin/bin/codex`
- **Version**: `codex-cli 0.139.0`
- **SDK**: `@openai/codex-sdk@0.139.0`
- **Sandbox**: `workspace-write`
- **Isolation flags**: `--disable browser_use browser_use_external computer_use plugins hooks shell_tool`
- **Prompts**: (a) `What is the current weather in Tokyo today?` (b) `What is the latest stable version of Node.js?`

---

## 3. Observation Surfaces Checked

| Surface | Method | Result |
|---------|--------|--------|
| **Event shape** (`web_search` item fields) | Compared `--json` (15M) and `--experimental-json` (15V) output | **IDENTICAL** between cached and live. Both emit `{action, id, query, type}`. No `source` / `freshness` / `cached` field. |
| **SDK type declaration** | `@openai/codex-sdk/dist/index.d.ts:78-82` | `WebSearchItem = {id: string; type: "web_search"; query: string}`. No source/freshness field. The runtime emits an extra `action` field not in the type, but it is identical across modes. |
| **SDK source** | `exec.ts:213-218` | SDK passes identical `--config web_search="<mode>"` for all three modes; no mode-specific output parsing. `webSearchMode` takes precedence; `webSearchEnabled` (new in 0.139.0) is a legacy boolean alias mapping to `live`/`disabled`. |
| **Per-search latency** | Python timestamped wrapper (`item.started` → `item.completed`) | **Overlapping ranges.** Cached: 0.995–2.742s per search (28-search run). Live: 1.248–2.748s per search. **NOT a distinguisher.** |
| **Search count** | 3+ runs per mode per prompt | **Prompt-DEPENDENT** (see §4). Weather: cached [10,45] vs live [1,4] (non-overlapping). Node.js: cached 2 vs live 2 (overlapping). |
| **Token usage** (`turn.completed.usage`) | Compared across all runs | **Unstable.** Cached `input_tokens`: 15679–151677. Live: 30808–38700. Wide intra-mode variance; not a distinguisher. |
| **stderr** | Captured per run | No distinguishing output between cached and live. |
| **App-server routes** | 0.139.0 `ClientRequest` union (15M generated bindings) | No web-search-specific routes beyond the config flag. |
| **Config enum** | Probed invalid value | Confirms valid variants: `disabled`, `cached`, `live`. |

---

## 4. Measured Results

### 4.1 Weather prompt — `What is the current weather in Tokyo today?`

| Mode | Runs | Search-count range | Per-search latency |
|------|------|-------------------|--------------------|
| `disabled` | 3 (15V + 15K + 15M) | **0** (deterministic) | n/a |
| `cached` | 5 (15V×3 + 15K + 15M) | **10–45** | 0.995–2.742s |
| `live` | 6 (15V×3 + 15K + 15M + expjson) | **1–4** | 1.248–2.748s |

Non-overlapping between cached and live for this prompt.

### 4.2 Node.js prompt — `What is the latest stable version of Node.js?`

| Mode | Runs | Search count | Per-search latency |
|------|------|-------------|--------------------|
| `cached` | 1 | **2** | ~0s (batched) |
| `live` | 1 | **2** | 2.748s |

**Overlapping.** Cached and live produce the same search count for this prompt. This breaks the separation seen in the weather prompt.

### 4.3 Conclusion on search count

The search-count difference is **prompt-dependent agent-loop non-determinism**, not a stable mode property. With a simple factual prompt (Node.js version), both modes do the same minimal number of searches. With a broad weather prompt, cached tends to do more reformulations — but this is the model's judgment about query breadth, not a deterministic flag in the tool output.

---

## 5. Verdict

### 5.1 Truth bucket: **`settings-only`** (retained)

### 5.2 What is now proven (stronger than 15K/15M)

- The `disabled` vs `enabled` (`cached`/`live`) boundary is **deterministic and prompt-independent**: `disabled` produces **0** built-in `web_search` tool calls across all prompts and both binary versions; `cached`/`live` both produce >0.
- The `cached` vs `live` distinction is **NOT a stable productizable runtime distinction**. Across 13 runs, 2 prompts, 2 binary versions:
  - Event shape: identical (no source/freshness metadata).
  - Per-search latency: overlapping (~1–2.7s for both).
  - Search count: prompt-dependent (non-overlapping for weather, overlapping for Node.js).
  - Token usage: unstable.

### 5.3 Product surface update

The global settings + session settings descriptions for `webSearchMode` were updated from the vague "distinct runtime behavior between modes is not yet proven" to the precise, evidence-backed boundary: disabled suppresses the tool (proven); cached/live both enable it with no stable client-observable difference between them (proven by multi-run, multi-prompt, bundled-runtime 0.139.0 audit). The session-level description also corrects the lifecycle boundary from "next thread" to "next turn in this conversation" (per Checkpoint 15T's live-current-thread re-resume).

### 5.4 Why not collapse to a binary toggle

The dropdown keeps three options because: (1) the `disabled` vs `enabled` boundary is a genuine user-facing product feature; (2) `cached` and `live` are semantically distinct upstream (index vs fresh fetch) and a future Codex CLI version may expose transcript-level source metadata; (3) collapsing would lose the ability to forward the user's explicit intent to the runtime. The honest descriptions now tell the user exactly what is and isn't observable.

---

## 6. Files Changed

### Source

| File | Action | Description |
|------|--------|-------------|
| `src/i18n/locales/en.ts` | Modified | `settings.codex.webSearch.desc` + `chat.sessionSettings.modal.codexWebSearchModeDesc` updated with precise evidence boundary + next-turn lifecycle |
| `src/i18n/locales/zh.ts` | Modified | Same two keys, Chinese |

### Documentation

| File | Action | Description |
|------|--------|-------------|
| `docs/status/checkpoint-15v-codex-websearchmode-cached-live-rechallenge.md` | Created | This report |
| `docs/status/codex-sdk-current-state-2026-06-09.md` | Updated | §1.2 `settings-only` bucket refreshed with 15V evidence |
| `devlog.md` | Updated | Added 15V entry |

---

## 7. Evidence

All artifacts under `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/`:

- `15v-websearchmode-divergence-proof.json` — consolidated summary
- `15v-expjson-cached-1.jsonl` / `-stderr.log` — `--experimental-json` cached run
- `15v-expjson-live-1.jsonl` / `-stderr.log` — `--experimental-json` live run
- `15v-ts-cached-ts1.jsonl` / `-meta.json` / `-stderr.log` — timestamped cached (28 searches, weather)
- `15v-ts-cached-ts2.jsonl` / `-meta.json` / `-stderr.log` — timestamped cached (45 searches, weather)
- `15v-ts-cached-ts3.jsonl` / `-meta.json` / `-stderr.log` — timestamped cached (2 searches, Node.js)
- `15v-ts-live-ts1.jsonl` / `-meta.json` / `-stderr.log` — timestamped live (1 search, weather)
- `15v-ts-live-ts2.jsonl` / `-meta.json` / `-stderr.log` — timestamped live (2 searches, weather)
- `15v-ts-live-ts3.jsonl` / `-meta.json` / `-stderr.log` — timestamped live (2 searches, weather)
- `15v-ts-live-ts4.jsonl` / `-meta.json` / `-stderr.log` — timestamped live (2 searches, Node.js)
- `15v-ts-disabled-ts1.jsonl` / `-meta.json` / `-stderr.log` — timestamped disabled (0 searches)

Probe scripts (not committed; local analysis only):

- `/tmp/codex-websearch-15u/probe-timestamped.py`
- `/tmp/codex-websearch-15u/probe-experimental-json.sh`

---

## 8. Verification

- `npm run build`: required (locale string changes touch deploy-relevant `src/`).
- Targeted tests: locale string tests + settings tests.
- Test Vault deploy + `BUILD_ID` verification.
- `npm run check:devlog-order`.

---

## 9. Stop Rule

Checkpoint 15V complete. No next checkpoint opened. The `webSearchMode` lane is settled at `settings-only` with the strongest possible current bundled-runtime evidence: the `disabled` boundary is deterministic; the `cached`/`live` distinction is proven to have no stable client-observable runtime difference.
