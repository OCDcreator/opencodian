# OpenCode Session Message Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 OpenCodian 的会话消息处理迁移到更接近 OpenCode 桌面端的 `session/message/part` 驱动模型，解决偶发空白 assistant 块与插件注入难适配问题，同时保留现有 OpenCodian 样式渲染外壳。

**Architecture:** 先建立“规范会话真相层”，把发送、流式事件、sync-event、reload/hydration 都收敛到同一份 canonical session graph；再在 chat 层把 canonical graph 组装成 turn view-model，并继续使用现有 DOM/CSS 宿主进行渲染。权威 reload 保留，但降级为补偿与纠偏路径，不再承担主渲染职责。

**Tech Stack:** TypeScript, Jest, OpenCode SDK v2 bridge, existing OpenCodian chat services, module docs guard, Obsidian plugin runtime

---

## Reference Map

**Primary reference repo**

- `C:\Users\lt\Desktop\Write\open-source-project\AI-tools-agents\opencode`

**Optional in-repo mirror for quick lookup**

- `reference-projects/opencode`

**High-value reference files**

- 请求构造
  - `C:\Users\lt\Desktop\Write\open-source-project\AI-tools-agents\opencode\packages\app\src\components\prompt-input\build-request-parts.ts`
  - `C:\Users\lt\Desktop\Write\open-source-project\AI-tools-agents\opencode\packages\app\src\components\prompt-input\submit.ts`
- 前端 sync reducer
  - `C:\Users\lt\Desktop\Write\open-source-project\AI-tools-agents\opencode\packages\app\src\context\global-sync\event-reducer.ts`
  - `C:\Users\lt\Desktop\Write\open-source-project\AI-tools-agents\opencode\packages\app\src\context\global-sync.tsx`
- turn 组装 / part 渲染
  - `C:\Users\lt\Desktop\Write\open-source-project\AI-tools-agents\opencode\packages\ui\src\components\session-turn.tsx`
  - `C:\Users\lt\Desktop\Write\open-source-project\AI-tools-agents\opencode\packages\ui\src\components\message-part.tsx`
- 服务端 prompt / plugin hook / session persistence
  - `C:\Users\lt\Desktop\Write\open-source-project\AI-tools-agents\opencode\packages\opencode\src\session\prompt.ts`
  - `C:\Users\lt\Desktop\Write\open-source-project\AI-tools-agents\opencode\packages\opencode\src\session\processor.ts`
  - `C:\Users\lt\Desktop\Write\open-source-project\AI-tools-agents\opencode\packages\opencode\src\session\session.ts`
  - `C:\Users\lt\Desktop\Write\open-source-project\AI-tools-agents\opencode\packages\opencode\src\sync\index.ts`

## File Structure And Ownership

### Create

- `src/core/opencode/OpenCodeSessionStateStore.ts`
  - 规范会话真相层 owner。
  - 负责 `message info` / `message part` 的 upsert、remove、delta merge、full snapshot replace。
- `tests/unit/core/opencode/OpenCodeSessionStateStore.test.ts`
  - 覆盖排序、增量归并、删除、snapshot 替换。
- `docs/modules/core/opencode/OpenCodeSessionStateStore.md`
  - 模块职责、输入输出、与 `OpenCodeService` 的关系。
- `src/features/chat/services/ConversationTurnViewModelBuilder.ts`
  - 将 canonical session graph 组装为 user turn + assistant/tool/reasoning turn view-model。
- `tests/unit/features/chat/ConversationTurnViewModelBuilder.test.ts`
  - 覆盖 tool-first、text-late、error/interrupted、reload/live 一致性。
- `docs/modules/features/chat/services/ConversationTurnViewModelBuilder.md`
  - turn builder 的 owner 说明。

### Modify

