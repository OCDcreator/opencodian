# ACP Client, Skill Management, and Tool Integration Design

**Date:** 2026-05-13
**Status:** [REVIEW]

## Overview

This spec covers three features for the OpenCodian Obsidian plugin:

1. **ACP Client Integration** — Connect to external ACP-compatible AI coding agents (Codex, Claude Code, OpenClaw, etc.) from within Obsidian
2. **Skill Discovery & Management** — Browse, inspect, and configure permissions for OpenCode Skills
3. **Tool Catalog Integration** — Display built-in and custom tool catalogs with schema inspection and permission control

**Not parallel-safe.** All three share settings schema, settings layout registry, i18n strings, and the permission config surface (written through `OpencodeConfigManager`). They should be developed as sequential vertical slices with shared infrastructure extracted first.

### Slicing order

1. **Slice 0 — Shared foundation:** Permission write-through to `OpencodeConfigManager`, settings layout + i18n slots for all three tabs.
2. **Slice 1 — Skill Management:** Least coupling to send pipeline; validates permission-write path end-to-end.
3. **Slice 2 — Tool Catalog:** Extends existing `OpenCodeCatalogStateStore`; reuses same permission surface.
4. **Slice 3 — ACP Client:** Highest complexity; introduces new transport owner alongside existing send chain.

---

## Shared Infrastructure (Slice 0)

### Permission Write-Through

Both Skill and Tool permissions must write to the project-level `.opencode/opencode.json` file via `OpencodeConfigManager.setToolPermission(tool, action)`. Plugin settings only store UI preferences (collapsed state, cache TTL), not runtime-effective permissions.

**Key existing API:**

```typescript
// src/core/config/OpencodeConfigManager.ts:327
async setToolPermission(tool: string, action: PermissionAction): Promise<void> {
  const config = await this.read();
  if (typeof config.permission === 'string') {
    config.permission = { '*': config.permission };
  }
  if (!config.permission || typeof config.permission !== 'object') {
    config.permission = {};
  }
  const permission = config.permission as PermissionConfig;
  permission[tool as keyof PermissionConfig] = action;
  await this.write(config);
}
```

**Existing permission types (`src/core/types/permission.ts`):**

- `PermissionAction` = `'allow' | 'deny' | 'ask'`
- `PermissionConfig` has typed fields for: `read`, `edit`, `write`, `bash`, `glob`, `grep`, `list`, `task`, `skill`, `lsp`, `webfetch`, `websearch`, `codesearch`, `external_directory`, `doom_loop`, `todoread`, `todowrite`, plus catch-all `'*'`
- `PermissionMode` = `'yolo' | 'normal' | 'plan'`

All permission UI controls in Skill and Tool tabs must call `OpencodeConfigManager.setToolPermission()`. Plugin settings store only cosmetic state.

### Settings Layout

New tabs registered in the existing `settingsLayoutRegistry`:

| Tab ID | Label Key | Feature |
|--------|-----------|---------|
| `acp` | `settings.acp.tab` | ACP Agents |
| `skills` | `settings.skills.tab` | Skills |
| `tools` | `settings.tools.tab` | Tools |

All three need i18n strings added to both locale files (`en` and `zh-CN`).

---

## 1. ACP Client Integration (Slice 3)

### Goal

Allow OpenCodian to act as an ACP **client**, spawning and communicating with external ACP-compatible AI coding agents via the Agent Client Protocol (JSON-RPC over stdio/NDJSON).

### Architecture

