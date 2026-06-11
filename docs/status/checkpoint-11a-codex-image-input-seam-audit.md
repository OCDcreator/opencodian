# Checkpoint 11A: Codex Image Input Seam Audit

> **Date**: 2026-06-10
> **Auditor**: OpenCode (kimi-for-coding/k2p6)
> **Worktree**: `codex-sdk-capability`
> **Branch**: `feature/codex-sdk-capability`
> **Scope**: Audit-only — no product-code changes

## 1. Executive Summary

Codex image input (`local_image`) remains **未接入** (not integrated) in ordinary chat. This audit maps the exact seam breakpoints where the current send chain drops images before they reach the Codex SDK.

**Key finding**: The gap spans **6 distinct breakpoints** across 4 runtime owners. It is **not** a one-file change. However, the OpenCode path already has working image plumbing through `PromptRequestPart[]`, which means the infrastructure pattern exists and can be referenced.

**Recommendation**: The next implementation checkpoint should be a **medium-sized focused batch** (not a tiny one-file change, but not a full refactor either). The minimal truthful slice requires:
1. Composer file-picker UI (hidden behind capability check)
2. `AgentChatSendRequest` extension with explicit `images` field
3. Send pipeline passthrough of images to backend
4. CodexAdapter translation from `ImageAttachment[]` to Codex `UserInput[]`
5. Optimistic user-message rendering of images

Items 1–4 are required for any real user-facing seam. Item 5 is required for honest productization (users must see what they sent).

---

## 2. Truth Sources Verified

| Source | Finding |
|--------|---------|
| `node_modules/@openai/codex-sdk/dist/index.d.ts` | Confirmed: `type UserInput = { type: "text"; text: string } \| { type: "local_image"; path: string }` |
| `node_modules/@openai/codex-sdk/dist/index.d.ts` | Confirmed: `type Input = string \| UserInput[]` — `thread.runStreamed(input: Input, ...)` accepts arrays |
| `src/core/types/chat.ts:24` | `ImageAttachment { data: string, mediaType: ImageMediaType, filename?: string }` exists |
| `src/core/types/chat.ts:240` | `ChatMessage.images?: ImageAttachment[]` exists |
| `src/core/opencode/types.ts:75` | `QueryOptions.images?: ImageAttachment[]` exists (OpenCode path) |
| `src/core/opencode/OpenCodeContextPartSerializer.ts:32-38` | OpenCode path converts images to `file` parts with base64 data URLs |

---

## 3. Seam Breakpoint Map

### Breakpoint 1: Composer — No Image Attachment UI

**Owner**: Chat composer / input panel
**Location**: `src/features/chat/composerContext.ts` (no image handling), `src/features/chat/services/MessageSendPreparationService.ts`
**Evidence**: Grep for `image|file.*picker|attachment` in `src/features/chat/composer*` returns **zero matches**. The composer only handles:
- Text content (`content: string`)
- Context attachments (`PromptContextItem[]` — files, selections, current note)
- Slash commands
- Synthetic text parts

There is no drag-and-drop handler, no paste handler for images, no file picker button, no image attachment chip rendering.

**Gap**: Users have no way to attach an image to a message.

---

### Breakpoint 2: MessageSendPreparationService — No Images in Prepared Send

**Owner**: Message send preparation
**Location**: `src/features/chat/services/MessageSendPreparationService.ts`
**Evidence**:
- `PrepareMessageSendOptions` (line 82) has no `images` field
- `PreparedMessageSend` (line 92) has no `images` field
- `buildOptimisticUserMessage` (line 106) does not accept `images`
- The optimistic user message is built with only `content`, `contextAttachments`, and `parts` (line 117–124)

**Gap**: Even if a user could attach an image, the preparation service would drop it before creating the optimistic message or the send payload.

---

### Breakpoint 3: SendPipelineRuntime — Content Is String Only

**Owner**: Send pipeline orchestration
**Location**: `src/features/chat/runtime/SendPipelineRuntime.ts:183–210`
**Evidence**:
- `sendMessage(input: string | PrepareMessageSendOptions)` extracts `content` as a string
- `createStreamingExecution` passes `content: string` to `sendStreamMessage`
- `SendPipelineTransportPort.sendStreamMessage` signature (line 83) takes `content: string`, not image arrays

**Gap**: The pipeline's central execution path only knows about string content. Images never enter the streaming execution.

---

### Breakpoint 4: AgentChatSendRequest — No Explicit Images Field

