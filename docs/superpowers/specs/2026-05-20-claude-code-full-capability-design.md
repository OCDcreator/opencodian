# Claude Code Full Capability Integration Design

**Date:** 2026-05-20

**Status:** [READY-FOR-IMPLEMENTATION-PLANNING]

## Goal

Define how OpenCodian should integrate Claude Code as the first non-OpenCode backend while preserving OpenCode behavior and exposing Claude-specific power without forcing it into OpenCode-shaped settings.

This is a pre-implementation design. It does not claim the adapter is implemented.

## Evidence Base

| Evidence | Source |
|---|---|
| Official Claude SDK behavior | Claude Agent SDK docs and npm package `@anthropic-ai/claude-agent-sdk@0.3.145`. |
| Obsidian/Electron integration sample | Local `claudian` source at `/Volumes/SDD2T/obsidian-vault-write/open-source-project/obsidian-plugins/opencodian-reference-projects/claudian`. |
| OpenCodian landing constraints | Current worktree source under `src/core/agents/backend/**`, `src/core/opencode/**`, `src/features/chat/**`, and `src/features/settings/**`. |
| Detailed evidence | `docs/status/claude-code-full-capability-research-2026-05-20.md`. |

## Key Decisions

| Question | Decision |
|---|---|
| Primary integration path | Use official TypeScript Claude Agent SDK `query()` streaming as the primary path. |
| CLI wrapper path | Keep CLI path/executable fallback and Electron-safe spawn as a packaging/runtime escape hatch, not the main protocol. |
| SDK V2 session API | Do not use in Phase 1 because official docs conflict on whether it is removed. |
| "Full capability" definition | Split into shared backend capabilities plus Claude-specific capabilities. Do not force 1:1 UI flattening. |
| `claudian` reuse | Reuse patterns, not code wholesale: persistent query, message channel, custom spawn concept, JSONL history mirror, dynamic update split. |
| Phase 1 UI | Expose only the controls needed for a safe end-to-end Claude loop; advanced controls can be runtime-only until validated. |
| OpenCode regression posture | Phase 0 must leave OpenCode as the only implemented runtime backend until Claude adapter passes smoke and contract tests. |

## Official Claude Capability Matrix

| Capability | Official status | OpenCodian design response |
|---|---|---|
| `query()` | Confirmed | `ClaudeCodeAdapter` wraps `query({ prompt, options })`. |
| Persistent query | Confirmed | Use `AsyncIterable<SDKUserMessage>` for chat sessions, with cold-start fallback. |
| Stream handling | Confirmed | Map SDK messages and partial stream events to existing `StreamChunk`. |
| Model selection | Confirmed | Add Claude model catalog/provider capability; map `model` and `fallbackModel`. |
| Effort/thinking | Confirmed | Add Claude settings for `effort` and `thinking`, mapping to existing effort/thinking UX only where semantics match. |
| Permission modes | Confirmed | Map OpenCodian modes into Claude modes, preserving Claude-only `dontAsk`, `acceptEdits`, `auto`, and `plan`. |
| `canUseTool` | Confirmed | Bridge to existing permission/question UI and return SDK `PermissionResult`. |
| Tools | Confirmed | Normalize built-ins, MCP tools, Agent tool, AskUserQuestion, Todo/Plan tools into shared tool rendering with Claude source metadata. |
| `allowedTools` / `disallowedTools` | Confirmed | Treat as Claude-specific policy inputs; document that `allowedTools` is not a sandbox. |
| MCP servers | Confirmed | Pass configured/selected MCP servers to SDK; add Claude-specific storage compatibility with `.claude/mcp.json` only after runtime proof. |
| Hooks | Confirmed | Phase later. Runtime hook support starts with internal hooks needed for subagent/background correctness. |
| Subagents / agents | Confirmed | Phase 1 can allow the Agent tool if explicitly enabled; full file-agent management and sidecar hydration are later. |
| Session resume/fork | Confirmed | Store Claude session id separately from OpenCode session id and support resume/fork after core chat works. |
| External session store | Confirmed | Later phase. Do not block Phase 1 on external store mirroring. |
| CLAUDE.md/settings | Confirmed but default conflict | Set `settingSources` explicitly. Do not rely on SDK defaults. |
| Skills | Confirmed | Later UI. Phase 1 may allow SDK-discovered skills through setting sources but should not author skills yet. |
| Additional directories | Confirmed | Use for external context; treat changes as restart-required. |
| Authentication/provider mode | Confirmed | Prefer API-key/provider env configuration. Do not assume claude.ai subscription login in a third-party product. |
| Bundled executable | Confirmed | SDK bundles platform binary via optional dependency; still support `pathToClaudeCodeExecutable`. |
| Electron specifics | Not official | Use `claudian` as evidence for custom spawn and PATH/Node workarounds. |

