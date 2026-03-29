# OpenCodian - AI Agent Documentation

## Project Overview

**OpenCodian** is an Obsidian plugin that embeds OpenCode AI (an open-source AI coding assistant) into the Obsidian sidebar. It is inspired by [Claudian](https://github.com/YishenTu/claudian) but uses the open-source OpenCode as the backend, supporting multiple AI model providers including Claude, GPT, and local models (vLLM/Ollama).

## Agent Working Profile

Use this repo's default agent profile for focused Obsidian plugin work:

- **Role**: Make surgical TypeScript, UI, config, and documentation updates for the OpenCodian plugin.
- **Best fit**: Plugin feature work, bugfixes, settings wiring, OpenCode integration, documentation upkeep, and test-vault deployment.
- **Prefer**: `rg` for search, small targeted edits, targeted tests first, and the sequential build-then-deploy workflow below.
- **Avoid**: Unrelated refactors, edits under `reference-projects/` unless explicitly requested, and chained build/deploy commands that can copy stale artifacts.

### Key Characteristics

- **Multi-model support**: Works with Claude, GPT, local models, and any OpenAI-compatible API
- **Local-first**: Can be configured to use local models, keeping data on the local machine
- **Client/Server architecture**: The plugin communicates with an OpenCode server via a hybrid HTTP/SSE + SDK v2 client layer
- **Desktop only**: Requires Obsidian desktop app (v1.4.5+)

## Architecture

```md
┌─────────────────────────────────────────────────────────────┐
│                        Obsidian                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                  OpenCodian Plugin                   │   │
│  │  ┌───────────┐  ┌───────────┐  ┌─────────────────┐  │   │
│  │  │   View    │  │  Service  │  │   SettingTab    │  │   │
│  │  │(UI Layer) │  │(SDK Wrap) │  │    (Settings)   │  │   │
│  │  └─────┬─────┘  └─────┬─────┘  └─────────────────┘  │   │
│  │        └──────────────┘                             │   │
│  │                  │                                  │   │
│  │         ┌────────┴────────┐                         │   │
│  │         │  ServerManager  │                         │   │
│  │         │(Lifecycle Mgr)  │                         │   │
│  │         └────────┬────────┘                         │   │
│  └──────────────────┼──────────────────────────────────┘   │
│  ┌──────────────────┼──────────────────────────────────┐   │
│  │  Supporting Services                                │   │
│  │  ┌──────────────────┐ ┌────────────┐ ┌───────────┐ │   │
│  │  │TitleGenerationSvc│ │  Markdown  │ │   i18n    │ │   │
│  │  │  (AI Titles)     │ │ Rendering  │ │ (en/zh)   │ │   │
│  │  └──────────────────┘ └────────────┘ └───────────┘ │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────┼──────────────────────────────────────┘
                      │ HTTP API
                      ▼ 
┌─────────────────────────────────────────────────────────────┐
│                   OpenCode Server                            │
│                  (Node.js Process)                           │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    LLM Providers                             │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌────────────────┐  │
│  │ Claude  │  │  GPT-4  │  │  Local  │  │OpenAI Compatible│  │
│  └─────────┘  └─────────┘  └─────────┘  └────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Technology Stack

| Category       | Technology                           |
| -------------- | ------------------------------------ |
| Language       | TypeScript 5.0+                      |
| Target         | ES2018, CommonJS                     |
| Build Tool     | esbuild 0.27+                        |
| Test Framework | Jest 30.2+ (jsdom environment)       |
| Linting        | ESLint 8.57+ with TypeScript support |
| Platform       | Obsidian Plugin API                  |

## Directory Structure

```md
opencodian/
├── src/
│   ├── main.ts                      # Plugin entry point
│   ├── core/
│   │   ├── config/                  # OpenCode config + model catalog + plugin management
│   │   │   ├── ModelConfigService.ts
│   │   │   ├── OpencodeConfigManager.ts
│   │   │   ├── PluginManagementService.ts
│   │   │   ├── modelConfig.ts
│   │   │   └── index.ts
│   │   ├── opencode/                # OpenCode SDK wrapper
│   │   │   ├── OpenCodeService.ts   # Core service for SDK interaction
│   │   │   ├── createSdkClient.ts   # SDK v2 client factory
│   │   │   ├── omoCompat.ts         # OMO message detection helpers
│   │   │   ├── ServerManager.ts     # Server lifecycle management
│   │   │   ├── sdkFeatureFlags.ts   # Internal SDK rollout switches
│   │   │   ├── sdkFetch.ts          # requestUrl/fetch hybrid transport
│   │   │   ├── sdkTypes.ts          # SDK v2 type bridge
│   │   │   ├── types.ts             # Service types
│   │   │   └── index.ts             # Module exports
│   │   ├── prompts/                 # System prompts for AI features
│   │   │   └── titleGeneration.ts   # Title generation system prompt
│   │   ├── security/                # Permission + blocklist helpers
│   │   │   ├── BlocklistChecker.ts
│   │   │   └── index.ts
│   │   ├── storage/                 # Persistence layer
│   │   │   ├── StorageService.ts    # Conversation & settings storage
│   │   │   └── index.ts
│   │   ├── types/                   # Type definitions
│   │   │   ├── chat.ts              # Chat message types
│   │   │   ├── models.ts            # Model types
│   │   │   ├── opencodeConfig.ts    # OpenCode config schema types
│   │   │   ├── permission.ts        # Permission UI / approval types
│   │   │   ├── settings.ts          # Settings types & defaults
│   │   │   ├── tools.ts             # Tool types
│   │   │   └── index.ts
│   │   └── tools/                   # Tool name constants
│   │       ├── toolNames.ts
│   │       └── index.ts
│   ├── features/
│   │   ├── chat/
│   │   │   ├── rendering/           # Chat rendering helpers
│   │   │   │   └── collapsible.ts
│   │   │   ├── services/            # Chat-level business services
│   │   │   │   └── TitleGenerationService.ts  # AI-powered title generation
│   │   │   ├── tabs/                # Multi-tab conversation system
│   │   │   │   ├── Tab.ts
│   │   │   │   ├── TabBar.ts
│   │   │   │   ├── TabManager.ts
│   │   │   │   ├── types.ts
│   │   │   │   └── index.ts
│   │   │   ├── ui/                  # Chat side utilities
│   │   │   │   ├── EffortSelector.ts
│   │   │   │   └── NavigationSidebar.ts
│   │   │   ├── chatAppearance.ts    # Chat appearance CSS variable builder
│   │   │   ├── OpenCodianView.ts    # Main chat view component
│   │   │   ├── renderGroups.ts      # Assistant render grouping helpers
│   │   │   └── index.ts
│   │   └── settings/
│   │       ├── ModelConfigJsonModal.ts
│   │       ├── ModelConfigModal.ts
│   │       ├── OpencodeConfigModal.ts
│   │       ├── OpenCodianSettings.ts # Settings tab UI
│   │       ├── ServerSettingHelpModal.ts
│   │       └── index.ts
│   ├── i18n/                        # Internationalization
│   │   ├── index.ts
│   │   └── locales/
│   │       ├── en.ts
│   │       ├── index.ts             # Locale barrel export
│   │       └── zh.ts
│   ├── shared/                      # Shared utilities
│   │   ├── modals/
│   │   │   ├── ForkTargetModal.ts
│   │   │   └── index.ts
│   │   ├── index.ts
│   │   ├── logger.ts
│   │   └── vault.ts
│   └── utils/                       # Utility functions
│       ├── icons/
│       │   ├── ProviderIconService.ts
│       │   └── index.ts
│       ├── markdown/                # Markdown rendering
│       │   ├── MarkdownRenderer.ts  # Custom markdown renderer
│       │   ├── fileLink.ts          # File link handling
│       │   ├── imageEmbed.ts        # Image embed handling
│       │   └── types.ts
│       ├── streaming/               # SSE streaming utilities
│       │   ├── StreamController.ts  # Stream state management
│       │   ├── ThinkingBlockRenderer.ts
│       │   ├── ToolCallRenderer.ts
│       │   └── types.ts
│       └── index.ts
├── tests/
│   ├── __mocks__/obsidian.ts        # Obsidian API mock
│   ├── setup.ts                     # Test setup
│   └── unit/                        # Unit tests
├── scripts/                         # Build scripts
├── docs/                            # Documentation
├── AGENTS.md                        # This file - project overview
├── devlog.md                        # Development log
├── ARCHITECTURE.md                  # Architecture details
└── SERVER_API.md                    # OpenCode API reference
```

## Build and Development Commands

```bash
# Install dependencies
npm install

# Check/fix esbuild after dependency changes
npm run doctor:esbuild
npm run doctor:esbuild:fix

# Development mode (watch and auto-rebuild)
npm run dev

# Production build (outputs to dist/)
npm run build

# Run tests
npm run test
npm run test:watch
npm run test:coverage

# Linting
npm run lint
npm run lint:fix
```

> **Syncthing note**: This repo uses `.stignore` to exclude `node_modules/` and other local artifacts. After switching systems, you usually do **not** need to run `npm run doctor:esbuild`; only run it if dependencies changed or build/dev reports an esbuild platform mismatch.

## Release and Build ID

### Version Release Rules

Use these commands to bump the semantic version when releasing:

| Command | Version Change | Use Case |
|---------|---------------|----------|
| `npm run release:patch` | 0.1.0 → 0.1.1 | Bugfix, text changes, config tweaks |
| `npm run release:minor` | 0.1.0 → 0.2.0 | New features, refactoring, API extensions |
| `npm run release:major` | 0.1.0 → 1.0.0 | Architecture changes, breaking changes |

These commands update `package.json`, `package-lock.json`, and `manifest.json` automatically.

### BUILD_ID

Each `npm run build` generates a `BUILD_ID` with format `{branch}.{timestamp}`:

- **Branch**: Current git branch, `/` replaced with `-`
- **Timestamp**: Local time, format `YYYYMMDDHHmm`
- **Example**: `fix-revert-model-toggle.202603271430`

The BUILD_ID is output to the Obsidian developer console when the plugin loads, useful for debugging which build is running.

### Typical Release Workflow

```bash
# 1. Bump version
npm run release:patch

# 2. Build
npm run build

# 3. Deploy to test vault
cp dist/main.js dist/manifest.json dist/styles.css ../../testvault/.obsidian/plugins/opencodian/
```

## Code Style Guidelines

### ESLint Configuration

- **Parser**: `@typescript-eslint/parser`
- **Plugins**: `@typescript-eslint`, `simple-import-sort`, `jest`
- **Import sorting**: Enforced via `simple-import-sort/imports` and `simple-import-sort/exports`
- **Console**: Warns on console usage except for `console.error` and `console.warn`

### TypeScript Configuration

- **Target**: ES2018
- **Module**: ESNext
- **Module Resolution**: `bundler`
- **Strict null checks**: Enabled
- **Path mapping**: `@/*` maps to `src/*`

### Naming Conventions

- **Classes**: PascalCase (e.g., `OpenCodeService`, `ServerManager`)
- **Interfaces**: PascalCase (e.g., `OpenCodianSettings`, `ChatMessage`)
- **Functions/Methods**: camelCase

## Core Components

### 1. OpenCodeService (`src/core/opencode/OpenCodeService.ts`)

Main service for interacting with OpenCode Server. Current state is a hybrid facade:

- UI-facing API remains local to `OpenCodian`
- `ServerManager` still owns process lifecycle
- SDK v2 now backs most CRUD, non-stream prompt, streaming main path, and cancel abort behavior
- Legacy HTTP/SSE paths are intentionally retained as fallback during rollout

**Key Methods:**

- `checkHealth()` - Health check with SDK-first / local probe fallback
- `createSession(title?)` - Create a new chat session
- `cancelStream(sessionId?)` - Stop the targeted local session stream and best-effort abort server execution
- `sendMessage(message, options)` - Send message and get streaming response
- `requestAssistantResponse(message, options)` - Send a message and wait for the full (non-streaming) assistant response
- `getAvailableModels()` - Fetch available providers and models
- `getSessionMessages(sessionId)` - Get messages for a session
- `updateSessionTitle(sessionId, title)` - Update a session's title
- `deleteSession(sessionId)` - Delete a session by ID
- `forkSession(sessionId, messageID?)` - Fork a conversation from a selected message
- `revertSession(sessionId, messageID, partID?)` - Rewind a conversation to a prior point
- `getPendingPermissions()` - Fetch pending permission requests
- `respondToPermission(requestID, reply, message?)` - Reply to a permission request
- `openCodeMessageToChatMessage(info, parts)` - Normalize persisted messages into chat UI data, including OMO metadata and notice hints

**SDK v2 migration notes:**

- **Reference source path**: `reference-projects/opencode/packages/sdk/js/src/v2`
- **Feature flags**: `sdkCrud`, `sdkPrompt`, `sdkStream`, `sdkAbort`, `sdkQuestions`, `sdkSync`
- **Runtime rollout**: `src/main.ts` currently injects `SDK_FEATURE_FLAG_ROLLOUT_DEFAULTS`
- **Testing default**: constructing `OpenCodeService` without runtime overrides keeps all SDK flags off
- **Do not remove yet**: legacy `connectSSE()`, `parseSSEEvents()`, and legacy HTTP helpers remain the rollback path

**Current module status:**

- **Implemented**: SDK type bridge, client factory, hybrid transport, CRUD migration, non-stream prompt migration, streaming main chain, dual-path cancel/abort
- **Still pending**: `format` / `agent` / `noReply`, real file/image parts, `externalContextPaths`, `question.*`, `global.syncEvent.subscribe()`, `session.summarize()`, `session.diff()`
- **Concurrency note**: streaming state is now maintained per session in `OpenCodeService`, so different tabs/sessions can stream concurrently without sharing one global abort/controller state

### 2. ServerManager (`src/core/opencode/ServerManager.ts`)

Manages the OpenCode server process lifecycle.

**Key Methods:**

- `start()` - Start the OpenCode server process
- `stop()` - Stop the server process
- `checkHealth()` - Check if server is responding

### 3. ModelConfigService (`src/core/config/ModelConfigService.ts`)

Resolves local OpenCode model config and server-provided model catalogs.

**Key Methods:**

- `getCatalogs(mode)` - Build local / server / effective model catalogs
- `readLocalModelConfig()` - Read model-related OpenCode config subset
- `writeLocalModelConfig(subset)` - Persist model config subset
- `isModelAvailableOnServer(provider, model)` - Validate server-side availability

### 4. PluginManagementService (`src/core/config/PluginManagementService.ts`)

Inspects and manages OpenCode plugin sources for the current vault.

**Key Methods:**

- `inspect(serviceMode, isolationMode)` - Build a plugin environment snapshot for global/project sources
- `updateProjectConfigPlugins(plugins)` - Persist the project-level `plugin` array
- `ensureProjectPluginDirectory()` - Create `.opencode/plugins/` when needed
- `ensureProjectOmoConfig()` - Create `.opencode/oh-my-opencode.jsonc` when needed

### 5. StorageService (`src/core/storage/StorageService.ts`)

Persists conversations and settings.

**Storage Layout:**

```md
.obsidian/plugins/opencodian/
└── .opencodian/
    ├── settings.json          # Plugin settings
    └── sessions/              # Conversation metadata
        └── conv-xxx.json
```

### 6. OpenCodianView (`src/features/chat/OpenCodianView.ts`)

Main chat UI view (extends Obsidian's `ItemView`).

**Features:**

- Sidebar or main-tab chat interface
- Multi-tab conversation management
- Per-tab runtime state for true concurrent tab sends
- Per-session model switching dropdown
- Effort / thinking budget selector
- Real-time streaming display
- Optimistic user message hydration from server-final content
- Navigation sidebar for previous/next user messages
- Fork / rewind conversation entry points
- Collapsible long assistant content blocks
- Inline permission cards and server status badge
- OMO injected-prompt panels with expandable raw prompt view
- OMO system-reminder notice cards with markdown rendering
- Idle conversation sync loop for post-stream follow-up messages
- Background-task in-progress indicator and follow-up pseudo-stream reveal
- Hidden background-task tab sync and per-tab permission card routing

### 7. OpenCodianSettingTab (`src/features/settings/OpenCodianSettings.ts`)

Settings UI with bilingual support (English/Chinese).

**Settings Categories:**

- **Language**: Interface language selection
- **Server**: Local / remote mode, auth, health status, help modal
- **Model**: Source mode, default provider/model, visual editor, JSON editor
- **Title Generation**: AI title mode (default/ai), override model for title generation
- **Plugins**: Global/plugin visibility, project `plugin` config, project plugin directory, pure mode, OMO config entry
- **Security**: Permission mode, config editor, command blocklist, export paths
- **UI**: Max tabs, tab bar position, auto-scroll, chat scroll mode, open in main tab
- **Style**: Chat appearance controls and custom CSS declarations
- **Debug**: Debug logging, per-platform log paths, diagnostics export
- **User**: User name, system prompt, excluded tags

### 8. Streaming Utilities (`src/utils/streaming/`)

SSE streaming components for real-time message display.

**Key Components:**

- `StreamController` - Manages stream state and callbacks
- `ThinkingBlockRenderer` - Renders AI thinking blocks
- `ToolCallRenderer` - Renders tool call progress and results
- Stream callbacks also feed chat-level background task progress UX

**Stream Event Types:**

- `text` - Text content chunks
- `thinking` - AI reasoning blocks
- `tool_use` - Tool call initiated
- `tool_result` - Tool execution result
- `done` - Stream completed
- `error` - Error occurred

### 9. TitleGenerationService (`src/features/chat/services/TitleGenerationService.ts`)

AI-powered conversation title generation service. Creates concise titles by sending the user's first message to an AI model.

**How it works:**

1. Creates a temporary OpenCode session for title generation
2. Sends the first user message with the system prompt from `src/core/prompts/titleGeneration.ts`
3. Parses the AI response into a clean title (≤50 chars)
4. Deletes the temporary session after use

**Key Methods:**

- `generateTitle(conversationId, userMessage, currentModel, callback)` - Generate a title for a conversation
- `cancelConversation(conversationId)` - Cancel an in-progress title generation
- `cancelAll()` - Cancel all active title generations

**Configuration:**

- `aiTitleModel` setting - Override the model used for title generation (format: `provider/model`), or leave empty to follow the current session model
- `locale` setting - Drives the language of AI-generated titles (`zh` => Chinese, `en` => English)
- `titleGenerationStatus` on conversations - Tracks state: `'pending'` | `'success'` | `'failed'`

### 10. Markdown Rendering (`src/utils/markdown/`)

Custom markdown rendering pipeline for chat messages.

**Key Components:**

- `MarkdownRenderService` / `renderMarkdown()` - Renders markdown to HTML with Obsidian integration
- `processFileLinks()` / `registerFileLinkHandler()` - Handles internal file link rendering
- `replaceImageEmbedsWithHtml()` - Converts image embeds to HTML elements

### 11. OMO Compatibility (`src/core/opencode/omoCompat.ts` + chat UI)

Compatibility layer for `oh-my-opencode` message mutations and reminders.

**Current responsibilities:**

1. Detect user-side injected prompts such as `[search-mode] ... --- 原始输入`
2. Detect `<system-reminder>...</system-reminder>` plus `<!-- OMO_INTERNAL_INITIATOR -->`
3. Preserve raw OMO text while exposing UI-friendly metadata
4. Render injected prompt summaries and raw prompt collapsibles in chat
5. Keep background-task reminders visible after the main stream ends

## Prerequisites for Users

1. **Obsidian** v1.4.5 or later (desktop only)
2. **OpenCode** installed globally:

   ```bash
   npm install -g opencode-ai
   ```

3. **AI Provider configured**: Run `opencode` and use `/connect` to set up API keys

## Deployment

### Deployment Paths

| Environment          | Path Type | Path                                                                         |
| -------------------- | --------- | ---------------------------------------------------------------------------- |
| **Production Vault** | Absolute  | `/Volumes/SDD2T/obsidian-vault-write/技术学习/.obsidian/plugins/opencodian/` |
| **Test Vault**       | Absolute  | `C:\Users\lt\Desktop\Write\testvault\.obsidian\plugins\opencodian\`          |
| **Test Vault**       | Relative  | `../../testvault/.obsidian/plugins/opencodian/`                              |

> **Note**: Relative path is calculated from the project root (`opencodian/`) for cross-platform compatibility.

### Agent Default Deploy Workflow

- For any code, style, manifest, or build-related change, the default workflow is: `npm run build` and then deploy `dist/main.js`, `dist/manifest.json`, and `dist/styles.css` to the **Test Vault** plugin directory.
- On Windows, deploy to `C:\Users\lt\Desktop\Write\testvault\.obsidian\plugins\opencodian\`.
- Skip deployment only if the user explicitly says not to build/deploy, or if the task is analysis-only with no file changes.
- After deployment, report whether build and copy succeeded or failed.
- Agents must run build and deploy as two separate sequential steps: first `npm run build`, wait for it to finish successfully, then copy the freshly built `dist/main.js`, `dist/manifest.json`, and `dist/styles.css` into the Test Vault plugin directory.
- Agents must not use parallel commands, chained deploy shortcuts, or any workflow that can copy artifacts before the newest build has completed. In particular, do not use `npm run build && copy ...`, do not use parallel tool calls for build/deploy, and do not verify deployment until the copy step has finished.
- After deployment, agents must verify that the Test Vault plugin `main.js` contains the latest `BUILD_ID` from the just-finished build and report that exact `BUILD_ID`.

## Development Notes

### Adding New Features

1. **New settings**: Add to `OpenCodianSettings` interface, add UI in `OpenCodianSettings.ts`
2. **New commands**: Register in `main.ts` `onload()` method
3. **New message types**: Extend `StreamChunk` type in `src/core/types/chat.ts`
4. **Model config changes**: Keep `ModelConfigService`, settings UI, and `.opencode/config.json` writes in sync
5. **Plugin management changes**: Keep `PluginManagementService`, `OpencodeConfigManager`, pure-mode server env, and plugin settings UI synchronized
6. **Chat UI additions**: Check `features/chat/tabs/`, `features/chat/ui/`, `renderGroups.ts`, `OpenCodianView.ts`, and `styles.css` together
7. **New AI features with prompts**: Add system prompts in `core/prompts/`, service logic in `features/chat/services/`, and wire into `OpenCodianView`
8. **i18n additions**: Add keys to both `en.ts` and `zh.ts` locale files, export from `locales/index.ts`
9. **OMO changes**: Keep `src/core/opencode/omoCompat.ts`, `OpenCodeService.openCodeMessageToChatMessage()`, `OpenCodianView`, OMO settings entry points, and notice/injection styles aligned
10. **SDK v2 migration changes**: Keep `OpenCodeService`, `createSdkClient.ts`, `sdkFetch.ts`, `sdkFeatureFlags.ts`, `sdkTypes.ts`, related tests, and `docs/opencode-service-sdk-v2-mapping.md` synchronized
11. **Concurrent tab changes**: When editing `OpenCodianView.ts`, `TabManager.ts`, or streaming/cancel logic, preserve the per-tab runtime model; do not reintroduce single global streaming state unless explicitly redesigning multi-tab concurrency

### Agent Checklist

Before handing off work, agents should verify the following when relevant:

- **Code changes**: Run the smallest meaningful test or validation command first, then broaden only if needed.
- **Build/deploy changes**: Follow the required sequential `npm run build` -> copy -> deployed `BUILD_ID` verification flow.
- **Prompt or title changes**: Keep `src/core/prompts/titleGeneration.ts`, `src/features/chat/services/TitleGenerationService.ts`, and locale-driven behavior aligned.
- **Plugin changes**: Keep project config writes, plugin source visibility, `pluginIsolationMode`, and local-server restart expectations aligned.
- **Settings or i18n changes**: Keep `DEFAULT_SETTINGS`, settings UI, and both locale files synchronized.
- **SDK migration changes**: Preserve rollback paths, keep rollout flags explicit, and update the mapping/checklist docs when module status changes.
- **Architecture/doc changes**: Update `devlog.md` and refresh this `AGENTS.md` when developer-facing workflow or component responsibilities materially change.

### Debugging

- Check Obsidian's Developer Tools (Ctrl/Cmd+Shift+I)
- Look for `[OpenCodian]`, `[ServerManager]`, `[OpenCodeService]`, `[OpenCodianView]`, `[OpenCodianSettings]` prefix logs
- OpenCode server logs with `[OpenCode]` prefix

---

## Documentation Files

### Repository Documentation

| File                    | Purpose                                              |
| ----------------------- | ---------------------------------------------------- |
| `AGENTS.md`             | Project overview and coding guidelines (this file)   |
| `devlog.md`             | Development log with detailed feature implementation |
| `ARCHITECTURE.md`       | Detailed architecture documentation                  |
| `SERVER_API.md`         | OpenCode Server API reference                        |
| `OPENCODE_SDK_USAGE.md` | SDK usage guide                                      |
| `docs/opencode-service-sdk-v2-mapping.md` | SDK v2 migration mapping, progress, and handoff status |
| `docs/opencode-sdk-v2-manual-checklist.md` | Manual verification checklist for SDK v2 migration |

### Project Development Documentation

**Primary devlog location**:

```md
/Volumes/SDD2T/obsidian-vault-write/技术学习/个人项目开发/opencodian插件项目/DEVLOG.md
```

This is the main development log maintained in the Obsidian vault for easy reference and linking with other project notes.

---

**Last Updated**: 2026-03-29
**Plugin Version**: 1.0.0
