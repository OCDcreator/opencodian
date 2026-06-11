# Checkpoint 11B: Codex Image Input Composer + Adapter Slice — Outcome

> **Date**: 2026-06-10
> **Executor**: OpenCode (kimi-for-coding/k2p6)
> **Worktree**: `codex-sdk-capability`
> **Branch**: `feature/codex-sdk-capability`
> **BUILD_ID**: `feature-codex-sdk-capability.202606100247`

---

## 1. Files Changed

### Source files (implementation)

| File | Change |
|------|--------|
| `src/core/agents/AgentCapability.ts` | Added `Images` capability |
| `src/core/agents/backend/AgentService.ts` | Added `images?: ImageAttachment[]` to `AgentChatSendRequest` |
| `src/core/agents/backend/CodexAdapter.ts` | Declared `Images` capability; implemented `buildCodexInput()` temp-file translation; `sendMessage()` now passes `UserInput[]` when images are present |
| `src/features/chat/runtime/SendPipelineTypes.ts` | Added `images?: ImageAttachment[]` to `sendStreamMessage` options |
| `src/features/chat/runtime/SendPipelineRuntime.ts` | Forward `preparedSend.images` into `sendStreamMessage` |
| `src/features/chat/runtime/UserMessageContentRenderer.ts` | Added `renderUserMessageImages()` gallery rendering |
| `src/features/chat/services/MessageSendPreparationService.ts` | Added `images` to `PrepareMessageSendOptions`, `PreparedMessageSend`, and `buildOptimisticUserMessage`; threaded through pipeline |
| `src/features/chat/services/ComposerInputShellCoordinator.ts` | Added capability-gated image picker button, file input, image chip rendering, and image attachment state |
| `src/features/chat/OpenCodianView.ts` | Implemented `hasImageInputCapability()` host seam; passed `images` through `handleComposerInputSubmission` and `sendStreamMessage` |
| `src/i18n/locales/en.ts` | Added `chat.image.attachImage`, `chat.image.removeImage` |
| `src/i18n/locales/zh.ts` | Added `chat.image.attachImage`, `chat.image.removeImage` |

### Bug fix during runtime verification

| File | Change | Reason |
|------|--------|--------|
| `src/features/chat/services/ComposerInputShellCoordinator.ts` | Append `fileInputEl` to `document.body` and remove it in `destroy()` | File input was created in memory but not attached to DOM, so programmatic file dispatch didn't work |

### Test files

| File | Change |
|------|--------|
| `tests/unit/core/agents/backend/CodexAdapter.test.ts` | Added 2 tests: image translation to `UserInput[]`, string fallback when no images |
| `tests/unit/core/agents/AgentCapability.test.ts` | Updated expected capability count to 23 (added `images`) |
| `tests/unit/features/chat/MessageSendPreparationService.test.ts` | Added 2 tests: `buildOptimisticUserMessage` with images, `prepareMessageSend` preserves images |
| `tests/unit/features/chat/UserMessageContentRenderer.test.ts` | Added 1 test: renders attached images in user messages |

### Module docs

| File | Change |
|------|--------|
| `docs/modules/core/agents/AgentCapability.md` | Mentioned `images` capability |
| `docs/modules/core/agents/backend/AgentService.md` | Documented `images` field in `AgentChatSendRequest` |
| `docs/modules/features/chat/runtime/SendPipelineTypes.md` | Documented `images` in transport port |
| `docs/modules/features/chat/runtime/UserMessageContentRenderer.md` | Documented image gallery rendering |
| `docs/modules/features/chat/services/ComposerInputShellCoordinator.md` | Documented image attachment UI |
| `docs/modules/features/chat/services/MessageSendPreparationService.md` | Documented `images` in options and prepared send |

### Graphify artifacts

| File | Change |
|------|--------|
| `graphify-out/GRAPH_REPORT.md` | Updated by `npm run graphify:update:src` |
| `graphify-out/graph.json` | Updated by `npm run graphify:update:src` |

---

## 2. What Capability Was Productized

**Codex image input in ordinary chat** — the smallest honest end-to-end seam:

