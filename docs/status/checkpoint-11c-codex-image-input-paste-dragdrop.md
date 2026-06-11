# Checkpoint 11C: Codex Image Input Paste + Drag-and-Drop — Outcome

> **Date**: 2026-06-10
> **Executor**: OpenCode (kimi-for-coding/k2p6)
> **Worktree**: `codex-sdk-capability`
> **Branch**: `feature/codex-sdk-capability`
> **BUILD_ID**: `feature-codex-sdk-capability.202606100435`

---

## 1. Files Changed

### Source files (implementation)

| File | Change |
|------|--------|
| `src/features/chat/services/ComposerInputShellCoordinator.ts` | Added capability-gated `paste` event listener on textarea for image files; added `dragover`/`dragleave`/`drop` listeners on composer shell for image file drops; extracted `filterImageFiles()` and `processImageFiles()` helpers; refactored `handleFileSelection()` to reuse the new helpers |

### Test files

| File | Change |
|------|--------|
| `tests/unit/features/chat/ComposerInputShellCoordinator.test.ts` | Added 10 new tests covering: paste image attachment, paste non-image ignored, paste without capability ignored, drop image attachment, drop non-image ignored, drop without capability ignored, multi-image paste, multi-image drop, image clear on send, individual image removal |

### Graphify artifacts

| File | Change |
|------|--------|
| `graphify-out/GRAPH_REPORT.md` | Updated by `npm run graphify:update:src` |
| `graphify-out/graph.json` | Updated by `npm run graphify:update:src` |

---

## 2. What Capability Was Productized

**Codex image input via clipboard paste and drag-and-drop** — two additional ordinary composer entry paths:

1. **Clipboard paste**: When the active backend declares `Images` capability, pasting supported image types (JPEG/PNG/GIF/WebP) into the composer textarea attaches them as chips using the same `ImageAttachment[]` model as 11B's file picker. Non-image paste is ignored without breaking text input.
2. **Drag-and-drop**: When the active backend declares `Images` capability, dropping supported image files onto the composer shell attaches them similarly. Valid image drops are intercepted and prevented from falling through to the browser/app default file-open behavior. Non-image drops are ignored by the image-attachment path.
3. **Reused 11B pipeline**: Both paths feed into the existing `processImageFiles()` helper, which uses `readFileAsBase64()` and `renderImageChips()` — the same rendering and send pipeline as the file-picker path.

---

## 3. Strongest Evidence

### Unit tests (all passing)

| # | Test | Evidence |
|---|------|----------|
| 1 | `attaches pasted image files when backend has image input capability` | Proves clipboard paste creates image chips |
| 2 | `ignores pasted non-image files and allows text paste` | Proves non-image paste is not intercepted |
| 3 | `ignores image paste when backend lacks image input capability` | Proves capability gating works for paste |
| 4 | `attaches dropped image files when backend has image input capability` | Proves drag-and-drop creates image chips |
| 5 | `ignores dropped non-image files` | Proves non-image drops are ignored |
| 6 | `ignores image drop when backend lacks image input capability` | Proves capability gating works for drop |
| 7 | `attaches multiple pasted images and preserves send behavior` | Proves multi-image paste + send pipeline integration |
| 8 | `attaches multiple dropped images and preserves send behavior` | Proves multi-image drop + send pipeline integration |
| 9 | `clears attached images on send after paste` | Proves composer state resets correctly after paste → send |
| 10 | `removes individual image chips after paste` | Proves per-chip remove button works for paste-attached images |

**Total tests**: 63/63 pass in `ComposerInputShellCoordinator.test.ts`. Full suite: 4550/4550 pass.

### Runtime proof (Test Vault, Codex backend)

| # | Evidence | Result |
|---|----------|--------|
| 1 | Paste image chip visible in composer | **PASS** — `.opencodian-composer-image-chip` rendered after simulated paste with `image/png` file |
| 2 | Drop image chip visible in composer | **PASS** — `.opencodian-composer-image-chip` rendered after simulated drop with `image/jpeg` file |
| 3 | Optimistic user message shows image gallery | **PASS** — `.opencodian-user-image-gallery` with `.opencodian-user-image-thumb` present in last user message after send |
| 4 | No console errors | **PASS** — `obsidian dev:errors` shows "No errors captured" before and after send |
| 5 | BUILD_ID verified | **PASS** — Deployed `main.js` contains `feature-codex-sdk-capability.202606100435`; runtime active |
| 6 | Reviewer-independent real-image follow-up | **PASS** — Real `image/png` paste/drop chips rendered with `naturalWidth=1`; a real dropped PNG then flowed through send and produced a content-aware color answer in runtime |

### Build/deploy

- `npm run verify` passed (0 errors, 2 pre-existing warnings)
- `BUILD_ID`: `feature-codex-sdk-capability.202606100435`
- Deployed to Test Vault and BUILD_ID verified in `main.js`

---

## 4. Remaining Gaps

| Gap | Detail | Priority |
|-----|--------|----------|
| Multi-image reordering | No UI to reorder attached images | Low (single image is honest minimum) |
| Image editing | No crop/resize/annotate flow | Out of scope |
| Assistant-side image preview | No special rendering for assistant messages referencing images | Low |
| OpenCode image path | OpenCode backend does not use the new `AgentChatSendRequest.images` field; it still uses its own `QueryOptions.images` path | Medium (architectural, not user-facing) |
| Temp file cleanup on crash | If Obsidian crashes during a Codex image send, temp files may persist until OS cleanup | Low (best-effort cleanup in `finally`) |

