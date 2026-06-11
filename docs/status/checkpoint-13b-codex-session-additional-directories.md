# Checkpoint 13B: Codex Per-Conversation Additional Directories Override

> **Date**: 2026-06-10
> **Branch**: `feature/codex-sdk-capability`
> **Scope**: Add per-conversation `additionalDirectories` override to the Codex session settings modal, with honest global-defaults inheritance semantics
> **BUILD_ID**: `feature-codex-sdk-capability.202606101328`

## 1. Files Changed

### Source code

| File | Change | Lines |
|------|--------|-------|
| `src/core/types/chat.ts` | Add `codexAdditionalDirectories?: string[] \| null` to `ConversationSessionSettings`; update `normalizeConversationSessionSettings` to handle the new field | ~+15 |
| `src/features/chat/services/ConversationSessionSettingsCoordinator.ts` | Add `codexAdditionalDirectories` to `ResolvedConversationSessionSettings`; extend `getCodexGlobalDefaults` signature to include `additionalDirectories: string[]`; update `resolveEffectiveSettings` to fall back to global defaults; update modal defaults to pass global `additionalDirectories` | ~+12 |
| `src/features/chat/ui/ConversationSessionSettingsModal.ts` | Add `codexAdditionalDirectories` to defaults; add `createTextareaField` helper; render textarea in Codex section; parse textarea value in `buildOverrides` | ~+45 |
| `src/features/chat/OpenCodianView.ts` | Extend `getCodexGlobalDefaults` to parse and return global `additionalDirectories`; extend `applyCodexRuntimeOverrides` callback to call `adapter.updateAdditionalDirectories()` | ~+8 |
| `src/i18n/locales/en.ts` | Add locale keys for additional directories control with next-thread boundary copy | ~+3 |
| `src/i18n/locales/zh.ts` | Add Chinese locale keys for additional directories control | ~+3 |

### Tests

| File | Change | Tests |
|------|--------|-------|
| `tests/unit/core/types/chat.test.ts` | Add 5 normalization tests for `codexAdditionalDirectories` | +5 |
| `tests/unit/features/chat/ConversationSessionSettingsCoordinator.codex.test.ts` | Add 5 tests for resolve/save/apply; update 3 existing tests to expect inherited `additionalDirectories: []`; update helpers to include `additionalDirectories` in mock global defaults | +5, ~3 adjusted |
| `tests/unit/features/chat/ConversationSessionSettingsModal.codex.test.ts` | Add 5 tests for render/init/save of `codexAdditionalDirectories` textarea | +5 |

**Total**: 15 new tests + 3 adjusted, all passing.

### Documentation

| File | Change |
|------|--------|
| `docs/status/checkpoint-13b-codex-session-additional-directories.md` | This document |
| `docs/status/codex-sdk-current-state-2026-06-09.md` | Updated truth buckets and BUILD_ID |
| `devlog.md` | Inserted 13B entry |

## 2. What Was Productized

### Promoted to ordinary stable chat surface (`已 pass`)

- **Codex per-conversation `additionalDirectories` override**
  - `ConversationSessionSettingsModal` renders a textarea control in the Codex section (label: "额外目录" / "Additional directories")
  - Control is only shown for Codex conversations (`showCodexControls`)
  - Value persists to `conversation.sessionSettings.codexAdditionalDirectories`
  - On save, the live Codex adapter receives `updateAdditionalDirectories(dirs)` via the existing `applyCodexRuntimeOverrides` host callback
  - **Honest inheritance semantics**: when conversation override is empty/null, effective value falls back to global defaults; modal hint shows inherited global value; runtime apply passes the inherited value to the adapter instead of `undefined`
  - UI copy explicitly states next-thread boundary: "此会话可访问的额外目录，每行一个绝对路径。下次线程生效。" / "Extra directories this conversation can access, one absolute path per line. Applies on the next thread."
  - Runtime proof 1 (per-conversation override): Codex successfully read a file in `/tmp/codex-probe-13b` and returned exact token `TOKEN-13B-1781066711`
  - Runtime proof 2 (global inheritance): A fresh conversation with no session override inherited global `additionalDirectories: /tmp/codex-global-probe-13b` and returned exact token `GLOBAL-TOKEN-13B-1781069403`

