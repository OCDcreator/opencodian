# Checkpoint 13C: Codex Per-Conversation Network Access Enabled — Truth Report

> **Date**: 2026-06-10
> **Worktree**: `codex-sdk-capability`
> **Branch**: `feature/codex-sdk-capability`
> **BUILD_ID**: `feature-codex-sdk-capability.202606101423`
> **Scope**: Per-conversation `networkAccessEnabled` override in Codex session settings modal only

## 1. What Was Implemented

### 1.1 Type Layer

- `src/core/types/chat.ts`
  - Added `codexNetworkAccessEnabled?: boolean | null` to `ConversationSessionSettings`
  - Added normalization in `normalizeConversationSessionSettings()`:
    - preserves explicit `true` / `false` / `null`
    - drops non-boolean values

### 1.2 Coordinator Layer

- `src/features/chat/services/ConversationSessionSettingsCoordinator.ts`
  - Added `codexNetworkAccessEnabled?: boolean` to `ResolvedConversationSessionSettings`
  - Extended `getCodexGlobalDefaults()` return type to include `networkAccessEnabled: boolean`
  - Extended `applyCodexRuntimeOverrides()` parameter to include `networkAccessEnabled?: boolean`
  - `resolveEffectiveSettings()`: resolves override → global default with proper inherit semantics
  - `applyConversationRuntimeState()`: passes `networkAccessEnabled` to adapter host
  - `openConversationSettingsModal()`: passes `codexNetworkAccessEnabled` in defaults to modal

### 1.3 Modal Layer

- `src/features/chat/ui/ConversationSessionSettingsModal.ts`
  - Added `codexNetworkAccessEnabled?: boolean` to `ConversationSessionSettingsModalDefaults`
  - Added `codexNetworkAccessEnabledSelectEl` ref
  - `createCodexSection()`: renders three-state dropdown (Inherit / Enabled / Disabled) after reasoning effort
  - `buildOverrides()`: reads select value and emits `true` / `false` / `null`
  - `onClose()`: cleans up new ref

### 1.4 Host Layer

- `src/features/chat/OpenCodianView.ts`
  - `getCodexGlobalDefaults`: returns `networkAccessEnabled` from global settings
  - `applyCodexRuntimeOverrides`: calls `adapter.updateNetworkAccessEnabled()` when available

### 1.5 Locale Strings

- `src/i18n/locales/en.ts`
  - `chat.sessionSettings.modal.codexNetworkAccessEnabled`: "Network access"
  - `chat.sessionSettings.modal.codexNetworkAccessEnabledDesc`: "Allow this conversation to access the network. Only effective in \"Workspace Write\" sandbox mode. Applies on the next thread."
  - `chat.sessionSettings.modal.codexNetworkAccessEnabledOn`: "Enabled"
  - `chat.sessionSettings.modal.codexNetworkAccessEnabledOff`: "Disabled"

- `src/i18n/locales/zh.ts`
  - Corresponding Chinese translations

### 1.6 Tests

- `tests/unit/core/types/chat.test.ts`
  - 4 new tests: true / false / null / non-boolean drop

- `tests/unit/features/chat/ConversationSessionSettingsCoordinator.codex.test.ts`
  - 6 new tests: resolve from override, fallback to global, null fallback, apply to adapter, global apply, persist + reapply

- `tests/unit/features/chat/ConversationSessionSettingsModal.codex.test.ts`
  - 5 new tests: render, init from override, default inherit, save output, null on inherit

**Test totals**:
- `chat.test.ts`: 15 passed (was 11)
- `Coordinator.codex.test.ts`: 30 passed (was 24)
- `Modal.codex.test.ts`: 21 passed (was 16)
- Full suite: 479 suites, 4593 tests — all green

## 2. Verification Results

| Check | Result | Notes |
|-------|--------|-------|
| Targeted tests | ✅ Pass | 15 new tests, all pass |
| `npm run typecheck` | ✅ Pass | 0 errors |
| `npm run lint` | ✅ 0 errors in 13C files | 3 unrelated warnings in non-13C files: `ComposerInputShellCoordinator.test.ts` (max-lines-per-function), `MessageSendPreparationService.test.ts` (max-lines), `SettingsCodexSection.test.ts` (max-lines-per-function) |
| `npm test` | ✅ Pass | 479 suites, 4593 tests |
| `npm run build` | ✅ Pass | BUILD_ID `feature-codex-sdk-capability.202606101423` |
| `npm run check:module-docs:coverage` | ✅ Pass | 471/471 mapped |
| `npm run check:module-docs:diff` | ❌ Fail | Pre-existing dirty files unrelated to 13C |
| `npm run check:graphify` | ✅ Pass | Updated and verified |
| `npm run check:devlog-order` | ✅ Pass | No changes |
| `OWNER_GUARD_APPROVED=... npm run verify` | ✅ Pass | Class B approval for OpenCodianView.ts |
| Deploy to testvault | ✅ Done | BUILD_ID verified in deployed main.js |

