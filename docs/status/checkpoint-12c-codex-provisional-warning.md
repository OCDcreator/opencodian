# Checkpoint 12C: Codex Provisional Backend Session Warning

> **Date**: 2026-06-10
> **Implementer**: Agent session
> **Worktree**: `codex-sdk-capability`
> **Branch**: `feature/codex-sdk-capability`
> **Scope**: Productize a truthful warning for Codex conversations that still have only a provisional backend session id (`codex-local-*`). Warning must be automatically cleaned up when the conversation later obtains a real backend thread id.

---

## 1. Executive Summary

Implemented a persistent assistant notice that warns users when a Codex conversation has only a provisional backend session ID. The warning is honest and calm: the conversation is locally saved, but backend continuity is not yet established until a real Codex thread id exists.

**Reviewer fix applied**: When a provisional Codex conversation later obtains a real backend thread id (via `finalizedBackendSessionId`), the stale provisional warning is automatically removed from the conversation messages so it no longer appears in the chat surface.

| Behavior | Status |
|----------|--------|
| Warning appears for Codex conversations with provisional-only IDs | **Productized** |
| Warning does not appear for real Codex thread IDs | **Productized** |
| Warning does not appear for non-Codex backends | **Productized** |
| Duplicate warnings are prevented | **Productized** |
| Warning persists across plugin reload | **Productized** |
| Warning is automatically removed when real thread id is established | **Productized** |

---

## 2. Files Changed

| File | Change | Lines |
|------|--------|-------|
| `src/features/chat/services/ConversationLoadRecoveryCoordinator.ts` | Added provisional warning detection and append logic; wired through `activateTab` and `initializeFirstTab`; added `noticeMeta` marker | 199–204, 211–248, 260–265, 299–323 |
| `src/features/chat/runtime/LocalStreamMessagePersistence.ts` | Added `removeCodexProvisionalWarningIfUpgraded` helper; called from both `persistLocalStreamOutcome` and `persistBackendSessionIdentityIfNeeded` | 119–129, 173–183, 269–290 |
| `src/core/types/chat.ts` | Extended `ChatNoticeMeta.kind` to accept `'codex-provisional-warning'` | 179 |
| `src/features/chat/OpenCodianView.ts` | Wired `hasMatchingPersistentNotice` and `appendPersistentNotice` into load recovery host deps | 1953–1958 |
| `src/i18n/locales/en.ts` | Added English warning strings | 1872–1873 |
| `src/i18n/locales/zh.ts` | Added Chinese warning strings | 1872–1873 |
| `tests/unit/features/chat/ConversationLoadRecoveryCoordinator.test.ts` | Added 6 tests covering provisional warning behavior | 776–898 |
| `tests/unit/features/chat/LocalStreamMessagePersistence.test.ts` | Added 3 tests covering provisional warning removal on thread upgrade | 331–467 |

---

## 3. Implementation Details

### 3.1 Detection Logic

A conversation is considered "provisional-only" when:
- `conversation.backend === 'codex'`
- `getConversationBackendSessionId(conversation)` returns a string starting with `codex-local-`

### 3.2 Warning Notice

The warning is rendered as a persistent assistant notice card with:
- **Title**: "Backend continuity not yet established" / "后端连续性尚未建立"
- **Body**: "This conversation is saved locally, but backend continuity is not yet established. After a plugin reload, the next follow-up will start a fresh backend thread unless a real Codex thread id has already been established."
- **Tone**: `warning`
- **Marker**: `noticeMeta: { kind: 'codex-provisional-warning' }`

### 3.3 Trigger Points

The warning is checked at two conversation load paths:
1. **`loadConversation`** — when explicitly loading a conversation
2. **`activateTab`** — when activating a tab (including during `initializeFirstTab`)

### 3.4 Deduplication

Before appending, the coordinator checks `hasMatchingPersistentNotice` to prevent duplicate warnings in the same conversation.

### 3.5 Automatic Removal on Thread Upgrade

When `backendSessionId` is upgraded from a provisional `codex-local-*` id to a real thread id during stream finalization, `removeCodexProvisionalWarningIfUpgraded` filters out any message with `noticeMeta.kind === 'codex-provisional-warning'` from the conversation's messages array.

This is called from both:
- `persistLocalStreamOutcome` (main finalization path)
- `persistBackendSessionIdentityIfNeeded` (identity-only finalization path)