**Owner**: Backend-neutral adapter interface
**Location**: `src/core/agents/backend/AgentService.ts:96–100`
**Evidence**:
```typescript
export interface AgentChatSendRequest {
  readonly sessionId: string;
  readonly content: string;
  readonly options?: Record<string, unknown>;
}
```

**Gap**: The backend-neutral request contract only carries a string `content`. Images could theoretically be smuggled through `options`, but:
- No caller does this today
- The type is `Record<string, unknown>` — untyped, unreliable
- The Codex adapter does not inspect `options` for images

---

### Breakpoint 5: CodexAdapter — Receives String, Not UserInput[]

**Owner**: Codex backend adapter
**Location**: `src/core/agents/backend/CodexAdapter.ts:274–334`
**Evidence**:
- `sendMessage(request: AgentChatSendRequest)` extracts `request.content` (a string)
- Line 311: `thread.runStreamed(request.content, { ... })` — passes string directly
- The adapter never inspects `request.options` for images
- The adapter has no code to translate `ImageAttachment[]` to Codex `UserInput[]`

**Contrast with OpenCode**: OpenCodeService receives `PromptTransportOptions` (which extends `QueryOptions` with `images`) and passes them to `OpenCodeContextPartSerializer`, which converts images to `file` parts. Codex has no equivalent.

**Gap**: This is the final backend boundary. Even if images survived all prior breakpoints, the Codex adapter would drop them by passing only a string to `thread.runStreamed()`.

---

### Breakpoint 6: UserMessageContentRenderer — Does Not Render Images

**Owner**: Chat message rendering
**Location**: `src/features/chat/runtime/UserMessageContentRenderer.ts:47–84`
**Evidence**:
- `renderUserMessageContent` renders:
  1. Text content (line 49–56)
  2. Context attachments (line 75–77)
  3. OMO user injections (line 79–81)
- `message.images` is **never referenced**
- There is no image thumbnail, no inline image rendering, no attachment list for images

**Gap**: Even if images were persisted on `ChatMessage.images`, users would not see them in the chat transcript. This breaks the honest productization rule: "users must see what they sent."

---

## 4. Comparison: OpenCode Image Path (Working Reference)

The OpenCode backend has a working image path that the Codex implementation can reference:

| Step | OpenCode Path | Codex Path |
|------|---------------|------------|
| 1. Service options | `QueryOptions.images?: ImageAttachment[]` | N/A — not in `AgentChatSendRequest` |
| 2. Part serialization | `OpenCodeContextPartSerializer.buildPromptRequestParts` converts images to `file` parts with base64 data URLs | N/A — no equivalent in Codex adapter |
| 3. Prompt payload | `PromptRequestPart[]` includes `file` parts | `thread.runStreamed(string, ...)` — only string |
| 4. Rendering | OpenCode server handles `file` parts with image URLs | Codex CLI expects filesystem `path` string |

**Key difference**: OpenCode accepts base64-encoded images inline via `file` parts. Codex SDK expects `local_image` with a **filesystem path** (`path: string`). This means Codex image input requires:
- Saving the image to a temp file (or referencing an existing file path)
- Passing the filesystem path to the SDK, not base64 data

This is an additional translation layer that the OpenCode path does not need.

---

## 5. Minimal Truthful Implementation Slice

To productize Codex image input in ordinary chat, the following are **required**:

### Required (Real User-Facing Seam)

| # | Owner | Work | Size |
|---|-------|------|------|
| R1 | Composer UI | Add image attachment button/file picker. Convert selected image to `ImageAttachment`. Render attachment chips. | Medium |
| R2 | `AgentChatSendRequest` | Extend interface with explicit `images?: ImageAttachment[]` field. | Small |
| R3 | Send pipeline | Thread `images` through `PrepareMessageSendOptions` → `PreparedMessageSend` → `sendStreamMessage`. | Small |
| R4 | CodexAdapter | Translate `ImageAttachment[]` → temp files → `UserInput[]` → `thread.runStreamed(userInputArray, ...)`. Handle cleanup. | Medium |
| R5 | Optimistic rendering | Add image rendering to `UserMessageContentRenderer`. | Small |

### Can Stay Hidden (Later Batch)

| # | Owner | Work | Reason |
|---|-------|------|--------|
| H1 | Clipboard paste | Handle paste events for images. | Nice-to-have; file picker is the honest minimum |
| H2 | Drag-and-drop | Handle drag-and-drop into composer. | Nice-to-have |
| H3 | Image editing | Crop, resize, annotate. | Far beyond minimum |
| H4 | Multi-image ordering | Reorder multiple attached images. | Single image is the honest minimum |

