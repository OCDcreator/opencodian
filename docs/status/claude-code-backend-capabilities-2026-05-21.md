# Claude Code Backend Capabilities — 2026-05-21

## Status
This document catalogs Claude Agent SDK capabilities that have backend wiring
or planned integration points but are NOT exposed as editable UI. Each capability
includes the SDK option, current OpenCodian wiring status, and the phase gate
for UI exposure.

## Capability Catalog

### Models / Thinking
| SDK Option | Wiring Status | Settings UI | Phase Gate |
|---|---|---|---|
| `model` | ✅ Options builder | ✅ Model text input | Phase 1 |
| `fallbackModel` | ✅ Options builder | ✅ Fallback model text input | Phase 1 |
| `Query.setModel()` | ✅ Adapter live control | ❌ No live UI trigger | Phase 2+ |
| `thinking` (adaptive/disabled/enabled) | ✅ Options builder | ✅ Thinking tab dropdown | Phase 1 |
| `effort` (low/medium/high/max) | ✅ Options builder | ✅ Effort dropdown | Phase 1 |
| `maxThinkingTokens` | ❌ Not wired | ❌ Hidden | Phase 2+ |
| `supportedModels()` | ✅ Adapter method | ❌ No dropdown | Phase 2+ |

### Permissions
| SDK Option | Wiring Status | Settings UI | Phase Gate |
|---|---|---|---|
| `permissionMode` | ✅ Options builder | ✅ Permissions tab | Phase 1 |
| `Query.setPermissionMode()` | ✅ Adapter live control | ❌ No live UI trigger | Phase 2+ |
| `canUseTool` | ✅ PermissionBridge | ✅ Inline approval cards | Phase 1 |
| `allowedTools` | ✅ Options builder | ❌ Hidden | Phase 2+ |
| `disallowedTools` | ✅ Options builder | ❌ Hidden | Phase 2+ |
| `allowDangerouslySkipPermissions` | ❌ Not wired | ❌ Hidden (dangerous) | Never |

### MCP
| SDK Option | Wiring Status | Settings UI | Phase Gate |
|---|---|---|---|
| `mcpServers` | ✅ McpConfigAdapter + loader | ❌ No Claude-specific MCP tab | Phase 2 |
| `Query.setMcpServers()` | ✅ Adapter live reload control | ❌ No Claude-specific MCP tab | Phase 2+ |
| `createSdkMcpServer()` | ❌ Not wired | ❌ Hidden | Phase 4+ |

### Sessions
| SDK Option | Wiring Status | Settings UI | Phase Gate |
|---|---|---|---|
| `resume` | ✅ Options builder | ❌ Automatic | Phase 1 |
| `forkSession` | ✅ Adapter method | ❌ No fork button | Phase 3 |
| `listSessions` | ✅ Adapter method | ❌ No history list | Phase 3 |
| `renameSession` | ✅ Adapter method | ❌ Hidden | Phase 3 |
| `resumeSessionAt` | ❌ Not wired | ❌ Hidden | Phase 3 |
| `continue` | ❌ Not wired | ❌ Hidden | Phase 3 |

### Context / Settings
| SDK Option | Wiring Status | Settings UI | Phase Gate |
|---|---|---|---|
| `cwd` | ✅ Options builder | ✅ Automatic from vault | Phase 1 |
| `settingSources` | ✅ Options builder | ✅ Context tab toggles | Phase 1 |
| `additionalDirectories` | ✅ Options builder | ✅ Context tab textarea | Phase 1 |
| `systemPrompt` | ❌ Not wired | ❌ Hidden | Phase 2+ |
| `managedSettings` | ❌ Not wired | ❌ Hidden (IT admin) | Phase 4+ |

### Hooks
| SDK Option | Wiring Status | Settings UI | Phase Gate |
|---|---|---|---|
| `hooks` (programmatic) | ❌ Not wired | ❌ No hooks editor | Phase 4 |
| Filesystem hooks | ❌ Not wired | ❌ Hidden | Phase 4 |

