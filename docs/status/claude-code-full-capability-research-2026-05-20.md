# Claude Code Full Capability Research - 2026-05-20

## Scope

This document records the pre-implementation evidence for adding a Claude Code backend to OpenCodian. It is research-only: no production code was changed.

The target working tree is `/Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/.worktrees/phase0-capability`.

## Source Priority

1. Official Claude Agent SDK and Claude Code documentation.
2. Local `claudian` source as a working Obsidian/Electron integration sample.
3. Current OpenCodian source and multi-agent foundation docs.

## Official Claude Sources

- Agent SDK overview: <https://code.claude.com/docs/en/agent-sdk/overview>
- Agent SDK quickstart: <https://code.claude.com/docs/en/agent-sdk/quickstart>
- TypeScript SDK reference: <https://platform.claude.com/docs/en/agent-sdk/typescript>
- Streaming input: <https://code.claude.com/docs/en/agent-sdk/streaming-vs-single-mode>
- Streaming output: <https://code.claude.com/docs/en/agent-sdk/streaming-output>
- Approvals and user input: <https://code.claude.com/docs/en/agent-sdk/user-input>
- Permissions: <https://code.claude.com/docs/en/agent-sdk/permissions>
- MCP: <https://code.claude.com/docs/en/agent-sdk/mcp>
- Hooks: <https://code.claude.com/docs/en/agent-sdk/hooks>
- Subagents: <https://code.claude.com/docs/en/agent-sdk/subagents>
- Sessions: <https://code.claude.com/docs/en/agent-sdk/sessions>
- External session storage: <https://code.claude.com/docs/en/agent-sdk/session-storage>
- Claude Code features in SDK: <https://code.claude.com/docs/en/agent-sdk/claude-code-features>
- Skills: <https://code.claude.com/docs/en/agent-sdk/skills>
- Hosting: <https://code.claude.com/docs/en/agent-sdk/hosting>
- npm package check: `npm view @anthropic-ai/claude-agent-sdk version dist-tags --json` returned latest `0.3.145`.

## Official Capability Matrix

| Capability | Status | Evidence / Decision |
|---|---|---|
| Query | Official confirmed | TypeScript entrypoint is `query({ prompt, options })`, returning an async generator over SDK messages. |
| Persistent query | Official confirmed | Streaming input mode supports a long-lived query fed by an `AsyncIterable<SDKUserMessage>`. This is the recommended OpenCodian chat path. |
| Streaming output | Official confirmed | `includePartialMessages: true` exposes raw stream events. OpenCodian must accumulate text/tool deltas and normalize them to `StreamChunk`. |
| V2 session API | Ambiguous | Official pages conflict: one says TS V2 session API was removed after `0.3.142`, while another still references it. Phase 1 must avoid V2 and use `query()`. |
| Model selection | Official confirmed | `model`, `fallbackModel`, runtime `setModel()`, and `supportedModels()` exist. |
| Thinking / effort | Official confirmed | `thinking` supports adaptive/enabled/disabled forms; `effort` supports low/medium/high/max. |
| Permission modes | Official confirmed | Modes include `default`, `dontAsk`, `acceptEdits`, `bypassPermissions`, `plan`, and TS-only `auto`. |
| Approval callback | Official confirmed | `canUseTool(toolName, input, options)` can allow, deny, interrupt, and update input/permissions. |
| Tools | Official confirmed | Built-ins include file ops, shell, search, web tools, question/plan/todo/agent-related tools; exact list must be verified against installed package types. |
| `allowedTools` / `disallowedTools` | Official confirmed | `allowedTools` pre-approves, but is not a sandbox. `disallowedTools` blocks tools and can remove definitions from context. |
| MCP | Official confirmed | `mcpServers` supports local and remote transports plus in-process SDK servers. Runtime `setMcpServers()` exists. |
| Hooks | Official confirmed | Programmatic and filesystem hooks exist; important events include tool, permission, session, compact, notification, and subagent hooks. |
| Subagents / agents | Official confirmed with drift risk | Programmatic `agents` and filesystem agents exist. `Agent` tool must be permitted. Docs and package types may differ on advanced fields. |
| Sessions | Official confirmed | Claude stores JSONL under `~/.claude/projects/...`; supports resume, continue, fork, resume-at, and external store mirroring. |
| CLAUDE.md / settings | Official confirmed with conflict | Docs conflict on default `settingSources`. OpenCodian must set it explicitly. |
| Skills | Official confirmed | Skills are filesystem artifacts discovered from settings sources/plugins. No programmatic skill registration API was found. |
| Additional directories | Official confirmed | `additionalDirectories` grants access outside `cwd`; current docs do not show it as dynamically updateable. |
| Auth/provider mode | Official confirmed | API key and cloud provider env vars are supported. Third-party products should not assume claude.ai subscription login passthrough. |
| Executable model | Official confirmed | TS SDK bundles a native Claude Code binary as optional dependencies; `pathToClaudeCodeExecutable` can point to an external install. |
| Electron exception | Not found | Official docs do not describe Electron-specific exceptions. `claudian` supplies local workarounds. |

## Claudian Evidence

Primary source inspected:

- `/Volumes/SDD2T/obsidian-vault-write/open-source-project/obsidian-plugins/opencodian-reference-projects/claudian`

Important implementation files:

