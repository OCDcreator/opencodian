# Checkpoint 13A: Codex Settings-Side Backend Session Browser Launcher

## Date
2026-06-10

## Intent
Add a browse-only settings-side launcher for Codex that mirrors the Claude Code pattern without overstating Codex capabilities.

## In Scope
- `SettingsCodexSection.ts` UI addition only
- Codex-specific locale strings for launcher label/description/browse-only notice
- Unit tests for `SettingsCodexSection`
- Narrow truth-doc updates for this checkpoint

## Out of Scope
- No app-server migration
- No approval-policy UI
- No resume button from settings
- No upgrade of Codex browser list/detail truth bucket
- No persisted discovery / transcript preview work
- No changes to chat-side browser entry
- No image-input or warning-dismiss side quests
- No broad session-browser refactor

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `src/features/settings/SettingsCodexSection.ts` | Modified | Added `renderBackendSessionBrowserInfo()` method with info notice, launcher button, and browse-only notice |
| `src/i18n/locales/en.ts` | Modified | Added 5 Codex session browser translation keys |
| `src/i18n/locales/zh.ts` | Modified | Added 5 Codex session browser translation keys (Chinese) |
| `tests/unit/features/settings/SettingsCodexSection.test.ts` | Modified | Added 4 focused tests + button mock infrastructure |
| `docs/status/codex-sdk-current-state-2026-06-09.md` | Updated | Moved settings-side launcher from "未接入" to "已 pass", updated BUILD_ID and evidence paths |

## Implementation Details

The launcher mirrors the Claude Code settings-side pattern:

1. **Inline info notice** (`data-codex-session-browser-info`): Explains that sessions are read from live adapter memory only
2. **Button row** launching `BackendSessionBrowserModal` with:
   - `forcedBackendKind: 'codex'`
   - `supportsResume: () => false`
3. **Browse-only explanatory notice** (`data-codex-session-browser-browse-only`): States that resume requires the chat view session browser

## Tests Added

| Test | Assertion |
|------|-----------|
| `renders session browser launcher button in connection tab` | Button with label `t('settings.codex.sessionBrowser.launchButton')` exists and has onClick handler |
| `renders session browser info notice in connection tab` | `[data-codex-session-browser-info]` element exists |
| `opens modal with forcedBackendKind codex and supportsResume false` | Clicking button constructs `BackendSessionBrowserModal` with `forcedBackendKind: 'codex'` and `supportsResume()` returning `false` |
| `renders browse-only notice explaining no resume from settings` | `[data-codex-session-browser-browse-only]` element exists and contains browse-only notice text |

## Verification Results

### Automated
- **Targeted tests**: 14/14 pass (`SettingsCodexSection.test.ts`)
- **Full test suite**: 479 suites, 4563 tests pass
- **Lint**: 0 errors, 3 pre-existing warnings (unrelated)
- **Typecheck**: Pass
- **Build**: `BUILD_ID feature-codex-sdk-capability.202606101213`

### Deployment
- Deployed to `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/`
- BUILD_ID verified in deployed `main.js`

### Obsidian Runtime Evidence

1. **Active backend = codex**: Switched via eval, confirmed settings surface renders Codex section
2. **Settings shows launcher row**: Screenshot at `/Volumes/SDD2T/obsidian-vault-write/testvault/screenshots/13a-settings-codex.png`
3. **Click opens Codex-scoped modal**: Screenshot at `/Volumes/SDD2T/obsidian-vault-write/testvault/screenshots/13a-modal-codex.png`
4. **Modal is browse-only**: Footer DOM inspection shows only "View Details" and "Refresh" buttons — no resume button
5. **No console errors**: `obsidian dev:console level=error` reports no messages

## Honest Truth Buckets

### Newly productized by 13A
- **Codex settings-side session browser launcher (browse-only)**: `已 pass`

### Remains readback
- Codex backend session browser list/detail seam (limited to live adapter memory, no transcript history)

### Remains unintegrated
- Persisted Codex session discovery (official Codex app-server exposes richer thread/history surfaces, not integrated)
- Full transcript preview for Codex browser
- Settings-side resume from Codex browser
- Approval-policy UI
- App-server migration

### Not promoted by this launcher
- Persisted Codex session discovery
- Transcript preview
- Settings-side resume
- Official app-server history integration

## Blockers
- `check:owner-guard` fails due to pre-existing dirty guarded files (`src/features/chat/OpenCodianView.ts`, `src/main.ts`) from earlier checkpoints in this worktree — **not caused by 13A changes**

## Next Smallest Suggestion
- Checkpoint 13B: Codex settings-side session browser resume button (if and only if chat-side resume is proven stable and settings-side resume is product-requested)
- Or: Continue with existing backlog (approval-policy UI, app-server migration, etc.) based on product priority