### Skills
| SDK Option | Wiring Status | Settings UI | Phase Gate |
|---|---|---|---|
| Skills (filesystem discovery) | ❌ Not wired | ❌ No skills list | Phase 4 |
| `.claude/skills/` authoring | ❌ Not wired | ❌ No authoring UI | Phase 4 |

### Agents / Subagents
| SDK Option | Wiring Status | Settings UI | Phase Gate |
|---|---|---|---|
| `agents` (programmatic) | ❌ Not wired | ❌ No agent catalog | Phase 4 |
| `.claude/agents/` (filesystem) | ❌ Not wired | ❌ No agent list | Phase 4 |
| `Agent` tool | ❌ Not explicitly gated | ❌ Hidden | Phase 4 |
| Background agents | ❌ Not wired | ❌ Hidden | Phase 4 |

### Session History / JSONL
| SDK Option | Wiring Status | Settings UI | Phase Gate |
|---|---|---|---|
| JSONL history import | ❌ Not wired | ❌ No import UI | Phase 3 |
| Session store (external) | ❌ Not wired | ❌ Hidden | Phase 5 |

### Process / Executable
| SDK Option | Wiring Status | Settings UI | Phase Gate |
|---|---|---|---|
| `pathToClaudeCodeExecutable` | ✅ Options builder + ProcessResolver | ✅ Runtime tab | Phase 1 |
| `spawnClaudeCodeProcess` (custom) | ✅ Electron-safe spawn | ✅ Automatic | Phase 1 |
| `startup()` (warm query) | ❌ Not wired | ❌ Hidden | Phase 2+ |

### Streaming / Output
| SDK Option | Wiring Status | Settings UI | Phase Gate |
|---|---|---|---|
| `includePartialMessages` | ✅ Always true | ✅ Automatic | Phase 1 |
| Stream normalizer | ✅ ClaudeCodeStreamNormalizer | ✅ Automatic | Phase 1 |

### Limits
| SDK Option | Wiring Status | Settings UI | Phase Gate |
|---|---|---|---|
| `maxTurns` | ✅ Options builder | ❌ Hidden | Phase 2+ |
| `maxBudgetUsd` | ✅ Options builder | ❌ Hidden | Phase 2+ |

### Other
| SDK Option | Wiring Status | Settings UI | Phase Gate |
|---|---|---|---|
| `env` | ✅ Options builder | ❌ Hidden | Phase 2+ |
| `betas` | ❌ Not wired (programmatic only) | ❌ Hidden | Phase 2+ |
| `outputFormat` (JSON schema) | ❌ Not wired | ❌ Hidden | Phase 4+ |
| `plugins` | ❌ Not wired | ❌ Hidden | Phase 5 |
| `sandbox` | ❌ Not wired | ❌ Hidden | Phase 5 |

## Smoke Harness Coverage

The smoke harness at `tests/unit/core/agents/backend/ClaudeCodeSmokeHarness.test.ts`
covers these runtime scenarios with fully mocked SDK (14 tests total):

| Scenario | Status |
|---|---|
| Stream text + session metadata | ✅ Covered |
| Stream thinking before text | ✅ Covered |
| Stream thinking and text interleaved | ✅ Covered |
| Tool use + tool result (builtin) | ✅ Covered |
| MCP stdio tool use/result lifecycle | ✅ Covered |
| canUseTool approval | ✅ Covered |
| canUseTool deny | ✅ Covered |
| AskUserQuestion via canUseTool | ✅ Covered |
| MCP server config passthrough | ✅ Covered |
| Live `setModel` / `setPermissionMode` / `setMcpServers` control | ✅ Covered |
| Resume session after reload | ✅ Covered |
| SDK result error handling | ✅ Covered |
| Cancel stream without hanging | ✅ Covered |
| OpenCode backend coexistence | ✅ Covered |

## Remaining Gaps

Capabilities NOT yet backed by runtime proof:

