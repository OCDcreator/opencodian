# Checkpoint 11B: Codex Image Input Composer + Adapter Slice — Execution Pack

## 1. Intent

This file is the repo-local execution pack for the next *possible* implementation checkpoint after 11A.

It is intentionally **not executed yet**.

Target checkpoint:

- `11B`: Codex image input composer + adapter slice

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

## 3. Why 11B Exists

Checkpoint 11A established:

- official / installed SDK support for `local_image` is real
- Codex image input is still **未接入**
- the current gap spans multiple owners, but the smallest truthful implementation slice is still manageable

Accepted next slice from 11A:

1. composer image picker
2. `AgentChatSendRequest.images`
3. send-pipeline passthrough
4. Codex adapter temp-file translation to `local_image`
5. optimistic user-message image rendering

This is the minimum slice that creates a real ordinary-chat user path without pretending the whole image system is done.

## 4. Truth Sources To Read First

- `/Volumes/SDD2T/obsidian-vault-write/testvault/Opencodian的chat面板-结构梳理.md`
- `docs/status/codex-sdk-current-state-2026-06-09.md`
- `docs/status/checkpoint-11a-codex-image-input-seam-audit.md`
- `node_modules/@openai/codex-sdk/README.md`
- `node_modules/@openai/codex-sdk/dist/index.d.ts`
- `src/core/types/chat.ts`
- `src/core/agents/backend/AgentService.ts`
- `src/core/agents/backend/CodexAdapter.ts`
- `src/features/chat/services/MessageSendPreparationService.ts`
- `src/features/chat/runtime/SendPipelineRuntime.ts`
- `src/features/chat/runtime/UserMessageContentRenderer.ts`

## 5. Current Accepted Truth

### Already proven

- Codex SDK supports `local_image`
- repo already has `ImageAttachment`
- repo already has `ChatMessage.images`
- OpenCode path demonstrates an image-plumbing reference pattern

### Not yet integrated

- composer image attachment entry
- backend-neutral image send contract
- send pipeline image passthrough
- Codex adapter image translation
- ordinary user-message image rendering

## 6. Checkpoint Goal

Productize the smallest truthful end-to-end Codex image-input seam in ordinary chat.

At the end of this checkpoint, a user should be able to:

1. attach one or more local images from the composer
2. send them through the Codex backend
3. see the attached image(s) in their optimistic user message
4. have the adapter actually pass the images to Codex as `local_image`

This checkpoint does **not** need to implement a full polished media system.

## 7. In Scope

### Required implementation slice

1. **Composer image picker**
   - a small, capability-gated entry point in the ordinary composer surface
   - should fit the existing composer / context chip / send-shell language
2. **Backend-neutral contract**
   - add explicit `images?: ImageAttachment[]` to `AgentChatSendRequest`
3. **Send pipeline**
   - thread images through:
     - `PrepareMessageSendOptions`
     - `PreparedMessageSend`
     - `sendStreamMessage(...)`
4. **Codex adapter**
   - convert `ImageAttachment[]` into temp files
   - construct Codex `UserInput[]` with `{ type: "text" }` + `{ type: "local_image", path }`
   - ensure cleanup is deliberate and safe
5. **Optimistic user-message rendering**
   - render attached images in ordinary user messages so the product seam is honest

### Likely file map

Primary implementation files expected in this slice:

- `src/features/chat/services/ComposerInputShellCoordinator.ts`
  - likely owner for a small composer-side image attach button near the existing add-context / send controls
- `src/features/chat/services/MessageSendPreparationService.ts`
  - add `images` to preparation flow and optimistic user-message bootstrap
- `src/features/chat/runtime/SendPipelineTypes.ts`
  - widen `sendStreamMessage(...)` transport signature to carry images
- `src/features/chat/runtime/SendPipelineRuntime.ts`
  - forward prepared image payload into backend send
- `src/core/agents/backend/AgentService.ts`
  - widen `AgentChatSendRequest`
- `src/core/agents/backend/CodexAdapter.ts`
  - translate `ImageAttachment[]` to temp files + Codex `UserInput[]`