- `src/core/opencode/OpenCodeService.ts`
- `src/core/opencode/OpenCodePromptRequestBuilder.ts`
- `src/core/opencode/OpenCodeContextPartSerializer.ts`
- `src/core/opencode/OpenCodeStreamEventTransformer.ts`
- `src/core/opencode/OpenCodeSyncEventRuntimeCoordinator.ts`
- `src/core/opencode/OpenCodeSessionControlOrchestrator.ts`
- `src/core/opencode/types.ts`
- `src/features/chat/services/MessageSendPreparationService.ts`
- `src/features/chat/services/ConversationSessionSignalRuntime.ts`
- `src/features/chat/services/ConversationSyncBridge.ts`
- `src/features/chat/services/ConversationAuthoritativeSyncCoordinator.ts`
- `src/features/chat/services/MessageFinalizationService.ts`
- `src/features/chat/services/ConversationRenderService.ts`
- `src/features/chat/services/ComposerInputShellCoordinator.ts`

### Existing tests to extend

- `tests/unit/core/opencode/OpenCodePromptRequestBuilder.test.ts`
- `tests/unit/core/opencode/OpenCodeStreamEventTransformer.test.ts`
- `tests/unit/core/opencode/OpenCodeSyncEventRuntimeCoordinator.test.ts`
- `tests/unit/core/opencode/OpenCodeService.messageCompatibility.test.ts`
- `tests/unit/core/opencode/OpenCodeService.sdkStreamEvents.test.ts`
- `tests/unit/core/opencode/OpenCodeService.sdkCrudSync.test.ts`
- `tests/unit/core/opencode/OpenCodeSessionControlOrchestrator.test.ts`
- `tests/unit/features/chat/MessageSendPreparationService.test.ts`
- `tests/unit/features/chat/ConversationSyncBridge.test.ts`
- `tests/unit/features/chat/MessageFinalizationService.test.ts`
- `tests/unit/features/chat/ConversationRenderService.test.ts`
- `tests/unit/features/chat/ConversationRenderService.renderFlows.test.ts`
- `tests/unit/features/chat/ComposerInputShellCoordinator.test.ts`
- `tests/unit/features/chat/ComposerInputShellCoordinatorSkills.test.ts`

### Existing docs to refresh

- `docs/modules/core/opencode/OpenCodeService.md`
- `docs/modules/core/opencode/OpenCodePromptRequestBuilder.md`
- `docs/modules/core/opencode/OpenCodeStreamEventTransformer.md`
- `docs/modules/core/opencode/OpenCodeSyncEventRuntimeCoordinator.md`
- `docs/modules/features/chat/services/MessageSendPreparationService.md`
- `docs/modules/features/chat/services/ConversationSyncBridge.md`
- `docs/modules/features/chat/services/MessageFinalizationService.md`
- `docs/modules/features/chat/services/ConversationRenderService.md`

---

### Task 1: Introduce the canonical session graph owner

**Files:**
- Create: `src/core/opencode/OpenCodeSessionStateStore.ts`
- Modify: `src/core/opencode/types.ts`
- Modify: `src/core/opencode/OpenCodeService.ts`
- Test: `tests/unit/core/opencode/OpenCodeSessionStateStore.test.ts`
- Test: `tests/unit/core/opencode/OpenCodeService.sdkCrudSync.test.ts`
- Docs: `docs/modules/core/opencode/OpenCodeSessionStateStore.md`
- Docs: `docs/modules/core/opencode/OpenCodeService.md`

**Reference files:**
- `C:\Users\lt\Desktop\Write\open-source-project\AI-tools-agents\opencode\packages\app\src\context\global-sync\event-reducer.ts`
- `C:\Users\lt\Desktop\Write\open-source-project\AI-tools-agents\opencode\packages\opencode\src\session\session.ts`

- [ ] **Step 1: Add canonical session graph types**

```ts
export interface OpenCodeCanonicalSessionState {
  sessionID: string;
  messages: OpenCodeCanonicalMessageInfo[];
  partsByMessageID: Record<string, OpenCodeCanonicalPart[]>;
}

export interface OpenCodeCanonicalMutation {
  type:
    | 'session.snapshot.replaced'
    | 'message.upserted'
    | 'message.removed'
    | 'part.upserted'
    | 'part.removed'
    | 'part.delta';
}
```

- [ ] **Step 2: Implement the reducer-style store**