## Claudian Capability Mapping

| Area | SDK-native in `claudian` | Claudian-owned shell | OpenCodian implication |
|---|---|---|---|
| Query | `agentQuery()` | Persistent `MessageChannel`, cold-start fallback, crash recovery | Implement an adapter-owned persistent runtime, not a raw one-shot wrapper. |
| Stream transform | SDK messages | `transformSDKMessage()` and dedup state | Add a Claude stream normalizer with fixture tests. |
| Permissions | `canUseTool`, permission updates | Approval UI bridge, AskUserQuestion bridge, plan-exit handling | Reuse OpenCodian permission/question renderers with Claude metadata. |
| MCP | `mcpServers`, `setMcpServers` | `.claude/mcp.json`, `_claudian` metadata, mention gating | Start with runtime pass-through; authoring `.claude/mcp.json` can wait. |
| Sessions | SDK JSONL | Metadata mirror, history rebuild, branch filter | Add `backendSessionId`, keep local conversation metadata, defer full JSONL import. |
| Subagents | SDK Agent tool/init messages | File-agent catalog, Stop hook, sidecar parsing | Phase subagents: enable basic tool later, then full catalog/history. |
| CLI path | SDK executable option | resolver, PATH enhancement, custom spawn | Copy the concept because Obsidian Electron needs it. |
| Settings | SDK `settingSources` | provider config migration and explicit toggle | OpenCodian should explicitly store Claude setting-source mode. |
| Skills | SDK filesystem discovery | fallback `.claude/skills` reader/writer | Runtime discovery first, authoring later. |

## OpenCodian Seam / Owner / Migration Map

| Owner | Current state | Required migration |
|---|---|---|
| `src/core/agents/backend/AgentService.ts` | Lifecycle/capability interface exists. | Add backend-neutral chat/session capability or core methods before Claude can mount cleanly. |
| `src/core/agents/backend/AgentServiceRegistry.ts` | Registry manages registered/enabled/active adapters. | Register Claude behind feature/implemented gate after adapter tests. |
| `src/core/agents/backend/OpenCodeAdapter.ts` | Broad OpenCode facade exists. | Keep as regression reference; do not force Claude to implement unsupported OpenCode-specific methods. |
| `src/core/types/chat.ts` | `AgentBackendKind`, `Conversation.backend`, and ACP-reserved session fields exist; `openCodeSessionId` is still required. | Genericize `acpSessionId` to `backendSessionId`, add `backendAgentId`, and make `openCodeSessionId` optional for non-OpenCode conversations. |
| `src/main.ts` | Creates OpenCode session directly and stores `openCodeSessionId`. | Route new-session creation through active backend only after OpenCode direct-routing tests pass. |
| `src/features/chat/runtime/SendPipelineRuntime.ts` | Transport port exists but carries OpenCode session id. | Generalize session id and route through backend chat capability. |
| `src/features/chat/OpenCodianView.ts` | Capability lookup partly uses registry; actual send/cancel/sync use `openCodeService`. | Migrate send/cancel first, then sync/history/todo/branch features by capability. |
| `src/features/chat/services/*` | Many services use `openCodeSessionId`. | Add backend-aware session accessor and capability gates before enabling Claude conversations. |
| `src/features/settings/SettingsBackendSection.ts` | Future backend options are filtered by `IMPLEMENTED_AGENT_BACKENDS`. | Keep hidden until Claude adapter passes runtime smoke. |
| `src/features/settings/settingsLayoutRegistry.ts` | OpenCode-specific tabs are gated. | Add backend-global, OpenCode-only, Claude-only, and capability-driven tab categories. |
| `src/core/config/ModelConfigService.ts` | OpenCode catalog merger. | Do not reuse for Claude models without a backend-specific catalog adapter. |
| `src/shared/toolIdentity.ts` and stream renderers | Tool rendering is centralized enough for new source metadata. | Add Claude tool source/classification without changing OpenCode behavior. |

