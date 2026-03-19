# OpenCodian - AI Agent Documentation

## Project Overview

**OpenCodian** is an Obsidian plugin that embeds OpenCode AI (an open-source AI coding assistant) into the Obsidian sidebar. It is inspired by [Claudian](https://github.com/YishenTu/claudian) but uses the open-source OpenCode as the backend, supporting multiple AI model providers including Claude, GPT, and local models (vLLM/Ollama).

### Key Characteristics

- **Multi-model support**: Works with Claude, GPT, local models, and any OpenAI-compatible API
- **Local-first**: Can be configured to use local models, keeping data on the local machine
- **Client/Server architecture**: The plugin communicates with an OpenCode server via HTTP/SSE
- **Desktop only**: Requires Obsidian desktop app (v1.4.5+)

## Architecture

```
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

| Category | Technology |
|----------|------------|
| Language | TypeScript 5.0+ |
| Target | ES2018, CommonJS |
| Build Tool | esbuild 0.27+ |
| Test Framework | Jest 30.2+ (jsdom environment) |
| Linting | ESLint 8.57+ with TypeScript support |
| Platform | Obsidian Plugin API |

## Directory Structure

```
opencodian/
├── src/
│   ├── main.ts                      # Plugin entry point
│   ├── core/
│   │   ├── opencode/                # OpenCode SDK wrapper
│   │   │   ├── OpenCodeService.ts   # Core service for SDK interaction
│   │   │   ├── ServerManager.ts     # Server lifecycle management
│   │   │   ├── types.ts             # Service types
│   │   │   └── index.ts             # Module exports
│   │   ├── storage/                 # Persistence layer
│   │   │   ├── StorageService.ts    # Conversation & settings storage
│   │   │   └── index.ts
│   │   ├── types/                   # Type definitions
│   │   │   ├── chat.ts              # Chat message types
│   │   │   ├── models.ts            # Model types
│   │   │   ├── settings.ts          # Settings types & defaults
│   │   │   ├── tools.ts             # Tool types
│   │   │   └── index.ts
│   │   └── tools/                   # Tool definitions
│   │       ├── toolNames.ts         # Tool name constants
│   │       └── index.ts
│   ├── features/
│   │   ├── chat/
│   │   │   ├── OpenCodianView.ts    # Main chat view component
│   │   │   └── index.ts
│   │   └── settings/
│   │       ├── OpenCodianSettings.ts # Settings tab UI
│   │       └── index.ts
│   ├── i18n/                        # Internationalization
│   │   ├── index.ts
│   │   └── locales/
│   │       ├── en.ts
│   │       └── zh.ts
│   └── utils/                       # Utility functions
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

### 2. ServerManager (`src/core/opencode/ServerManager.ts`)

Manages the OpenCode server process lifecycle.

**Key Methods:**
- `start()` - Start the OpenCode server process
- `stop()` - Stop the server process
- `checkHealth()` - Check if server is responding

### 3. StorageService (`src/core/storage/StorageService.ts`)

Persists conversations and settings.

**Storage Layout:**
```
.obsidian/plugins/opencodian/
└── .opencodian/
    ├── settings.json          # Plugin settings
    └── sessions/              # Conversation metadata
        └── conv-xxx.json
```

### 4. OpenCodianView (`src/features/chat/OpenCodianView.ts`)

Main chat UI view (extends Obsidian's `ItemView`).

**Features:**
- Sidebar chat interface
- Message rendering
- Input handling
- Real-time streaming display

### 5. OpenCodianSettingTab (`src/features/settings/OpenCodianSettings.ts`)

Settings UI with bilingual support (English/Chinese).

**Settings Categories:**
- **Language**: Interface language selection
- **Server**: Auto-start, host, port
- **Model**: Dynamic provider/model selection
- **Security**: Permission mode, command blocklist
- **UI**: Max tabs, tab bar position, auto-scroll

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

### Current Deployment Path

```
/Volumes/SDD2T/obsidian-vault-write/技术学习/.obsidian/plugins/opencodian/
```

## Development Notes

### Adding New Features

1. **New settings**: Add to `OpenCodianSettings` interface, add UI in `OpenCodianSettings.ts`
2. **New commands**: Register in `main.ts` `onload()` method
3. **New message types**: Extend `StreamChunk` type in `src/core/types/chat.ts`

### Debugging

- Check Obsidian's Developer Tools (Ctrl/Cmd+Shift+I)
- Look for `[OpenCodeService]`, `[OpenCodianView]`, `[Settings]` prefix logs
- OpenCode server logs with `[OpenCode]` prefix

---

## Documentation Files

### Repository Documentation

| File | Purpose |
|------|---------|
| `AGENTS.md` | Project overview and coding guidelines (this file) |
| `devlog.md` | Development log with detailed feature implementation |
| `ARCHITECTURE.md` | Detailed architecture documentation |
| `SERVER_API.md` | OpenCode Server API reference |
| `OPENCODE_SDK_USAGE.md` | SDK usage guide |

### Project Development Documentation

**Primary devlog location**: 
```
/Volumes/SDD2T/obsidian-vault-write/技术学习/个人项目开发/opencodian插件项目/DEVLOG.md
```

This is the main development log maintained in the Obsidian vault for easy reference and linking with other project notes.

---

**Last Updated**: 2026-03-19  
**Plugin Version**: 0.1.0
