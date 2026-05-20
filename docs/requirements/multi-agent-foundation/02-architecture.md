# 多 Agent 架构设计

> **状态**: `[DRAFT]`
> **最后更新**: 2026-05-20

## 概述

采用 **Core + Capability Pattern**：定义一个最小核心接口（会话、流式、消息），加上一系列可选能力接口（工具、MCP、权限、分支等）。每个 adapter 声明自己支持哪些能力，视图层根据能力动态展示/隐藏功能。

## 0. 当前实现状态和 Claude 接入修正

2026-05-20 复核当前 worktree 后，架构文档需要区分“目标架构”和“已经落地的 Phase 0 状态”：

| 区域 | 当前状态 | Claude 前置要求 |
|---|---|---|
| Registry | `AgentServiceRegistry` 已存在，能注册/启用/选择 backend。 | 保留为统一入口。 |
| OpenCode adapter | `OpenCodeAdapter` 已存在，广泛委托 `OpenCodeService`。 | 作为 OpenCode regression reference。 |
| Implemented gate | `IMPLEMENTED_AGENT_BACKENDS` 当前只包含 `opencode`。 | Claude runtime smoke 通过前不得加入。 |
| Core contract | 当前 `AgentService` 主要是 lifecycle/status/capability，尚未包含 backend-neutral chat/session。 | 需要补 `AgentChatCapability` / `AgentSessionCapability` 或等价 core methods。 |
| Conversation schema | `Conversation.backend` 已存在，但 `openCodeSessionId` 仍 required。 | 需要 `backendSessionId`，旧数据 fallback 到 `openCodeSessionId`。 |
| Send pipeline | Runtime 已抽出 port，但实际仍传 `openCodeSessionId` 并调用 `openCodeService.sendMessage()`。 | 必须改成 active backend routing。 |
| Settings | Backend section 有未来选项，但过滤到已实现 backend。 | 继续 gate；Claude settings 单独 owner。 |

Claude 不能被设计成“OpenCodeService 的另一个 provider”。它是另一个 backend runtime，具有自己的 executable、settings source、permission mode、session JSONL、skills、hooks、agents、MCP 语义。

### 0.1 Capability 拆分规则

OpenCodian UI 只应依赖共性 capability：

- `chat`
- `sessions`
- `models`
- `tools`
- `permissions`
- `mcp`
- `context`
- `branching`

Claude 专属能力必须保留专属 namespace 或专属 settings owner：

- `claude.executable`
- `claude.settingSources`
- `claude.permissionMode`
- `claude.thinking`
- `claude.hooks`
- `claude.skills`
- `claude.agents`
- `claude.sessionJsonl`
- `claude.additionalDirectories`

这样既能实现“Claude 全部功能接入”，也不会把 Claude 的能力硬塞成 OpenCode-only 的 provider/config/tool settings。

### 0.2 2026-05-20 Council 修正

Council review 选择 **direct registry routing + capability narrowing** 作为 Phase 0d/Claude Phase 1 的实施策略。旧版 Proxy 委托方案只保留为历史备选，不再作为当前计划。

修正点：

- `AgentCapability` 必须新增 `Chat` / `Sessions`，因为 chat/session 是 backend 接入的核心能力。
- `AgentChatCapability.sendMessage` 统一为一个 request object：`sendMessage({ sessionId, content, options })`，避免 architecture doc 和 implementation plan 的参数顺序冲突。
- `Conversation.openCodeSessionId` 必须改为可选，非 OpenCode 会话用 `backendSessionId`；现有 `acpSessionId` 应泛化/迁移为 `backendSessionId`，避免新增并行 session 字段。
- create/delete/title/cancel/send/finalization 等生命周期路径都必须 backend-aware；不能只迁移 send path。

## 1. 架构总览

```
┌─────────────────────────────────────────────────┐
│              Chat View / UI Layer                │
│   (depends only on AgentService + capabilities)  │
├─────────────────────────────────────────────────┤
│           AgentServiceRegistry                   │
│   (manages agent instances, selection, switch)   │
├─────────────────────────────────────────────────┤
│            AgentService (interface)               │
│   + AgentToolCapability                          │
│   + AgentMcpCapability                           │
│   + AgentPermissionCapability                    │
│   + AgentBranchCapability                        │
│   + AgentConfigCapability                        │
│   + AgentTodoCapability                          │
│   + agent-specific capabilities...               │
├──────────┬──────────┬──────────┬────────────────┤
│ OpenCode │  Claude  │  Codex   │ Copilot │ Pi   │
│ Adapter  │  Adapter │  Adapter │ Adapter │ Adap. │
├──────────┴──────────┴──────────┴────────────────┤
│        @opencode-ai/sdk  │  @anthropic-ai/...   │
│        @openai/codex-sdk │  @github/copilot-... │
│        @mariozechner/pi-...                      │
└─────────────────────────────────────────────────┘
```

## 2. 核心接口定义

### 2.1 AgentBackendKind — 后端标识

> ⚠️ 命名为 `AgentBackendKind`（非 `AgentKind`），明确标识的是后端实现而非 agent 本身。
> 与现有 `SurfaceAgent` 配合使用 — `SurfaceAgent.backend` 字段引用此类型。

```typescript
type AgentBackendKind = 'opencode' | 'claude-code' | 'codex' | 'copilot' | 'pi';
```

### 2.2 AgentService — 核心接口

所有后端 adapter 必须实现的最小契约：

```typescript
interface AgentService {
  /** 后端类型标识 */
  readonly kind: AgentBackendKind;

  /** 显示名称（本地化） */
  readonly displayName: string;

  /** 描述（本地化） */
  readonly description: string;

  /** 连接状态 */
  readonly status: AgentConnectionStatus;

  /** 声明支持的能力集合 */
  readonly capabilities: ReadonlySet<AgentCapability>;

  /** 能力查询 — 返回 this 并缩窄类型 */
  hasCapability(cap: AgentCapability): boolean;

  // ---- 生命周期 ----
  start(): Promise<void>;
  stop(): Promise<void>;
  onStatusChange(handler: StatusChangeHandler): Disposable;

  // ---- 会话管理（核心） ----
  createSession(options?: SessionCreateOptions): Promise<string>; // 返回 sessionId
  listSessions(): Promise<readonly SessionInfo[]>;
  getSession(sessionId: string): Promise<SessionInfo | null>;
  deleteSession(sessionId: string): Promise<void>;
  updateSessionTitle(sessionId: string, title: string): Promise<void>;

  // ---- 消息与流式（核心） ----
  // ⚠️ 返回 StreamChunk（src/core/types/chat.ts 已定义的传输无关类型）
  // 每个 adapter 负责将自己的 SDK 事件翻译为 StreamChunk
  sendMessage(request: { sessionId: string; content: string; options?: ChatSendOptions }): AsyncGenerator<StreamChunk>;
  cancelStream(sessionId: string): Promise<void>;

  // ---- 事件订阅（核心） ----
  onSessionEvent(handler: SessionEventHandler): Disposable;
}
```