```
┌─────────────────────────────────────────────────────┐
│                  OpenCodian Plugin                   │
│                                                      │
│  ┌───────────────────────────────────────────────┐   │
│  │  AcpClientManager                             │   │
│  │  - Manages external agent config list         │   │
│  │  - Spawns/stops ACP agent processes           │   │
│  │  - Persists config to plugin settings         │   │
│  │  - Tracks connection lifecycle states          │   │
│  └───────────────┬───────────────────────────────┘   │
│                  │                                   │
│  ┌───────────────▼───────────────────────────────┐   │
│  │  AcpTransportOwner                            │   │
│  │  - Alternative to OpenCodeStreamingRuntime     │   │
│  │  - Bridges ACP events → StreamChunk objects   │   │
│  │  - Owns ACP session lifecycle                 │   │
│  │  - Routes permission requests to UI           │   │
│  └───────────────┬───────────────────────────────┘   │
│                  │                                   │
│  ┌───────────────▼───────────────────────────────┐   │
│  │  @agentclientprotocol/sdk                     │   │
│  │  - ClientSideConnection                       │   │
│  │  - JSON-RPC over stdio (NDJSON)               │   │
│  └───────────────────────────────────────────────┘   │
│                  │ child_process.spawn()             │
└──────────────────┼──────────────────────────────────┘
                   │
        ┌──────────▼──────────┐
        │  External ACP Agent │  (Codex, Claude Code, OpenClaw...)
        │  opencode acp /     │
        │  codex acp / ...    │
        └─────────────────────┘
```

### Core Components

#### AcpClientManager

- **Location:** `src/core/acp/AcpClientManager.ts`
- **Responsibilities:**
  - Store and manage user-configured external agent list (persisted to plugin settings as `acpAgents`)
  - Spawn agent processes via Node.js `child_process.spawn()`
  - Initialize `ClientSideConnection` from `@agentclientprotocol/sdk`
  - Track lifecycle states: `disconnected | connecting | connected | error`
  - Provide `connect(agentId)` / `disconnect(agentId)` / `listAgents()` methods
- **No dependency on OpenCode SDK** — ACP operates independently of the OpenCode HTTP/SDK path

#### AcpTransportOwner (NOT a simple adapter)

**The current send pipeline is:**
```
OpenCodianView → openCodeService.sendMessage() → streamingRuntime.streamResponse()
  → sdk.session.promptAsync() + sdk.event.subscribe()
  → StreamEventTransformer → StreamChunk → chat UI
```

ACP cannot be injected as a simple adapter into this chain because:

1. `OpenCodeService.sendMessage()` returns `AsyncGenerator<StreamChunk>` with OpenCode-specific session identity
2. `OpenCodeStreamingRuntimeCoordinator` manages SSE subscriptions and reconnect logic
3. Session hydration, cancel, detach, and status all assume OpenCode sessions
4. The chat view uses `sendStreamMessage` callback that goes through `openCodeService`

**Instead, AcpTransportOwner implements the same `AsyncGenerator<StreamChunk>` interface but produces chunks from ACP notifications.** It must yield the exact `StreamChunk` shapes defined in `src/core/types/chat.ts`:

```typescript
// Core StreamChunk (from chat.ts) — AcpTransportOwner must produce these
type StreamChunk =
  | { type: 'text'; content: string }
  | { type: 'thinking'; content: string; partId?: string; durationSeconds?: number }
  | { type: 'tool_use'; id: string; name: string; kind?: ToolIdentityKind; input: Record<string, unknown>; toolMetadata?: Record<string, unknown>; toolResultVisibility?: 'visible' | 'hidden' }
  | { type: 'tool_result'; toolUseId: string; content: string; isError?: boolean }
  | { type: 'message_metadata'; messageId: string; timestamp: number; modelId?: string }
  | { type: 'usage'; inputTokens: number; outputTokens: number; sessionId?: string }
  | { type: 'error'; content: string }
  | { type: 'message_start' }
  | { type: 'message_stop' }
  | { type: 'permission_request'; id: string; permission: string; patterns: string[]; metadata: Record<string, unknown>; always: string[]; tool?: { messageID: string; callID: string } }
  | { type: 'question_request'; request: QuestionRequest }
  // ... other variants

// ACP notification → StreamChunk mapping:
// agent_message_chunk.text → { type: 'text', content }
// agent_thought_chunk.text → { type: 'thinking', content, partId }
// tool_call(name, id, input) → { type: 'tool_use', id, name, input }
// tool_call_update(id, status, output) → { type: 'tool_result', toolUseId: id, content: output }
// usage_update → { type: 'usage', inputTokens, outputTokens }
```