## Shared vs Claude-Specific Capabilities

Shared capabilities:

- `chat`: send user messages and receive `StreamChunk`.
- `sessions`: create, resume, delete, title, and list backend-owned sessions where supported.
- `models`: list/select models with provider/source metadata.
- `tools`: stream/render tool use/result and expose a tool catalog when available.
- `permissions`: request and answer approvals.
- `mcp`: pass server configs and report status.
- `context`: current note, selections, files, images, and additional directories.

Claude-specific capabilities:

- `claude.executable`: bundled binary/external executable/PATH diagnostics.
- `claude.settingSources`: explicit user/project/local/none loading.
- `claude.permissionMode`: `dontAsk`, `acceptEdits`, `bypassPermissions`, `plan`, `auto`.
- `claude.thinking`: adaptive/fixed token thinking and effort.
- `claude.hooks`: programmatic and filesystem hook exposure.
- `claude.skills`: filesystem-discovered skills and later authoring.
- `claude.agents`: programmatic/file agents and Agent tool gating.
- `claude.sessionJsonl`: JSONL history import, fork/resume-at, subagent sidecar hydration.
- `claude.additionalDirectories`: access expansion outside vault/current cwd.

## Phase Strategy

| Phase | Goal | User-visible result |
|---|---|---|
| Phase 0 | Finish backend abstraction and prove OpenCode non-regression. | OpenCode still behaves exactly as before; no Claude UI exposed. |
| Phase 1 | Minimal Claude backend loop. | Claude can be enabled, start a conversation, stream replies/tools, ask permissions/questions, and resume its backend session. |
| Phase 2 | Claude runtime completeness. | Models/thinking, MCP runtime, setting sources, additional directories, executable diagnostics are operable. |
| Phase 3 | Claude session/history/branching completeness. | Resume/fork/history import and backend-aware conversation list are reliable. |
| Phase 4 | Claude ecosystem UI. | Skills, agents/subagents, hooks, MCP authoring, and permission policy editors are surfaced carefully. |
| Phase 5 | Full capability polish and cross-backend UX. | Shared capability UI and Claude-specific advanced UI are coherent, tested, and documented. |

## Runtime Verification Requirements

Must have live runtime verification before claiming implemented:

- SDK import and bundled/external executable startup in Obsidian Electron.
- Persistent query streaming text and thinking.
- Tool use/result rendering from real SDK events.
- `canUseTool` approval and `AskUserQuestion`.
- MCP server pass-through with at least one local stdio server.
- Resume existing Claude session id after reload.
- OpenCode send/new session still works after Claude is installed but disabled.

Can start with unit/integration tests before runtime:

- `Options` builder mapping.
- Stream event normalizer fixtures.
- Conversation `backendSessionId` migration.
- Registry implemented-backend filtering.
- Settings tab capability gating.
- Permission result translation.

## Risks And Fallbacks

| Risk | Mitigation / fallback |
|---|---|
| SDK docs drift | Pin package version during implementation and generate type-backed fixtures. |
| Electron spawn failure | Add custom spawn similar to `claudian`; allow configured executable path. |
| Optional binary missing in bundle | Runtime diagnostic and `pathToClaudeCodeExecutable` fallback. |
| Permission semantics differ from OpenCode | Keep Claude permission modes separate and map only the shared approval UI. |
| `openCodeSessionId` coupling causes regressions | Genericize existing ACP session fields to `backendSessionId`; make `openCodeSessionId` optional while preserving it for old data and OpenCode paths. |
| Settings source confusion | Explicit `settingSources` setting; no implicit SDK default. |
| Advanced Claude features overload UI | Gate advanced panels behind capability sections and ship runtime-only first. |

## Exit Criteria For This Design

This design is ready to implement when:

- The implementation plan names exact files, tests, and phase gates.
- Phase 0 is treated as a mandatory OpenCode non-regression gate.
- Claude Phase 1 is a real end-to-end loop, not a toy one-shot prompt.
- Later phases cover the full Claude capability surface without promising all UI at once.
