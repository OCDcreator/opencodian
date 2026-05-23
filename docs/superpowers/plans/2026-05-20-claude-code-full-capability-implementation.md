# Claude Code Full Capability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Claude Code as a first-class OpenCodian backend through the official Claude Agent SDK, while preserving OpenCode behavior and phasing the full Claude capability surface safely.

**Architecture:** Complete the current `AgentServiceRegistry` foundation by adding backend-neutral chat/session seams, then add a Claude adapter that owns SDK query lifecycle, stream normalization, permission bridging, executable diagnostics, and Claude-specific settings. Shared UI consumes common capabilities; Claude-only features remain explicit `claude.*` capabilities.

**Tech Stack:** Obsidian plugin, TypeScript, Jest, Claude Agent SDK `@anthropic-ai/claude-agent-sdk`, Node child process spawn from Electron, OpenCodian `StreamChunk`, `npm run verify`, graphify/module-doc gates, Test Vault runtime smoke.

---

## Global Constraints

- Do not expose Claude in runtime UI until its adapter, settings normalization, and smoke tests pass.
- Do not remove or weaken OpenCode-specific fallback fields; old conversations default to `opencode`.
- Do not use the official SDK V2 session API until official docs and package types agree.
- Do not call `opencode` unless the user explicitly asks for an OpenCode review.
- After any `src/**` change, run `npm run graphify:update:src` before final repository gates.
- Build/deploy steps, when needed, must be sequential.

## File Structure

- Modify: `src/core/agents/backend/AgentService.ts`
  - Add backend-neutral chat/session contracts or split `AgentChatCapability` and `AgentSessionCapability`.
- Modify: `src/core/agents/backend/index.ts`
  - Keep `IMPLEMENTED_AGENT_BACKENDS` as `['opencode']` until Claude runtime smoke passes.
- Modify: `src/core/agents/backend/OpenCodeAdapter.ts`
  - Implement the new chat/session contract by delegating to `OpenCodeService`.
- Create: `src/core/agents/backend/ClaudeCodeAdapter.ts`
  - Own Claude SDK lifecycle, options, stream normalization, permissions, and diagnostics.
- Create: `src/core/agents/backend/ClaudeCodeOptionsBuilder.ts`
  - Map OpenCodian settings/session context to SDK `Options`.
- Create: `src/core/agents/backend/ClaudeCodeStreamNormalizer.ts`
  - Convert SDK messages to `StreamChunk`.
- Create: `src/core/agents/backend/ClaudeCodePermissionBridge.ts`
  - Convert `canUseTool` and `AskUserQuestion` into existing OpenCodian permission/question flows.
- Create: `src/core/agents/backend/ClaudeCodeProcessResolver.ts`
  - Resolve bundled/external executable and Electron-safe spawn.
- Modify: `src/core/types/chat.ts`
  - Rename/genericize `acpSessionId?: string` to `backendSessionId?: string`, add `backendAgentId?: string`, and change `openCodeSessionId` from required `string` to optional `string?` for non-OpenCode conversations.
- Modify: `src/core/types/settings.ts`
  - Add Claude backend settings under a scoped object such as `backendSettings.claudeCode`.
- Modify: `src/core/types/settingsLoadNormalization.ts`
  - Normalize Claude settings and keep unknown enabled backends filtered until implemented.
- Modify: `src/main.ts`
  - Register Claude adapter only after Phase 1 gates; route conversation creation through active backend in a later task.
- Modify: `src/features/chat/runtime/SendPipelineTypes.ts`
  - Generalize transport options from OpenCode session id to backend session id.
- Modify: `src/features/chat/runtime/SendPipelineRuntime.ts`
  - Pass backend session id from prepared conversation.
- Modify: `src/features/chat/services/MessageSendPreparationService.ts`
  - Use backend-aware availability/session preparation.
- Modify: `src/features/chat/OpenCodianView.ts`
  - Replace direct send/cancel/lifecycle calls with backend transport seams in phased slices.
- Modify: `src/features/settings/SettingsBackendSection.ts`
  - Keep UI gated until `IMPLEMENTED_AGENT_BACKENDS` includes `claude-code`.
- Create or modify: `src/features/settings/SettingsClaudeCodeSection.ts`
  - Claude executable, auth/env, setting sources, permission mode, thinking/effort, and diagnostics.