---

## 6. Blockers and Gaps

### No External Blockers

- SDK support exists (`local_image`)
- Types exist (`ImageAttachment`, `ChatMessage.images`)
- OpenCode path proves the infrastructure pattern works

### Internal Gaps

| Gap | Detail | Risk |
|-----|--------|------|
| Filesystem path translation | Codex requires `path: string` (filesystem path), not base64. Need temp file management. | Medium — needs cleanup, path validation |
| Electron file picker | Obsidian's `app.fileManager` or HTML `<input type="file">` must work in plugin context. | Low — standard web APIs work |
| Temp file lifecycle | Where to save temp images? Plugin directory? OS temp? Who cleans up? | Medium — needs design decision |
| Base64 → file conversion | `ImageAttachment.data` is base64. Need to decode and write to temp file. | Low — standard Node.js `fs` APIs |
| UI real estate | Composer already has context chips, model selector, send button. Adding image button needs layout care. | Low — manageable |

---

## 7. Next Smallest Suggestion

**Do NOT attempt a one-file change.** The gap spans 4 runtime owners and requires UI + contract + adapter + rendering work.

**Recommended next checkpoint**: `11B` — "Codex Image Input Composer + Adapter Slice"

Scope:
1. Add `images?: ImageAttachment[]` to `AgentChatSendRequest` and thread it through the send pipeline
2. Add a hidden-capability-gated image file picker to the composer (only visible when backend supports it)
3. Implement CodexAdapter translation: `ImageAttachment[]` → write temp files → `UserInput[]` → `thread.runStreamed()`
4. Render attached images in optimistic user messages

**Out of scope for 11B**: Clipboard paste, drag-and-drop, multi-image reordering, image editing.

---

## 8. Explicit Truth-Bucket Conclusion

### Supporting Evidence Only — Not Product Pass

These facts are real, but they are **not** ordinary-chat productized Codex capability and must not be read as `已 pass`:

| Evidence | Meaning |
|----------|---------|
| SDK `local_image` type support exists | Installed Codex SDK can accept local image input |
| `ImageAttachment` type exists | Repo data model already has an image attachment shape |
| `ChatMessage.images` field exists | Persisted chat messages can theoretically carry images |
| OpenCode path has image plumbing | Another backend path already demonstrates a viable infrastructure pattern |

### Codex Image Input Truth Buckets

| Bucket | Item | Verdict |
|--------|------|---------|
| **未接入** | Composer image attachment UI | ❌ No file picker, no paste handler, no drag-and-drop |
| **未接入** | Send pipeline image passthrough | ❌ `AgentChatSendRequest` has no `images` field |
| **未接入** | CodexAdapter image handling | ❌ Adapter passes only string to `thread.runStreamed()` |
| **未接入** | User message image rendering | ❌ `UserMessageContentRenderer` ignores `message.images` |
| **未接入** | **Codex image input (end-to-end)** | ❌ **Overall status: 未接入** |

**Honest statement**: Image input for Codex is **not** a quick one-file fix. The smallest truthful productization slice requires touching the composer UI, backend-neutral adapter contract, send pipeline, Codex adapter, and user-message rendering. This is a focused but medium-sized batch, not a tiny unblocker.

---

## 9. Files Changed

| File | Action | Description |
|------|--------|-------------|
| `docs/status/checkpoint-11a-codex-image-input-seam-audit.md` | **Created** | This audit document |
| `docs/status/codex-sdk-current-state-2026-06-09.md` | **Not changed** | Audit did not sharpen any existing status explanations; current doc is accurate |

---

## 10. Verification Status

| Check | Ran? | Result |
|-------|------|--------|
| `npm run verify` | Not run | No source code changes |
| `npm run build` | Not run | No source code changes |
| `npm run test` | Not run | No source code changes |
| Test Vault deploy | Not run | No deploy-relevant changes |
| SDK type verification | ✅ Run | `local_image` confirmed in `node_modules/@openai/codex-sdk/dist/index.d.ts` |
| Codebase seam mapping | ✅ Run | 6 breakpoints identified across 4 owners |
| OpenCode path reference | ✅ Run | `OpenCodeContextPartSerializer` image handling confirmed |

---

*End of audit. Stopped per execution pack §13: "After the seam audit is recorded, stop. Do not automatically open the implementation checkpoint."*