### 2.3 核心类型

> ⚠️ **关键决策**：不复用 `AgentStreamEvent` / `AgentSession` / `AgentMessage` 等新类型。
> 流式事件复用已有 `StreamChunk`（src/core/types/chat.ts）。
> 会话数据复用已有 `Conversation`（扩展 `backend` / `backendSessionId` 字段）。
> 消息数据复用已有 `ChatMessage`（扩展 `backendKind` metadata）。

```typescript
type AgentConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error';

type AgentCapability =
  | 'chat'           // 消息发送和流式响应
  | 'sessions'       // 会话创建、删除、标题更新、resume
  | 'tools'          // 工具调用
  | 'mcp'            // MCP 集成
  | 'permissions'    // 权限管理
  | 'branching'      // 会话分支/fork
  | 'config'         // Agent 配置管理
  | 'todos'          // Todo 追踪
  | 'questions'      // 问答/权限请求
  | 'models'         // 模型选择
  | 'subagents'      // 子 agent
  | 'context'        // 上下文管理
  | 'providers'      // 多 provider 支持
  | 'compaction'     // 上下文压缩
  | 'file-ops'       // 文件操作
  | 'shell'          // Shell 命令
  | 'cost-tracking'  // 成本追踪
  | 'export'         // 会话导出
  | 'hooks';         // Hook 系统

// 会话轻量摘要 — adapter 返回给 registry 的
interface SessionInfo {
  id: string;
  title?: string;
  createdAt: number;
  updatedAt: number;
}

interface SessionCreateOptions {
  model?: string;
  agentId?: string;      // agent profile (如 OpenCode 的 agent name)
  systemPrompt?: string;
  metadata?: Record<string, unknown>;
}

interface ChatSendOptions {
  model?: string;
  agentId?: string;
  images?: Array<{ url: string; mediaType?: string }>;
  contextItems?: Array<{ type: string; path?: string; content?: string }>;
  allowedTools?: string[];
}

interface Disposable {
  dispose(): void;
}

// ❌ 已删除：AgentStreamEvent（复用 StreamChunk）
// ❌ 已删除：AgentSession（复用 Conversation）
// ❌ 已删除：AgentMessage（复用 ChatMessage）
```

## 3. 能力接口定义

### 3.1 AgentToolCapability — 工具调用

```typescript
interface AgentToolCapability {
  /** 列出可用工具 */
  listTools(): Promise<AgentTool[]>;

  /** 订阅工具目录变化 */
  onToolCatalogChange(handler: () => void): Disposable;
}

interface AgentTool {
  name: string;
  description: string;
  category?: string;
  parameters?: unknown; // JSON Schema
}
```

### 3.2 AgentMcpCapability — MCP 集成

```typescript
interface AgentMcpCapability {
  /** 列出已连接的 MCP servers */
  listMcpServers(): Promise<AgentMcpServer[]>;

  /** 添加/移除 MCP server */
  addMcpServer(config: AgentMcpServerConfig): Promise<void>;
  removeMcpServer(name: string): Promise<void>;
}

interface AgentMcpServer {
  name: string;
  status: 'connected' | 'disconnected' | 'error';
  tools?: AgentTool[];
}
```

### 3.3 AgentPermissionCapability — 权限管理

```typescript
interface AgentPermissionCapability {
  /** 请求用户授权 */
  onPermissionRequest(handler: (request: AgentPermissionRequest) => Promise<AgentPermissionResponse>): Disposable;

  /** 获取当前权限配置 */
  getPermissionConfig(): Promise<AgentPermissionConfig>;

  /** 更新权限配置 */
  updatePermissionConfig(config: Partial<AgentPermissionConfig>): Promise<void>;
}

interface AgentPermissionRequest {
  id: string;
  toolName: string;
  action: string;
  details?: unknown;
}

type AgentPermissionResponse = 'allow' | 'deny' | 'allow_all';

interface AgentPermissionConfig {
  mode: 'yolo' | 'normal' | 'plan' | 'auto' | 'suggest';
  toolOverrides?: Record<string, 'allow' | 'deny' | 'ask'>;
}
```

### 3.4 AgentBranchCapability — 会话分支

```typescript
interface AgentBranchCapability {
  /** Fork 当前会话 */
  forkSession(sessionId: string, options?: { atMessageId?: string }): Promise<SessionInfo>;

  /** Revert 到某条消息 */
  revertSession(sessionId: string, options: { atMessageId?: string }): Promise<void>;

  /** Unrevert */
  unrevertSession(sessionId: string): Promise<void>;

  /** 获取 revert 状态 */
  getRevertState(sessionId: string): Promise<AgentRevertState | null>;
}

interface AgentRevertState {
  canRevert: boolean;
  canUnrevert: boolean;
  revertPoint?: string;
}
```

### 3.5 AgentConfigCapability — 配置管理

```typescript
interface AgentConfigCapability {
  /** 获取 agent 配置 */
  getConfig(): Promise<AgentConfig>;

  /** 更新 agent 配置 */
  updateConfig(config: Partial<AgentConfig>): Promise<void>;

  /** 配置变化订阅 */
  onConfigChange(handler: (config: AgentConfig) => void): Disposable;
}

interface AgentConfig {
  // 通用字段
  model?: string;
  provider?: string;
  // agent-specific 字段放在 metadata
  metadata: Record<string, unknown>;
}
```

### 3.6 AgentModelCapability — 模型选择

```typescript
interface AgentModelCapability {
  /** 列出可用模型 */
  listModels(): Promise<AgentModel[]>;

  /** 获取当前模型 */
  getCurrentModel(sessionId: string): Promise<AgentModel | null>;

  /** 设置模型 */
  setModel(sessionId: string, modelId: string): Promise<void>;

  /** 模型变化订阅 */
  onModelsChange(handler: () => void): Disposable;
}

interface AgentModel {
  id: string;
  name: string;
  provider: string;
  capabilities?: string[];
}
```

### 3.7 AgentTodoCapability — Todo 追踪

```typescript
interface AgentTodoCapability {
  /** 获取 session 的 todo 列表 */
  getSessionTodos(sessionId: string): Promise<AgentTodo[]>;

  /** Todo 更新订阅 */
  onTodoUpdate(handler: (sessionId: string, todos: AgentTodo[]) => void): Disposable;
}

interface AgentTodo {
  id?: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
}
```

### 3.8 AgentQuestionCapability — 问答/交互

```typescript
interface AgentQuestionCapability {
  /** 当 agent 需要用户输入时触发 */
  onQuestion(handler: (question: AgentQuestion) => void): Disposable;

  /** 回答问题 */
  answerQuestion(questionId: string, answer: string): Promise<void>;
}

interface AgentQuestion {
  id: string;
  sessionId: string;
  content: string;
  options?: string[];
}
```