**Note:** The streaming controller (`src/utils/streaming/types.ts`) has its own `StreamChunk` type (`ToolResultChunk.id` not `toolUseId`). The `AcpTransportOwner` produces the **core** `StreamChunk` from `chat.ts`; `OpenCodianView.convertToStreamingChunk()` (line 3416) converts core chunks to streaming controller chunks downstream. ACP does NOT need to produce streaming controller chunks directly.

**Integration point:** The chat view's send pipeline gains a transport selector:

- When the selected backend is an OpenCode model → existing `openCodeService.sendMessage()` path (unchanged)
- When the selected backend is an ACP agent → `acpTransportOwner.sendMessage()` path

This requires modifying the `sendStreamMessage` callback in `OpenCodianView` to dispatch based on the active backend type. The ACP path bypasses `OpenCodeService` entirely but must still produce core `StreamChunk` objects that the existing render pipeline understands.

**Session identity boundary — requires persisted transport discriminator:**

- ACP sessions have their own IDs (from ACP `newSession` response), separate from OpenCode sessions
- **Cannot reuse `Conversation.openCodeSessionId` for ACP session IDs** — the reload/hydration chain (`ConversationAuthoritativeReloadCoordinator`, sync, todo, question APIs) treats `openCodeSessionId` as an OpenCode session and calls OpenCode-specific SDK methods with it. Putting an ACP session ID there would cause reload failures.
- **Required change:** Add a persisted transport discriminator to the `Conversation` type:

```typescript
// Add to Conversation interface in chat.ts
interface Conversation {
  // ... existing fields ...
  openCodeSessionId: string;           // OpenCode sessions only
  transport?: 'opencode' | 'acp';      // new: defaults to 'opencode' if absent
  acpSessionId?: string;               // ACP session ID (only when transport === 'acp')
  acpAgentId?: string;                 // which ACP agent config this conversation uses
}
```

- Reload/hydration checks `transport` first: if `'acp'`, uses ACP `loadSession` instead of OpenCode SDK hydration
- Tab-level state tracks which transport owns the session
- Cancel uses ACP `cancel` when `transport === 'acp'`, otherwise `sdk.session.abort()`

#### ACP Settings UI

- **Location:** `src/features/settings/SettingsAcpSection.ts`
- **UI Elements:**
  - Agent configuration list with add/edit/delete
  - Each agent config: name, command, args, environment variables, enabled toggle
  - Connection status indicator per agent
  - Preset templates: OpenCode (`opencode acp`), Codex (`codex acp`), Claude Code (`claude acp`)
  - Test connection button

#### Chat UI Integration

- The model selector area gains an "ACP Agent" option alongside OpenCode models
- ACP agent sessions are visually tagged (badge showing agent name)
- Tool calls, streaming text, thinking, and permission requests all reuse existing rendering components because `AcpTransportOwner` produces standard `StreamChunk` objects

### Data Types

```typescript
// Settings (persisted to plugin settings)
interface AcpAgentConfig {
  id: string;                          // UUID
  name: string;                        // "Codex", "Claude Code", etc.
  command: string;                     // "codex", "claude", "opencode"
  args: string[];                      // ["acp"]
  env: Record<string, string>;         // {"OPENAI_API_KEY": "..."}
  enabled: boolean;
  cwd?: string;                        // Working directory override
}

// Runtime state (not persisted)
type AcpConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

interface AcpAgentRuntime {
  config: AcpAgentConfig;
  state: AcpConnectionState;
  process: ChildProcess | null;
  connection: ClientSideConnection | null;
  activeSessionId: string | null;
}

// Prompt options specific to ACP
interface AcpPromptOptions {
  agentId: string;
  sessionId?: string;           // for loadSession/resumeSession
  cwd?: string;
}
```

### Dependencies

- `@agentclientprotocol/sdk` — ACP client-side SDK (provides `ClientSideConnection`, `ndJsonStream`, types)
- Node.js `child_process` — for spawning external agent processes (available in Obsidian/Electron)
- Core `StreamChunk` type from `src/core/types/chat.ts` (the type `AcpTransportOwner` must produce)
- `OpenCodianView.convertToStreamingChunk()` — downstream bridge converting core chunks to streaming `StreamChunk`; ACP reuses this path unchanged
- Existing chat rendering pipeline (no changes needed to render components)