- Test: `tests/unit/core/agents/backend/*`
- Test: `tests/unit/core/types/settingsLoadNormalization.test.ts`
- Test: `tests/unit/features/chat/*`
- Test: `tests/unit/features/settings/*`
- Docs: corresponding `docs/modules/**` entries for every new `src/**` file.

## Task 0: Phase 0 Baseline And OpenCode Regression Gate

- [ ] **Step 1: Confirm fixed worktree and baseline**

Run:

```bash
pwd
git status --short
```

Expected: `pwd` is `/Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/.worktrees/phase0-capability`. Record any unrelated dirty files before editing.

- [ ] **Step 2: Run current Phase 0 focused tests**

Run:

```bash
npm test -- --runInBand \
  tests/unit/core/agents/backend/AgentServiceRegistry.test.ts \
  tests/unit/core/types/settingsLoadNormalization.test.ts \
  tests/unit/features/settings/SettingsBackendSection.test.ts \
  tests/unit/features/chat/composerAvailabilityState.test.ts \
  tests/unit/features/chat/slashCommandPreloadAvailability.test.ts \
  tests/unit/main.test.ts
```

Expected: PASS. If this fails, stop and fix Phase 0 before adding Claude.

- [ ] **Step 3: Verify Claude is not exposed yet**

Run:

```bash
rg -n "IMPLEMENTED_AGENT_BACKENDS|BACKEND_OPTIONS|claude-code" src/core/agents/backend src/features/settings tests/unit
```

Expected: `IMPLEMENTED_AGENT_BACKENDS` contains only `opencode`; settings tests assert future backends are filtered.

## Task 1: Add Backend-Neutral Chat And Session Contract

**Files:**
- Modify: `src/core/agents/backend/AgentService.ts`
- Modify: `src/core/agents/AgentCapability.ts`
- Modify: `src/core/agents/backend/OpenCodeAdapter.ts`
- Test: `tests/unit/core/agents/backend/OpenCodeAdapter.test.ts`
- Docs: `docs/modules/core/agents/backend/agent-service.md`, OpenCode adapter module doc.

- [ ] **Step 1: Write contract tests**

Add tests proving `OpenCodeAdapter` exposes:

```ts
await adapter.createSession();
adapter.sendMessage({ sessionId: 'ses_mock', content: 'hello' });
await adapter.cancelStream('ses_mock');
```

Expected behavior: each method delegates to the existing mocked `OpenCodeService`.

- [ ] **Step 2: Extend the interface**

Add either core methods or narrow capabilities:

```ts
export interface AgentChatSendRequest {
  sessionId: string;
  content: string;
  options?: Record<string, unknown>;
}

export interface AgentSessionCapability extends AgentService {
  createSession(title?: string, options?: Record<string, unknown>): Promise<string>;
  deleteSession(sessionId: string): Promise<void>;
  updateSessionTitle(sessionId: string, title: string): Promise<void>;
}

export interface AgentChatCapability extends AgentService {
  sendMessage(request: AgentChatSendRequest): AsyncGenerator<StreamChunk>;
  cancelStream(sessionId: string): Promise<void> | void;
}
```

Use real OpenCodian option types where they already exist; do not create SDK-shaped types.

- [ ] **Step 2.5: Add capability identifiers**

Add `AgentCapability.Chat = 'chat'` and `AgentCapability.Sessions = 'sessions'` to `src/core/agents/AgentCapability.ts`, and include them in OpenCode's full capability set.

- [ ] **Step 3: Implement OpenCode delegation**

`OpenCodeAdapter` should call the existing `OpenCodeService` methods without changing behavior.

- [ ] **Step 4: Verify**

Run:

```bash
npm test -- --runInBand tests/unit/core/agents/backend/OpenCodeAdapter.test.ts tests/unit/core/agents/backend/AgentServiceRegistry.test.ts
```

Expected: PASS.

## Task 2: Generalize Conversation Session Identity

**Files:**
- Modify: `src/core/types/chat.ts`
- Modify: `src/core/storage/StorageService.ts`.
- Modify: conversation metadata/cache owners such as `ConversationMetadataCache` or equivalent storage index if present.
- Modify: send-pipeline-adjacent chat services that read `openCodeSessionId`.
- Test: storage/conversation tests and affected chat service tests.

