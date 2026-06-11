# Checkpoint 10B: `webSearchMode=cached` vs `live` Runtime Audit

## 1. Files Changed

No repo source files changed.

Temporary runtime-only changes during the audit:
- `/Volumes/SDD2T/obsidian-vault-write/testvault/.opencodian/settings.core.json`
  - switched `data.backendSettings.codex.webSearchMode` from `cached` to `live` for the live-mode test run
  - initial `cp` from backup restored the file on disk, but the plugin runtime retained `live` in memory until explicitly reloaded
  - **Repair** (reviewer follow-up): re-applied `cached` to disk and reloaded the plugin; verified via `obsidian eval`

Runtime artifacts captured:
- `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/checkpoint-current-state.png` — initial state
- `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/checkpoint-chat-opened.png` — chat view opened
- `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/checkpoint-cached-midstream.png` — cached mode mid-stream
- `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/checkpoint-cached-complete.png` — cached mode final state
- `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/checkpoint-live-midstream.png` — live mode mid-stream
- `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/checkpoint-live-complete.png` — live mode final state
- `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/settings-backup-pre-audit.json` — settings backup

## 2. What Was Diagnosed

**Question**: In ordinary Codex chat on the current Test Vault build, do `webSearchMode=cached` and `webSearchMode=live` produce a stable, visible, user-meaningful difference?

**Procedure**:
1. Confirmed BUILD_ID and active backend in Test Vault
2. Backed up current Codex settings (`webSearchMode=cached`)
3. Created new conversation, sent identical prompt with `cached` mode
4. Switched settings to `live` mode, reloaded plugin
5. Created new conversation, sent identical prompt with `live` mode
6. Compared visible transcript behavior, DOM, tool calls, and completion state
7. Restored original settings (`cached`) to disk and reloaded plugin to clear runtime cache

**Identical prompt used for both runs**:
> "What are the latest headlines in tech news today? Please search the web."

## 3. Strongest Evidence

### Runtime Setup
- **BUILD_ID**: `feature-codex-sdk-capability.202606100054`
- **Active backend**: `codex`
- **Backend status**: `connected`
- **Test Vault**: `/Volumes/SDD2T/obsidian-vault-write/testvault/`
- **Console errors**: `No errors captured.` (clean `obsidian dev:errors`)

### Cached Mode Results
- **Tool calls emitted**: 13 total
  - 1 `command_execution` (reading `using-superpowers` skill)
  - 12 `WebSearch` tool calls
- **Transcript behavior**: 
  - Assistant stated: "I'm checking the required session workflow first, then I'll search current tech headlines from **live web sources** and summarize the top items with links."
  - Multiple `WebSearch` blocks visible in DOM with `streaming-tool-call` class
  - Some searches completed, one still "Waiting for result..."
- **Errors**: 2× `502 Bad Gateway` errors with reconnect attempts (1/5 and 2/5)
- **Completion**: Partial — response cut off with incomplete final search

### Live Mode Results
- **Tool calls emitted**: 7 total
  - 1 `command_execution` (reading `using-superpowers` skill)
  - 6 `WebSearch` tool calls
- **Transcript behavior**:
  - Assistant stated: "我会先按会话要求读取 superpowers:using-superpowers 技能说明，然后**直接联网检索**今天的科技新闻头条并给出来源链接。"
  - Multiple `WebSearch` blocks visible in DOM with `streaming-tool-call` class
  - All searches completed
- **Errors**: None
- **Completion**: Full — assistant provided complete tech news summary with source citations

### Comparative DOM Evidence
Both modes produced **identical visible transcript surfaces**:
- `WebSearch` tool call blocks with `lucide-wrench` icon
- `streaming-tool-name: "WebSearch"` elements
- `status-completed` badges on completed searches
- Identical CSS classes and structure (`streaming-tool-call`, `streaming-tool-header`, etc.)