- `package.json`: depends on `@anthropic-ai/claude-agent-sdk`.
- `src/providers/claude/runtime/ClaudeChatRuntime.ts`: imports SDK `query`, uses both persistent and cold-start query paths.
- `src/providers/claude/runtime/ClaudeQueryOptionsBuilder.ts`: maps settings to SDK `Options`.
- `src/providers/claude/runtime/ClaudeDynamicUpdates.ts`: uses `setModel`, `applyFlagSettings`, `setPermissionMode`, and `setMcpServers`.
- `src/providers/claude/runtime/ClaudeApprovalHandler.ts`: implements `canUseTool`.
- `src/providers/claude/runtime/customSpawn.ts`: custom Electron-safe spawn.
- `src/providers/claude/cli/findClaudeCLIPath.ts` and `runtime/ClaudeCliResolver.ts`: CLI path discovery.
- `src/providers/claude/history/*`: JSONL session parsing, branch filtering, subagent sidecar hydration.
- `src/providers/claude/storage/*`: `.claude/settings.json`, `.claude/mcp.json`, `.claude/skills`, `.claude/agents`, and local metadata.

## Claudian Mapping Matrix

| Capability | SDK direct | Claudian-owned adaptation |
|---|---|---|
| Query | `query()` | Persistent `MessageChannel`, cold-start fallback, crash recovery. |
| Stream events | SDK messages | `transformSDKMessage()` maps text/thinking/tool/usage/subagent events to local chunks. |
| Sessions | SDK JSONL and resume/fork options | Metadata store, provider state, history rebuild, JSONL parser, branch filter. |
| Permissions | `canUseTool`, permission updates, `setPermissionMode` | Approval UI bridge, ask-user-question bridge, plan-exit handling, allowed-tool enforcement. |
| MCP | `mcpServers`, `setMcpServers` | `.claude/mcp.json`, enable/disable metadata, mention-gated active servers, disabled MCP tool mapping. |
| Model/thinking | `model`, `setModel`, `thinking`, `effort`, `applyFlagSettings` | Model aliases, adaptive/fixed thinking rules, session invalidation around env/model changes. |
| CLI/process | SDK executable path and custom spawn hook | PATH enhancement, Node executable resolution, cross-realm AbortSignal workaround, CLI detection UI. |
| CLAUDE.md/settings | SDK/CLI via `settingSources` | Explicit setting-source toggle; no local CLAUDE.md parser found. |
| Skills | SDK/CLI filesystem discovery | Fallback reader/writer for `.claude/skills/*/SKILL.md`. |
| Subagents | SDK init and `Agent` tool | File agent catalog, fallback built-ins, Stop hook, async sidecar JSONL hydration. |
| Hooks | SDK hooks | Only subagent Stop hook was prominent in the runtime path. |
| Additional directories | SDK option | Treated as restart-required, not live-updateable. |

## OpenCodian Seam Inventory

| Area | Current seam | Gap before Claude Phase 1 |
|---|---|---|
| Backend registry | `src/core/agents/backend/AgentServiceRegistry.ts` exists and tracks registered/enabled/active adapters. | Registering Claude is blocked by `IMPLEMENTED_AGENT_BACKENDS` and no adapter implementation. |
| Adapter contract | `src/core/agents/backend/AgentService.ts` defines lifecycle and optional capabilities. | It lacks backend-neutral chat/session methods; send path remains OpenCode-bound. |
| OpenCode adapter | `src/core/agents/backend/OpenCodeAdapter.ts` delegates broad OpenCode capabilities. | It is a good reference, but includes OpenCode-specific method shapes. |
| Settings gate | `SettingsBackendSection.ts` lists future backends but filters to implemented backends. | Claude settings owners do not exist; OpenCode settings tabs are mostly gated by `backendRequired: 'opencode'`. |
| Conversation data | `Conversation.backend` and `AgentBackendKind` exist. | `openCodeSessionId` is still required and heavily referenced across chat/session services. |
| Send pipeline | `SendPipelineRuntime` is already separated from the view. | `sendStreamMessage` delegates to `plugin.openCodeService.sendMessage()` and passes `openCodeSessionId`. |
| Availability | Chat distinguishes no backend from backend offline. | Availability is still OpenCode server availability, not backend registry status. |
| Model/settings | Model catalog and title generation are OpenCode-specific. | Claude model catalog, thinking/effort, and auth settings need capability-specific owners. |
| Tools/MCP/permissions | Existing UI and stream rendering can represent tools, MCP, questions, and permissions. | Tool names, permission semantics, and MCP settings need backend-specific translation rather than shared OpenCode config. |

## Conclusions

- OpenCodian should use the official TypeScript Claude Agent SDK as the primary integration path.
- OpenCodian should keep a CLI executable path fallback because the SDK still spawns a Claude Code executable and Electron packaging/PATH issues are real in `claudian`.
- "Claude full capability" must mean shared backend capabilities plus Claude-specific capability surfaces. A 1:1 flattening into generic OpenCode settings would hide important Claude semantics.
- Phase 1 should not expose all Claude UI at once. It should prove a minimal but real loop: authenticate/configure executable, create/resume a Claude-owned conversation, stream text/thinking/tools, bridge `canUseTool`/`AskUserQuestion`, pass MCP servers, and preserve OpenCode regression safety.
- History parsing, session mapping, dynamic updates, custom spawn, and settings merge are not all official SDK features. `claudian` shows they are necessary adaptation layers for a polished Obsidian plugin.