## 4. 能力映射到 Agent

| 能力 | OpenCode | Claude Code | Codex | Copilot | Pi |
|------|----------|-------------|-------|---------|-----|
| tools | ✅ | ✅ | ✅ (via MCP) | ✅ | ✅ |
| mcp | ✅ | ✅ | ✅ | ✅ | 需确认 |
| permissions | ✅ | ✅ | ✅ (approvalPolicy) | ✅ | 需确认 |
| branching | ✅ | ✅ | ❌ | ❌ | ✅ (tree) |
| config | ✅ | 部分支持 | 部分支持 | 部分支持 | ✅ |
| models | ✅ | ✅ | ✅ | ✅ | ✅ (12+ prov) |
| todos | ✅ | ❌ | ❌ | ❌ | ❌ |
| questions | ✅ | ✅ (AskUser) | ❌ | ✅ (elicitation) | ❌ |
| subagents | ✅ | ✅ | ✅ | ❌ | ❌ |
| context | ✅ | ✅ | ✅ | ✅ (compaction) | ✅ |
| providers | ✅ | ✅ (Bedrock) | ❌ (OpenAI) | ✅ (BYOK) | ✅ (12+) |
| cost-tracking | ❌ | ❌ | ❌ | ❌ | ✅ |
| hooks | ✅ | ✅ | ❌ | ✅ | ❌ |

## 5. AgentServiceRegistry

管理所有 agent 实例的生命周期和选择：

```typescript
interface AgentServiceRegistry {
  /** 注册 agent adapter */
  register(adapterFactory: AgentAdapterFactory): void;

  /** 获取当前活跃 agent */
  getActive(): AgentService;

  /** 切换活跃 agent */
  setActive(kind: AgentBackendKind): Promise<void>;

  /** 获取所有已注册 agent */
  listAll(): AgentServiceInfo[];

  /** 按 kind 获取 */
  get(kind: AgentBackendKind): AgentService;

  /** 活跃 agent 变化订阅 */
  onActiveChange(handler: (kind: AgentBackendKind) => void): Disposable;
}

interface AgentServiceInfo {
  kind: AgentBackendKind;
  displayName: string;
  status: AgentConnectionStatus;
  capabilities: ReadonlySet<AgentCapability>;
}

type AgentAdapterFactory = (context: AgentAdapterContext) => AgentService;

// ⚠️ CI-7 修正：不暴露整个 Plugin，只传声明依赖
interface AgentAdapterContext {
  /** 设置（只读快照） */
  settings: Readonly<OpenCodianSettings>;
  /** 持久化服务 */
  storage: StorageService;
  /** Vault 根路径 */
  vaultPath: string;
  /** 安全存储（用于 API key / token） */
  secureStore: SecureTokenStore;
  /** 日志工厂 */
  createLogger: (prefix: string) => Logger;
}
```

## 6. 目录结构

> ⚠️ CI-2 修正：扩展已有 `src/core/agents/`（复数），不新建 `src/core/agent/`（单数）。

```
src/core/agents/                     # 已有！扩展而非新建
├── (现有 7 个文件)                   # types.ts, AgentCatalogService.ts, etc.
│   ├── types.ts                    # ← 扩展 SurfaceAgent 加 backend 字段
│   ├── AgentCatalogService.ts      # ← 扩展 aggregate() 加多后端聚合
│   └── ...
├── backend/                         # 新增：AgentService 接口层
│   ├── types.ts                    # AgentBackendKind, AgentCapability, SessionInfo 等
│   ├── AgentService.ts             # AgentService 接口定义
│   ├── AgentServiceRegistry.ts     # Registry 实现
│   ├── callbackToAsyncGenerator.ts # 共享工具：callback-based SDK → AsyncGenerator<StreamChunk>
│   └── capabilities/               # Capability 接口
│       ├── index.ts
│       └── *.ts
└── adapters/                        # 新增：各后端实现
    ├── index.ts                    # adapter 注册
    ├── OpenCodeAdapter.ts          # 包装现有 OpenCodeService
    ├── ClaudeCodeAdapter.ts        # Claude Code
    ├── CodexAdapter.ts             # Codex
    ├── CopilotAdapter.ts           # Copilot
    └── PiAdapter.ts                # Pi
```

## 7. 与现有代码的迁移路径

### Phase 0: 定义接口 + OpenCodeAdapter

1. 创建 `src/core/agents/backend/` 和 `src/core/agents/adapters/` 目录和接口定义
2. 实现 `OpenCodeAdapter`：包装现有 `OpenCodeService`
   - 不改 `OpenCodeService` 内部代码
   - `OpenCodeAdapter` 持有 `OpenCodeService` 实例，将其方法映射到 `AgentService` 接口
3. 创建 `AgentServiceRegistry`
4. 让 `OpenCodianView` 通过 `AgentServiceRegistry.getActive()` 获取服务
   - 第一阶段只返回 OpenCodeAdapter
   - 现有功能不受影响

### Phase 1: 接入第二个 agent

1. 实现 `ClaudeCodeAdapter`
2. 添加 agent 选择器 UI
3. 验证切换流程

### 后续: 逐步接入其他 agent

## 8. 设计原则

1. **接口只增不减** — AgentService 核心接口稳定后不改，新能力通过新的 Capability 接口
2. **Adapter 完全隔离** — 每个 agent 的 SDK 类型只在 adapter 内部使用，不泄漏到上层
3. **强类型** — 所有接口都有完整的 TypeScript 类型定义
4. **优雅降级** — 视图层根据 `capabilities` 动态展示，不支持的特性不显示
5. **渐进式** — 先实现核心 + OpenCode adapter，逐步加新 agent
6. **SDK 升级友好** — 每个 adapter 独立依赖自己的 SDK，升级只改 adapter

## 9. Council Review 预防性修正

基于对 Copilot agent spec 的交叉 review，预先记录以下已识别的设计陷阱：

| 陷阱 | 修正 |
|------|------|
| 在 SurfaceAgentSource 加新层 | ❌ Source 描述来源（runtime/config/file），不是后端；改为 `SurfaceAgent.backend` 独立字段 |
| 直接建 `core/copilot/` 或 `core/claude-code/` 模块 | ✅ 先建 AgentBackend/AgentService 共享接口，再建各 agent 实现 |
| 假设 SDK 一定可用 | ⚠️ 每个 agent 的 Phase 0 必须先验证 SDK 在 Obsidian Electron 环境中可用；不过则停 |
| 将所有功能塞进 Phase 1 | ❌ Ghost Text、Inline Edit、MCP 透传等高级功能按优先级推迟到后续 Phase |
| BYOK 混入 agent 认证 | ❌ BYOK 绕过特定 agent，应作为独立的 provider 管理层 |
| 捆绑 CLI 二进制 | ❌ Copilot CLI +55MB、Claude CLI 也有平台特定 binary；要求用户单独安装或按需下载 |
| 双后端错误混淆 | ✅ 统一 `AgentError` 必须带 `backend` 标签，标注错误来源 |