```ts
export class OpenCodeSessionStateStore {
  replaceSessionSnapshot(sessionID: string, messages: OpenCodeSessionMessageWithParts[]): OpenCodeCanonicalSessionState;
  upsertMessage(info: OpenCodeCanonicalMessageInfo): OpenCodeCanonicalSessionState;
  removeMessage(sessionID: string, messageID: string): OpenCodeCanonicalSessionState;
  upsertPart(part: OpenCodeCanonicalPart): OpenCodeCanonicalSessionState;
  removePart(messageID: string, partID: string): OpenCodeCanonicalSessionState;
  appendPartDelta(input: { messageID: string; partID: string; field: string; delta: string }): OpenCodeCanonicalSessionState;
  getSessionState(sessionID: string): OpenCodeCanonicalSessionState | null;
}
```

- [ ] **Step 3: Let `OpenCodeService` own one instance of the store**

```ts
private readonly sessionStateStore = new OpenCodeSessionStateStore();

private applyCanonicalSnapshot(sessionID: string, messages: OpenCodeSessionMessageWithParts[]): void {
  this.sessionStateStore.replaceSessionSnapshot(sessionID, messages);
}
```

- [ ] **Step 4: Write focused reducer tests**

```ts
it('keeps messages sorted and merges part deltas into existing parts', () => {
  const store = new OpenCodeSessionStateStore();
  store.upsertMessage({ id: 'msg-1', sessionID: 'session-1', role: 'assistant', time: { created: 1 } });
  store.upsertPart({ id: 'part-1', messageID: 'msg-1', sessionID: 'session-1', type: 'text', text: 'Hel' });
  store.appendPartDelta({ messageID: 'msg-1', partID: 'part-1', field: 'text', delta: 'lo' });
  expect(store.getSessionState('session-1')?.partsByMessageID['msg-1']?.[0]?.text).toBe('Hello');
});
```

- [ ] **Step 5: Run the targeted tests**

Run: `npm test -- --runInBand tests/unit/core/opencode/OpenCodeSessionStateStore.test.ts tests/unit/core/opencode/OpenCodeService.sdkCrudSync.test.ts`

Expected: reducer tests pass and existing sync CRUD compatibility remains green.

**Completion checkpoint:** OpenCodian 内部第一次拥有稳定的 canonical `session/message/part` 真相层，且不依赖 `ChatMessage[]` 作为唯一持久状态。

---

### Task 2: Reshape send preparation around stable `messageID + parts[]`

**Files:**
- Modify: `src/core/opencode/OpenCodePromptRequestBuilder.ts`
- Modify: `src/core/opencode/OpenCodeContextPartSerializer.ts`
- Modify: `src/core/opencode/OpenCodeService.ts`
- Modify: `src/features/chat/services/MessageSendPreparationService.ts`
- Test: `tests/unit/core/opencode/OpenCodePromptRequestBuilder.test.ts`
- Test: `tests/unit/core/opencode/OpenCodeService.sdkPromptTransport.test.ts`
- Test: `tests/unit/features/chat/MessageSendPreparationService.test.ts`
- Docs: `docs/modules/core/opencode/OpenCodePromptRequestBuilder.md`
- Docs: `docs/modules/features/chat/services/MessageSendPreparationService.md`

**Reference files:**
- `C:\Users\lt\Desktop\Write\open-source-project\AI-tools-agents\opencode\packages\app\src\components\prompt-input\build-request-parts.ts`
- `C:\Users\lt\Desktop\Write\open-source-project\AI-tools-agents\opencode\packages\app\src\components\prompt-input\submit.ts`
- `C:\Users\lt\Desktop\Write\open-source-project\AI-tools-agents\opencode\packages\opencode\src\session\prompt.ts`

- [ ] **Step 1: Extend the request builder to return structured send payloads**

```ts
export interface BuiltPromptSendPayload {
  messageID: string;
  requestParts: PromptRequestPart[];
  optimisticUserParts: PromptRequestPart[];
}

buildStructuredPromptSendPayload(input: PromptBuildInput): BuiltPromptSendPayload;
```

- [ ] **Step 2: Preserve stable IDs through send preparation**

```ts
export interface PreparedMessageSend {
  conversation: Conversation;
  tabId: TabId;
  messageID: string;
  requestParts: PromptRequestPart[];
  optimisticUserParts: PromptRequestPart[];
  contextItems: PromptContextItem[];
  modelOptions: SendMessageModelOptions;
}
```

- [ ] **Step 3: Stop treating optimistic user append as the final truth**