1. **Composer image picker**: A capability-gated button (only visible when active backend declares `Images`) opens an HTML file picker accepting JPEG/PNG/GIF/WebP. Selected files are read as base64 and stored as `ImageAttachment[]`.
2. **Backend-neutral contract**: `AgentChatSendRequest` now carries an explicit `images?: ImageAttachment[]` field.
3. **Send pipeline passthrough**: Images flow through `PrepareMessageSendOptions` → `PreparedMessageSend` → `sendStreamMessage` → `AgentChatSendRequest` without being dropped.
4. **Codex adapter translation**: `CodexAdapter.sendMessage()` converts `ImageAttachment[]` to temporary files on disk, constructs a `UserInput[]` with `{ type: "text" }` + `{ type: "local_image", path }` entries, and passes that to `thread.runStreamed()`. Temp directories are cleaned up in `finally`.
5. **Optimistic user-message rendering**: `UserMessageContentRenderer` renders attached images as an inline thumbnail gallery below the text content.

---

## 3. Strongest Evidence

### Unit tests (all passing)

| # | Test | Evidence |
|---|------|----------|
| 1 | `CodexAdapter › DI seam › converts ImageAttachment[] to UserInput[] with temp files` | Proves adapter translates images to Codex `local_image` inputs |
| 2 | `CodexAdapter › DI seam › falls back to string payload when no images are provided` | Proves no regression to text-only sends |
| 3 | `buildOptimisticUserMessage › builds a user message with images` | Proves optimistic messages carry images |
| 4 | `MessageSendPreparationService › preserves images through the preparation pipeline` | Proves `PreparedMessageSend` and `userMessage.images` survive preparation |
| 5 | `UserMessageContentRenderer › renders attached images in user messages` | Proves optimistic rendering shows image gallery |
| 6 | `AgentCapability › should define all backend capabilities` | Proves `Images` capability is declared |

### Runtime proof (Test Vault, Codex backend)

| # | Evidence | Result |
|---|----------|--------|
| 1 | Composer image button visible | **PASS** — `.opencodian-composer-image-btn` rendered when Codex active |
| 2 | Image chip visible before send | **PASS** — Red TEST square chip with remove button shown in composer |
| 3 | Optimistic user message shows image | **PASS** — Screenshot shows "Describe this image" with red TEST thumbnail |
| 4 | Codex processes image correctly | **PASS** — Assistant response: "A simple graphic: a solid red square with the word TEST centered in white, all caps." |
| 5 | No console errors | **PASS** — `obsidian dev:errors` shows "No errors captured" before and after send |
| 6 | Image persisted in conversation | **PASS** — Runtime eval confirms `lastUserMessage.hasImages=true`, `imageCount=1`, `filename="test-red-square.png"` |
| 7 | BUILD_ID verified | **PASS** — Deployed `main.js` contains `feature-codex-sdk-capability.202606100247`; runtime active |

### Build/deploy

- `npm run verify` passed (0 errors, 1 pre-existing warning)
- `BUILD_ID`: `feature-codex-sdk-capability.202606100247`
- Deployed to Test Vault and BUILD_ID verified in `main.js`

---

## 4. Remaining Gaps

| Gap | Detail | Priority |
|-----|--------|----------|
| Clipboard paste | No `paste` event handler for images in composer | Low (nice-to-have) |
| Drag-and-drop | No dnd handler for images into composer | Low (nice-to-have) |
| Multi-image reordering | No UI to reorder attached images | Low (single image is honest minimum) |
| Image editing | No crop/resize/annotate flow | Out of scope |
| Assistant-side image preview | No special rendering for assistant messages referencing images | Low |
| OpenCode image path | OpenCode backend does not use the new `AgentChatSendRequest.images` field; it still uses its own `QueryOptions.images` path | Medium (architectural, not user-facing) |
| Temp file cleanup on crash | If Obsidian crashes during a Codex image send, temp files may persist until OS cleanup | Low (best-effort cleanup in `finally`) |

---

## 5. Blockers

**None.**

- No upstream SDK blockers — `local_image` support is verified
- No internal blockers — all 6 breakpoints from 11A audit are now bridged
- No test failures — 4540/4540 tests pass
- No lint errors — 0 errors, 1 pre-existing warning (test file line count)
- No runtime errors — `obsidian dev:errors` clean before and after image send

---