## 10. Send Pipeline 解耦路径

### 当前耦合点

```typescript
// 当前：直接调用 OpenCode 专用服务
sendStreamMessage: (content, options) =>
  this.plugin.openCodeService.sendMessage(content, options)
```

### 目标架构

在 Send Pipeline 中注入路由层，根据当前选中 Agent 的 `backend` 字段路由到对应实现：

```
用户输入 → OpenCodianView → SendPipelineRuntime
  → AgentServiceRegistry.getActive()
    → 'opencode'  → OpenCodeAdapter.sendMessage()
    → 'copilot'   → CopilotAdapter.sendMessage()
    → 'claude'    → ClaudeCodeAdapter.sendMessage()
    → 'codex'     → CodexAdapter.sendMessage()
    → 'pi'        → PiAdapter.sendMessage()
```

### 10.1 迁移子阶段（CI-3 + CI-4 修正）

**实际规模**：128 次调用 / 53 个方法 / 26 个文件。不能一次替换，必须分 3 批：

#### Phase 0d-1：服务器生命周期（62 次调用，~7 个文件）

最安全的一批 — `checkHealth()`、`start()`、`stop()`、`getServerStatus()` 等。
这些方法在 `AgentService` 接口上有直接对应。

**策略**：在 `main.ts` 中将 `openCodeService.start/stop` 替换为 `registry.getActive().start/stop`。

#### Phase 0d-2：会话管理（32 次调用，OpenCodianView.ts + 4 services 文件）

**当前实施策略**：使用 direct registry routing + capability narrowing，不使用 Proxy 委托。

```typescript
const adapter = registry.get(conversation.backend ?? 'opencode');
if (!adapter?.hasCapability(AgentCapability.Sessions)) {
  throw new AgentBackendUnavailableError(conversation.backend);
}
```

选择 direct routing 的原因：

- Proxy 会让 Claude 会话在缺方法时静默 fallback 到 `OpenCodeService`，这是多 backend 场景中最危险的失败模式。
- Direct routing 能在 create/delete/title/cancel/send/finalization 路径上明确区分 backend-owned session。
- Owner Guard 风险通过分阶段小切片和 focused tests 控制，而不是通过隐式代理隐藏。
- OpenCode-only 方法保留显式 `conversation.backend === 'opencode'` 或 capability gate。

#### Phase 0d-3：MCP / Config / Model / 事件订阅（34 次调用，~15 个 settings 文件）

Settings 层是第二大消费者（18 个 section 文件）。
`checkHealth/start/stop` 在 settings 中大量使用。

**策略**：Settings 的 server section 已有 `getActiveBackend()` 的概念，只需改路由入口。

## 11. Agent Catalog 融合

当多 agent 接入后，Agent Catalog 需要聚合所有后端的 agent 列表：

```typescript
// AgentCatalogService.aggregate() 扩展
async aggregate(): Promise<readonly SurfaceAgent[]> {
  const agents: SurfaceAgent[] = [];

  // 现有 OpenCode agents
  agents.push(...await this.aggregateOpenCodeAgents());

  // 其他后端的 agents（按注册顺序）
  for (const backend of this.registry.listAll()) {
    if (backend.kind !== 'opencode' && backend.status === 'connected') {
      agents.push(...await this.aggregateBackendAgents(backend));
    }
  }

  return agents;
}
```

每个 agent 的 `SurfaceAgent` 扩展 `backend` 字段（区别于 `source`）：
- `source` 描述来源层（runtime/config/file）
- `backend` 描述后端实现（opencode/copilot/claude-code/codex/pi）

## 12. 错误归一化

所有后端的错误必须统一标注来源：

```typescript
interface AgentError extends Error {
  readonly backend: AgentBackendKind;
  readonly code: string;
  readonly recoverable: boolean;
  readonly details?: Record<string, unknown>;
}
```

原则：
- 两个后端的错误各自清晰标注来源，不混淆
- 错误信息要包含 `backend` 标签，方便调试
- 不可恢复的错误要明确区分

## 13. Phase 0 技术验证门控

每个新 agent 的 Phase 0 必须通过技术验证门控，才允许进入 Phase 1：

### 验证项模板

| 验证项 | 方法 | 判定标准 |
|--------|------|---------|
| SDK 是否可用 | `npm install` + 最小 TS 调用 | 能创建 client、创建 session、发送消息、收到流式响应 |
| SDK 在 Electron 环境是否正常 | 在测试插件中引入 | CLI 进程能启动、通信正常、无 native module 冲突 |
| 流式事件可归一化 | 解析事件类型 | 所有核心事件能映射到 `StreamChunk` |
| CLI binary 体积可接受 | 测量 bundle size | 不超过插件体积 +20%（否则要求用户单独安装） |

**门控规则**：如果所有路径都不可行，暂停该 agent 的后续 Phase 并重新评估。

## 14. 认证架构通用模型

### 统一认证接口

```typescript
interface AgentAuthCapability {
  readonly isAuthenticated: boolean;
  readonly authMode: AgentAuthMode;
  authenticate(): Promise<void>;
  logout(): Promise<void>;
  onAuthStateChange(handler: (authenticated: boolean) => void): Disposable;
}

type AgentAuthMode =
  | 'local'           // 无需认证（如本地进程模式）
  | 'api-key'         // API Key 认证
  | 'subscription'    // 订阅认证（如 GitHub OAuth）
  | 'byok';           // Bring Your Own Key
```

### 各 agent 认证方式

| Agent | 认证方式 | 安全存储 |
|-------|---------|---------|
| OpenCode | local / api-key | 本地配置文件 |
| Claude Code | api-key | 设置加密存储 |
| Codex | api-key (OpenAI) | 设置加密存储 |
| Copilot | subscription (GitHub OAuth) / byok | 系统 Keychain + 设置加密 |
| Pi | api-key (multi-provider) | 设置加密存储 |

### BYOK 独立管理

BYOK（Bring Your Own Key）不应混入单个 agent 的认证中。它是一个独立的 provider 管理层：
- 用户配置 Provider URL + API Key
- 多个 agent 可以共享同一个 BYOK provider
- 在设置中有独立的 BYOK 管理界面

## 15. CLI Binary 策略

| Agent | 需要 CLI | 体积 | 策略 |
|-------|---------|------|------|
| OpenCode | 是（已有管理） | 已集成 | 现有 ServerManager 管理 |
| Claude Code | 是（bundled with SDK） | ~50MB+ | 不捆绑；SDK 自带 optional dep；用户 `npm install` 后自动获取 |
| Codex | 是（需单独安装） | ~30MB+ | 不捆绑；要求用户 `npm install -g @openai/codex` |
| Copilot | 是（bundled with SDK） | ~55MB+ | 不捆绑；SDK 自带 optional dep |
| Pi | 否（in-process） | 仅 SDK JS | 直接安装 |