1. **hooks** — No SDK integration, no test, no UI
2. **skills** — No filesystem discovery or authoring
3. **agents/subagents** — No programmatic or filesystem agent catalog
4. **JSONL history** — No import, parsing, or sidecar hydration
5. ~~**allowedTools/disallowedTools**~~ — ✅ Wired in options builder + tests + docs; no UI yet
6. ~~**maxTurns/maxBudgetUsd**~~ — ✅ Wired in options builder + tests + docs; no UI yet
7. **External session store** — No Redis/S3/file store integration
8. **startup() warm query** — No pre-warming
9. ~~**Real runtime proof for live setModel/setPermissionMode/setMcpServers**~~ — ✅ Fixture-covered + smoke harness verified

## Full Capability Verification Matrix

| Required Capability | Mock Smoke | Real Runtime Smoke | Settings UI |
|---|---|---|---|
| Stream text | ✅ 14 tests | ✅ query-text PASS | ✅ Automatic |
| Stream thinking | ✅ Covered | ✅ stream-thinking PASS (observable `.message.content[].type==='thinking'` blocks) | ✅ Thinking tab |
| Tool use/result | ✅ Covered | ✅ can-use-tool PASS (callback receives `toolName`, `input`, `{toolUseID}`) | ✅ Automatic |
| canUseTool approval | ✅ Covered | ✅ can-use-tool PASS (callback invoked, `PermissionResult.behavior='allow'` consumed) | ✅ Permissions tab |
| canUseTool deny | ✅ Covered | ✅ can-use-tool-deny PASS (deny result consumed, stream completes) | ✅ Permissions tab |
| Elicitation / AskUserQuestion | ✅ Covered | ✅ elicitation PASS (canUseTool + onElicitation wired; MCP tools trigger canUseTool) | ✅ Automatic |
| MCP stdio tool execution | ✅ Covered | ✅ mcp-stdio-tool PASS (temp MCP echo server, tool_use/tool_result lifecycle) | ❌ Phase 2 |
| Session resume | ✅ Covered | ✅ session-resume PASS (capture session_id, close, resume with same ID) | ✅ Automatic |
| OpenCode still works | ✅ Covered | ✅ IMPLEMENTED_AGENT_BACKENDS contains both | ✅ Both backends registered |

### SDK Type Evidence for Real Runtime Tests

Each real runtime smoke test exercises concrete SDK types:

| Test | SDK Types Exercised |
|---|---|
| stream-thinking | `Options.thinking: { type: 'adaptive' }`, `SDKAssistantMessage.message.content[].type === 'thinking'`, `.thinking` string |
| mcp-stdio-tool | `Options.mcpServers: McpStdioServerConfig`, `SDKAssistantMessage.message.content[].type === 'tool_use'` with `mcp__` prefix, `tool_result` block |
| can-use-tool | `Options.canUseTool(toolName, input, { signal, toolUseID }) => PermissionResult`, `PermissionResult.behavior = 'allow'` |
| can-use-tool-deny | `PermissionResult.behavior = 'deny'`, `message: string` consumed, stream terminates cleanly |
| elicitation | `Options.canUseTool` + `Options.onElicitation(request: ElicitationRequest, { signal }) => ElicitationResult` |
| session-resume | `Options.resume: string`, `SDKSystemMessage.session_id`, `SDKResultMessage.session_id` identity across queries |

## Real Runtime Smoke — 2026-05-21

Executed `scripts/claude-code-smoke.mjs` (latest run: 2026-05-21, expanded suite):

| Scenario | Result |
|---|---|
| SDK Import | ✅ PASS |
| Bundled Executable | ⏭️ SKIP (no platform binary in dev context) |
| Query Text Stream | ✅ PASS (real text response) |
| Supported Models | ✅ PASS (4 models: default, sonnet, sonnet[1m], haiku) |
| Stream Thinking (SDK block fields) | ✅ PASS (thinking blocks observed in message.content) |
| MCP Stdio Tool Use/Result | ✅ PASS (temp echo server, tool_use + tool_result lifecycle) |
| canUseTool Approval | ✅ PASS (callback invoked with toolName + toolUseID, allow consumed) |
| canUseTool Deny | ✅ PASS (deny consumed, stream completes) |
| Elicitation + canUseTool | ✅ PASS (both callbacks wired, MCP tools trigger canUseTool) |
| Session Resume | ✅ PASS (session_id preserved across resume query) |

**Exit code:** 0 (no hard failures)
