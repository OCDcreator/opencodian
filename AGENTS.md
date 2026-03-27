# OpenCodian - AI Agent Documentation

## Project Overview

**OpenCodian** is an Obsidian plugin that embeds OpenCode AI (an open-source AI coding assistant) into the Obsidian sidebar. It is inspired by [Claudian](https://github.com/YishenTu/claudian) but uses the open-source OpenCode as the backend, supporting multiple AI model providers including Claude, GPT, and local models (vLLM/Ollama).

### Key Characteristics

- **Multi-model support**: Works with Claude, GPT, local models, and any OpenAI-compatible API
- **Local-first**: Can be configured to use local models, keeping data on the local machine
- **Client/Server architecture**: The plugin communicates with an OpenCode server via HTTP/SSE
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
│   │   ├── config/                  # OpenCode config + model catalog management
│   │   │   ├── ModelConfigService.ts
│   │   │   ├── OpencodeConfigManager.ts
│   │   │   ├── modelConfig.ts
│   │   │   └── index.ts
│   │   ├── opencode/                # OpenCode SDK wrapper
│   │   │   ├── OpenCodeService.ts   # Core service for SDK interaction
│   │   │   ├── ServerManager.ts     # Server lifecycle management
│   │   │   ├── types.ts             # Service types
│   │   │   └── index.ts             # Module exports
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

Main service for interacting with OpenCode Server via HTTP API.

**Key Methods:**

- `createSession(title?)` - Create a new chat session
- `sendMessage(message, options)` - Send message and get streaming response
- `getAvailableModels()` - Fetch available providers and models
- `getSessionMessages(sessionId)` - Get messages for a session
- `forkSession(sessionId, messageID?)` - Fork a conversation from a selected message
- `revertSession(sessionId, messageID, partID?)` - Rewind a conversation to a prior point

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

### 4. StorageService (`src/core/storage/StorageService.ts`)

Persists conversations and settings.

**Storage Layout:**

```md
.obsidian/plugins/opencodian/
└── .opencodian/
    ├── settings.json          # Plugin settings
    └── sessions/              # Conversation metadata
        └── conv-xxx.json
```

### 5. OpenCodianView (`src/features/chat/OpenCodianView.ts`)

Main chat UI view (extends Obsidian's `ItemView`).

**Features:**

- Sidebar or main-tab chat interface
- Multi-tab conversation management
- Per-session model switching dropdown
- Effort / thinking budget selector
- Real-time streaming display
- Navigation sidebar for previous/next user messages
- Fork / rewind conversation entry points
- Collapsible long assistant content blocks
- Inline permission cards and server status badge

### 6. OpenCodianSettingTab (`src/features/settings/OpenCodianSettings.ts`)

Settings UI with bilingual support (English/Chinese).

**Settings Categories:**

- **Language**: Interface language selection
- **Server**: Local / remote mode, auth, health status, help modal
- **Model**: Source mode, default provider/model, visual editor, JSON editor
- **Security**: Permission mode, config editor, command blocklist, export paths
- **UI**: Max tabs, tab bar position, auto-scroll, chat scroll mode, open in main tab
- **Style**: Chat appearance controls and custom CSS declarations
- **Debug**: Debug logging, per-platform log paths, diagnostics export
- **User**: User name, system prompt, excluded tags

### 7. Streaming Utilities (`src/utils/streaming/`)

SSE streaming components for real-time message display.

**Key Components:**

- `StreamController` - Manages stream state and callbacks
- `ThinkingBlockRenderer` - Renders AI thinking blocks
- `ToolCallRenderer` - Renders tool call progress and results

**Stream Event Types:**

- `text` - Text content chunks
- `thinking` - AI reasoning blocks
- `tool_use` - Tool call initiated
- `tool_result` - Tool execution result
- `done` - Stream completed
- `error` - Error occurred

## Prerequisites for Users

1. **Obsidian** v1.4.5 or later (desktop only)
2. **OpenCode** installed globally:

   ```bash
   npm install -g opencode-ai
   ```

3. **AI Provider configured**: Run `opencode` and use `/connect` to set up API keys

## Deployment

### Quick Deploy Script

```bash
npm run build && cp dist/main.js dist/manifest.json dist/styles.css "/path/to/vault/.obsidian/plugins/opencodian/"
```

### Deployment Paths

| Environment          | Path Type | Path                                                                         |
| -------------------- | --------- | ---------------------------------------------------------------------------- |
| **Production Vault** | Absolute  | `/Volumes/SDD2T/obsidian-vault-write/技术学习/.obsidian/plugins/opencodian/` |
| **Test Vault**       | Absolute  | `C:\Users\lt\Desktop\Write\testvault\.obsidian\plugins\opencodian\`          |
| **Test Vault**       | Relative  | `../../testvault/.obsidian/plugins/opencodian/`                              |

> **Note**: Relative path is calculated from the project root (`opencodian/`) for cross-platform compatibility.

### Test Vault Quick Deploy (Windows)

```bash
npm run build && copy dist\main.js dist\manifest.json dist\styles.css ..\..\testvault\.obsidian\plugins\opencodian\
```

### Test Vault Quick Deploy (Unix/macOS)

```bash
npm run build && cp dist/main.js dist/manifest.json dist/styles.css ../../testvault/.obsidian/plugins/opencodian/
```

### Agent Default Deploy Workflow

- For any code, style, manifest, or build-related change, the default workflow is: `npm run build` and then deploy `dist/main.js`, `dist/manifest.json`, and `dist/styles.css` to the **Test Vault** plugin directory.
- On Windows, deploy to `C:\Users\lt\Desktop\Write\testvault\.obsidian\plugins\opencodian\`.
- Skip deployment only if the user explicitly says not to build/deploy, or if the task is analysis-only with no file changes.
- After deployment, report whether build and copy succeeded or failed.

## Development Notes

### Adding New Features

1. **New settings**: Add to `OpenCodianSettings` interface, add UI in `OpenCodianSettings.ts`
2. **New commands**: Register in `main.ts` `onload()` method
3. **New message types**: Extend `StreamChunk` type in `src/core/types/chat.ts`
4. **Model config changes**: Keep `ModelConfigService`, settings UI, and `.opencode/config.json` writes in sync
5. **Chat UI additions**: Check `features/chat/tabs/`, `features/chat/ui/`, and `styles.css` together

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

### Project Development Documentation

**Primary devlog location**:

```md
/Volumes/SDD2T/obsidian-vault-write/技术学习/个人项目开发/opencodian插件项目/DEVLOG.md
```

This is the main development log maintained in the Obsidian vault for easy reference and linking with other project notes.

---

**Last Updated**: 2026-03-27
**Plugin Version**: 0.1.0