**原则**：不捆绑大体积 CLI binary 到插件中。Obsidian 社区审核和插件体积都要求按需获取。

## 16. 开发调试与可观测性

多 agent 环境下，调试难度成倍增加。必须在架构层面内建可观测性，避免屎山代码中找不到问题。

### 16.1 Agent-Aware 日志系统

所有 adapter 操作必须带 `backend` 标签输出日志，复用现有 `src/shared/logger.ts`：

```typescript
// 使用方式
import { logger } from '../../shared/logger';

// 每个 adapter 内部
this.log = logger.withPrefix(`[agent:${this.kind}]`);
this.log.debug('sendMessage', { sessionId, contentLength: message.content.length });
this.log.info('stream completed', { sessionId, eventCount, duration });
this.log.error('stream failed', { sessionId, error });
```

**日志格式要求**：
- 每条日志必须包含 `backend` (AgentBackendKind)
- 流式事件日志包含 `sessionId`、事件类型、耗时
- 错误日志包含 `AgentError` 完整信息（backend + code + recoverable + details）
- 认证日志记录状态变化但不记录 token/key 值

### 16.2 事件流追踪 (Event Trace)

当 bug 发生在消息流中时，开发者需要能看到事件从 SDK 到 UI 的完整流转：

```
[Claude CLI] → JSONL event
  → [ClaudeCodeAdapter] → normalizeStreamEvent() → StreamChunk
    → [AgentServiceRegistry] → 路由到 UI
      → [OpenCodianView] → rendering pipeline → DOM
```

**调试手段**：

1. **环境变量开关** — `OPENCODIAN_DEBUG_AGENT=claude-code` 只输出特定 agent 的调试日志
2. **事件采样** — 流式事件量大时，可配置采样率（如每 10 个事件记录 1 个）
3. **生命周期审计** — 每次 start/stop/session-create/stream-start/stream-end 都记录时间戳

```typescript
// 调试模式下可以追踪事件流
if (process.env.OPENCODIAN_DEBUG_AGENT === this.kind) {
  this.log.debug('event trace', {
    raw: event,           // SDK 原始事件
    normalized: agentEvent, // 归一化后的事件
    sessionId,
    timestamp: Date.now()
  });
}
```

### 16.3 Adapter 健康诊断

每个 adapter 必须实现诊断接口，方便在 DevTools 控制台快速排查：

```typescript
interface AgentDiagnostic {
  /** adapter 基本信息 */
  readonly kind: AgentBackendKind;
  readonly capabilities: ReadonlySet<AgentCapability>;

  /** 运行时状态快照 */
  getDiagnosticSnapshot(): AgentDiagnosticSnapshot;
}

interface AgentDiagnosticSnapshot {
  kind: AgentBackendKind;
  status: AgentConnectionStatus;
  connectedSince?: number;
  activeSessions: number;
  activeStreams: number;
  lastError?: { message: string; code: string; timestamp: number };
  sdkVersion?: string;
  processInfo?: { pid?: number; cliPath?: string };
  authStatus?: { authenticated: boolean; mode: string; expiresAt?: number };
}
```

**使用方式**（在 Obsidian DevTools 控制台）：
```javascript
// 查看所有 agent 状态
window.opencodian?.agents?.diagnostics()

// 查看特定 agent
window.opencodian?.agents?.get('copilot')?.getDiagnosticSnapshot()

// 查看当前活跃 agent
window.opencodian?.agents?.getActive()?.getDiagnosticSnapshot()
```

### 16.4 流式事件断点

在调试模式下，可以在 adapter 的 StreamChunk 归一化层设置断点：

```typescript
// 开发模式下可用的事件拦截器
interface AgentDebugHooks {
  /** SDK 原始事件到达时 */
  onRawEvent?(kind: AgentBackendKind, event: unknown): void;

  /** 归一化后 */
  onNormalizedEvent?(kind: AgentBackendKind, event: StreamChunk): void;

  /** 发送到 UI 前 */
  onBeforeUiDispatch?(kind: AgentBackendKind, sessionId: string, event: StreamChunk): void;

  /** 错误发生时 */
  onError?(kind: AgentBackendKind, error: AgentError): void;
}
```

开发时可以注入自定义 hooks 做断言或日志。

### 16.5 防止屎山的硬约束

| 规则 | 检查方式 | 说明 |
|------|---------|------|
| adapter 内部不直接操作 DOM | lint rule / code review | 所有 UI 操作通过 StreamChunk 回上层 |
| adapter 不引用其他 adapter | import 限制 | 每个 adapter 完全独立，通过 registry 交互 |
| 错误不吞没 | 强制 AgentError 类型 | catch 块必须构造 AgentError 并传播 |
| 状态不交叉 | typecheck + review | 不同 adapter 的状态绝不共享引用 |
| 日志不敏感信息 | lint rule / regex check | 不记录 API key、token、password |

### 16.6 测试策略

**每个 adapter 至少三类测试**：

1. **单元测试** — 纯逻辑测试（事件归一化、状态映射、认证流程），mock SDK
2. **契约测试** — 验证 adapter 实现了 AgentService 的全部方法，参数/返回值类型正确
3. **集成冒烟测试** — 真实 SDK 调用（CI 中标记为 `@integration`，需要 API key）

```typescript
// 契约测试模板 — 每个 adapter 必须通过
describe('OpenCodeAdapter contract', () => {
  it('implements AgentService', () => {
    const adapter = new OpenCodeAdapter(mockContext);
    expect(adapter.kind).toBe('opencode');
    expect(typeof adapter.start).toBe('function');
    expect(typeof adapter.sendMessage).toBe('function');
    // ... 全部核心方法
  });

  it('declares capabilities correctly', () => {
    const adapter = new OpenCodeAdapter(mockContext);
    expect(adapter.capabilities.has('tools')).toBe(true);
    expect(adapter.capabilities.has('todos')).toBe(true);
  });
});
```

## 17. 现有架构衔接策略

OpenCodian 已有成熟的分层架构和守卫机制。多 agent 层必须融入现有体系，不能另起炉灶。

### 17.1 当前架构分层

```
src/
├── main.ts                      # 插件入口
├── core/                        # 后端服务层
│   ├── opencode/ (33 files)     #   OpenCode SDK（最大模块）
│   ├── agents/ (7 files)        #   Agent catalog/invocation（已有！）
│   ├── config/ (15 files)       #   配置管理
│   ├── acp/ (3 files)           #   ACP 通信协议
│   ├── storage/ (5 files)       #   持久化
│   ├── runtime/ (3 files)       #   运行时协调
│   └── types/ (8 files)         #   核心类型
├── features/
│   ├── chat/ (~200 files)       #   聊天功能（services 129 + runtime 44）
│   └── settings/ (66 files)     #   设置功能
├── shared/                      # 跨切面工具
├── utils/                       # 视觉/图标/markdown/流式
└── i18n/                        # 国际化
```