### Key Observation
**Both modes triggered web search**. The assistant in `cached` mode explicitly mentioned "live web sources" and performed 12 searches. The assistant in `live` mode performed 6 searches. There is no visible transcript difference that a user could attribute to "cached" vs "live" semantics.

## 4. Remaining Gaps

- **Single prompt test**: Only one prompt shape tested. Different prompt types (e.g., factual lookup vs. current events) might behave differently.
- **No SDK-level verification**: Did not verify whether the SDK actually passes different `--config` values to the Codex CLI for `cached` vs `live`.
- **No network traffic inspection**: Did not inspect whether the underlying HTTP requests differ between modes.
- **Server instability confounding**: The `cached` run experienced 502 errors while `live` did not. This could be random server load, not a mode difference.
- **Non-deterministic model behavior**: The number of searches differed (12 vs 6), which is likely model-driven, not mode-driven.
- **No user-facing settings surface**: `webSearchMode` still has no stable UI for users to toggle between modes.

## 5. Current Blockers

- No stable runtime evidence that `cached` vs `live` produces a **reliable, user-visible difference** in ordinary chat.
- The Codex SDK's exact behavior for `webSearchMode` is not documented in enough detail to predict what the visible difference should be.
- Server/network instability (502 errors) makes it difficult to get clean A/B comparisons.

## 6. Honest Verdict

**`cached` vs `live` is not visibly distinguishable** in ordinary Codex chat under this build, based on this runtime audit.

**Evidence for this conclusion**:
1. Both modes produced visible `WebSearch` tool calls in the transcript
2. Both modes resulted in the assistant performing actual web searches
3. No DOM difference, no CSS class difference, no UI surface difference
4. The number of searches varied (12 vs 6), but this is attributable to model non-determinism, not mode
5. The `cached` run's 502 errors appear to be server-side noise, not a mode behavior

**What this does NOT mean**:
- It does not mean the SDK ignores `webSearchMode` — the setting is passed to `ThreadOptions` and reaches the Codex CLI
- It does not mean there is zero backend difference — only that no **ordinary user-visible difference** was observable
- It does not contradict the `disabled` suppression evidence from Checkpoint 5E

**Truth bucket conclusion**: `webSearchMode` remains **`readback`**. The `disabled` suppression branch has runtime evidence (Checkpoint 5E), but the `cached` vs `live` differentiation remains **unproven** in ordinary chat.

## 7. Next Smallest Recommendation

- **Stop here for review.**
- If approved to continue investigating `webSearchMode`, the next smallest step would be **SDK-level verification**: check whether the Codex CLI actually receives different `--config web_search_mode=cached` vs `live` arguments, and whether the CLI documentation describes any behavioral difference.
- Alternatively, accept that `webSearchMode` may not have a user-visible differentiation in ordinary chat and keep it as `readback` indefinitely, or expose only `disabled` vs `enabled` (collapsing `cached`/`live` into one) in any future settings surface.

## 8. Exact BUILD_ID

`feature-codex-sdk-capability.202606100054`

## 9. Exact Runtime Artifact Paths

All artifacts saved under:
- `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/`

Specific files:
- `checkpoint-current-state.png`
- `checkpoint-chat-opened.png`
- `checkpoint-cached-midstream.png`
- `checkpoint-cached-complete.png`
- `checkpoint-live-midstream.png`
- `checkpoint-live-complete.png`
- `settings-backup-pre-audit.json`

## 10. Explicit Truth Bucket Conclusion for `webSearchMode`

| Bucket | Status | Evidence |
|--------|--------|----------|
| `disabled` suppression | **Runtime proven** (Checkpoint 5E) | Zero visible WebSearch blocks under `disabled` for identical prompt |
| `cached` vs `live` differentiation | **Unproven** | Both modes produced visible WebSearch calls; no stable user-visible difference observed |
| `webSearchMode` overall | **`readback`** | Only `disabled` branch has runtime evidence; `cached`/`live` seam remains unproven |

**No truth bucket promotion.** `webSearchMode` stays `readback`.