## 6. Next Smallest Suggestion

**Checkpoint 11C: Codex image input polish / edge cases**

Potential scope (only if needed):
1. Clipboard paste support for images
2. Drag-and-drop support for images into composer
3. Multi-image attachment and reordering
4. Image removal from optimistic message after send
5. Error handling when image file is too large

---

## 7. Verify/Build/Deploy Results

| Check | Command | Result |
|-------|---------|--------|
| Owner guard | `OWNER_GUARD_APPROVED='...' npm run verify` | PASS (Class B approved) |
| Module docs | `npm run check:module-docs` | PASS (29 targets) |
| Graphify | `npm run check:graphify` | PASS (fresh after update) |
| Devlog order | `npm run check:devlog-order` | PASS |
| Lint | `npm run lint` | PASS (0 errors, 1 pre-existing warning) |
| Typecheck | `npm run typecheck` | PASS |
| Tests | `npm run test` | PASS (4540/4540) |
| Build | `npm run build` | PASS |
| BUILD_ID | `feature-codex-sdk-capability.202606100247` | Verified in Test Vault `main.js` and runtime active |

---

## 8. Obsidian Runtime Evidence

### Test Vault deploy
- `main.js`, `manifest.json`, `styles.css` copied to `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/`
- BUILD_ID in deployed `main.js`: `feature-codex-sdk-capability.202606100247`

### Runtime artifacts

| # | Path | Description |
|---|------|-------------|
| 1 | `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/11b-01-initial-state.png` | Initial OpenCodian view with Codex backend active |
| 2 | `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/11b-02-after-image-attach.png` | Composer after programmatic image attachment (not yet visible) |
| 3 | `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/11b-03-image-chip-visible.png` | **Image chip visible in composer before send** — red TEST square with remove button |
| 4 | `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/11b-04-optimistic-message.png` | **Optimistic user message with image thumbnail** — "Describe this image" with red TEST image, plus Codex assistant response describing the image correctly |

### Runtime verification details

- **Active backend**: Codex (verified via `app.plugins.plugins.opencodian.agentServiceRegistry.getActive().kind`)
- **Images capability**: Declared and active (verified via `hasCapability('images')`)
- **Image button**: Visible in composer footer
- **File input**: Attached to DOM and functional
- **Conversation state**: Last user message has `hasImages=true`, `imageCount=1`, `filename="test-red-square.png"`, `mediaType="image/png"`
- **Console errors**: None before or after send

---

## 9. Explicit Truth Buckets

### Codex image input truth state after 11B

| Bucket | Item | Verdict |
|--------|------|---------|
| **已 pass** | `AgentChatSendRequest.images` contract exists | ✅ Type-safe, explicit field |
| **已 pass** | Send pipeline image passthrough | ✅ `PrepareMessageSendOptions` → `PreparedMessageSend` → `sendStreamMessage` |
| **已 pass** | CodexAdapter image handling | ✅ Converts `ImageAttachment[]` → temp files → `UserInput[]` → `thread.runStreamed()` |
| **已 pass** | Composer image attachment UI | ✅ Capability-gated button, file picker, image chips |
| **已 pass** | User message image rendering | ✅ `UserMessageContentRenderer` shows image gallery |
| **已 pass** | Codex `Images` capability declaration | ✅ Added to `AgentCapability` and `CodexAdapter` capabilities |
| **已 pass** | End-to-end code path | ✅ All 6 breakpoints from 11A are bridged in code |
| **已 pass** | **Runtime proof in Obsidian** | ✅ Image attached, sent through Codex, assistant correctly described image |
| **未接入** | Clipboard paste | ❌ Out of scope for 11B |
| **未接入** | Drag-and-drop | ❌ Out of scope for 11B |

### Honest statement

The Codex image input **code seam** is fully implemented end-to-end. All breakpoints identified in 11A are bridged. **Runtime proof has been obtained**: an actual image-bearing message was sent through the Codex backend inside Obsidian, and the assistant correctly described the attached image ("A simple graphic: a solid red square with the word TEST centered in white, all caps."). No console errors occurred.

The status of Codex image input is now **已 pass** for the core ordinary-chat seam.

---

*End of checkpoint 11B. Completed with runtime proof.*