### 17.2 已有 `src/core/agents/` — 不要重复创建

**关键发现**：项目已有 `src/core/agents/` 目录（7 个文件），包含：
- `AgentCatalogService` — agent 目录聚合
- `AgentInvocationService` — agent 调用
- 等等

**新目录规划调整**：

```
src/core/agents/                 # 已有！扩展而非新建
├── (现有 7 个文件)               # AgentCatalogService, AgentInvocationService...
├── backend/                     # 新增：AgentService 接口层
│   ├── types.ts                 # AgentBackendKind, AgentCapability, 核心类型
│   ├── AgentService.ts          # AgentService 接口
│   ├── AgentServiceRegistry.ts  # Registry 实现
│   └── capabilities/            # Capability 接口
│       ├── index.ts
│       └── *.ts
└── adapters/                    # 新增：各 agent 实现
    ├── OpenCodeAdapter.ts       # 包装现有 OpenCodeService
    ├── ClaudeCodeAdapter.ts
    ├── CodexAdapter.ts
    ├── CopilotAdapter.ts
    └── PiAdapter.ts
```

**不用** `src/core/agent/`（单数），直接扩展已有的 `src/core/agents/`（复数）。

### 17.3 Owner Guard 兼容

现有 owner guard 守护这些高连接文件，禁止添加新的运行时所有权：

| 守护文件 | 边数 | 多 agent 层的影响 |
|---------|------|-----------------|
| `OpenCodianView.ts` | 181 | 不直接改。通过 AgentServiceRegistry 间接访问 |
| `OpenCodeService.ts` | 127 | 不直接改。OpenCodeAdapter 包装它 |
| `main.ts` | 64 | 只增加 adapter 注册代码，不增加运行时所有权 |
| `ServerManager.ts` | — | 不改。OpenCode adapter 委托给它管理进程 |

**原则**：多 agent 层不改守卫文件内部逻辑，只做委托/包装。

### 17.4 Module-Doc Guard 兼容

每个新增的 `src/core/agents/backend/` 和 `src/core/agents/adapters/` 文件都必须：
1. 在 `module-docs.config.json` 中注册映射
2. 在 `docs/modules/` 下有对应的文档页
3. 每次 src/ 变更后运行 `npm run check:module-docs`

新增文件模板：
```
src/core/agents/backend/AgentService.ts    → docs/modules/core/agents/backend/agent-service.md
src/core/agents/adapters/OpenCodeAdapter.ts → docs/modules/core/agents/adapters/open-code-adapter.md
```

### 17.5 Graphify 兼容

`src/` 每次变更后必须：
1. `npm run graphify:update:src` 刷新图
2. `npm run check:graphify` 确认不 stale
3. `npm run verify` 作为最终门控

多 agent 层的变更会在图中产生新的节点和边。需要关注：
- 新增的 adapter 节点是否会成为新的高连接 god node？
- 如果 adapter 的边数超过 30，说明它做了太多事，需要拆分

### 17.6 与现有 `src/core/opencode/` 的关系

`src/core/opencode/` 有 33 个文件，是当前最大的模块。多 agent 层不取代它：

```
                    OpenCodeAdapter
                         │
                         │ 委托（不修改内部）
                         ▼
src/core/opencode/ (33 files, 不变)
├── OpenCodeService.ts        ← adapter 持有引用
├── OpenCodeSdkFacade.ts      ← adapter 间接使用
├── ServerManager.ts          ← adapter 不直接访问
├── OpenCodeSessionStateStore ← adapter 通过 Service 访问
└── ... 其他 29 个文件不变
```

**规则**：
- `src/core/opencode/` 内部代码不改
- `OpenCodeAdapter` 只引用 `OpenCodeService` 的公开 API
- 如果发现需要访问 `OpenCodeService` 内部方法，应该在 `OpenCodeService` 上增加公开方法，而不是绕过它

### 17.7 i18n 兼容

所有 agent 相关的 UI 文本必须进入现有 locale 体系：
- `src/i18n/locales/en.ts` — 英文
- `src/i18n/locales/zh.ts` — 中文

新增的翻译键前缀：`agents.` — 例如 `agents.copilot.displayName`、`agents.selectBackend`。

### 17.8 设置兼容

Agent 设置扩展在现有 `OpenCodianSettings` 中：
- 不创建新的设置文件
- 新增 `agentBackends` 字段在 `src/core/types/settings.ts`
- 默认值和 normalize 在现有 settings 流程中处理
- 设置 UI 在 `src/features/settings/` 下新增 agent 配置区域

## 18. 现有资产深度盘点

前面 §17 提到了大致方向，这里逐项列出必须衔接的现有代码资产、已存在的预留设计、以及与 spec 的冲突点。

### 18.1 `SurfaceAgent` 已存在 — 必须扩展，不能重定义

**文件**: `src/core/agents/types.ts:71-135`

当前 `SurfaceAgent` 有 15 个字段，代表 OpenCode 的三层 catalog 合并结果（runtime + config + file）。它**没有**以下多 agent 必需的字段：

```typescript
// 现有字段 — 不能删除或改名
interface SurfaceAgent {
  id: string;
  displayName: string;
  description: string;
  mode: 'primary' | 'subagent' | 'all' | null;
  sources: readonly SurfaceAgentSource[];  // 'runtime' | 'config' | 'file'
  originPath?: string;
  hidden: boolean;
  disabled: boolean;
  system: boolean;
  runtimeAvailable: boolean;
  hasProjectOverride: boolean;
  defaultEligible: boolean;
  subagentVisible: boolean;
  builtin: boolean | undefined;
  rawConfig?: OpencodeAgentConfig;
}
```

**需要新增的字段**（不是新类型，是扩展现有类型）：

```typescript
interface SurfaceAgent {
  // ... 现有 15 个字段不变 ...

  /** 后端标识 — 区分 agent 来自哪个后端 */
  backend: AgentBackendKind;  // 'opencode' | 'claude-code' | 'codex' | 'copilot' | 'pi'
  /** 该 agent 支持的能力（从 adapter 获取） */
  capabilities?: ReadonlySet<AgentCapability>;
}
```

**CI-6 修正 — `mode` 字段语义**：

`mode: 'primary' | 'subagent' | 'all' | null` 是 OpenCode 特有概念。
- OpenCode 后端的 agent：`mode` 保持原语义
- 非 OpenCode 后端的 agent：`mode` 为 `null`，不影响功能
- 不需要新值，`null` 已能表达"此概念不适用"