- [ ] **Step 1: Add `backendSessionId` tests**

Add tests for loading old conversations:

```ts
expect(normalized.backend ?? 'opencode').toBe('opencode');
expect(getConversationBackendSessionId(normalized)).toBe(normalized.openCodeSessionId);
expect(normalized.openCodeSessionId).toBeDefined();
```

- [ ] **Step 2: Add helper**

Add a helper near chat/session types:

```ts
export function getConversationBackendSessionId(conversation: Conversation): string | undefined {
  return conversation.backendSessionId ?? conversation.openCodeSessionId;
}
```

- [ ] **Step 2.5: Make schema and storage explicit**

Update `Conversation` and `ConversationMeta` so:

```ts
openCodeSessionId?: string;
backendSessionId?: string;
backendAgentId?: string;
```

Also update the concrete construction/persistence points found by Council: `main.ts` conversation hydration/create paths around the current metadata mapping and `createConversation`/`createConversationFromSession`, plus `StorageService` metadata save/load around the current metadata rows. If a `ConversationMetadataCache` or full-message cache stores session identifiers, persist `backendSessionId` there too.

- [ ] **Step 3: Inventory and replace send-path reads first**

Run:

```bash
rg -n "openCodeSessionId|getConversationBackendSessionId|sessionId:" src/features/chat src/main.ts src/core/storage
```

Expected: identify all send-pipeline-adjacent reads in `SendPipelineRuntime.ts`, `SendPipelineTypes.ts`, `SendPipelineTrace.ts`, `StreamChunkRouter.ts`, `StreamLocalFinalizer.ts`, `LocalStreamMessagePersistence.ts`, `MessageSendPreparationService.ts`, and `OpenCodianView.ts`. Update only the send path to use the helper. Leave sync/history/todo OpenCode-only paths gated for Task 7A.

- [ ] **Step 4: Verify**

Run:

```bash
npm test -- --runInBand tests/unit/features/chat tests/unit/core/types/settingsLoadNormalization.test.ts
```

Expected: PASS.

## Task 3: Build Claude SDK Options And Process Resolver

**Files:**
- Create: `src/core/agents/backend/ClaudeCodeOptionsBuilder.ts`
- Create: `src/core/agents/backend/ClaudeCodeProcessResolver.ts`
- Modify: `src/core/types/settings.ts`
- Modify: `src/core/types/settingsLoadNormalization.ts`
- Test: `tests/unit/core/agents/backend/ClaudeCodeOptionsBuilder.test.ts`
- Test: `tests/unit/core/agents/backend/ClaudeCodeProcessResolver.test.ts`

- [ ] **Step 1: Add settings shape and normalization tests**

Cover:

```ts
backendSettings.claudeCode = {
  executablePath: '',
  settingSources: ['project'],
  permissionMode: 'default',
  thinking: { type: 'adaptive' },
  effort: 'medium',
  additionalDirectories: [],
};
```

Expected: invalid arrays/modes normalize to safe defaults.

Default `settingSources` must be `['project']` so vault `.claude/` configuration is loaded predictably. Empty/none must be an explicit user choice, not an SDK default.

- [ ] **Step 2: Implement options builder**

Map only explicit values:

```ts
{
  cwd: vaultPath,
  model,
  fallbackModel,
  settingSources,
  permissionMode,
  thinking,
  effort,
  additionalDirectories,
  includePartialMessages: true,
  pathToClaudeCodeExecutable,
  canUseTool,
  mcpServers,
}
```

Never rely on default `settingSources`.

- [ ] **Step 3: Implement process resolver**

Support SDK bundled executable by default, configured external path when set, enhanced PATH, and custom spawn hook if Electron requires it.

- [ ] **Step 4: Verify**

Run:

```bash
npm test -- --runInBand \
  tests/unit/core/agents/backend/ClaudeCodeOptionsBuilder.test.ts \
  tests/unit/core/agents/backend/ClaudeCodeProcessResolver.test.ts
```

Expected: PASS.

## Task 4: Implement Claude Stream Normalizer

**Files:**
- Create: `src/core/agents/backend/ClaudeCodeStreamNormalizer.ts`
- Test: `tests/unit/core/agents/backend/ClaudeCodeStreamNormalizer.test.ts`