---

## 5. Blockers

**None.**

- No upstream SDK blockers
- No internal blockers
- No test failures — 4550/4550 tests pass
- No lint errors — 0 errors, 2 pre-existing warnings
- No runtime errors — `obsidian dev:errors` clean before and after paste/drop/send

---

## 6. Next Smallest Suggestion

**Checkpoint 11D: Codex image input multi-image polish / edge cases** (only if needed)

Potential scope:
1. Multi-image attachment limit (e.g., max 4 images)
2. Image file size validation with user-facing error
3. Image removal from optimistic message after send
4. Copy-paste of images from within Obsidian (e.g., from notes)

Alternatively, the next batch could move on to a different Codex capability surface entirely (e.g., approval policy settings, model selection, or backend session browser settings-side launcher).

---

## 7. Verify/Build/Deploy Results

| Check | Command | Result |
|-------|---------|--------|
| Owner guard | `OWNER_GUARD_APPROVED='ComposerInputShellCoordinator image paste/drop' npm run verify` | PASS (Class B approved) |
| Module docs | `npm run check:module-docs` | PASS (29 targets) |
| Graphify | `npm run check:graphify` | PASS (fresh after update) |
| Devlog order | `npm run check:devlog-order` | PASS |
| Lint | `npm run lint` | PASS (0 errors, 2 pre-existing warnings) |
| Typecheck | `npm run typecheck` | PASS |
| Tests | `npm run test` | PASS (4550/4550) |
| Build | `npm run build` | PASS |
| BUILD_ID | `feature-codex-sdk-capability.202606100435` | Verified in Test Vault `main.js` and runtime active |

---

## 8. Obsidian Runtime Evidence

### Test Vault deploy
- `main.js`, `manifest.json`, `styles.css` copied to `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/`
- BUILD_ID in deployed `main.js`: `feature-codex-sdk-capability.202606100435`

### Runtime artifacts

| # | Path | Description |
|---|------|-------------|
| 1 | `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/11c-01-initial-state.png` | Initial OpenCodian view with Codex backend active |
| 2 | `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/11c-03-paste-chip-visible.png` | **Paste chip visible in composer** — image chip after simulated clipboard paste |
| 3 | `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/11c-04-drop-chip-visible.png` | **Drop chip visible in composer** — image chip after simulated drag-and-drop |
| 4 | `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/11c-05-optimistic-message.png` | **Optimistic user message with image gallery** — "Describe this dropped image" with image thumbnail visible |
| 5 | `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/11c-06-final-state.png` | Final state showing user message with image gallery |

### Runtime verification details

- **Active backend**: Codex (verified via `agentServiceRegistry.getActive().kind`)
- **Images capability**: Declared and active (verified via `hasCapability('images')`)
- **Paste path**: Simulated `ClipboardEvent` with `image/png` file → chip rendered after async FileReader completion
- **Drop path**: Simulated `DragEvent` with `image/jpeg` file → chip rendered after async FileReader completion
- **Send path**: Message "Describe this dropped image" sent with attached image → optimistic user message renders `.opencodian-user-image-gallery` with `.opencodian-user-image-thumb`
- **Reviewer-independent real PNG proof**: real `image/png` bytes were injected through both paste and drop paths; composer chip thumbs rendered with `naturalWidth=1`, and a follow-up send with the real dropped PNG returned a color answer from Codex in the live runtime
- **Console errors**: None before or after paste/drop/send

---

## 9. Explicit Truth Buckets

### Codex image input truth state after 11C

| Bucket | Item | Verdict |
|--------|------|---------|
| **已 pass** | `AgentChatSendRequest.images` contract exists | ✅ Type-safe, explicit field |
| **已 pass** | Send pipeline image passthrough | ✅ `PrepareMessageSendOptions` → `PreparedMessageSend` → `sendStreamMessage` |
| **已 pass** | CodexAdapter image handling | ✅ Converts `ImageAttachment[]` → temp files → `UserInput[]` → `thread.runStreamed()` |
| **已 pass** | Composer image attachment UI (file picker) | ✅ Capability-gated button, file picker, image chips |
| **已 pass** | Composer image attachment UI (clipboard paste) | ✅ Capability-gated paste handler, image chips |
| **已 pass** | Composer image attachment UI (drag-and-drop) | ✅ Capability-gated drop handler, visual drag-over state, image chips |
| **已 pass** | User message image rendering | ✅ `UserMessageContentRenderer` shows image gallery |
| **已 pass** | Codex `Images` capability declaration | ✅ Added to `AgentCapability` and `CodexAdapter` capabilities |
| **已 pass** | End-to-end code path | ✅ All breakpoints from 11A are bridged in code |
| **已 pass** | **Runtime proof in Obsidian** | ✅ Paste, drop, and send all verified with actual DOM evidence |

### Honest statement

The Codex image input **ordinary chat surface** now supports three entry paths:
1. File picker button (11B)
2. Clipboard paste (11C)
3. Drag-and-drop (11C)

All three are capability-gated, reuse the same `ImageAttachment[]` model and send pipeline, and have been verified in the Obsidian runtime with clean console error logs.

The status of Codex image input ordinary chat surface is now **已 pass** for all three entry paths.

---

*End of checkpoint 11C. Completed with runtime proof.*