**关键约束**：
- `sources` 字段保持不变（描述来源层：runtime/config/file）
- `backend` 是新增的独立维度（描述后端实现）
- OpenCode 来源的 agent 其 `backend` 为 `'opencode'`（向后兼容）
- 其他后端的 agent 其 `backend` 为对应值

### 18.2 `AgentCatalogService` 已存在 — 必须扩展聚合逻辑

**文件**: `src/core/agents/AgentCatalogService.ts` (216 行)

现有聚合逻辑：
1. Runtime 层 → 从 `app.agents()` 获取
2. Config 层 → 从 `.opencode/opencode.json` 读取
3. File 层 → 从 vault Markdown 文件扫描
4. 三层合并 → `SurfaceAgent[]`

**需要的变更**：

```typescript
// 扩展 aggregate() 方法
async aggregate(input: AgentCatalogInput): Promise<SurfaceAgent[]> {
  const agents: SurfaceAgent[] = [];

  // 现有逻辑不变
  const opencodeAgents = this.buildFromLayers(input);
  agents.push(...opencodeAgents.map(a => ({ ...a, backend: 'opencode' as const })));

  // 新增：聚合其他后端的 agents
  for (const adapter of this.registry.listAdapters()) {
    if (adapter.kind !== 'opencode' && adapter.status === 'connected') {
      const backendAgents = await this.aggregateFromBackend(adapter);
      agents.push(...backendAgents);
    }
  }

  return agents;
}
```

### 18.3 `AgentInvocationService` 已存在 — 需要路由扩展

**文件**: `src/core/agents/AgentInvocationService.ts` (129 行)

当前只解析 intent，不做 agent 路由。`resolveInvocationIntent()` 返回 `ResolvedAgentInvocation`。

**需要的变更**：
- 当 `intent` 的 target agent 是非 OpenCode 后端时，`invocationParts` 需要携带 `backend` 信息
- 不改现有解析逻辑，只扩展返回类型

### 18.4 `src/core/acp/` 已存在 — 胚胎期 agent 通信协议

**文件**: `src/core/acp/` (3 个文件)

| 文件 | 行数 | 作用 |
|------|------|------|
| `types.ts` | 47 | `AcpAgentConfig`, `AcpNotification` 类型 |
| `AcpClientManager.ts` | 125 | 管理 agent 子进程生命周期 |
| `AcpTransportOwner.ts` | 154 | ACP notification → `StreamChunk` 翻译 |

**关键发现**：
- ACP 的 `AcpNotification` 类型和 `StreamChunk` 翻译逻辑可以**复用**
- `AcpTransportOwner.translateAcpMessageChunk()` 已经在做事件归一化
- 但 ACP 模块**未连接到生产代码** — 没有消费者

**衔接策略**：
- **不删除** ACP 模块
- **复用**其概念设计（spawn 子进程 → 翻译事件 → StreamChunk）
- Copilot adapter 的 transport 层可以参考 ACP 的模式
- 如果 ACP 概念和 multi-agent adapter 概念重叠，后续可合并

### 18.5 `StreamChunk` 已是传输无关的 — 最大利好

**文件**: `src/core/types/chat.ts`

`StreamChunk` 是一个联合类型：
```typescript
type StreamChunk =
  | { type: 'text'; ... }
  | { type: 'thinking'; ... }
  | { type: 'tool_use'; ... }
  | { type: 'tool_result'; ... }
  | { type: 'usage'; ... }
  | { type: 'error'; ... }
  // 等等
```

**关键**：OpenCode 的 `OpenCodeStreamEventTransformer` 和 ACP 的 `AcpTransportOwner` 都翻译到 `StreamChunk`。这意味着：

> **新 adapter 不需要定义新的 `AgentStreamEvent` 类型，只需翻译到已有的 `StreamChunk`。**

这简化了 spec §2.3 中定义的 `AgentStreamEvent` — 它应该复用 `StreamChunk`，而不是创建一个新的并行类型。

### 18.6 `Conversation` 类型已有未使用的多 agent 预留

**文件**: `src/core/types/chat.ts`

```typescript
interface Conversation {
  // ... 现有字段 ...
  openCodeSessionId?: string;   // 当前使用
  acpSessionId?: string;        // ⚠️ 已定义但未使用
  acpAgentId?: string;          // ⚠️ 已定义但未使用
  transport?: string;           // ⚠️ 已定义但未使用
}
```

**衔接策略**：
- `acpSessionId` 和 `acpAgentId` 是为 ACP 预留的，但 ACP 从未启用
- **方案 A（推荐）**：将 `acpSessionId` 泛化为 `backendSessionId?: string`，`acpAgentId` 泛化为 `backendAgentId?: string`
- **方案 B**：保留旧字段，新增 `backend: AgentBackendKind`，adapter 按类型选择使用哪个字段
- `openCodeSessionId` 当前是 `string`（必填）。**CI-8 修正**：改为 `openCodeSessionId?: string`（可选），非 OpenCode 会话设为 `undefined`
- `transport` 当前是 `'opencode' | 'acp'`。**CI-9 修正**：扩展为 `'opencode' | 'acp' | 'claude-code' | 'codex' | 'copilot' | 'pi'`，或直接用 `backend: AgentBackendKind` 替换

### 18.7 `ContentBlock.subagentId` 已存在

**文件**: `src/core/types/chat.ts`

```typescript
interface ContentBlock {
  // ...
  subagentId?: string;    // 已存在
  subagentMode?: 'sync' | 'async';  // 已存在
  toolKind?: string;      // 已包含 'task', 'skill', 'plan' 等
}
```

**衔接策略**：
- 多 agent 的内容归属可以直接用 `subagentId` 或类似字段
- `toolKind` 可以新增 `'agent'` 来标识跨 agent 工具调用

### 18.8 `toolIdentity.ts` 已有 agent 来源意识

**文件**: `src/shared/toolIdentity.ts`

```typescript
// source 参数已支持多种 agent 来源
getToolIdentity(name: string, options?: { source?: 'generic' | 'opencode' | 'claudian' | 'codex' })
```

**衔接策略**：
- `source` 已经有 `'claudian'` 和 `'codex'`（虽然可能未启用）
- 新增 `'copilot'` 和 `'pi'` 到 source 联合类型
- 不需要新的工具身份体系

### 18.9 `OpenCodeStreamEvent.properties.agent` 已存在

**文件**: `src/core/opencode/OpenCodeStreamEventTransformer.ts`

OpenCode 后端协议**已经**在流式事件中携带 `agent` 字段：
```typescript
interface OpenCodeStreamEvent {
  properties?: {
    agent?: string;  // ⚠️ 已存在
    model?: { id: string; providerID: string; variant: string };
    // ...
  };
}
```

`session.next.*` 事件系列也已经在跟踪 agent 切换：
- `session.next.agent.switched`
- `session.next.step.started/ended`
- `session.next.text.started/ended`

**当前状态**：这些事件被 `handleSessionNextObserved()` 处理，但**只做日志，不路由**。

