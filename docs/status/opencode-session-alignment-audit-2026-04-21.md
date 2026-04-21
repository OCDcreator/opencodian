# OpenCode session alignment audit

> Date: 2026-04-21
> Scope: architecture audit only; no runtime code changes in this report.
> Current project: `C:\Users\lt\Desktop\Write\custom-project\opencodian`
> Reference project: `C:\Users\lt\Desktop\Write\open-source-project\AI-tools-agents\opencode`

## Final verdict

- **Is OpenCodian fully aligned with OpenCode's session mechanism?** `基本是但仍有关键差异`
- **Are session capabilities fully provided by the OpenCode SDK / native OpenCode session runtime?** `不是`

OpenCodian now has a real canonical `session/message/part` graph, but the active session runtime is still hybrid. The strongest local truth owner is `OpenCodeService` plus `OpenCodeSessionStateStore`; however render, reload, finalization, stream rendering, and historical `ChatMessage` compatibility still rely on OpenCodian-owned compensation layers.

## Architecture determination table

| Area | Current owner | OpenCode alignment | Pure SDK-owned | Evidence |
| --- | --- | --- | --- | --- |
| session source of truth | Canonical graph in `OpenCodeSessionStateStore`, populated by `OpenCodeService`; UI still keeps `Conversation.messages` as a fallback/merge source | Partial | No | `src/core/opencode/OpenCodeSessionStateStore.ts:45`, `src/core/opencode/OpenCodeService.ts:663`, `src/features/chat/services/ConversationRenderService.ts:252` |
| send | `SendPipelineRuntime` and `MessageSendPreparationService` prepare send, seed optimistic user message, then pass structured parts to `OpenCodeService` | Partial | No | `src/features/chat/runtime/SendPipelineRuntime.ts:48`, `src/features/chat/services/MessageSendPreparationService.ts:199`, `src/core/opencode/OpenCodeService.ts:834` |
| stream | OpenCodian transforms SDK/legacy stream events into canonical mutations plus local legacy chunks | Partial | No | `src/core/opencode/OpenCodeStreamingRuntimeCoordinator.ts:370`, `src/core/opencode/OpenCodeStreamEventTransformer.ts:361`, `src/features/chat/OpenCodianView.ts:4922` |
| sync event | Non-`session.diff` events now mutate canonical state, but tab routing and visible/background sync orchestration remain local | Partial | No | `src/core/opencode/OpenCodeService.ts:1111`, `src/features/chat/services/ConversationSessionSignalRuntime.ts:73`, `src/features/chat/services/ConversationSyncBridge.ts:203` |
| reload | Authoritative reload remains an OpenCodian coordinator; canonical gaps and `session.diff` fall back to server reload | Not fully aligned | No | `src/features/chat/services/ConversationAuthoritativeReloadCoordinator.ts:85`, `src/features/chat/services/ConversationSyncBridge.ts:274`, `src/features/chat/services/ConversationSessionSignalRuntime.ts:75` |
| finalization | OpenCodian performs post-stream sync, fingerprint comparison, render follow-up, todos refresh, and persistence | Not fully aligned | No | `src/features/chat/services/MessageFinalizationService.ts:90`, `src/features/chat/services/MessageFinalizationService.ts:156` |
| turn assembly | Local `ConversationTurnViewModelBuilder` builds turns from canonical state, then hydrates them back to `ChatMessage` | Data-model aligned, implementation-local | No | `src/features/chat/services/ConversationTurnViewModelBuilder.ts:45`, `src/features/chat/services/ConversationRenderService.ts:278` |
| command / shell / plugin injection | Prompt synthetic parts and command parts passthrough exist; shell composer is still not active in the stable view | Partial | No | `src/core/opencode/OpenCodeSessionControlOrchestrator.ts:363`, `src/features/chat/services/SlashCommandExecutionService.ts:206`, `src/features/chat/OpenCodianView.ts:765` |
| render input model | Canonical state is converted into local turn view models and then `ChatMessage`; fallback merge still preserves client-only fields | Not fully aligned | No | `src/core/opencode/OpenCodeService.ts:1622`, `src/core/opencode/OpenCodeMessageNormalizationMapper.ts:254`, `src/features/chat/services/ConversationAuthoritativeMessageMergeCoordinator.ts:15` |

## Key gaps

### 1. `Conversation.messages` is still a parallel runtime truth source

`ConversationRenderService.resolveConversationRenderMessages()` builds canonical render messages when possible, but still merges them with fallback `ChatMessage[]`. This is useful for compatibility, but it means runtime rendering is not purely derived from the canonical `session/message/part` graph.