### Error Handling

- Agent process crash → detect via `process.on('exit')`, update state to `error`, show notification
- ACP protocol error → surface as error StreamChunk in chat
- Connection timeout (30s) → mark as `error`, show user-facing message
- Permission request timeout (60s) → auto-deny with notification

### Limitations

- ACP is stdio-based — agent processes must run on the same machine
- Each ACP agent session is separate from OpenCode sessions — no cross-session data
- ACP agents may not support all features (thinking, usage) — `AcpTransportOwner` yields only the StreamChunk types the agent provides; missing types are simply not emitted

---

## 2. Skill Discovery & Management (Slice 1)

### Goal

Provide a UI for users to discover, inspect, and configure permissions for OpenCode Skills. Skills are already discoverable via `sdk.app.skills()` and appear in slash command autocomplete — this adds a dedicated management interface.

### Current State of Skill Data

**What exists today:**

- `sdk.app.skills()` — returns skill list (called via `OpenCodeSdkFacade` → `attachOpenCodeAppAgents` sidecar). The facade does NOT have a dedicated `skill` namespace.
- `SlashCommandMenuCatalogCache` calls `host.loadRuntimeSkills()` which returns `{ name, description, location }` (no `content` field). See `normalizeRuntimeSkills()` at line 146.
- The OpenCode server endpoint `GET /skill` returns the full skill list with `name`, `description`, `location`, and `content` fields.

**Implication:** Skill content preview requires calling `GET /skill` via HTTP or a new SDK wrapper — the existing `sdk.app.skills()` path only provides metadata for slash command catalog. The `SkillCatalogService` must use a separate data path.

### Architecture

```
┌──────────────────────────────────────────────┐
│              OpenCodian Plugin                │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │  SkillCatalogService                   │  │
│  │  - Fetches via GET /skill (HTTP)       │  │
│  │  - TTL-based cache (30s default)       │  │
│  │  - Classifies by source location       │  │
│  └─────────────┬──────────────────────────┘  │
│                │                             │
│  ┌─────────────▼──────────────────────────┐  │
│  │  Existing OpencodeConfigManager        │  │
│  │  - setToolPermission('skill', action)  │  │
│  │  - Writes to .opencode/opencode.json   │  │
│  └─────────────┬──────────────────────────┘  │
│                │                             │
│  ┌─────────────▼──────────────────────────┐  │
│  │  Settings UI: Skill Tab                │  │
│  │  - Grouped skill list by source        │  │
│  │  - Permission per skill (via config)   │  │
│  │  - Content preview (from GET /skill)   │  │
│  │  - Refresh button                      │  │
│  └────────────────────────────────────────┘  │
└──────────────────────────────────────────────┘
```

### Core Components

#### SkillCatalogService

- **Location:** `src/features/chat/services/SkillCatalogService.ts`
- **Data source:** HTTP `GET /skill` endpoint (via `sdkFetch` or direct `requestUrl`). This is the only reliable source for full skill data including `content`.
- **Returns:** Array of `{ name: string, description?: string, location: string, content: string }`
- **Caching:** TTL-based cache (default 30s), independent from `SlashCommandMenuCatalogCache`
- **Methods:** `getAll()`, `getByName(name)`, `refresh()`, `groupBySource()`
- **Source classification:** Parses `location` field to categorize as: project-local (`.opencode/skills/`), global (`~/.config/opencode/skills/`), claude-compat (`.claude/skills/`), agents-compat (`.agents/skills/`), built-in
- **Fallback:** If `GET /skill` fails (server not running), shows cached metadata from `SlashCommandMenuCatalogCache` without content preview

#### Permission Flow