**衔接策略**：
- OpenCode adapter 的流式归一化**不需要新建事件类型**
- 直接扩展 `handleSessionNextObserved()` 来处理 agent 切换
- 其他 adapter 参考同样模式翻译到 StreamChunk

### 18.10 `openCodeService` 引用规模 — 迁移影响面

**完整统计**：

| 指标 | 数量 |
|------|------|
| 直接调用 `openCodeService.xxx` 的文件 | **26 个** |
| 总方法调用次数 | **128 次** |
| 不同方法名 | **53 个** |
| 引用 `OpenCodeService` 类型的文件 | **14 个** |
| import `core/opencode` 的文件 | **26 个** |
| 间接依赖其类型的文件 | **~25 个** |

**按类别拆分**：

| 类别 | 调用次数 | 占比 |
|------|---------|------|
| 服务器状态/生命周期 (checkHealth, start, stop, getServerStatus...) | 62 | 48.4% |
| 会话管理 (createSession, deleteSession, forkSession...) | 32 | 25.0% |
| MCP 操作 | 12 | 9.4% |
| 消息/Diff 数据查询 | 12 | 9.4% |
| Config/Model 查询 | 7 | 5.5% |
| SDK 直通 | 5 | 3.9% |
| 事件订阅 | 3 | 2.3% |

**Top 5 消费者**：

| 文件 | 引用数 |
|------|--------|
| `OpenCodianView.ts` | 47 |
| `main.ts` | 25 |
| `SettingsMcpSection.ts` | 13 |
| `SlashCommandExecutionService.ts` | 11 |
| `SettingsServerSection.ts` | 9 |

**注意**：设置层（18 个 section 文件）是第二大消费者，大量调用 `checkHealth/start/stop`。这些在多 agent 环境下需要根据当前活跃 backend 路由。

### 18.11 Spec 冲突修正清单

基于以上盘点，§2 中定义的类型需要修正：

| Spec 原定义 | 实际现状 | 修正方案 |
|------------|---------|---------|
| 新建 `AgentKind` 类型 | `SurfaceAgent` 已存在 | 扩展 `SurfaceAgent` 加 `backend` 字段 |
| 新建 `AgentStreamEvent` 类型 | `StreamChunk` 已是传输无关 | **复用 `StreamChunk`**，不建新类型 |
| 新建 `AgentMessage` 类型 | `ChatMessage` 已存在 | 复用，扩展 `role` 加 `'agent'` |
| 新建 `AgentSession` 类型 | `Conversation` 已存在且有预留字段 | 扩展 `Conversation`，复用 `acpSessionId` 等 |
| 新建 `src/core/agent/` 目录 | `src/core/agents/` 已存在 | 扩展已有目录 |
| 新建 `AgentServiceRegistry` | `AgentCatalogService` 已存在 | 扩展已有 service |
| 新建 agent 认证接口 | 无对应 | 保留新建，但复用现有安全存储 |
| 新建 `AgentToolCapability` | `toolIdentity` 已有 source 感知 | 扩展，新增 source 值 |
| 忽略 ACP 模块 | `src/core/acp/` 已存在 | 复用概念，考虑合并 |
| 忽略 `OpenCodeStreamEventTransformer` 的 `agent` 字段 | 已存在 | 直接利用 |
| 忽略 `ToolCallRenderer` 的 subagent 渲染 | 已存在 | 复用 |

### 18.12 Module-Doc — 已存在

**CI-5 修正**：经文件系统验证，`docs/modules/core/agents/` 下**已有 7 个文档文件**：

```
docs/modules/core/agents/
├── index.md
├── types.md
├── AgentCatalogService.md
├── AgentInvocationService.md
├── ChildSessionGraphService.md
├── MarkdownAgentWorkspaceService.md
└── SystemAgentGuardService.md
```

**处理方式**：Phase 0a 新增 `backend/` 和 `adapters/` 文件时，在 `module-docs.config.json` 注册映射并在 `docs/modules/core/agents/` 下添加对应文档页。

## 19. 修正后的架构方向（已回移到 §2-§8）

基于 §18 的盘点和 Council 审查，以下修正**已直接应用到 §2-§8**：

| 修正项 | 状态 | 应用位置 |
|--------|------|---------|
| ❌ `AgentStreamEvent` → ✅ 复用 `StreamChunk` | ✅ 已修复 | §2.2, §2.3 |
| ❌ `src/core/agent/` → ✅ `src/core/agents/` | ✅ 已修复 | §6 |
| ❌ `AgentKind` → ✅ `AgentBackendKind` | ✅ 已修复 | §2.1 |
| ❌ `AgentSession` → ✅ `SessionInfo` 轻量摘要 | ✅ 已修复 | §2.2, §2.3 |
| ❌ `AgentMessage` → ✅ 复用 `ChatMessage` | ✅ 已修复 | §2.3 注释 |
| ❌ `plugin` 泄露 → ✅ 窄类型 `AgentAdapterContext` | ✅ 已修复 | §5 |
| ❌ 迁移 39 处 → ✅ 128 次/53 方法/3 子阶段 | ✅ 已修复 | §10.1 |
| ❌ Owner Guard 侵犯 → ✅ Direct registry routing + capability narrowing | ✅ 已修复 | §10.1 |
| ❌ module-doc 缺失 → ✅ 已存在 7 个文件 | ✅ 已修复 | §18.12 |
| ❌ `SurfaceAgent.mode` 歧义 → ✅ 非 OpenCode 用 null | ✅ 已修复 | §18.1 |
| ❌ `openCodeSessionId` 必填 → ✅ 改为可选 | ✅ 已修复 | §18.6 |
| ❌ `transport` 狭义联合 → ✅ 扩展方案 | ✅ 已修复 | §18.6 |
| ❌ `callbackToAsyncGenerator` 重复实现 → ✅ 共享工具 | ✅ 已修复 | §6 目录 |
| ❌ `hasCapability` 类型谓词脆弱 → ✅ 改为 boolean | ✅ 已修复 | §2.2 |

## 20. 未来功能路径（不承诺时间线）

以下功能作为未来参考，不在当前 multi-agent-foundation scope 内：

| 功能 | 依赖 | 备注 |
|------|------|------|
| Ghost Text 内联补全 | 需要 LSP 连接 | 非 SDK 路径，需独立研究 |
| 内联编辑 + Diff | CM6 装饰扩展 | Phase 4+ |
| MCP Server 透传 | MCP capability | Phase 6+ |
| Agent Skills 支持 | 各 agent 的 skills 系统 | Phase 6+ |
| 多模态 / 图片输入 | agent 支持图片 | Phase 6+ |
| 编排层（multi-agent-board） | 本 spec 全部完成 | 参见 `multi-agent-board.md` |
| A2A 外部互操作 | 编排层 | 参见 `multi-agent-board.md` Phase 4 |