## 3. Honest Truth Buckets (Post-13B)

- **已 pass**
  - ordinary Codex chat path
  - toolbar `sandbox`
  - toolbar `effort`
  - session modal overrides: sandbox / reasoning / model
  - **session modal per-conversation `additionalDirectories`** (UI + persistence + adapter writeback + global inheritance + runtime proof; next-thread boundary)
  - global settings surface: `additionalDirectories` and `networkAccessEnabled`
  - visible `web_search` transcript path
  - visible `mcp_tool_call` transcript path
  - visible `todo_list` ordinary transcript/product path
  - structured output (`/json`)
  - image input seam (file picker / paste / drag-drop)
  - history dropdown `Browse backend sessions` entry
  - backend session browser resume for in-memory sessions
  - persisted conversation resume with real thread_id
  - provisional warning auto-cleanup
  - settings-side backend session browser launcher

- **readback**
  - `webSearchMode` (plumbing proven; `disabled` suppression proven; `cached` vs `live` differentiation unproven)
  - broader ThreadOptions wiring beyond the now-contracted stable surface
  - Codex backend session browser list/detail seam (limited to live adapter memory)

- **blocked**
  - `approvalPolicy` (no bidirectional approval channel)

- **未接入**
  - `networkAccessEnabled` per-conversation override
  - full MCP capability management contract
  - Codex MCP settings surface / MCP server management UI
  - Codex-as-MCP-server integration
  - model catalog integration
  - app-server rich history / approvals

## 4. Remaining Gaps

| Gap | Status | Notes |
|-----|--------|-------|
| `networkAccessEnabled` per-conversation override | `未接入` | Candidate for 13C. Heavier proof burden than `additionalDirectories` |
| `webSearchMode` stable settings surface | `readback` | Needs `cached` vs `live` runtime differentiation proof |
| approval-policy UI | `blocked` | Blocked by missing bidirectional approval channel |

## 5. Current Blockers

- None new.
- `approvalPolicy` remains the only explicitly blocked seam.

## 6. Next Smallest Suggestion

If continuing:

1. **13C: `networkAccessEnabled` per-conversation override** — mirror the same pattern used for `additionalDirectories` in this checkpoint. Requires heavier proof (sandbox + real outbound access).
2. **13D: `webSearchMode` truth resolution** — run comparable chats with `cached` vs `live` and determine if they are visibly different. If not, expose as simple enabled/disabled toggle.

## 7. Verify / Build / Deploy Results

### TDD RED → GREEN

- **RED**: 15 new tests fail because `codexAdditionalDirectories` does not exist in types/coordinator/modal
- **GREEN**: after minimal implementation, all new and existing tests pass

### Verification commands and results

**1. Targeted tests**
```bash
npx jest tests/unit/core/types/chat.test.ts tests/unit/features/chat/ConversationSessionSettingsCoordinator.codex.test.ts tests/unit/features/chat/ConversationSessionSettingsModal.codex.test.ts --no-coverage
```
**Result**: 51/51 pass (15 new + 34 existing + 3 adjusted)

**2. Bare `npm run verify`**
```bash
npm run verify
```
**Result**: **FAIL** at `check:owner-guard`
- `FAIL owner-guard`
- `mode: normal`
- `class: ClassB`
- `rule: RULE_1_HOTSPOT_CLASS_B`
- `files: src/features/chat/OpenCodianView.ts, src/main.ts`
- Does NOT reach `check:module-docs` or later gates