- Status: **unfinished divergence**
- Evidence: `src/features/chat/services/ConversationRenderService.ts:252`
- Risk: live rendering can differ from reload rendering when fallback fields preserve stale content, tool calls, stream state, or structured payloads.

### 2. Authoritative reload is still a local compensation system

`ConversationAuthoritativeReloadCoordinator` still owns server snapshot fetch, hydration, merge, fingerprinting, persistence, and background task sync markers. `session.diff` still schedules this path instead of becoming just another canonical reducer mutation.

- Status: **unfinished divergence**
- Evidence: `src/features/chat/services/ConversationAuthoritativeReloadCoordinator.ts:85`, `src/features/chat/services/ConversationSessionSignalRuntime.ts:75`
- Risk: reload can still become a second truth path rather than a correction pass over the same canonical state.

### 3. Finalization still proves the live path is not unified

`MessageFinalizationService.finalizeAfterStream()` can request post-stream server sync, compare visual fingerprints, and apply a render follow-up. This exists because the streamed/live view is not yet guaranteed to equal the authoritative canonical/reloaded view.

- Status: **unfinished divergence**
- Evidence: `src/features/chat/services/MessageFinalizationService.ts:90`
- Risk: blank-block style bugs can still hide until finalization or reload repairs the local view.

### 4. Stream handling is still a local bridge

The stream coordinator applies canonical mutations before yielding legacy chunks, but the visible UI still consumes converted local chunks through `StreamChunkRouter` and `OpenCodianView.convertToStreamingChunk()`.

- Status: **necessary bridge, not pure SDK ownership**
- Evidence: `src/core/opencode/OpenCodeStreamingRuntimeCoordinator.ts:370`, `src/features/chat/runtime/StreamChunkRouter.ts:194`, `src/features/chat/OpenCodianView.ts:4922`
- Risk: tool-first, reasoning-first, or text-late assistant parts can still diverge between the canonical graph and the live DOM shell.

### 5. Plugin-injected prompt handling is improved but not native-equivalent

Synthetic injected text can now travel as structured parts through prompt send. That is a strong compatibility improvement. It is still not the same as OpenCode's native server-side `chat.message` and `experimental.chat.messages.transform` plugin hooks owning message transformation.

- Status: **partially aligned**
- Evidence: `src/features/chat/services/MessageSendPreparationService.ts:199`, `src/core/opencode/OpenCodePromptRequestBuilder.ts:102`
- Reference evidence: `C:\Users\lt\Desktop\Write\open-source-project\AI-tools-agents\opencode\packages\opencode\src\session\prompt.ts:1234`, `C:\Users\lt\Desktop\Write\open-source-project\AI-tools-agents\opencode\packages\opencode\src\session\prompt.ts:1471`
- Risk: plugin injection that depends on server-side message transform semantics may still not replay identically through OpenCodian's client-prepared synthetic parts.

### 6. Shell submission is not unified in the stable view

The composer can parse shell submissions, and session shell request normalization exists, but the stable `OpenCodianView` still ignores shell submissions.

- Status: **unfinished divergence**
- Evidence: `src/features/chat/OpenCodianView.ts:765`, `src/core/opencode/OpenCodeSessionControlOrchestrator.ts:392`
- Risk: shell-mode parity with OpenCode remains a future seam, not a delivered stable capability.

## Blank block judgement

The blank block / "reply appears only after reload" class of issues is **mitigated but not architecturally eradicated**.

Most likely residual chains:

1. **Canonical/fallback merge drift**: canonical render output is merged with historical `ChatMessage` fields, so live and reload paths can still differ.
   - Evidence: `src/features/chat/services/ConversationRenderService.ts:252`, `src/features/chat/services/ConversationAuthoritativeMessageMergeCoordinator.ts:15`
2. **Stream chunk vs canonical part timing**: stream mutations write canonical state, but visible rendering still depends on local chunks and stream controller behavior.
   - Evidence: `src/core/opencode/OpenCodeStreamingRuntimeCoordinator.ts:370`, `src/features/chat/runtime/StreamChunkRouter.ts:194`
3. **Post-stream finalization repair**: finalization can still perform server sync and render follow-up, meaning live render is not the sole canonical outcome.
   - Evidence: `src/features/chat/services/MessageFinalizationService.ts:156`
4. **Hydration back into `ChatMessage`**: canonical parts are still folded into `content`, `contentBlocks`, `toolCalls`, `structured`, and `parts` for the existing renderer.
   - Evidence: `src/core/opencode/OpenCodeMessageNormalizationMapper.ts:254`

## Plugin hook / injected prompt judgement