```ts
const prepared = this.promptRequestBuilder.buildStructuredPromptSendPayload(...);
this.host.seedCanonicalUserMessage({
  sessionID: conversation.openCodeSessionId!,
  messageID: prepared.messageID,
  parts: prepared.optimisticUserParts,
});
```

- [ ] **Step 4: Add send-path tests for plain text, context, and injected synthetic parts**

```ts
it('returns stable message and part ids for the optimistic seed and the SDK request', () => {
  const payload = builder.buildStructuredPromptSendPayload(...);
  expect(payload.messageID).toMatch(/^message-/);
  expect(payload.requestParts.map((part) => part.id)).toEqual(payload.optimisticUserParts.map((part) => part.id));
});
```

- [ ] **Step 5: Run the targeted tests**

Run: `npm test -- --runInBand tests/unit/core/opencode/OpenCodePromptRequestBuilder.test.ts tests/unit/core/opencode/OpenCodeService.sdkPromptTransport.test.ts tests/unit/features/chat/MessageSendPreparationService.test.ts`

Expected: 发送路径继续支持普通文本、context/file、system/tools/agent 选项，并且 optimistic seed 与实际 request 使用同一批稳定 ID。

**Completion checkpoint:** 发送层已经与 OpenCode 的 `messageID + parts[]` 思路一致，后续插件 hook 与 sync reducer 都能围绕结构化 part 工作。

---

### Task 3: Convert sync-event handling from “reload signal” to “graph mutation”

**Files:**
- Modify: `src/core/opencode/OpenCodeSyncEventRuntimeCoordinator.ts`
- Modify: `src/core/opencode/OpenCodeService.ts`
- Modify: `src/features/chat/services/ConversationSessionSignalRuntime.ts`
- Modify: `src/features/chat/services/ConversationSyncBridge.ts`
- Test: `tests/unit/core/opencode/OpenCodeSyncEventRuntimeCoordinator.test.ts`
- Test: `tests/unit/core/opencode/OpenCodeService.sdkCrudSync.test.ts`
- Test: `tests/unit/features/chat/ConversationSyncBridge.test.ts`
- Docs: `docs/modules/core/opencode/OpenCodeSyncEventRuntimeCoordinator.md`
- Docs: `docs/modules/features/chat/services/ConversationSyncBridge.md`

**Reference files:**
- `C:\Users\lt\Desktop\Write\open-source-project\AI-tools-agents\opencode\packages\app\src\context\global-sync.tsx`
- `C:\Users\lt\Desktop\Write\open-source-project\AI-tools-agents\opencode\packages\app\src\context\global-sync\event-reducer.ts`
- `C:\Users\lt\Desktop\Write\open-source-project\AI-tools-agents\opencode\packages\opencode\src\sync\index.ts`

- [ ] **Step 1: Enrich sync-event payloads with reducer-ready data**

```ts
export type SessionSyncEventUpdate =
  | { type: 'message.updated'; sessionId: string; info: OpenCodeMessageInfo }
  | { type: 'message.removed'; sessionId: string; messageId: string }
  | { type: 'message.part.updated'; sessionId: string; part: OpenCodeMessagePart; time: number | null }
  | { type: 'message.part.removed'; sessionId: string; messageId: string; partId: string }
  | { type: 'message.part.delta'; sessionId: string; messageId: string; partId: string; field: string; delta: string }
  | { type: 'session.diff'; sessionId: string };
```

- [ ] **Step 2: Apply these events directly into `OpenCodeSessionStateStore`**

```ts
private handleCanonicalSyncEvent(update: SessionSyncEventUpdate): void {
  switch (update.type) {
    case 'message.updated':
      this.sessionStateStore.upsertMessage(update.info);
      return;
    case 'message.part.delta':
      this.sessionStateStore.appendPartDelta(update);
      return;
  }
}
```

- [ ] **Step 3: Keep full conversation reload only for `session.diff` and gap recovery**

```ts
if (update.type === 'session.diff') {
  this.conversationSyncBridge.scheduleConversationSyncFromSignal(tabId, 'session.diff');
  return;
}
this.applyCanonicalSyncEvent(update);
this.notifyConversationRenderFromCanonicalMutation(update.sessionId);
```