- **No separate `SkillPermissionManager`.** Skill permissions are tool permissions — the `skill` tool is one entry in `PermissionConfig`.
- **Flat permission only.** The existing `OpencodeConfigManager.setToolPermission(tool, action)` writes `permission[tool] = action` as a flat `PermissionAction` string. It cannot write nested per-skill patterns like `{ "skill": { "internal-*": "deny" } }`.
- **Scope decision:** The Skill tab will offer only the flat `skill` permission (allow/deny/ask) via `setToolPermission('skill', action)`. This controls whether the `skill` tool itself is available to the agent — a coarse-grained gate. Per-skill-name pattern filtering (e.g., `internal-*`) is out of scope for this iteration because it requires a new `setNestedPermission()` API on `OpencodeConfigManager` that does not yet exist.
- **Future extension:** The OpenCode server already supports nested skill permission patterns (e.g., `{ "skill": { "internal-*": "deny" } }` in `opencode.json`). The missing piece is OpenCodian's writer API — when `OpencodeConfigManager` adds `setToolPermissionPattern(tool, pattern, action)` or a nested permission editor, the Skill tab can expose per-skill-name pattern rows.

#### Settings UI — Skill Tab

- **Location:** `src/features/settings/SettingsSkillSection.ts`
- **Layout:**
  - Filter bar: filter by name, source group (project/global/built-in)
  - Grouped list by source:
    - **Built-in** (e.g., `customize-opencode`)
    - **Project** (`.opencode/skills/` in vault)
    - **Global** (`~/.config/opencode/skills/`)
    - **Claude compat** (`.claude/skills/`)
    - **Agents compat** (`.agents/skills/`)
  - Global skill permission control: single dropdown (allow/deny/ask) for the `skill` tool, written via `OpencodeConfigManager.setToolPermission('skill', action)`
  - Each skill row: name, description (truncated), source path (read-only)
  - Click to expand: full SKILL.md content preview (read-only, loaded from `GET /skill` response)
  - Refresh button (force re-fetch from OpenCode server)

#### Chat UI Enhancement

- Skill tool call card already renders with brain icon and skill name (via `ToolCallRenderer`)
- Enhancement: expand to show content summary (first 200 chars of SKILL.md body, when available from tool result)
- Loading animation during skill load

### Data Types

```typescript
// Skill info (from GET /skill)
interface SkillInfo {
  name: string;
  description?: string;
  location: string;   // file path or "builtin"
  content: string;    // full SKILL.md body (from GET /skill only)
}

// Plugin settings (UI preferences only, not runtime-effective)
interface SkillSettings {
  skillCatalogCacheTtl: number;       // default 30000ms
}
```

### Dependencies

- HTTP `GET /skill` endpoint — primary data source for full skill info including content
- `SlashCommandMenuCatalogCache` — fallback metadata source when server unavailable
- `OpencodeConfigManager.setToolPermission()` — for writing skill permissions to `opencode.json`

---

## 3. Tool Catalog Integration (Slice 2)

### Goal

Display built-in and custom tool catalogs in a dedicated Settings UI with schema inspection and permission control. MCP tools remain in their existing independent settings section.

### Current State of Tool Data

**What exists today:**

- `OpenCodeCatalogStateStore` already caches:
  - `registryToolIds: Set<string>` — from `tool.ids()`
  - `toolSchemasByModel: Map<string, ToolCatalogEntry[]>` — from `tool.list({ provider, model })`
  - `observedExternalToolNames: Set<string>` — tool names observed in message parts
- `toolIdentity.ts` defines the canonical built-in tool list (27 source keys, 25 unique canonical names, 23 unique display names, see below)
- `PermissionConfig` type in `permission.ts` has typed fields for each tool
- `OpencodeConfigManager.setToolPermission()` writes per-tool permissions

### Canonical Built-in Tool List

From `src/shared/toolIdentity.ts` `BUILTIN_TOOL_DEFINITIONS` (27 source keys → 25 canonical names → 23 unique display names):

| Canonical Name | Display Name | Icon | Kind |
|---------------|-------------|------|------|
| read | Read | file-text | builtin |
| write | Write | file-plus | builtin |
| edit | Edit | file-pen | builtin |
| multiedit | MultiEdit | file-pen | builtin |
| apply_patch | Patch | file-pen | builtin |
| patch | Patch | file-pen | builtin |
| bash | Bash | terminal | builtin |
| grep | Grep | search | builtin |
| glob | Glob | folder-search | builtin |
| list | List | folder-tree | builtin |
| lsp | LSP | search | builtin |
| web_search | WebSearch | search | builtin |
| web_fetch | WebFetch | download | builtin |
| codesearch | CodeSearch | code | builtin |
| task | Subagent Task | git-branch | task |
| question | Questions | message-square | question |
| skill | Skill | brain | skill |
| enter_plan_mode | EnterPlanMode | list | plan |
| plan_enter | EnterPlanMode | list | plan |
| exit_plan_mode | ExitPlanMode | check | plan |
| plan_exit | ExitPlanMode | check | plan |
| todowrite | Todos | list-checks | builtin |
| todoread | Todo Read | list-checks | builtin |
| structuredoutput | StructuredOutput | wrench | unknown |
| invalid | Invalid | wrench | unknown |

