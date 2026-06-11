# Checkpoint 5E: `webSearchMode=disabled` Runtime Smoke

## 1. Files Changed

No repo source files changed.

Temporary runtime-only changes during the audit:
- `/Volumes/SDD2T/obsidian-vault-write/testvault/.opencodian/settings.core.json`
  - switched `data.backendSettings.codex.webSearchMode` from `cached` to `disabled`
  - restored from backup after evidence capture

Runtime artifact captured:
- `/Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/.worktrees/codex-sdk-capability/.obsidian-debug/checkpoint-5e-disabled-runtime.png`

## 2. Capability Diagnosed

- Codex `webSearchMode=disabled` suppression behavior in ordinary Test Vault chat

## 3. Strongest Evidence

### Runtime setup
- Active backend in Test Vault settings was `codex`
- Temporary mode switch to `disabled` was applied, then the plugin was reloaded
- Prompt used: `What happened in the news today June 9 2026? Please search the web for the latest headlines.`

### Positive evidence
- The same class of prompt previously produced **7 visible `WebSearch` blocks** under the earlier `cached`-mode proof run
- Under `disabled`, the ordinary chat transcript produced:
  - zero visible `WebSearch` buttons in the DOM
  - zero `WebSearch` text occurrences in `document.body.innerText`
  - no `web_search` / `WebSearch` markers in captured console output
- The stream instead showed alternate tool behavior:
  - multiple `command_execution` blocks
  - later `js Connect in-app browser` attempts

### Concrete probes
- DOM button probe returned: `{\"count\":0,\"labels\":[]}`
- Global text probe returned: `{\"hasWebSearchText\":false,\"webSearchCount\":0,\"hasCommandExecution\":true}`
- `obsidian dev:errors` returned `No errors captured.`

## 4. Remaining Gaps

- This proves a **disabled-vs-enabled-like** difference for this prompt path, not the full three-mode seam
- `cached` vs `live` is still unproven in ordinary chat
- `webSearchMode` still has no stable user-facing ordinary settings surface
- The assistant did not complete a clean news answer in this run; it pivoted into alternate command/browser attempts after `web_search` was unavailable

## 5. Current Blockers

- No stable runtime evidence yet for `cached` vs `live`
- No stable user-facing surface for choosing `webSearchMode`
- Current OpenCode MCP workflow path remains unreliable; this checkpoint used OpenCode CLI fallback for the config-prep step

## 6. Honest Verdict

- `disabled` now has **runtime evidence** that ordinary Codex chat does **not** emit visible `WebSearch` blocks for this tested prompt path
- `webSearchMode` as a whole should still remain **`readback`**, not `已 pass`, because:
  - only the `disabled` suppression branch gained runtime evidence
  - `cached` vs `live` differentiation remains unproven
  - there is still no reviewed stable user-facing surface for this setting

## 7. Next Smallest Recommendation

- Stop here for review.
- If approved, the next smallest seam is a narrowly scoped `cached` vs `live` runtime comparison, but only if we accept that it may end with an honest “not visibly distinguishable” conclusion.