- [ ] **Step 4: Add tests that prove visible conversations can update without a full reload**

```ts
it('applies message and part sync events before falling back to a session reload', async () => {
  // arrange thin sync events
  // expect no syncConversationMessagesFromServer call for message.updated / part.updated only
});
```

- [ ] **Step 5: Run the targeted tests**

Run: `npm test -- --runInBand tests/unit/core/opencode/OpenCodeSyncEventRuntimeCoordinator.test.ts tests/unit/core/opencode/OpenCodeService.sdkCrudSync.test.ts tests/unit/features/chat/ConversationSyncBridge.test.ts`

Expected: `message.updated` / `message.part.updated` / `message.part.delta` 可以直接刷新本地状态；`session.diff` 仍保留为权威 reload 入口。

**Completion checkpoint:** sync-event 不再只是“叫别人去重拉”的旁路信号，而成为第一层本地真相归并通道。

---

### Task 4: Make stream processing update canonical parts, not only loose text chunks

**Files:**
- Modify: `src/core/opencode/OpenCodeStreamEventTransformer.ts`
- Modify: `src/core/opencode/OpenCodeService.ts`
- Test: `tests/unit/core/opencode/OpenCodeStreamEventTransformer.test.ts`
- Test: `tests/unit/core/opencode/OpenCodeStreamingRuntimeCoordinator.test.ts`
- Test: `tests/unit/core/opencode/OpenCodeService.sdkStreamEvents.test.ts`
- Docs: `docs/modules/core/opencode/OpenCodeStreamEventTransformer.md`
- Docs: `docs/modules/core/opencode/OpenCodeService.md`

**Reference files:**
- `C:\Users\lt\Desktop\Write\open-source-project\AI-tools-agents\opencode\packages\opencode\src\session\prompt.ts`
- `C:\Users\lt\Desktop\Write\open-source-project\AI-tools-agents\opencode\packages\opencode\src\session\processor.ts`

- [ ] **Step 1: Add canonical stream mutation output alongside existing chunks**

```ts
export interface OpenCodeStreamMutation {
  type: 'message.upserted' | 'part.upserted' | 'part.delta' | 'part.completed';
  sessionID: string;
  messageID: string;
  partID?: string;
}

export interface OpenCodeStreamEventOutcome {
  chunks: StreamChunk[];
  mutations: OpenCodeStreamMutation[];
  stop: boolean;
}
```

- [ ] **Step 2: Use stream part IDs as canonical IDs**

```ts
private handleMessagePartUpdated(...) {
  mutations.push({
    type: 'part.upserted',
    sessionID,
    messageID: part.messageID,
    partID: part.id,
  });
}
```

- [ ] **Step 3: Apply mutations before any local assistant fallback body patch**

```ts
for (const mutation of outcome.mutations) {
  this.applyCanonicalStreamMutation(mutation);
}
this.emitLegacyChunks(outcome.chunks);
```

- [ ] **Step 4: Add tests for tool-first and text-late sequences**

```ts
it('tracks tool and text updates under the same assistant turn without emitting a blank assistant body', () => {
  // part.updated(tool running) -> part.updated(text empty) -> part.delta(text body)
  // assert mutations preserve one assistant message and later fill body text
});
```

- [ ] **Step 5: Run the targeted tests**

Run: `npm test -- --runInBand tests/unit/core/opencode/OpenCodeStreamEventTransformer.test.ts tests/unit/core/opencode/OpenCodeStreamingRuntimeCoordinator.test.ts tests/unit/core/opencode/OpenCodeService.sdkStreamEvents.test.ts`

Expected: 流式路径能够稳定写入 canonical part 状态，reasoning/tool/text 都共享同一条规范状态通路。

**Completion checkpoint:** 空白块不再来自“stream 只攒 loose text，而 sync/reload 另有一套事实”的双轨漂移。

---

### Task 5: Introduce a turn view-model builder and keep the existing UI shell

