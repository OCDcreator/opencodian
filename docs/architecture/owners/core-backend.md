# Owner: core.backend

> Auto-generated scaffold from `architecture-owners.config.json`. The manifest is the canonical truth source; this page narrates the model and records hard-to-automate rationale. Update it when the owner boundary or its non-obvious invariants change.

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
- Run `npm run inspect:owner -- <this owner or a path>` for an always-fresh summary.

## SDK upgrade notes
- 2026-09-02: `@anthropic-ai/claude-agent-sdk` upgraded `0.3.145 → 0.3.252`. `Query.interrupt()` now resolves to `SDKControlInterruptResponse | undefined` (interrupt receipt on `interrupt_receipt_v1`-capable CLIs); `ClaudeCodeSessionRuntime.query.interrupt` was widened to `() => Promise<unknown>` since OpenCodian discards the receipt. `SDKControlGetContextUsageResponse` kept `model` / `totalTokens` / `maxTokens` unchanged (new `agents` / `slashCommands` / `skills` fields are additive), so `getSessionContextUsageSnapshot()` normalization needed no adaptation.
- 2026-09-02 能力接入：`conversation_reset` → sdkSessionId 重映射（captureSdkSessionId 跳过 reset 消息防误抛）；`commands_changed` → `onCommandsChanged` 订阅 surface；`onUserDialog`/`supportedDialogKinds` options 透传；Codex app-server `cache_write_input_tokens` → snapshot.cacheWriteTokens。
- 2026-09-08：三后端 SDK 刷新到 Claude 0.3.263、Codex 0.153.4、OpenCode 1.18.29。`core.backend` 负责 Claude 稳定系统信号的类型化兼容边界、permission prompt 所有权、Codex 新 effort/thread source 与 OpenCode provider timeout 类型兼容；实验性 usage 与无宿主控件的能力不得伪装为已支持。
