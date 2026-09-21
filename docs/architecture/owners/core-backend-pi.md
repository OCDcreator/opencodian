# Owner: core.backend-pi
> 2026-09-21 (advantage-parity R-F7)：PiLaunchOptions/PiSessionRuntime/PiAdapter 增 `getExtraEnv` 缝：Pi 服务进程 spawn env 在 PATH 增补后叠加域 env。
> 2026-09-21 (advantage-parity R-F1)：PiAdapter 声明 TurnSteering 能力并实现 steerTurn（原生 RPC prompt streamingBehavior:'steer'，活体实证 pi 0.86.0）。
> 2026-09-21 (advantage-parity R-E6)：owner manifest 刷新——shared.foundation 的 include 新增 `src/shared/tokenEstimate.ts`（token 估算启发式）；本 owner 的边界与职责未变。
- 2026-09-13 (universal memory backend): owner manifest gained `core.memory` and `app.memory-runtime`; this owner's boundary itself is unchanged (no source touched, allowlist untouched).
- 2026-09-18 (inline-edit R-A3/R-A4): `PiAuxQuerySession` gained per-turn image attachments (chat-side `images: [{type:'image', data, mimeType}]` shape on the prompt request) and progressive text streaming (`message_update` `text_delta` events). Read-only `set_tools`/`get_tools` contract and temp-scope cleanup unchanged; images never enter the vault.

The canonical owner is declared in `architecture-owners.config.json`.

Pi is an independently installed local process service. The Obsidian process consumes its official JSONL RPC interface; it does not load the Pi SDK, share an OpenCode server, or call Claude/Codex implementations. There is no public listening port or additional HTTP daemon.

| Boundary | Owner |
| --- | --- |
| CLI version, credentials, providers, extensions, native JSONL history | External official Pi installation |
| Process lifetime, protocol framing and failures | PiRpcClient |
| Session locks, cancellation and AgentService lifecycle | PiAdapter |
| Plugin session handles and atomic metadata | PiSessionStore |
| Translation into existing StreamChunk contract | PiStreamMapper |
| Model selector and settings presentation | PiModelSelectionBinding / SettingsPiSection |

Each active conversation gets its own process. Processes close after a turn and resume from the same Pi-owned session file on the next turn. A process crash or cancellation cannot terminate another conversation. Registration and construction do not start Pi or change the active backend.

Imports from `core.backend` are limited to AgentService contracts; other backend implementations are forbidden by the Pi isolation test. Core does not depend on the feature or app layers. Shared entrypoints contain only explicit Pi dispatch/composition.

Upgrade validation: `node scripts/pi-rpc-smoke.mjs` checks the installed official CLI with no provider fallback, including a real tool, streaming, persisted resume, clone and scoped deletion in a temporary workspace. Run unit tests and `npm run verify` for plugin changes. Do not rewrite Pi session schemas to accommodate an upstream change; update the protocol adapter and test the new version instead.

Model/thinking overrides are process launch arguments, followed by exact get_state model validation. Never use settings-persisting Pi RPC setters for per-conversation overrides. The live smoke asserts byte-for-byte equality of Pi global settings before/after.

## SDK 服务边界

2026-09-09：兼容0.85.x的@earendil-works官方包、ModelRuntime认证/模型接口和保留持久化模式的会话工厂；旧0.73.x AuthStorage路径保持独立分支。配置保存等待异步官方模型校验，保留revision/备份约束；模型校验禁用网络与认证解析。Windows新SDK验收使用本地HTTP fixture，不消费用户模型额度，不安装SDK。51项结构化设置仍对应既有0.73.1基线，原生JSON保留新增字段。

完整接入使用PiProtocol/PiSessionRuntime与assets/pi独立服务，按会话常驻进程。业务命令/扩展UI/原生历史/账号资源分别隔离；运行时内存设置避免全局默认值泄漏。见docs/requirements/multi-agent-foundation/07-pi-adapter.md。

2026-09-09：独立配置进程管理官方settings/models文件，带schema、revision冲突、备份、校验；会话内存设置与持久配置分开。SDK升级测试对照51项设置全集。

v1.1.14安装边界：用户自行安装官方Pi，缺失时直接报错；插件没有Pi安装/升级脚本。服务模块在构建时合并到main.js，通过stdin传给独立Node进程并在内存加载，不再展开assets/pi文件。发行包始终只有main.js、manifest.json、styles.css；真实SDK验收验证无服务文件也可运行。

- 2026-09-15: 新增 `PiAuxQuerySession.ts`：用 Pi 原生的 `set_tools`/`get_tools` 建立并校验只读会话，会话落在临时作用域而非 `.pi/opencodian-sessions`；`PiAdapter` 实现 `startAuxQuerySession()`。
- 2026-09-17: `PiStreamMapper` 新增 `resolvePiToolCall()`，把 Pi 的 MCP 元工具（`mcp` / `mcpScript`，真实 server/tool 只存在于参数的 `{tool, args}` 或 `{search}` / `{describe}` 里）还原成 `kind: 'mcp'` + 限定工具名 + 解析后的 input。live 流与 `toPiChatMessages` 历史恢复共用该 helper，历史侧同时写回 content block 的 `toolKind`。身份归一化仍属本 owner（翻译进 StreamChunk 契约），不是渲染职责。
- 2026-09-17: 新增 `PiMcpConfigService`（只读）：Pi 的 MCP 来自扩展而非 RPC，所以声明清单只能按扩展的合并顺序读配置文件（`~/.config/mcp` → `~/.agents` → Pi 全局 `mcp.json` → 库内 `.mcp.json` / `.pi/mcp.json`），并做端点脱敏。这是本 owner 第一次读 Pi 安装侧的文件；不写任何文件，也不复刻祖先目录发现与 imports 展开。同一轮 `PiAdapter` 捕获扩展经 UI 通道上报的 `setStatus`/`notify` 文本（`getExtensionStatus()`）供设置页展示。