**Files:**
- Create: `src/features/chat/services/ConversationTurnViewModelBuilder.ts`
- Modify: `src/features/chat/services/ConversationRenderService.ts`
- Modify: `src/core/opencode/OpenCodeService.ts`
- Test: `tests/unit/features/chat/ConversationTurnViewModelBuilder.test.ts`
- Test: `tests/unit/features/chat/ConversationRenderService.test.ts`
- Test: `tests/unit/features/chat/ConversationRenderService.renderFlows.test.ts`
- Docs: `docs/modules/features/chat/services/ConversationTurnViewModelBuilder.md`
- Docs: `docs/modules/features/chat/services/ConversationRenderService.md`

**Reference files:**
- `C:\Users\lt\Desktop\Write\open-source-project\AI-tools-agents\opencode\packages\ui\src\components\session-turn.tsx`
- `C:\Users\lt\Desktop\Write\open-source-project\AI-tools-agents\opencode\packages\ui\src\components\message-part.tsx`

- [ ] **Step 1: Define a turn-shaped render input**

```ts
export interface ConversationTurnViewModel {
  userMessageID: string;
  userInfo: OpenCodeCanonicalMessageInfo;
  userParts: OpenCodeCanonicalPart[];
  assistantMessages: OpenCodeCanonicalMessageInfo[];
  assistantPartsByMessageID: Record<string, OpenCodeCanonicalPart[]>;
  interrupted: boolean;
  error: OpenCodeNormalizedError | null;
}
```

- [ ] **Step 2: Build turns from canonical message order**

```ts
buildTurns(sessionState: OpenCodeCanonicalSessionState): ConversationTurnViewModel[] {
  // 从 user message 开始，收集直到下一个 user message 前的 assistant/tool/reasoning
}
```

- [ ] **Step 3: Make `ConversationRenderService` consume turns instead of flat `ChatMessage[]` as its primary source**

```ts
const turns = this.turnViewModelBuilder.buildTurns(sessionState);
await this.renderTurns(turns);
```

- [ ] **Step 4: Keep existing DOM/CSS helpers, but change only the input seam**

```ts
// keep existing assistant shell, footer, markdown, notice helpers
// replace only the data source: flat ChatMessage -> turn view-model
```

- [ ] **Step 5: Add tests that compare live and reloaded render inputs**

```ts
it('builds the same turn structure for live stream mutations and for authoritative reload snapshots', () => {
  expect(buildTurns(liveState)).toEqual(buildTurns(reloadedState));
});
```

- [ ] **Step 6: Run the targeted tests**

Run: `npm test -- --runInBand tests/unit/features/chat/ConversationTurnViewModelBuilder.test.ts tests/unit/features/chat/ConversationRenderService.test.ts tests/unit/features/chat/ConversationRenderService.renderFlows.test.ts`

Expected: turn builder 能处理 tool-first、reasoning-first、空 text part 后补 delta、interrupted/error 等场景；渲染层继续复用现有样式与 footer/card 宿主。

**Completion checkpoint:** render 层与 OpenCode 一样以 turn 为核心，但 OpenCodian 的样式壳完全保留。

---

### Task 6: Align command, shell, and plugin-injection semantics with structured parts

**Files:**
- Modify: `src/core/opencode/OpenCodePromptRequestBuilder.ts`
- Modify: `src/core/opencode/OpenCodeSessionControlOrchestrator.ts`
- Modify: `src/core/opencode/OpenCodeService.ts`
- Modify: `src/features/chat/services/ComposerInputShellCoordinator.ts`
- Modify: `src/features/chat/services/MessageSendPreparationService.ts`
- Test: `tests/unit/core/opencode/OpenCodeSessionControlOrchestrator.test.ts`
- Test: `tests/unit/core/opencode/OpenCodePromptRequestBuilder.test.ts`
- Test: `tests/unit/features/chat/ComposerInputShellCoordinator.test.ts`
- Test: `tests/unit/features/chat/ComposerInputShellCoordinatorSkills.test.ts`
- Docs: `docs/modules/features/chat/services/ComposerInputShellCoordinator.md`
- Docs: `docs/modules/core/opencode/OpenCodePromptRequestBuilder.md`

**Reference files:**
- `C:\Users\lt\Desktop\Write\open-source-project\AI-tools-agents\opencode\packages\app\src\components\prompt-input\submit.ts`
- `C:\Users\lt\Desktop\Write\open-source-project\AI-tools-agents\opencode\packages\opencode\src\session\prompt.ts`
- `C:\Users\lt\Desktop\Write\open-source-project\AI-tools-agents\opencode\packages\opencode\src\session\processor.ts`

