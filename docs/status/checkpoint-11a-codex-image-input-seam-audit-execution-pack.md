# Checkpoint 11A: Codex Image Input Seam Audit — Execution Pack

## 1. Intent

This file is the repo-local execution pack for the next possible checkpoint after 10C.

It is intentionally an **audit-first** checkpoint.

Target checkpoint:

- `11A`: Codex image input seam audit

## 2. Non-Negotiable Constraints

- Work only in:
  - `/Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/.worktrees/codex-sdk-capability`
- Do not touch the main workspace
- Use OpenCode with:
  - `providerID="kimi-for-coding"`
  - `modelID="k2p6"`
- Run `opencode_setup` first
- Keep scope narrow
- Stop after this checkpoint

## 3. Why 11A Exists

Current truth after 10C:

- `webSearchMode` is now sharply understood as real semantics below ordinary-chat visibility
- the next higher-value unfinished Codex seam is **image input**

Official and installed-SDK truth already show that Codex supports local image input:

- SDK README documents `thread.run([{ type: "text", ... }, { type: "local_image", path: ... }])`
- installed SDK types include `Input = string | UserInput[]` and `UserInput` includes `local_image`

But the current OpenCodian product path still shows:

- `Image input (`local_image`) | 未接入 | No file picker`

This checkpoint exists to determine the smallest truthful implementation slice and the exact place where the current send chain drops images.

## 4. Truth Sources To Read First

- `/Volumes/SDD2T/obsidian-vault-write/testvault/Opencodian的chat面板-结构梳理.md`
- `docs/status/codex-sdk-current-state-2026-06-09.md`
- `node_modules/@openai/codex-sdk/README.md`
- `node_modules/@openai/codex-sdk/dist/index.d.ts`
- `src/core/types/chat.ts`
- `src/features/chat/services/MessageSendPreparationService.ts`
- `src/features/chat/runtime/SendPipelineRuntime.ts`
- `src/features/chat/runtime/UserMessageContentRenderer.ts`
- `src/core/opencode/OpenCodePromptRequestBuilder.ts`
- `src/core/opencode/OpenCodeContextPartSerializer.ts`
- `src/core/agents/backend/CodexAdapter.ts`

## 5. Current Accepted Truth

### Already proven

- Official / installed SDK support for `local_image` exists
- Repo has a general `ImageAttachment` type
- OpenCode-side prompt serialization already has image-aware pathways

### Not proven / not productized

- any ordinary Codex chat image-input UI
- any Codex adapter handling of image-bearing sends
- any stable user-message image rendering path in ordinary chat
- whether the smallest truthful slice is:
  - composer/file-picker only
  - send-pipeline passthrough only
  - optimistic user-message rendering too
  - or all of the above

## 6. Checkpoint Goal

Answer these exact questions:

1. Where does the current OpenCodian send path lose image input before it reaches Codex?
2. What is the smallest truthful end-to-end slice that would make Codex image input productizable in ordinary chat?
3. Which parts are required for a real user-facing seam, and which can stay hidden for a later batch?
4. Is the right next implementation checkpoint:
   - a small product slice
   - or a larger refactor that should be avoided for now?

## 7. In Scope

- codebase audit of the current image path and its gaps
- mapping:
  - composer / attachment entry
  - optimistic user-message persistence
  - prepared send payload
  - backend-neutral send path
  - Codex adapter boundary
  - ordinary user-message rendering
- recommend the smallest truthful productization slice
- status-doc updates if the conclusion becomes clearer

## 8. Explicitly Out Of Scope

- no product-code implementation unless a tiny unblocker is absolutely required
- no generic multimedia system
- no non-Codex image redesign work
- no approvalPolicy work
- no MCP management work
- no model catalog work
- no arbitrary schema/structured-output work

## 9. Preferred Investigation Order

1. **Official surface**
   - confirm Codex supports `local_image`
2. **Current repo data model**
   - confirm existing image-related types / message fields
3. **Current send-chain ownership**
   - identify where images are currently omitted before backend send
4. **Current rendering ownership**
   - identify whether ordinary user messages can already render images
5. **Minimal slice decision**
   - choose the smallest truthful batch that can reach ordinary chat

## 10. Desired Outcome Shape

Good outcomes:

- a sharp diagnosis of the exact seam breakpoints
- a recommendation like:
  - “next batch can be small and focused”
  - or
  - “current gap spans too many owners; do not pretend it is a one-file change”

Bad outcomes:

- speculative implementation without first mapping the full seam
- pretending partial plumbing equals productized image input
- promoting image input beyond `未接入` without real end-to-end evidence

## 11. Suggested Final Artifact

- `docs/status/checkpoint-11a-codex-image-input-seam-audit.md`

Update `docs/status/codex-sdk-current-state-2026-06-09.md` only if the audit sharpens the status explanation.

## 12. Required Final Report Shape

- files changed
- what was diagnosed
- strongest evidence
- remaining gaps
- blockers
- next smallest suggestion
- explicit truth-bucket conclusion for Codex image input

## 13. Stop Rule

After the seam audit is recorded, stop.

Do not automatically open the implementation checkpoint.