- `src/features/chat/runtime/UserMessageContentRenderer.ts`
  - render optimistic/saved user-message images

Potential supporting files if the chosen implementation shape needs them:

- `src/features/chat/OpenCodianView.ts`
  - only if host wiring for composer or send transport must pass new image payloads through
- `src/core/types/chat.ts`
  - only if `ImageAttachment` or `ChatMessage` shape needs narrow adjustments

### Required docs/tests

- focused tests first
- module docs for changed files
- checkpoint status doc
- update current-state doc only if truth bucket changes

## 8. Explicitly Out Of Scope

- no clipboard paste
- no drag-and-drop
- no multi-image reorder UI
- no crop/edit/annotate flow
- no assistant-side image preview system
- no OpenCode image refactor
- no MCP / approval / model-catalog work

## 9. Product Constraints

- follow the current multi-backend product rule:
  - multiple backends may be enabled
  - only active backend starts/connects
  - backend-specific behavior must remain scoped to active backend
- do **not** expose image UI on backends that cannot support it honestly
- if capability-gating is needed, keep it narrow and explicit

## 10. UI Expectations

Align with the current stable chat surface baseline:

- image attachment belongs to the ordinary composer / user-message path
- avoid inventing a floating media lab or separate modal-first workflow
- attached image state should be legible near existing composer/context affordances
- optimistic user messages must show what the user actually attached

## 11. Testing / Verification Requirements

### Before implementation

- add/adjust focused tests first

Likely test files to touch:

- `tests/unit/core/agents/backend/CodexAdapter.test.ts`
- `tests/unit/features/chat/MessageSendPreparationService.test.ts`
- `tests/unit/features/chat/UserMessageContentRenderer.test.ts`
- `tests/unit/features/chat/sendPipelineHostFactory.test.ts`
- any helper fixtures under:
  - `tests/unit/features/chat/MessageSendPreparationService.testSupport.ts`
  - `tests/unit/features/chat/SendPipelineRuntime.testSupport.ts`

Prefer adding tests for these concrete seams:

1. `AgentChatSendRequest.images` survives the send path
2. `PreparedMessageSend` preserves images through runtime execution
3. `CodexAdapter` converts image attachments into `local_image` user inputs
4. optimistic user messages visibly render attached images
5. no regression to existing context chips / normal text-only sends

### After implementation

1. run `npm run graphify:update:src` if `src/` changed
2. run:
   - `OWNER_GUARD_APPROVED='Checkpoint 11B Codex image input composer adapter slice' npm run verify`
3. because this is user-visible/runtime work:
   - run `npm run build`
   - deploy to Test Vault
   - verify latest BUILD_ID
   - reload plugin
   - check `obsidian dev:errors vault=testvault`

### Runtime proof required

Must prove all of:

1. attached image is visible in composer/user path before send
2. attached image appears in optimistic user message after send
3. Codex backend receives a real image-bearing send path
4. no new console / hydration / continuity regressions

Strong preferred proof for item 3:

- a focused adapter/runtime probe or screenshot/log showing the Codex path is no longer sending only `request.content` string
- if available, a deterministic unit test proving `thread.runStreamed(...)` receives `UserInput[]` including `local_image`

Save artifacts under:

- `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/`

## 12. Desired Outcome Shape

Good outcomes:

- one honest end-to-end Codex image-input slice works
- status becomes meaningfully better than `未接入`
- no overclaim beyond the actual implemented surface

Bad outcomes:

- partial hidden plumbing claimed as `已 pass`
- only adapter code implemented with no user-facing surface
- only UI implemented with no verified adapter send path
- ballooning into a general media system

## 13. Suggested Final Artifact

- `docs/status/checkpoint-11b-codex-image-input-composer-adapter-slice.md`

## 14. Required Final Report Shape

- files changed
- what capability was productized or diagnosed
- strongest evidence
- remaining gaps
- blockers
- next smallest suggestion
- verify/build/deploy results
- BUILD_ID
- Obsidian runtime evidence
- explicit truth buckets

## 15. Stop Rule

After the slice is implemented, verified, and documented, stop.

Do not automatically open the next checkpoint.