- [ ] **Step 1: Distinguish “prompt send” from “session command/shell execution” at the payload level**

```ts
export type PreparedComposerSubmission =
  | { kind: 'prompt'; payload: PreparedMessageSend }
  | { kind: 'command'; command: SessionCommandInput };
```

- [ ] **Step 2: Make slash/shell selection produce structured intent, not string-only rewrites**

```ts
{
  kind: 'command',
  command: {
    command: 'review',
    arguments: ['--focus', 'tests'],
    agent: 'build',
  },
}
```

- [ ] **Step 3: Preserve plugin-injected prompt material as synthetic parts with metadata**

```ts
{
  id: 'part-123',
  type: 'text',
  text: 'Injected plugin prompt',
  synthetic: true,
  metadata: {
    source: 'plugin',
    pluginName: 'opencode-plugin-x',
  },
}
```

- [ ] **Step 4: Add tests for ordinary input, slash command, shell command, and plugin-injected synthetic parts**

```ts
it('keeps plugin-injected text in synthetic parts instead of flattening it into the user content string', () => {
  // expect synthetic metadata to survive send preparation and later hydration
});
```

- [ ] **Step 5: Run the targeted tests**

Run: `npm test -- --runInBand tests/unit/core/opencode/OpenCodeSessionControlOrchestrator.test.ts tests/unit/core/opencode/OpenCodePromptRequestBuilder.test.ts tests/unit/features/chat/ComposerInputShellCoordinator.test.ts tests/unit/features/chat/ComposerInputShellCoordinatorSkills.test.ts`

Expected: “有命令 / 无命令 / shell / slash / plugin 注入” 都走结构化语义路径，后续 render 与 reload 能无损回放。

**Completion checkpoint:** 插件 hook 难适配的问题被压缩到“part 结构兼容”范围，而不再需要猜 prompt 字符串是怎样被改写的。

---

### Task 7: Rework reload/finalization as compensation over canonical state and add regressions

**Files:**
- Modify: `src/features/chat/services/ConversationAuthoritativeSyncCoordinator.ts`
- Modify: `src/features/chat/services/ConversationSyncBridge.ts`
- Modify: `src/features/chat/services/MessageFinalizationService.ts`
- Modify: `src/features/chat/services/ConversationRenderService.ts`
- Modify: `src/core/opencode/OpenCodeService.ts`
- Test: `tests/unit/features/chat/MessageFinalizationService.test.ts`
- Test: `tests/unit/features/chat/ConversationSyncBridge.test.ts`
- Test: `tests/unit/features/chat/ConversationRenderService.renderFlows.test.ts`
- Test: `tests/unit/core/opencode/OpenCodeService.messageCompatibility.test.ts`
- Test: `tests/unit/core/opencode/OpenCodeService.omoCompatibility.test.ts`
- Docs: `docs/modules/features/chat/services/MessageFinalizationService.md`
- Docs: `docs/modules/features/chat/services/ConversationSyncBridge.md`
- Docs: `docs/modules/core/opencode/OpenCodeService.md`

**Reference files:**
- `C:\Users\lt\Desktop\Write\open-source-project\AI-tools-agents\opencode\packages\opencode\src\session\session.ts`
- `C:\Users\lt\Desktop\Write\open-source-project\AI-tools-agents\opencode\packages\opencode\src\server\routes\instance\session.ts`
- `C:\Users\lt\Desktop\Write\open-source-project\AI-tools-agents\opencode\packages\app\src\pages\session.tsx`

- [ ] **Step 1: Replace “reload writes flat chat messages” with “reload replaces canonical snapshot”**

```ts
const snapshot = await this.host.fetchConversationSnapshot(...);
this.sessionStateStore.replaceSessionSnapshot(sessionID, snapshot.messages);
const turns = this.turnViewModelBuilder.buildTurns(this.sessionStateStore.getSessionState(sessionID)!);
await this.renderTurns(turns);
```

- [ ] **Step 2: Make stream finalization compare canonical fingerprints, not only flat message strings**