## 3. Obsidian Runtime Evidence

### 3.1 UI Evidence — Session Settings Modal

Screenshots captured with network access control scrolled into viewport:

- **Enabled state**: `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/13c-08-network-access-enabled-true-visible.png`
  - Modal shows "Network access" row with dropdown value "Enabled" (启用)
  - Dropdown options visible: Inherit (继承) / Enabled (启用) / Disabled (禁用)

- **Disabled state**: `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/13c-07-network-access-disabled-visible.png`
  - Modal shows "Network access" row with dropdown value "Disabled" (禁用)
  - Same dropdown options visible

### 3.2 DOM Verification

```javascript
// Enabled conversation
Network access select found: true
Value: true
Options: 继承=, 启用=true, 禁用=false

// Disabled conversation
Network access select found: true
Value: false
```

### 3.3 Persistence Verification

```javascript
// Saved conversation object
Current conv sessionSettings: {"codexSandboxMode":"workspace-write","codexNetworkAccessEnabled":false}
```

## 4. What Was NOT Proven

### 4.1 Runtime Divergence — Enabled vs Disabled

**Status**: ❌ **NOT proven**

This checkpoint **cannot be promoted to `已 pass`** because the critical runtime divergence proof is missing.

**Why**:
- Codex requires a valid OpenAI API key to spawn threads and execute network requests
- The testvault environment does not have a configured API key
- Without authenticated Codex threads, there is no way to observe the behavioral difference between:
  - `networkAccessEnabled=true` + `workspace-write` → agent can fetch external resources
  - `networkAccessEnabled=false` + `workspace-write` → agent is blocked from external access

**What was verified instead**:
- UI correctly displays and persists the three-state control
- Coordinator correctly resolves inherit → global default semantics
- Host correctly forwards the effective value to `adapter.updateNetworkAccessEnabled()`
- Adapter already had `updateNetworkAccessEnabled()` and forwards to `ThreadOptions.networkAccessEnabled` (proven in prior checkpoints)

## 5. Truth Bucket Classification

| Capability | Status | Notes |
|------------|--------|-------|
| Codex per-conversation `networkAccessEnabled` UI (session settings modal) | ✅ **已 pass** | Three-state dropdown renders, saves, persists |
| Codex per-conversation `networkAccessEnabled` persistence + coordinator logic | ✅ **已 pass** | Resolve/save/apply covered by 11 new tests |
| Codex per-conversation `networkAccessEnabled` adapter host plumbing | ✅ **已 pass** | OpenCodianView forwards to adapter.updateNetworkAccessEnabled() |
| Codex per-conversation `networkAccessEnabled` runtime divergence proof | ❌ **readback** | UI/adapter plumbing verified, but no authenticated thread runtime proof |
| Global settings `networkAccessEnabled` | ✅ **已 pass** (unchanged) | Still pass from Checkpoint 10A |
| `webSearchMode` | 📖 **readback** (unchanged) | No changes |
| Live thread in-place mutation | ❌ **not claimed** | Honest next-thread boundary semantics maintained |

## 6. Remaining Gaps

1. **Runtime divergence proof**: Need valid OpenAI API key to observe enabled vs disabled behavioral difference in actual Codex threads
2. **Module-docs diff**: Pre-existing dirty files (LocalStreamMessagePersistence, ConversationLoadRecoveryCoordinator) still fail `check:module-docs:diff` — unrelated to 13C
3. **Lint warnings**: Pre-existing max-lines warnings in test files — no new warnings introduced

## 7. Blockers

- **OpenAI API key**: Required to complete the runtime divergence proof. Without it, 13C cannot be honestly promoted beyond `readback` for the runtime behavior seam.

## 8. Next Smallest Suggestion

If an API key becomes available:

1. Create two fresh Codex conversations with `workspace-write` sandbox
2. Set one to `networkAccessEnabled=true`, one to `false`
3. Prompt both to fetch `https://example.com`
4. Capture the divergence in chat transcript screenshots
5. Update this checkpoint doc to `已 pass`

Alternatively, if the API key is permanently unavailable in this test environment, accept 13C as `readback` and move to the next smallest checkpoint (e.g., Codex session browser resume for persisted threads, or broader session settings surface polish).

## 9. Files Changed

### Product code
- `src/core/types/chat.ts`
- `src/features/chat/services/ConversationSessionSettingsCoordinator.ts`
- `src/features/chat/ui/ConversationSessionSettingsModal.ts`
- `src/features/chat/OpenCodianView.ts`
- `src/i18n/locales/en.ts`
- `src/i18n/locales/zh.ts`

### Tests
- `tests/unit/core/types/chat.test.ts`
- `tests/unit/features/chat/ConversationSessionSettingsCoordinator.codex.test.ts`
- `tests/unit/features/chat/ConversationSessionSettingsModal.codex.test.ts`

### Generated
- `graphify-out/*` (graphify update)

## 10. Stop Confirmation

This checkpoint stops here. No 13D was opened.