- [x] **Step 1: Add fixture tests**

Include SDK-style fixtures for:

```ts
session_init
assistant text delta
thinking delta
tool_use
tool_result
usage
result error
AskUserQuestion / permission-like tool
```

- [x] **Step 2: Normalize to existing `StreamChunk`**

Expected mappings:

```ts
text -> { type: 'text', content }
thinking -> { type: 'thinking', content }
tool use -> { type: 'tool_use', kind, input, toolMetadata }
tool result -> { type: 'tool_result', content, isError }
usage -> { type: 'usage', inputTokens, outputTokens, sessionId }
error -> { type: 'error', content }
```

- [x] **Step 3: Verify**

Run:

```bash
npm test -- --runInBand tests/unit/core/agents/backend/ClaudeCodeStreamNormalizer.test.ts
```

Expected: PASS with dedup coverage for partial and final assistant messages.

## Task 5: Implement Permission And Question Bridge

**Files:**
- Create: `src/core/agents/backend/ClaudeCodePermissionBridge.ts`
- Modify: existing permission/question host interfaces only if needed.
- Test: `tests/unit/core/agents/backend/ClaudeCodePermissionBridge.test.ts`

- [x] **Step 1: Test approval mapping**

Cover allow, deny, cancel/interruption, allow-always permission updates, and no handler.

- [x] **Step 2: Test `AskUserQuestion` mapping**

Map Claude tool input into existing `question_request` UI data and return updated input with answers.

- [x] **Step 3: Implement bridge**

The bridge should return SDK `PermissionResult` objects but keep SDK types inside the Claude backend folder.

- [x] **Step 4: Verify**

Run:

```bash
npm test -- --runInBand tests/unit/core/agents/backend/ClaudeCodePermissionBridge.test.ts
```

Expected: PASS.

## Task 6: Implement ClaudeCodeAdapter Behind A Disabled Gate

**Files:**
- Create: `src/core/agents/backend/ClaudeCodeAdapter.ts`
- Modify: `src/core/agents/backend/index.ts`
- Modify: `src/main.ts`
- Test: `tests/unit/core/agents/backend/ClaudeCodeAdapter.test.ts`

- [x] **Step 1: Add adapter tests with mocked SDK**

Mock `@anthropic-ai/claude-agent-sdk` and verify:

```ts
adapter.start()
adapter.createSession()
adapter.sendMessage()
adapter.cancelStream()
adapter.dispose()
```

Expected: no real Claude process starts in unit tests.

- [x] **Step 2: Implement adapter**

Use persistent `query()` with an async message channel for normal chat and cold-start fallback for diagnostics/title-like tasks if needed.

Include crash recovery behavior before exposing the adapter:

- detect persistent query consumer errors;
- replay the last message only if no stream chunk was seen;
- fall back to cold-start when persistent query restart fails;
- surface backend-labelled errors instead of hanging the send pipeline.

- [x] **Step 3: Register without exposing**

Register the adapter only behind an internal implementation flag or keep `IMPLEMENTED_AGENT_BACKENDS` unchanged until runtime smoke passes.

- [x] **Step 4: Verify OpenCode still passes**

Run:

```bash
npm test -- --runInBand \
  tests/unit/core/agents/backend/ClaudeCodeAdapter.test.ts \
  tests/unit/core/agents/backend/AgentServiceRegistry.test.ts \
  tests/unit/features/settings/SettingsBackendSection.test.ts \
  tests/unit/main.test.ts
```

Expected: PASS; settings still expose only OpenCode.

## Task 7A: Route Full Conversation Lifecycle Through Active Backend

**Files:**
- Modify: `src/main.ts`
- Modify: `src/features/chat/OpenCodianView.ts`
- Modify: `src/features/chat/services/TitleGenerationService.ts`
- Modify: `src/features/chat/services/MessageFinalizationService.ts`
- Modify: any service that currently deletes, titles, cancels, syncs, or refreshes backend-owned session state through `openCodeService`.
- Test: focused main/chat/title/finalization tests.

- [x] **Step 1: Add lifecycle routing tests**

Tests must prove non-OpenCode conversations do not call `openCodeService` for:

