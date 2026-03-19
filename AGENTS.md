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
                      │ @opencode-ai/sdk
                      ▼ HTTP / SSE
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
| Main Dependency | @opencode-ai/sdk |
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
│   ├── shared/                      # Shared components
│   ├── i18n/                        # Internationalization
│   └── utils/                       # Utility functions
├── tests/
│   ├── __mocks__/obsidian.ts        # Obsidian API mock for testing
│   ├── setup.ts                     # Test setup
│   └── unit/                        # Unit tests
├── scripts/                         # Build scripts
│   ├── build.mjs                    # Production build
│   ├── build-css.mjs                # CSS compilation
│   ├── run-jest.js                  # Test runner
│   └── sync-version.js              # Version synchronization
├── docs/
│   └── MIGRATION.md                 # Claudian migration guide
├── package.json
├── manifest.json                    # Obsidian plugin manifest
├── tsconfig.json                    # TypeScript config
├── tsconfig.jest.json               # Jest TypeScript config
├── jest.config.js                   # Jest configuration
├── esbuild.config.mjs               # esbuild development config
├── .eslintrc.cjs                    # ESLint configuration
└── styles.css                       # Compiled CSS (generated)
```

## Build and Development Commands

```bash
# Install dependencies
npm install

# Development mode (watch and auto-rebuild)
npm run dev

# Production build (outputs to dist/)
npm run build

# Type checking
npm run typecheck

# Run tests
npm run test
npm run test:watch      # Watch mode
npm run test:coverage   # With coverage report

# Linting
npm run lint
npm run lint:fix        # Auto-fix issues

# Build CSS (if src/style/ exists)
npm run build:css
```

## Code Style Guidelines

### ESLint Configuration

The project uses ESLint with the following key rules:

- **Parser**: `@typescript-eslint/parser`
- **Plugins**: `@typescript-eslint`, `simple-import-sort`, `jest`
- **Import sorting**: Enforced via `simple-import-sort/imports` and `simple-import-sort/exports`
- **Console**: Warns on console usage except for `console.error` and `console.warn`
- **Unused vars**: Errors on unused variables (except those prefixed with `_`)
- **Any type**: Explicit `any` is allowed (`@typescript-eslint/no-explicit-any: off`)

### TypeScript Configuration

- **Target**: ES2018
- **Module**: ESNext
- **Module Resolution**: Node
- **Strict null checks**: Enabled
- **Path mapping**: `@/*` maps to `src/*`
- **Source maps**: Inline for development

### Naming Conventions

- **Classes**: PascalCase (e.g., `OpenCodeService`, `ServerManager`)
- **Interfaces**: PascalCase (e.g., `OpenCodianSettings`, `ChatMessage`)
- **Type aliases**: PascalCase (e.g., `PermissionMode`, `StreamChunk`)
- **Constants**: UPPER_SNAKE_CASE for true constants (e.g., `VIEW_TYPE_OPENCODIAN`, `DEFAULT_SETTINGS`)
- **Functions/Methods**: camelCase
- **Private members**: Prefix with underscore is not commonly used; rely on `private` modifier

### File Organization

- Each module should have an `index.ts` for clean exports
- Types are co-located in `src/core/types/`
- Feature-based organization under `src/features/`
- Core business logic in `src/core/`

## Testing Strategy

### Test Framework

- **Runner**: Jest 30.2+
- **Environment**: jsdom (for unit tests), node (for integration tests)
- **Transpiler**: ts-jest
- **Coverage**: Collected from `src/**/*.ts`, excluding `.d.ts` and `index.ts` files

### Test Structure

```
tests/
├── unit/           # Unit tests
├── integration/    # Integration tests (configured but not yet implemented)
├── __mocks__/      # Mocks
│   └── obsidian.ts # Comprehensive Obsidian API mock
└── setup.ts        # Global test setup
```

### Mocking

The `tests/__mocks__/obsidian.ts` provides mocks for:
- `Plugin` class
- `PluginSettingTab` and `Setting` classes
- `Modal`, `Notice`, `TFile`, `TFolder`, `Vault`
- `Workspace`, `WorkspaceLeaf`, `ItemView`
- Utility functions like `setIcon`, `normalizePath`, `debounce`

### Running Tests

```bash
# All tests
npm run test

# Watch mode
npm run test:watch

# With coverage
npm run test:coverage
```

## Core Components

### 1. OpenCodeService (`src/core/opencode/OpenCodeService.ts`)

Main service for interacting with the OpenCode SDK.

**Responsibilities:**
- Wraps `@opencode-ai/sdk` client
- Manages session lifecycle (create, list, delete)
- Sends messages and handles streaming responses
- Transforms OpenCode message format to internal ChatMessage format
- Fetches available models from the server

**Key Methods:**
- `start()` / `stop()` - Start/stop the service
- `createSession(title?)` - Create a new chat session
- `sendMessage(message, options)` - Send message and get streaming response (async generator)
- `getAvailableModels()` - Fetch available providers and models

### 2. ServerManager (`src/core/opencode/ServerManager.ts`)

Manages the OpenCode server process lifecycle.

**Responsibilities:**
- Spawns the OpenCode server process (`opencode server --port ...`)
- Monitors server health via HTTP health endpoint
- Handles port availability checks
- Manages graceful shutdown
- Crash recovery

**States:** `stopped` → `starting` → `running` → `error` | `restarting`

### 3. StorageService (`src/core/storage/StorageService.ts`)

Persists conversations and settings to the Obsidian vault.

**Storage Layout:**
```
.obsidian/plugins/opencodian/  # Plugin directory
└── .opencodian/               # Data directory
    ├── settings.json          # Plugin settings
    └── sessions/              # Conversation metadata
        ├── conv-xxx.json
        └── conv-yyy.json