---

## 4. Test Coverage

### 4.1 Warning Append Tests (ConversationLoadRecoveryCoordinator)

Added 6 new tests in `ConversationLoadRecoveryCoordinator.test.ts`:

| Test | Description |
|------|-------------|
| `shows a persistent warning when loading a Codex conversation with a provisional session id` | RED → GREEN |
| `does not show a warning when loading a Codex conversation with a real thread id` | RED → GREEN |
| `does not show a warning for non-Codex backends` | RED → GREEN |
| `does not duplicate the warning if it already exists` | RED → GREEN |
| `shows a persistent warning when activating a tab with a provisional Codex session` | RED → GREEN |
| `does not show a warning when activating a tab with a real Codex thread id` | RED → GREEN |

### 4.2 Warning Removal Tests (LocalStreamMessagePersistence)

Added 3 new tests in `LocalStreamMessagePersistence.test.ts`:

| Test | Description |
|------|-------------|
| `removes the provisional warning when backendSessionId upgrades from provisional to real` | RED → GREEN |
| `keeps the provisional warning when backendSessionId stays provisional` | RED → GREEN |
| `does not remove unrelated notices when backendSessionId upgrades` | RED → GREEN |

**Test result**: 48/48 pass across both test files

---

## 5. Verification Results

### 5.1 Automated Tests

```bash
npx jest tests/unit/features/chat/ConversationLoadRecoveryCoordinator.test.ts tests/unit/features/chat/LocalStreamMessagePersistence.test.ts --no-coverage
# Test Suites: 2 passed, 2 total
# Tests:       48 passed, 48 total
```

### 5.2 Build

```bash
npm run build
# BUILD_ID: feature-codex-sdk-capability.202606100651
```

### 5.3 Deployment

- **Target**: `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/`
- **Files**: `main.js`, `manifest.json`, `styles.css`
- **BUILD_ID verified**: `feature-codex-sdk-capability.202606100651`

### 5.4 Runtime Proof

**Positive proof** (provisional conversation shows warning):
- Screenshot: `/tmp/opencodian-12c-provisional.png`
- Shows persistent notice card with title "后端连续性尚未建立" in a Codex conversation with `codex-local-*` session ID

**Negative proof** (real thread conversation does not show warning):
- Reviewer screenshot: `/tmp/opencodian-warning-absent-obsidian.png`
- Real resumed Codex conversation in Test Vault (`RESUME-PROOF-1781036095394`) shows no provisional warning notice in the normal chat surface
- Verified by unit tests (real thread ID → `appendPersistentNotice` not called; upgrade path → warning removed)

**Console errors**: Clean — no new errors after reload.

---

## 6. Honest Boundaries

- This checkpoint **only** adds the warning notice and its automatic cleanup. It does **not** add session browser launcher, app-server migration, approvalPolicy UI, image validation, or any other Codex seam.
- The warning is a **chat surface notice**, not a diagnostic-only toast.
- The warning respects the **multi-backend product rule**: it only appears when the conversation backend is `codex`.
- The warning is **persistent** (saved to conversation messages) so it survives plugin reload, but is **automatically removed** when backend continuity is established.
- The warning uses the **existing persistent notice card infrastructure** (`PersistentAssistantNoticeService`, `AssistantNoticeCardRenderer`).

---

## 7. Remaining Gaps

| Gap | Note |
|-----|------|
| Session browser launcher | Out of scope (checkpoint 12A) |
| App-server migration | Out of scope |
| approvalPolicy UI | Out of scope |
| Manual dismiss action for warning | Could be added if users request it (checkpoint 12D candidate) |

---

## 8. Next Smallest Recommended Batch

1. **Checkpoint 12D**: Add a manual dismiss action to the provisional warning notice so users can hide it after reading.
2. Or proceed to **Checkpoint 13A** (if defined) for the next Codex productization seam.

---

## 9. Changed Files Summary

```
src/features/chat/services/ConversationLoadRecoveryCoordinator.ts
src/features/chat/runtime/LocalStreamMessagePersistence.ts
src/core/types/chat.ts
src/features/chat/OpenCodianView.ts
src/i18n/locales/en.ts
src/i18n/locales/zh.ts
tests/unit/features/chat/ConversationLoadRecoveryCoordinator.test.ts
tests/unit/features/chat/LocalStreamMessagePersistence.test.ts
```