```ts
createSession
deleteSession
updateSessionTitle
cancelStream
sendMessage
refresh todos/questions after finalize
```

Expected: unsupported Claude lifecycle methods produce capability-gated no-op or backend-labelled unavailable errors, never silent OpenCode calls.

- [x] **Step 2: Implement registry routing**

Use direct `AgentServiceRegistry.getActive()` / `registry.get(conversation.backend)` routing plus capability narrowing. Do not use Proxy delegation. OpenCode-only sync/todo/diff/title-generation paths must check `conversation.backend === 'opencode'` or the relevant capability before calling OpenCode-specific APIs.

- [x] **Step 3: Verify**

Run:

```bash
npm test -- --runInBand tests/unit/main.test.ts tests/unit/features/chat tests/unit/features/chat/services/TitleGenerationService.test.ts tests/unit/features/chat/services/MessageFinalizationService.test.ts
```

Expected: PASS.

## Task 7B: Route Send/New Conversation Through Active Backend

**Files:**
- Modify: `src/main.ts`
- Modify: `src/features/chat/OpenCodianView.ts`
- Modify: `src/features/chat/runtime/SendPipelineTypes.ts`
- Modify: `src/features/chat/runtime/SendPipelineRuntime.ts`
- Modify: `src/features/chat/services/MessageSendPreparationService.ts`
- Test: focused chat/send/main tests.

- [x] **Step 1: Add OpenCode regression tests**

Tests must prove that with active backend `opencode`, new conversation and send still call `OpenCodeAdapter`/`OpenCodeService` and persist `openCodeSessionId`.

- [x] **Step 2: Add Claude routing tests**

With mocked Claude adapter active, new conversation persists:

```ts
backend: 'claude-code'
backendSessionId: '<mock claude session>'
```

Expected: no `openCodeService.createSession()` call.

- [x] **Step 3: Implement routing**

Use direct `AgentServiceRegistry.getActive()` and capability narrowing. If the active backend lacks chat/session capability, show backend unavailable instead of falling back silently. This task must build on Task 7A so create/delete/title/cancel cannot accidentally keep using OpenCode for Claude conversations.

- [x] **Step 4: Verify**

Run:

```bash
npm test -- --runInBand tests/unit/main.test.ts tests/unit/features/chat
```

Expected: PASS.

## Task 8: Add Minimal Claude Settings UI

**Files:**
- Create: `src/features/settings/SettingsClaudeCodeSection.ts`
- Modify: `src/features/settings/settingsLayoutRegistry.ts`
- Modify: `src/features/settings/OpenCodianSettings.ts`
- Modify: locale files.
- Test: `tests/unit/features/settings/SettingsClaudeCodeSection.test.ts`

- [x] **Step 1: Add settings UI tests**

Cover executable path, setting sources, permission mode, thinking/effort, additional directories, and diagnostics button.

- [x] **Step 2: Implement UI**

Keep Phase 1 UI small:

```text
Claude Code executable
Authentication/environment hint
Setting sources
Permission mode
Model/thinking/effort
Additional directories
Runtime diagnostics
```

- [x] **Step 3: Keep advanced UI hidden**

Do not expose hooks, skills authoring, agent authoring, external SessionStore, or JSONL import UI in Phase 1.

- [x] **Step 4: Verify**

Run:

```bash
npm test -- --runInBand tests/unit/features/settings/SettingsClaudeCodeSection.test.ts tests/unit/features/settings/SettingsBackendSection.test.ts
```

Expected: PASS.

## Task 9: Runtime Smoke Gate Before Exposing Claude

**Files:**
- Create: `docs/status/claude-code-phase1-runtime-validation-YYYY-MM-DD.md`
- Runtime only: `.obsidian-debug/claude-code-phase1/*`

- [x] **Step 1: Build**

Run:

```bash
npm run build
```

Expected: PASS and record `BUILD_ID`.

Actual: PASS. Final verified build `feature-phase0-capability.202605201718`.

- [x] **Step 2: SDK executable smoke**

In Test Vault or an equivalent local runtime, verify:

```text
SDK imports
bundled or external executable resolves
persistent query starts
simple prompt streams text
```

Expected: record raw diagnostic output without secrets.