```

Note: Message history is stored by the OpenCode server, not the plugin.

### 4. OpenCodianView (`src/features/chat/OpenCodianView.ts`)

Main chat UI view (extends Obsidian's `ItemView`).

**Features:**
- Sidebar chat interface
- Message rendering
- Input handling
- Tool call display (planned)
- Multi-tab support (planned)

### 5. OpenCodianSettingTab (`src/features/settings/OpenCodianSettings.ts`)

Settings UI for configuring the plugin.

**Settings Categories:**
- **Server**: Auto-start, host, port
- **Model**: Default provider, default model
- **Security**: Permission mode, command blocklist, external access
- **UI**: Max tabs, tab bar position, auto-scroll
- **User**: User name, system prompt, excluded tags

## Settings Reference

Default settings are defined in `src/core/types/settings.ts`:

```typescript
{
  userName: '',
  server: {
    host: '127.0.0.1',
    port: 4096,
    autoStart: true,
  },
  enableBlocklist: true,
  allowExternalAccess: false,
  blockedCommands: { unix: [...], windows: [...] },
  permissionMode: 'yolo',  // 'yolo' | 'normal' | 'plan'
  defaultProvider: 'anthropic',
  defaultModel: 'claude-3-5-sonnet-20241022',
  providers: [...],
  maxTabs: 3,
  tabBarPosition: 'input',  // 'input' | 'header'
  enableAutoScroll: true,
  openInMainTab: false,
  locale: 'en',
}
```

## Prerequisites for Users

1. **Obsidian** v1.4.5 or later (desktop only)
2. **OpenCode** installed globally:
   ```bash
   npm install -g opencode-ai
   ```

## Deployment Process

### Development

1. Clone the repository
2. Run `npm install`
3. Run `npm run dev` for watch mode
4. Copy/symlink the plugin to your Obsidian vault:
   ```bash
   # On macOS/Linux
   ln -s /path/to/opencodian /path/to/vault/.obsidian/plugins/opencodian
   ```

### Production Build

```bash
npm run build
```

This creates a `dist/` folder with:
- `main.js` - Bundled plugin code
- `manifest.json` - Plugin manifest
- `styles.css` - Compiled styles (if applicable)

### Distribution

The production build can be distributed as a release package containing:
- `main.js`
- `manifest.json`
- `styles.css` (if it exists)

Users install by extracting these files to `.obsidian/plugins/opencodian/` in their vault.

## Security Considerations

### Command Blocklist

The plugin includes a default blocklist of dangerous commands:

**Unix:** `rm -rf`, `chmod 777`, etc.
**Windows:** `del /s /q`, `format`, `diskpart`, various PowerShell commands

### Permission Modes

- **YOLO**: Auto-approve all tool executions
- **Normal**: Prompt user for approval
- **Plan**: Plan mode (implementation specific)

### External Access

Users can control whether the AI can access files outside the vault (`allowExternalAccess` setting).

## Known Limitations

1. **Requires OpenCode installation** - Users must manually install `opencode-ai` npm package
2. **Port dependency** - Default port 4096 must be available
3. **Server startup time** - First launch may take a few seconds
4. **No MCP support** - OpenCode uses its own plugin system, not Model Context Protocol
5. **Desktop only** - Requires Node.js process spawning

## Useful References

- [OpenCode SDK Documentation](https://opencode.ai/docs/sdk/)
- [Obsidian Developer Documentation](https://docs.obsidian.md/)
- [Claudian Plugin](https://github.com/YishenTu/claudian) - Inspiration for this project
- Migration guide: `docs/MIGRATION.md`
- Architecture details: `ARCHITECTURE.md`

## Development Notes

### Adding New Features

1. **New settings**: Add to `OpenCodianSettings` interface in `src/core/types/settings.ts`, add UI in `OpenCodianSettings.ts`
2. **New commands**: Register in `main.ts` `onload()` method
3. **New message types**: Extend `StreamChunk` type in `src/core/types/chat.ts`
4. **SDK changes**: Update `OpenCodeService` methods and event transformers

### Debugging

- Use `console.log` sparingly (ESLint warns on console usage)
- Check Obsidian's Developer Tools (Ctrl/Cmd+Shift+I)
- OpenCode server logs to console with `[OpenCode]` prefix
- Enable verbose logging in OpenCode server config if needed

### Version Management

The `npm run version` script automatically syncs version numbers between `package.json` and `manifest.json`.