Additional aliases: `ls` → `list`, `askuserquestion` → `question`.

**Permission type fields** (from `PermissionConfig`): `read`, `edit`, `write`, `bash`, `glob`, `grep`, `list`, `task`, `skill`, `lsp`, `webfetch`, `websearch`, `codesearch`, `external_directory`, `doom_loop`, `todoread`, `todowrite`, `'*'`.

### Architecture

```
┌──────────────────────────────────────────────┐
│              OpenCodian Plugin                │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │  Extended OpenCodeCatalogStateStore    │  │
│  │  - Already has tool.ids() / tool.list()│  │
│  │  - Enhancement: cache full schemas     │  │
│  │  - Classify using toolIdentity.ts      │  │
│  └─────────────┬──────────────────────────┘  │
│                │                             │
│  ┌─────────────▼──────────────────────────┐  │
│  │  Existing OpencodeConfigManager        │  │
│  │  - setToolPermission(tool, action)     │  │
│  │  - Writes to .opencode/opencode.json   │  │
│  └─────────────┬──────────────────────────┘  │
│                │                             │
│  ┌─────────────▼──────────────────────────┐  │
│  │  Settings UI: Tools Tab                │  │
│  │  ┌──────────────────────────────────┐  │  │
  │  │  │ 📦 Built-in Tools (25 canonical)  │  │  │
│  │  │  Grouped by function             │  │  │
│  │  │  Permission per tool             │  │  │
│  │  ├──────────────────────────────────┤  │  │
│  │  │ 🔧 Custom Tools (N)             │  │  │
│  │  │  From .opencode/tools/           │  │  │
│  │  │  Source file + schema + perm     │  │  │
│  │  └──────────────────────────────────┘  │  │
│  │  (MCP tools: independent MCP page)    │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │  Chat UI: Tool call card enhancement   │  │
│  │  - Category icon (builtin/custom/mcp)  │  │
│  │  - Better MCP tool summaries           │  │
│  └────────────────────────────────────────┘  │
└──────────────────────────────────────────────┘
```

### Core Components

#### Extended Tool Catalog

- **Location:** Extend `src/core/opencode/OpenCodeCatalogStateStore.ts`
- **Enhancements:**
  - Cache full tool schemas (parameters, descriptions, types) from `tool.list({ provider, model })`
  - Classify tools using `toolIdentity.ts` — tools in `BUILTIN_TOOL_DEFINITIONS` are builtin, tools in `registryToolIds` but not in builtin are custom, the rest are observed/external
  - Track source file for custom tools (where available from server response)
- **Tool grouping for UI:**
  - File ops: read, write, edit, multiedit, apply_patch, patch
  - Search: glob, grep, list, codesearch
  - Execution: bash, task
  - Network: webfetch, websearch
  - Intelligence: lsp
  - Meta: skill, todowrite, todoread, question
  - Plan: plan_enter, plan_exit

#### Permission Flow

- **No separate `ToolPermissionManager`.** Tool permissions write through the existing `OpencodeConfigManager.setToolPermission(tool, action)`.
- **Flat permission only.** Same constraint as Skill: `setToolPermission()` writes `permission[tool] = action` as a flat `PermissionAction`. It cannot write nested patterns.
- The UI reads current permissions from `OpencodeConfigManager.read().permission` and writes changes via `OpencodeConfigManager.setToolPermission()`.
- **Wildcard patterns** (e.g., `mymcp_*`) for custom/MCP tools are written as top-level string keys in the permission config. `PermissionConfig` is a fixed interface with typed fields, not `Record<string, PermissionAction>` — but the JSON permission object can carry arbitrary tool/pattern keys at runtime, and `setToolPermission()` writes them via cast. Pattern-based matching at runtime is handled by the OpenCode server.
- **Scope:** Each tool row gets a flat allow/deny/ask dropdown. Per-tool-name pattern matching within a tool category is out of scope for this iteration.