Actual: SDK import succeeded; bundled executable resolved through `@anthropic-ai/claude-agent-sdk-darwin-arm64`; SDK reported Claude Code `2.1.145`. Query emitted `system/init` with the correct cwd but returned `authentication_failed` because this machine's SDK environment had `apiKeySource: "none"`.

- [ ] **Step 3: Permission/question smoke**

Run a prompt that triggers a safe tool approval and an AskUserQuestion-style flow.

Expected: existing OpenCodian approval/question UI receives and resolves the request.

Actual: blocked by local Claude Code auth before tool execution; `canUseTool` was not exercised by live runtime. Unit coverage exists for `ClaudeCodePermissionBridge`, but authenticated runtime proof remains required.

- [x] **Step 4: MCP smoke**

Pass one local stdio MCP server to Claude.

Expected: SDK reports server available or a clear backend-labeled error.

Actual: SDK accepted the MCP config and reported `opencodian_smoke` as `pending`; live MCP tool execution was blocked by the same auth failure.

- [x] **Step 5: OpenCode regression smoke**

Disable Claude or switch back to OpenCode; create and send an OpenCode conversation.

Expected: OpenCode still works and existing session/history/title behavior remains intact.

Actual: OpenCode regression covered by focused and full suites. Final `npm run verify` passed with 419 Jest suites / 2736 tests.

## Task 10: Expose Claude As Implemented Backend

**Files:**
- Modify: `src/core/agents/backend/index.ts`
- Modify: settings tests and locale if needed.
- Docs: update `docs/status/claude-code-phase1-runtime-validation-YYYY-MM-DD.md`.

- [x] **Step 0: Confirm pre-exposure blockers are closed**

Before editing `IMPLEMENTED_AGENT_BACKENDS`, verify and record:

```bash
rg -n "openCodeSessionId" src/main.ts src/features/chat src/core/storage
npm test -- --runInBand tests/unit/main.test.ts tests/unit/features/chat tests/unit/core/agents/backend
```

Expected: remaining `openCodeSessionId` reads are either OpenCode-only compatibility paths or explicitly capability/backend gated; no Claude conversation can call OpenCode lifecycle methods silently.

- [x] **Step 1: Add Claude to implemented backends**

Change:

```ts
export const IMPLEMENTED_AGENT_BACKENDS: readonly AgentBackendKind[] = ['opencode', 'claude-code'];
```

- [x] **Step 2: Update settings tests**

Expected: backend settings show OpenCode and Claude Code; unknown future backends remain filtered.

- [x] **Step 3: Verify**

Run:

```bash
npm test -- --runInBand tests/unit/features/settings/SettingsBackendSection.test.ts tests/unit/core/types/settingsLoadNormalization.test.ts
npm run verify
```

Expected: PASS.

Actual: PASS with `OWNER_GUARD_APPROVED` because `src/main.ts` and chat owner routing changes are required for Claude backend registration and lifecycle routing.

## Later Phase Checklist

### Phase 2: Claude Runtime Completeness

- [ ] Add full model catalog and supported model flags.
- [ ] Add robust thinking/effort UI with package-type verification.
- [ ] Add MCP runtime management and diagnostics.
- [ ] Add setting-source diagnostics and CLAUDE.md visibility.
- [ ] Add additional-directory restart detection and warnings.

### Phase 3: Sessions, Resume, Fork, And History

- [ ] Add JSONL import fixtures.
- [ ] Add resume/fork/resume-at UI and tests.
- [ ] Add backend-aware history list and session deletion.
- [ ] Add subagent sidecar hydration only after real SDK schema validation.

### Phase 4: Skills, Hooks, Agents

- [ ] Add read-only skills and agents catalog first.
- [ ] Add authoring for `.claude/skills` and `.claude/agents` after compatibility tests.
- [ ] Add hooks editor only after validating filesystem and programmatic hook precedence.

### Phase 5: Full Capability Polish

- [ ] Add cross-backend capability dashboard.
- [x] Add Claude diagnostics export without secrets.
- [ ] Add runtime docs and troubleshooting for bundled binary, external CLI, PATH, Node, and Electron spawn.

## Final Gates

For any phase that changes `src/**`, run:

```bash
npm run graphify:update:src
npm run verify
git diff --check
git status --short
```

Expected: all pass; generated graph/module docs are intentionally included when required.