```ts
const previousFingerprint = getCanonicalTurnFingerprint(previousState);
const nextFingerprint = getCanonicalTurnFingerprint(nextState);
if (previousFingerprint !== nextFingerprint) {
  await this.host.applySyncedConversationUpdate(...);
}
```

- [ ] **Step 3: Add blank-block diagnostics around assistant part arrival**

```ts
this.logger.debug('assistant-turn-canonical-state', {
  sessionID,
  messageID,
  partIDs,
  hasRenderableText,
  hasToolParts,
  source: 'stream' | 'sync' | 'reload',
});
```

- [ ] **Step 4: Add regression tests for the two real failure classes**

```ts
it('does not leave a blank assistant block when tool parts arrive before text deltas', async () => {
  // simulate stream-first then authoritative sync
});

it('rebuilds the same assistant turn after reload when plugin synthetic parts are present', async () => {
  // arrange synthetic plugin part metadata + snapshot reload
});
```

- [ ] **Step 5: Run the targeted tests**

Run: `npm test -- --runInBand tests/unit/features/chat/MessageFinalizationService.test.ts tests/unit/features/chat/ConversationSyncBridge.test.ts tests/unit/features/chat/ConversationRenderService.renderFlows.test.ts tests/unit/core/opencode/OpenCodeService.messageCompatibility.test.ts tests/unit/core/opencode/OpenCodeService.omoCompatibility.test.ts`

Expected: reload/finalization 成为纠偏路径；live 与 reload 路径能产出同一份 turn 结构；空白块与 injected-prompt 漂移都有回归保护。

**Completion checkpoint:** 即使再遇到边缘时序，重载只是在修正极端漂移，不再是“刷新后才看得到回复”的唯一救命手段。

---

## Suggested Execution Order

- [ ] 完成 Task 1，再开始任何 send/render 改动。
- [ ] 完成 Task 2 与 Task 3，确保 send 与 sync 都写入 canonical state。
- [ ] 完成 Task 4，再开始 Task 5，让 render 直接吃 canonical 结果。
- [ ] 完成 Task 6，统一 command/shell/plugin 注入语义。
- [ ] 最后完成 Task 7，把 authoritative reload 收束为补偿路径，并补齐诊断与回归。

## Validation Ladder

- [ ] Targeted reducer/send/sync tests first:
  - `npm test -- --runInBand tests/unit/core/opencode/OpenCodeSessionStateStore.test.ts tests/unit/core/opencode/OpenCodePromptRequestBuilder.test.ts tests/unit/core/opencode/OpenCodeSyncEventRuntimeCoordinator.test.ts`
- [ ] Then stream/render/finalization tests:
  - `npm test -- --runInBand tests/unit/core/opencode/OpenCodeStreamEventTransformer.test.ts tests/unit/core/opencode/OpenCodeService.sdkStreamEvents.test.ts tests/unit/features/chat/ConversationTurnViewModelBuilder.test.ts tests/unit/features/chat/ConversationRenderService.renderFlows.test.ts tests/unit/features/chat/MessageFinalizationService.test.ts`
- [ ] Then command/plugin tests:
  - `npm test -- --runInBand tests/unit/core/opencode/OpenCodeSessionControlOrchestrator.test.ts tests/unit/features/chat/ComposerInputShellCoordinator.test.ts tests/unit/features/chat/ComposerInputShellCoordinatorSkills.test.ts`
- [ ] Final gate:
  - `npm run verify`
- [ ] Docs gate after module changes:
  - `npm run check:module-docs`

## Non-Goals

- 不重写 OpenCodian 的现有样式、卡片结构、footer 呈现与主题系统。
- 不为了这次改造去清理无关的 trailing-assistant maintainability helper 链。
- 不修改 `reference-projects/` 中的任何源码。

## Handoff Notes For The Next Session

- 先做状态与事件层，再做 turn view-model；不要一上来从 `ConversationRenderService` 的 DOM patch 开始。
- 如果实现过程中发现自己又在到处拼 `ChatMessage.content`，说明偏离了计划。
- 若某个兼容层必须暂时保留，优先把它标记成“derived from canonical state”，不要再新增第三套真相。
- 如需缩小首轮风险，可先完成 Task 1-5，把 Task 6-7 作为第二个提交批次。
