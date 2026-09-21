# Owner: core.backend
> 2026-09-21 (advantage-parity R-E6)：owner manifest 刷新——shared.foundation 的 include 新增 `src/shared/tokenEstimate.ts`（token 估算启发式）；本 owner 的边界与职责未变。

> Auto-generated scaffold from `architecture-owners.config.json`. The manifest is the canonical truth source; this page narrates the model and records hard-to-automate rationale. Update it when the owner boundary or its non-obvious invariants change.
- 2026-09-13 (universal memory backend): OpenCodeAdapter/ClaudeCodeAdapter/CodexAdapter/PiAdapter consumed the new memory-injection seam (opencode: synthetic text part; claude/codex/pi: prompt prefix).
- 2026-09-18 (R-C3): `AgentInlineCompletionCapability` + the shared `WarmInlineCompletionSession` wrapper land next to the aux contract; all four adapters expose `startInlineCompletionSession()` built from their existing audited read-only session construction (fail-closed proofs and `AuxQuerySafetyProof` reused verbatim). The wrapper adds warm lifecycle only (turn serialization, reset-through-recreate, `ClaudeCodeAuxQuerySession.warmUp()` eager CLI start); it cannot widen what a session may do.
- 2026-09-18 (inline-edit R-A3/R-A4): the auxiliary sessions (ClaudeCode/Codex/OpenCode) gained per-turn image attachments reusing the chat-side wire shapes (Anthropic base64 block via `createUserPrompt`; Codex `localImage` with temp files in the system temp dir, cleaned per-turn and on dispose) and progressive text streaming (Claude `includePartialMessages` text_delta only; Codex native per-token deltas). Read-only contract, deny-list, and audit semantics unchanged; images never enter the vault.

- **Layer:** `core` (may import layers: shared, core)
- **Risk:** high
- **Include:** `src/core/agents/backend/**`

## Responsibilities
- agent backend adapters and transports for OpenCode, Codex and Claude
- Claude settings source, project resource secure write, configuration archive
- backend model catalog and routing

## Canonical state (truth home)
- agent service registry instances
- Claude/Codex/OpenCode adapter state
- backend model catalog

> Cross-owner access is read-only snapshot/command/event. Do not replicate this state as a second writable truth source.

## Entrypoints
- `src/core/agents/backend/index.ts`
- `src/core/agents/backend/ClaudeCodeAdapter.ts`
- `src/core/agents/backend/CodexAdapter.ts`
- `src/core/agents/backend/OpenCodeAdapter.ts`

## Dependency surface
- **Allowed owner dependencies:** `shared.foundation`, `shared.diagnostics`, `core.types`
- **Forbidden dependencies:** `feature`, `app`
- **Adjacent owners** (prefer editing these when out of scope): `core.agents`, `core.backend-diagnostics`, `feature.chat-send`
- **Delegates to:** `core.backend-diagnostics`

## Focused tests
- `tests/unit/core/agents/backend/**`

## Required gates
Run before merge: `npm run typecheck`, `npm run module-docs`.

## Hard invariants
- Do not cross `forbiddenDependencies`.
- Do not replicate canonical state in another owner.
- Changes here must update the matching `docs/modules/**` page (via `module-docs.config.json`).
- Archive history descriptor identity preserves exact filesystem device/inode IDs using bigint stats and decimal-string tokens; Windows NTFS IDs must never be rounded through JavaScript Number. Confinement, state and content integrity checks remain mandatory before restore.
- Run `npm run inspect:owner -- <this owner or a path>` for an always-fresh summary.

## SDK upgrade notes
- 2026-09-02: `@anthropic-ai/claude-agent-sdk` upgraded `0.3.145 → 0.3.252`. `Query.interrupt()` now resolves to `SDKControlInterruptResponse | undefined` (interrupt receipt on `interrupt_receipt_v1`-capable CLIs); `ClaudeCodeSessionRuntime.query.interrupt` was widened to `() => Promise<unknown>` since OpenCodian discards the receipt. `SDKControlGetContextUsageResponse` kept `model` / `totalTokens` / `maxTokens` unchanged (new `agents` / `slashCommands` / `skills` fields are additive), so `getSessionContextUsageSnapshot()` normalization needed no adaptation.
- 2026-09-02 能力接入：`conversation_reset` → sdkSessionId 重映射（captureSdkSessionId 跳过 reset 消息防误抛）；`commands_changed` → `onCommandsChanged` 订阅 surface；`onUserDialog`/`supportedDialogKinds` options 透传；Codex app-server `cache_write_input_tokens` → snapshot.cacheWriteTokens。
- 2026-09-08：三后端 SDK 刷新到 Claude 0.3.263、Codex 0.153.4、OpenCode 1.18.29。`core.backend` 负责 Claude 稳定系统信号的类型化兼容边界、permission prompt 所有权、Codex 新 effort/thread source 与 OpenCode provider timeout 类型兼容；实验性 usage 与无宿主控件的能力不得伪装为已支持。

## Pi service delegation (2026-09-08)

Pi runtime is delegated to [core.backend-pi](core-backend-pi.md). This owner retains the common registry/contracts and existing OpenCode/Claude/Codex implementations; Pi runtime responsibilities do not accumulate here.

- 2026-09-15: 新增 `AgentAuxQueryCapability` 与三个 aux 会话实现（`auxiliary/OpenCodeAuxScope.ts`、`auxiliary/OpenCodeAuxQuerySession.ts`、`auxiliary/ClaudeCodeAuxQuerySession.ts`、`auxiliary/CodexAuxQuerySession.ts`）。OpenCode/Claude/Codex 三个 adapter 各自实现 `startAuxQuerySession()`，全部 fail closed；`AppServerThreadStartOptions` 增加 `ephemeral`。