OpenCodian now has **stronger compatibility**, but not full native equivalence.

Aligned pieces:

- Ordinary prompt sends use stable `messageID + parts[]`.
- Synthetic injected text can travel as explicit synthetic text parts.
- Command requests can pass structured `parts` through the session-control seam.

Remaining mismatch:

- Slash commands use a command execution path followed by background sync rather than the exact same live prompt pipeline.
- Shell composer submissions are typed but ignored in the stable view.
- OpenCode's server-side plugin hooks can transform saved/user/model message state in places that OpenCodian's client-side synthetic part preparation cannot fully mirror.

## Required next step

Do **one focused architecture slice**:

> Make canonical `session/message/part` state the only render/finalization/reload input, and demote `Conversation.messages` to persistence/cache metadata rather than a parallel render truth.

This should be done before adding new command/shell/plugin-injection features. Otherwise new flows will keep attaching to the existing compensation layer and preserve the same drift risks.

## Suggested implementation constraints

- Do not touch `reference-projects/`.
- Keep SDK/legacy HTTP fallback behavior unless the current code proves a path is dead.
- Preserve OpenCodian's current UI shell and styling.
- Prefer deleting or narrowing compensation once canonical rendering is proven, not adding a third truth source.
- Add focused regressions for:
  - live stream and reload producing the same assistant turn input;
  - tool-first assistant parts not rendering a blank assistant block;
  - plugin synthetic parts surviving reload without fallback `ChatMessage.content`;
  - finalization comparing canonical fingerprints rather than visual-only `ChatMessage` fields.
- For behavior changes, run the repo validation required by `AGENTS.md`; if runtime UI changes are deploy-relevant, follow build and Test Vault deployment rules.

## Follow-up prompt for a new session

```text
你在 `C:\Users\lt\Desktop\Write\custom-project\opencodian` 工作。请先阅读并严格基于这份审计报告执行：

- `docs/status/opencode-session-alignment-audit-2026-04-21.md`
- 参考项目：`C:\Users\lt\Desktop\Write\open-source-project\AI-tools-agents\opencode`

目标：不要泛泛重构，也不要新增第三套状态。请做一个最小但关键的架构切片：让 canonical `session/message/part` state 成为 render / finalization / reload 的唯一输入，并把 `Conversation.messages` 降级为 persistence/cache metadata 或兼容输出，而不是继续作为并行 render truth。

必须先验证当前代码，不要假设报告仍然完全最新。重点检查：

- `src/features/chat/services/ConversationRenderService.ts`
- `src/features/chat/services/ConversationTurnViewModelBuilder.ts`
- `src/features/chat/services/ConversationAuthoritativeReloadCoordinator.ts`
- `src/features/chat/services/ConversationAuthoritativeMessageMergeCoordinator.ts`
- `src/features/chat/services/ConversationSyncBridge.ts`
- `src/features/chat/services/MessageFinalizationService.ts`
- `src/core/opencode/OpenCodeService.ts`
- `src/core/opencode/OpenCodeSessionStateStore.ts`

实现要求：

1. 先给一个小计划，明确本轮只解决 canonical render/finalization/reload 输入统一，不处理 shell UI 新功能。
2. 优先让 `ConversationRenderService` 直接消费 canonical turn/render model；如果必须保留 fallback，只允许作为 canonical 缺失时的临时降级路径，不能和 canonical 输出 merge 成并行 truth。
3. 把 authoritative reload / sync 的职责收束为更新 canonical snapshot 或 canonical-derived render input，不再重新以 `ChatMessage[]` 作为事实源做大规模字段保留。
4. 把 finalization 的 drift 判断改向 canonical fingerprint / canonical render input，而不是主要比较 visual `ChatMessage` 字段。
5. 保留现有 UI 外观、footer、notice、question、OMO、tool rendering 行为。
6. 添加或更新 focused tests，至少覆盖 live stream vs reload render input 一致、tool-first assistant parts、plugin synthetic parts reload、finalization canonical drift。
7. 遵守 `AGENTS.md`：不动 `reference-projects/`；如果改动 runtime 行为，至少跑 focused tests，再视范围跑 `npm run build` / `npm run verify`。若触及 deploy-relevant runtime 文件并成功 build，按 Test Vault 部署和 `BUILD_ID` 验证规则执行。

完成后请提交一个聚焦 commit，并在最终回复中说明：

- 改了哪些文件；
- 哪些本地补偿被删除或降级；
- canonical state 现在在哪些环节成为唯一输入；
- 跑过哪些验证；
- 是否部署到 Test Vault，以及对应 `BUILD_ID`（如果适用）。
```