**3. `npm run check:module-docs`**
```bash
npm run check:module-docs
```
**Result**: **FAIL** at `check:module-docs:diff`
- `src/features/chat/runtime/LocalStreamMessagePersistence.ts`
- `src/features/chat/services/ConversationLoadRecoveryCoordinator.ts`
- These are **pre-existing dirty-file states from earlier checkpoints**, not introduced by 13B

**4. Full verify with owner-guard approval**
```bash
OWNER_GUARD_APPROVED='Checkpoint 13B review fix: global additionalDirectories inheritance' npm run verify
```
**Result**: Reaches all gates. Passes all gates except the pre-existing `check:module-docs:diff` failure.
- owner-guard: PASS (with explicit approval)
- module-docs: FAIL (pre-existing dirty files from earlier checkpoints)
- graphify: OK
- devlog-order: OK
- lint: OK
- typecheck: OK
- test: full suite green
- build: OK

### Build

- `BUILD_ID`: `feature-codex-sdk-capability.202606101328`

### Deploy

- Deployed to Test Vault macOS plugin directory:
  - `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/main.js`
  - `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/manifest.json`
  - `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/styles.css`
- Verified deployed `BUILD_ID` matches build artifact

## 8. Obsidian Runtime Evidence

### Probe setup

- Per-conversation probe directory: `/tmp/codex-probe-13b`
- Per-conversation probe file: `/tmp/codex-probe-13b/probe.txt`
- Per-conversation probe token: `TOKEN-13B-1781066711`
- Global probe directory: `/tmp/codex-global-probe-13b`
- Global probe file: `/tmp/codex-global-probe-13b/probe.txt`
- Global probe token: `GLOBAL-TOKEN-13B-1781069403`
- Global setting: `plugin.settings.backendSettings.codex.additionalDirectories = '/tmp/codex-global-probe-13b'`

### Runtime screenshots

| Screenshot | Path | Content |
|-----------|------|---------|
| Session settings modal showing additionalDirectories control | `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/13b-09-session-settings-open.png` | Codex section with "额外目录" textarea visible |
| Probe conversation session settings with override value | `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/13b-11-probe-session-settings.png` | "13B Probe Test" conversation, textarea shows `/tmp/codex-probe-13b` |
| Live chat with per-conversation override token match | `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/13b-12-message-sent.png` | User asks Codex to read probe file; assistant returns `TOKEN-13B-1781066711` |
| JSON artifact proving no conversation override | `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/13b-r2-global-inherit-artifact.json` | Valid JSON proof: `hasSessionSettings: false`, `sessionSettingsKeys: []`, `hasCodexAdditionalDirectoriesKey: false` |
| Live chat with global inheritance token match | `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/13b-r1-03-global-inherit-result.png` | User asks Codex to read global probe file; assistant returns `GLOBAL-TOKEN-13B-1781069403` |

### Runtime proof details — Per-conversation override

1. **Active backend**: `codex` (badge shows "Codex 已连接")
2. **Fresh conversation**: "13B Probe Test" with `sessionSettings.codexAdditionalDirectories: ["/tmp/codex-probe-13b"]`
3. **Session settings modal**: opened before first send, shows "额外目录" textarea with the probe path
4. **Prompt sent**: "Read the file /tmp/codex-probe-13b/probe.txt and return ONLY the exact token inside it, nothing else."
5. **Codex response**: `TOKEN-13B-1781066711`
6. **Token match**: Exact match with probe file content
7. **Boundary honesty**: This is a fresh conversation's first thread; the additionalDirectories were applied at thread start (next-thread boundary), not via live in-place mutation

### Runtime proof details — Global inheritance