#### Settings UI — Tools Tab

- **Location:** `src/features/settings/SettingsToolSection.ts`
- **Sections:**
  - **Built-in Tools** — grouped by function (matching groups above), each showing:
    - Icon + display name (from `toolIdentity.ts`) + description (from server schema)
    - Permission dropdown (allow/deny/ask), reading current value from `OpencodeConfigManager.read().permission`
    - Click to expand: parameter schema table (name, type, description, required) from `tool.list()` data
  - **Custom Tools** — flat list of tools NOT in `BUILTIN_TOOL_DEFINITIONS`, each showing:
    - Name + description + source info
    - Permission dropdown
    - Click to expand: parameter schema table
  - **Permission Patterns** — wildcard pattern editor for batch control (e.g., `mymcp_*`). These are written as top-level permission keys via `setToolPermission(pattern, action)`.
- **MCP tools are NOT shown here** — they remain in the existing MCP settings page
- Refresh button to re-fetch tool catalog from server

#### Chat UI Enhancement

- Tool call cards already have category-aware icons via `toolIdentity.ts` (builtin → tool-specific, custom → `layers`, mcp → `opencodian-tool-mcp`, unknown → `wrench`)
- MCP tool summary improvement: leverage the existing `mcpSummaryConfig.ts` action-word classification
- Long tool results get collapsible content with "Show more" toggle

### Data Types

```typescript
// Tool catalog entry (enhanced)
interface ToolCatalogEntry {
  id: string;                          // "read", "bash", "database", etc.
  name: string;                        // display name from toolIdentity or server
  description: string;
  category: 'builtin' | 'custom';     // MCP excluded (managed separately)
  source?: string;                     // source info for custom tools
  parameters?: ToolParameterSchema[];
  group?: string;                      // "file-ops", "search", "execution", etc.
}

interface ToolParameterSchema {
  name: string;
  type: string;                        // "string", "number", "boolean", "array", "object"
  description?: string;
  required: boolean;
  enum?: string[];
}
```

### Dependencies

- Existing `OpenCodeCatalogStateStore` — extend with schema caching and classification
- Existing `toolIdentity.ts` — canonical source for builtin tool definitions and classification
- Existing SDK methods: `tool.ids()`, `tool.list({ provider, model })`
- Existing `OpencodeConfigManager.setToolPermission()` — for writing tool permissions

---

## Settings Data Impact

### Plugin Settings (UI preferences only)

```typescript
interface OpenCodianPluginSettings {
  // ... existing fields ...

  // ACP (agent configs are plugin-level preferences)
  acpAgents: AcpAgentConfig[];

  // Skills (UI preferences only)
  skillCatalogCacheTtl: number;       // default 30000ms

  // Tools (UI preferences only)
  toolCatalogCacheTtl: number;        // default 30000ms
}
```

### Runtime-Effective Config (`.opencode/opencode.json`)

Skill and tool permissions are written to the project-level config via `OpencodeConfigManager`. This is the only path that affects runtime behavior.

---

## Testing Strategy

- **Shared:** Verify `OpencodeConfigManager.setToolPermission()` write-through end-to-end
- **Skill Management:** Unit tests for `SkillCatalogService` data parsing and source classification; integration test verifying `OpencodeConfigManager.setToolPermission()` write-through
- **Tool Catalog:** Unit tests for tool classification using `toolIdentity.ts` definitions; test catalog refresh flow
- **ACP Client:** Unit tests for `AcpTransportOwner` event-to-StreamChunk translation; integration test with a mock ACP server process

## Localization

All three features need locale string additions for both `en` and `zh-CN`:
- Settings tab titles and descriptions
- Tool/skill/agent status labels
- Permission option labels (allow/deny/ask)
- Error messages
- ACP agent preset names
