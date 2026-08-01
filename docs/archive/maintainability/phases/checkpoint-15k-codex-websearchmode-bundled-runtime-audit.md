# Checkpoint 15K: Codex `webSearchMode` Bundled-Runtime Audit

> **Date**: 2026-06-12
> **Branch**: `feature/codex-sdk-capability`
> **Scope**: Re-audit `webSearchMode` using the exact Test Vault/plugin bundled `codex-cli 0.137.0` runtime
> **Outcome**: **`settings-only`** kept. Bundled-runtime evidence proves `disabled` suppresses the built-in `web_search` tool while `cached`/`live` invoke it; no observable `cached` vs `live` distinction in this setup.

## 1. Files Changed

### Documentation

| File | Action | Description |
|------|--------|-------------|
| `docs/status/checkpoint-15k-codex-websearchmode-bundled-runtime-audit.md` | **Created** | This audit report |
| `docs/status/codex-sdk-current-state-2026-06-09.md` | **Updated** | §1 truth snapshot and §1.2 status buckets refreshed with 15K evidence |
| `devlog.md` | **Updated** | Added 15K entry |

### Source code

**None.** No product code changes.

## 2. Audit Design

### 2.1 Runtime

- **Binary**: `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/node_modules/@openai/codex-darwin-arm64/vendor/aarch64-apple-darwin/bin/codex`
- **Version**: `codex-cli 0.137.0` (Test Vault plugin bundled)
- **Working directory**: `/tmp/codex-websearch-test`
- **Prompt** (identical across all three runs): `What is the current weather in Tokyo today?`
- **Sandbox**: `workspace-write`
- **Isolation flags** to remove alternate web-access paths and isolate the built-in `web_search` tool:
  - `--disable browser_use`
  - `--disable browser_use_external`
  - `--disable computer_use`
  - `--disable plugins`
  - `--disable hooks`
  - `--disable shell_tool`

### 2.2 Cases

| Case | CLI flag | Expected distinct behavior |
|------|----------|---------------------------|
| `disabled` | `--config web_search="disabled"` | No `web_search` tool calls |
| `cached` | `--config web_search="cached"` | `web_search` tool calls present |
| `live` | `--config web_search="live"` | `web_search` tool calls present |

## 3. Evidence

### 3.1 Durable artifacts

All artifacts are under `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/`:

- `15k-bundled-websearchmode-divergence-proof.json` — summary JSON
- `15k-bundled-websearchmode-disabled.jsonl` — raw `codex exec --json` output, `disabled`
- `15k-bundled-websearchmode-cached.jsonl` — raw `codex exec --json` output, `cached`
- `15k-bundled-websearchmode-live.jsonl` — raw `codex exec --json` output, `live`
- `15k-bundled-websearchmode-disabled-stderr.log` — stderr log, `disabled`
- `15k-bundled-websearchmode-cached-stderr.log` — stderr log, `cached`
- `15k-bundled-websearchmode-live-stderr.log` — stderr log, `live`

### 3.2 Measured results

| Mode | `web_search` calls started | `web_search` calls completed | Turn completed | Final agent message preview |
|------|---------------------------|------------------------------|----------------|----------------------------|
| `disabled` | 0 | 0 | 1 | "I can’t verify Tokyo’s current weather from this environment because network access is blocked and there’s no built-in weather data tool available here." |
| `cached` | 32 | 32 | 1 | "As of 12:00 PM JST on June 12, 2026, central Tokyo (Chiyoda) was `26.1°C`..." |
| `live` | 2 | 2 | 1 | "Tokyo today, June 12, 2026 JST: mostly cloudy and about 21°C (70°F)..." |

### 3.3 Key observations

- `disabled` mode produced **zero** `web_search` tool events (`type: "item.started/completed"` with `item.type: "web_search"`). The agent fell back to a `fetch` via the `node_repl` MCP server, which failed (`TypeError: fetch failed`), and then reported it could not verify the weather.
- `cached` and `live` modes both produced `web_search` tool events and both returned a weather answer for Tokyo.
- The difference in `web_search` call count (`32` vs `2`) appears to be agent/search-loop non-determinism, not a stable mode-specific pattern.
- No transcript-level indicator distinguished `cached` from `live` (same event type, same query shape, same tool name).

## 4. Verdict

### 4.1 What is proven

Using the exact Test Vault bundled `codex-cli 0.137.0` runtime:

- `--config web_search="disabled"` suppresses the built-in `web_search` tool.
- `--config web_search="cached"` and `--config web_search="live"` both enable the built-in `web_search` tool.
- The plugin SDK generates the identical `--config web_search="<mode>"` CLI flag (already verified in 15F/15G).

### 4.2 What is not proven

- No observable runtime distinction between `cached` and `live` in ordinary transcript shape, tool-call type, or answer structure for this prompt family.
- The official semantic distinction (`cached` = OpenAI cached index, `live` = fresh fetch) is real at the documentation/SDK level, but it is not visible as a durable user-facing difference in the bundled runtime output captured here.

### 4.3 Classification decision

**Keep `webSearchMode` at `settings-only`.**

Reasoning:

- The product surface advertises three independent choices (`disabled`/`cached`/`live`).
- Strong bundled-runtime evidence only supports the binary distinction `disabled` vs `enabled` (`cached`/`live`).
- Without strong evidence that `cached` and `live` themselves produce distinct observable behavior, promoting the full ternary control to `已 pass` would overclaim.
- The honest state is: setting is wired, persisted, forwarded to the bundled runtime, and has a proven runtime effect for the `disabled` boundary; the `cached`/`live` distinction remains an unproven product seam.

## 5. Blockers / Next Steps

- **Blocker to promotion**: no reproducible, prompt-independent way to observe a `cached` vs `live` difference in the bundled runtime output.
- **Suggested next step**: revisit if a future Codex CLI version exposes transcript-level source/freshness metadata (e.g., `source: "cached-index"` vs `source: "live-fetch"`) or if official docs publish a client-observable distinction.
- **Until then**: keep `settings-only`; do not collapse the dropdown to binary, but keep the honest description that `cached`/`live` runtime distinction is not yet proven.

## 6. Verification

- No source code changes.
- `npm run build`: not required (docs-only).
- `npm run verify`: not required (docs-only).
- Test Vault deploy: not required (docs-only).
- `npm run check:devlog-order`: run and pass.
- Evidence analyzer script: `/tmp/codex-websearch-test/analyze-evidence.mjs` (not committed; local analysis only).

## 7. Exact Output Requirements Checklist

- [x] Does `webSearchMode` produce a bundled-runtime observable distinction? **Yes — `disabled` vs `cached`/`live`.**
- [x] Does the distinction cover all three modes? **No — `cached` vs `live` remains unproven.**
- [x] Final classification: **`settings-only`**.
- [x] Why: **Strong evidence for `disabled` boundary; no strong evidence for `cached`/`live` mutual distinction.**
- [x] Code changed: **None — docs-only truth-sync.**

---

**Stop rule applied**: Checkpoint 15K complete. No next checkpoint opened.