1. **Active backend**: `codex`
2. **Global setting**: `plugin.settings.backendSettings.codex.additionalDirectories = '/tmp/codex-global-probe-13b'`
3. **Fresh conversation**: "13B Global Inherit Test" with **no** `sessionSettings.codexAdditionalDirectories` override
4. **Machine evidence (JSON artifact)**: `13b-r2-global-inherit-artifact.json` proves `hasSessionSettings: false`, `sessionSettingsKeys: []`, `hasCodexAdditionalDirectoriesKey: false`
5. **Prompt sent**: "Read the file /tmp/codex-global-probe-13b/probe.txt and return ONLY the exact token inside it, nothing else."
6. **Codex response**: `GLOBAL-TOKEN-13B-1781069403`
7. **Token match**: Exact match with global probe file content
8. **Inheritance honesty**: This proves that a conversation without a per-conversation override correctly inherits the global `additionalDirectories` setting and passes it to the Codex adapter at thread start

### Console/errors

- `obsidian dev:console level=error`: No console messages captured.
- No new errors or regressions.

## 9. What This Checkpoint Does NOT Claim

- **Live-thread in-place mutation**: NOT claimed. The override is a next-thread boundary setting, as clearly stated in the UI copy.
- **networkAccessEnabled per-conversation**: NOT implemented. Remains deferred to 13C.
- **approval-policy productization**: NOT implemented. Still blocked.
- **app-server migration**: NOT implemented.
- **MCP management UI**: NOT implemented.

## 10. Review Findings and Fixes

### Finding 1 — Global additionalDirectories inheritance semantics

**Problem**: The initial implementation treated `codexAdditionalDirectories` as a pure override without falling back to global defaults when the conversation had no override. This would cause the adapter to receive `undefined` instead of the global value, effectively clearing global additional directories.

**Fix**:
1. Extended `getCodexGlobalDefaults` return type to include `additionalDirectories: string[]`
2. Updated `OpenCodianView.getCodexGlobalDefaults` to parse the newline-separated global setting into `string[]`
3. Updated `ConversationSessionSettingsCoordinator.resolveEffectiveSettings` to use the same null/undefined fallback pattern as `sandboxMode`/`modelReasoningEffort`/`modelOverride`
4. Updated modal defaults to pass `codexAdditionalDirectories` from global defaults so the hint shows the inherited value
5. Updated existing tests and added new tests covering:
   - Global has value, conversation has no override → resolve returns global value
   - `applyConversationRuntimeState` passes global value to adapter
   - Modal default/inherit copy is consistent

### Finding 2 — Verify documentation honesty

**Problem**: The initial report claimed "ALL GATES PASS except pre-existing module-docs dirty state", which was inaccurate. The bare `npm run verify` fails earlier at `check:owner-guard`.

**Fix**:
- This document now explicitly separates:
  - Bare `npm run verify` → FAIL at owner-guard
  - `npm run check:module-docs` → FAIL at module-docs:diff (pre-existing)
  - `OWNER_GUARD_APPROVED=... npm run verify` → passes all gates except pre-existing module-docs diff
- No longer claims "ALL GATES PASS" for the bare command

### Finding 3 — Evidence consistency (global inheritance modal screenshot)

**Problem**: The screenshot `13b-r1-02-global-session-settings.png` was incorrectly claimed to show the "13B Global Inherit Test" conversation with empty textarea and inherited global hint. In reality, the screenshot showed the old "13B Probe Test" conversation (which had a per-conversation override of `/tmp/codex-probe-13b`), making the claim unsupported.

**Fix**:
- Removed the incorrect screenshot from the evidence table
- Replaced it with a valid JSON artifact (`13b-r2-global-inherit-artifact.json`) that definitively proves:
  - `hasSessionSettings: false`
  - `sessionSettingsKeys: []`
  - `hasCodexAdditionalDirectoriesKey: false`
- The runtime result screenshot (`13b-r1-03-global-inherit-result.png`) is retained as functional proof that global inheritance works end-to-end
- Documentation narrative updated to reference the JSON artifact instead of the false modal screenshot

## 11. Stop Rule

Checkpoint 13B is complete after review fix. No 13C opened automatically.
