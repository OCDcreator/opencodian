# Copilot Base Agent Integration Design

**Date:** 2026-05-18

**Status:** [REVIEW]

## Goal

在 OpenCodian 内新增 GitHub Copilot 作为第二个基座 Agent 后端（与现有 OpenCode 后端并列），让用户能在 Agent 选择器中切换使用 OpenCode 或 Copilot 提供的 AI 能力。

本设计只覆盖 **后端抽象层 + Copilot Chat 集成**（Phase 0–2）。内联补全、MCP、Skills 等高级功能作为后续 Phase，不在本次 spec 范围内。

## Council Review Summary

本设计经过 6 位 Council 议员审阅，识别出以下关键修正：

| 原提案问题 | 修正 |
|---|---|
| 在 `SurfaceAgentSource` 加 `'copilot'` 第四层 | ❌ Source 描述来源不是后端；改为 `SurfaceAgent.backend` 字段 |
| 直接建 `core/copilot/` 模块 | ✅ 先建 `AgentBackend` 共享接口，再建 Copilot 实现 |
| 使用 `@github/copilot-sdk` 作为集成方式 | ⚠️ SDK 存在性待验证；Phase 0 必须先确认可行路径 |
| Ghost Text 内联补全放在 P1 | ❌ 需要独立 LSP 连接，非 SDK 路径；推迟到 Phase 5 |
| BYOK 放在 Copilot 认证下 | ❌ BYOK 绕过 Copilot，应独立管理 |
| 捆绑 Copilot CLI 二进制 | ❌ 插件体积 +55MB，要求用户单独安装或按需下载 |

## Chosen Approach

### 三层架构

```
layer-1: AgentBackend 接口层 (shared)
  ├── ChatBackendAdapter      — 发送消息、流式响应
  ├── ModelCatalogAdapter     — 模型列表获取
  ├── SessionAdapter          — 会话生命周期
  └── AuthAdapter             — 认证状态管理

layer-2: OpenCode 后端 (现有代码重构)
  └── OpenCodeBackend implements AgentBackend
      └── 委托给现有 OpenCodeService / OpenCodeSdkFacade

layer-3: Copilot 后端 (新增)
  └── CopilotBackend implements AgentBackend
      └── 通过 SDK 或 ACP 与 Copilot 通信
```

### BackendRouter 路由

在 Send Pipeline 中注入 `BackendRouter`，根据当前选中 Agent 的 `backend` 字段路由到对应实现：

```
用户输入 → OpenCodianView → SendPipelineRuntime
  → BackendRouter.route(activeAgent.backend)
    → 'opencode' → OpenCodeBackend.sendMessage()
    → 'copilot'  → CopilotBackend.sendMessage()
```

## Why This Approach

- **避免代码分叉**：没有 `if (backend === 'copilot')` 散落在各 UI 组件中
- **复用现有 UI**：Chat 面板、Model 选择器、流式渲染器全部复用
- **渐进式重构**：先建接口 + 重构 OpenCode 实现（零行为变化），再添加 Copilot
- **集成方式不绑定**：`AgentBackend` 接口不假设底层是 SDK 还是 ACP，Phase 0 验证后再决定

## Scope

### In Scope

- `AgentBackend` 接口定义 + `BackendRouter` 实现
- 现有 `OpenCodeService` 重构为实现 `AgentBackend`（零行为变化）
- `SurfaceAgent` 类型扩展 `backend` 字段
- Copilot 认证管理（OAuth Device Flow + BYOK）
- Copilot Chat 后端实现（发送消息、流式响应、模型列表）
- 设置页 Copilot 配置区域
- Phase 0 技术验证（SDK vs ACP 可行性确认）

### Out of Scope

- 内联自动补全（Ghost Text）— 需独立 LSP 连接，Phase 5
- 内联编辑 + Diff（CM6 装饰）— Phase 4
- MCP Server 透传 — Phase 6
- Copilot Skills 支持 — Phase 6
- 多模态 / 图片输入 — Phase 6
- 移动端支持 — Copilot CLI / SDK 均不支持移动端
- BYOK 自定义 Provider 管理 — 作为独立 Feature 后续处理

## Architecture

### 1. SurfaceAgent 类型扩展

```typescript
// src/core/agents/types.ts — 扩展

export type AgentBackendKind = 'opencode' | 'copilot';

export interface SurfaceAgent {
  readonly id: string;
  readonly displayName: string;
  readonly description: string;
  readonly mode: OpencodeAgentMode | null;
  readonly sources: readonly SurfaceAgentSource[];  // 不变：runtime/config/file
  readonly backend: AgentBackendKind;               // 新增：后端标识
  readonly originPath?: string;
  readonly hidden: boolean;
  readonly disabled: boolean;
  readonly system: boolean;
  readonly runtimeAvailable: boolean;
  readonly hasProjectOverride: boolean;
  readonly defaultEligible: boolean;
  readonly subagentVisible: boolean;
  readonly builtin: boolean | undefined;
  readonly rawConfig?: OpencodeAgentConfig;
}
```

**关键约束**：`SurfaceAgentSource` 保持不变（`runtime`/`config`/`file` 描述来源层），`backend` 是独立维度。一个来自 OpenCode runtime 的 agent 其 `backend` 为 `'opencode'`，一个来自 Copilot catalog 的 agent 其 `backend` 为 `'copilot'`。

### 2. AgentBackend 接口

```typescript
// src/core/agents/backend/types.ts — 新文件

export interface AgentBackend {
  readonly kind: AgentBackendKind;

  // 生命周期
  initialize(): Promise<void>;
  dispose(): Promise<void>;

  // 认证
  readonly auth: AuthAdapter;

  // 模型
  readonly models: ModelCatalogAdapter;

  // 会话
  readonly sessions: SessionAdapter;

  // 消息发送
  readonly chat: ChatBackendAdapter;
}

export interface AuthAdapter {
  readonly isAuthenticated: boolean;
  readonly authMode: 'subscription' | 'byok' | 'local';
  authenticate(): Promise<void>;
  logout(): Promise<void>;
}

export interface ModelCatalogAdapter {
  listModels(): Promise<readonly ModelInfo[]>;
  getDefaultModel(): string;
}

export interface SessionAdapter {
  createSession(options?: SessionCreateOptions): Promise<string>;
  destroySession(sessionId: string): Promise<void>;
  listSessions(): Promise<readonly SessionInfo[]>;
}

export interface ChatBackendAdapter {
  sendMessage(
    sessionId: string,
    content: string,
    options?: ChatSendOptions,
  ): AsyncIterable<StreamEvent>;
}

export interface ModelInfo {
  readonly id: string;
  readonly displayName: string;
  readonly provider: string;
  readonly capabilities: {
    readonly vision: boolean;
    readonly toolCalling: boolean;
    readonly maxContextTokens: number;
  };
}

export interface StreamEvent {
  readonly type: 'text_delta' | 'tool_call' | 'tool_result' | 'error' | 'done';
  readonly content?: string;
  readonly toolCallId?: string;
  readonly toolName?: string;
  readonly error?: Error;
}
```

### 3. BackendRouter

```typescript
// src/core/agents/backend/BackendRouter.ts — 新文件

export class BackendRouter {
  private backends: Map<AgentBackendKind, AgentBackend> = new Map();

  register(backend: AgentBackend): void {
    this.backends.set(backend.kind, backend);
  }

  route(kind: AgentBackendKind): AgentBackend {
    const backend = this.backends.get(kind);
    if (!backend) throw new AgentError(`Backend '${kind}' not registered`);
    return backend;
  }

  getBackendForAgent(agent: SurfaceAgent): AgentBackend {
    return this.route(agent.backend);
  }
}
```

### 4. Send Pipeline 解耦

**当前耦合点**（`OpenCodianView.ts`）：

```typescript
// 当前：直接调用 OpenCode 专用服务
sendStreamMessage: (content, options) =>
  this.plugin.openCodeService.sendMessage(content, options)
```

**改为**：

```typescript
// 重构后：通过 BackendRouter 路由
sendStreamMessage: (content, options) => {
  const activeAgent = this.agentSelectionCoordinator.getActiveAgent();
  const backend = this.plugin.backendRouter.getBackendForAgent(activeAgent);
  return backend.chat.sendMessage(sessionId, content, options);
}
```

### 5. OpenCodeBackend（重构包装）

```typescript
// src/core/agents/backend/OpenCodeBackend.ts — 新文件

export class OpenCodeBackend implements AgentBackend {
  readonly kind = 'opencode' as const;

  constructor(
    private readonly openCodeService: OpenCodeService,
    private readonly sdkFacade: OpenCodeSdkFacade,
  ) {}

  get auth() { return this.openCodeAuthAdapter; }
  get models() { return this.openCodeModelAdapter; }
  get sessions() { return this.openCodeSessionAdapter; }
  get chat() { return this.openCodeChatAdapter; }

  async initialize() { /* 委托给 OpenCodeService 现有启动逻辑 */ }
  async dispose() { /* 委托给 OpenCodeService 现有关闭逻辑 */ }
}
```

**关键原则**：`OpenCodeBackend` 是一个薄适配层，所有实际逻辑仍由现有 `OpenCodeService` 及其子服务处理。零行为变化，纯结构重构。

### 6. Copilot 模块结构

```
src/core/copilot/
├── CopilotBackend.ts             # implements AgentBackend
├── CopilotChatAdapter.ts         # implements ChatBackendAdapter
├── CopilotAuthAdapter.ts         # implements AuthAdapter (OAuth + BYOK)
├── CopilotModelAdapter.ts        # implements ModelCatalogAdapter
├── CopilotSessionAdapter.ts      # implements SessionAdapter
├── CopilotTransport.ts           # 底层通信（SDK / ACP / HTTP，Phase 0 决定）
└── types.ts                      # Copilot 特有类型
```

### 7. 认证架构

Copilot 支持两种认证模式：

| 模式 | 流程 | 存储 |
|---|---|---|
| **GitHub 订阅** | OAuth Device Flow → GitHub token → Copilot API token | 系统 Keychain |
| **BYOK** | 用户配置 Provider URL + API Key | 设置加密存储 |

```typescript
// src/core/copilot/CopilotAuthAdapter.ts

export class CopilotAuthAdapter implements AuthAdapter {
  private mode: 'subscription' | 'byok';
  private tokenStore: SecureTokenStore;  // 复用 OpenCodian 现有安全存储

  get isAuthenticated(): boolean {
    return this.mode === 'byok'
      ? !!this.settings.providerApiKey
      : !!this.tokenStore.get('copilot-github-token');
  }

  get authMode() {
    return this.mode;
  }

  async authenticate(): Promise<void> {
    if (this.mode === 'subscription') {
      await this.deviceFlowAuth();
    } else {
      await this.validateByokCredentials();
    }
  }
}
```

### 8. 数据流

```
用户在 Chat 输入消息
  ↓
OpenCodianView.handleSend()
  ↓
SendPipelineRuntime.process()
  ↓
BackendRouter.getBackendForAgent(activeAgent)
  ↓ [backend === 'copilot']
  ↓
CopilotBackend.chat.sendMessage(sessionId, content, options)
  ↓
CopilotChatAdapter
  ↓
CopilotTransport (SDK / ACP / HTTP — Phase 0 决定)
  ↓
Copilot CLI / API
  ↓
StreamEvent (text_delta / tool_call / error / done)
  ↓
CopilotStreamingNormalizer → 统一 StreamEvent 格式
  ↓
Chat UI 渲染（复用现有流式渲染管线）
```

### 9. Agent Catalog 融合

Copilot 提供的 agent 不作为新的 `SurfaceAgentSource` 层注入。而是：

1. Copilot 后端启动后，获取其可用 agent 列表
2. 每个 agent 映射为 `SurfaceAgent`，`backend: 'copilot'`，`sources: [{ type: 'runtime', backend: 'copilot' }]`
3. 注入 `AgentCatalogService` 的聚合结果中

```typescript
// AgentCatalogService.aggregate() 扩展
async aggregate(): Promise<readonly SurfaceAgent[]> {
  const opencodeAgents = await this.aggregateOpenCodeAgents();
  const copilotAgents = this.copilotBackendEnabled
    ? await this.aggregateCopilotAgents()
    : [];
  return [...opencodeAgents, ...copilotAgents];
}
```

### 10. 设置扩展

```typescript
// src/core/types/settings.ts — 扩展 OpenCodianSettings

export interface CopilotAgentSettings {
  enabled: boolean;

  // 认证配置
  authMode: 'subscription' | 'byok';

  // BYOK 模式配置
  providerType: 'openai' | 'azure' | 'anthropic';
  providerBaseUrl: string;    // e.g., "https://open.bigmodel.cn/api/paas/v4"
  providerApiKey: string;     // 加密存储

  // 默认模型
  defaultModel: string;

  // Copilot CLI 路径（自动检测或手动指定）
  cliPath?: string;
}

// 在 OpenCodianSettings 中添加
export interface OpenCodianSettings {
  // ... 现有字段 ...
  copilotAgent: CopilotAgentSettings;
}
```

## Phasing

### Phase 0 — 技术验证（1–2 周）

**目标**：确认 Copilot 集成的可行技术路径。

**验证项**：

| 验证项 | 方法 | 判定标准 |
|---|---|---|
| `@github/copilot-sdk` 是否可用 | `npm install @github/copilot-sdk` + 最小 TypeScript 调用 | 能创建 Client、创建 Session、发送一条消息并收到流式响应 |
| SDK 能否在 Obsidian Electron 环境中运行 | 在测试插件中引入 SDK | CLI 进程能正常启动、JSON-RPC 通信正常 |
| ACP 替代方案 | `copilot --acp --stdio` 子进程测试 | 能通过 ACP 协议发送消息 |
| BYOK 模式验证 | 配置自定义 OpenAI 兼容端点 | 能用第三方模型（如 GLM）发送消息 |

**产出**：技术验证报告 + 确定的集成路径（SDK / ACP / HTTP）。

**门控**：如果所有路径都不可行，暂停后续 Phase 并重新评估。

### Phase 1 — Backend 抽象层 + OpenCode 重构（2–3 周）

**目标**：引入 `AgentBackend` 接口，重构 OpenCode 为其实现，零行为变化。

**关键文件**：

| 操作 | 文件 |
|---|---|
| 新建 | `src/core/agents/backend/types.ts` |
| 新建 | `src/core/agents/backend/BackendRouter.ts` |
| 新建 | `src/core/agents/backend/OpenCodeBackend.ts`（+ 子适配器） |
| 修改 | `src/core/agents/types.ts`（加 `backend` 字段） |
| 修改 | `src/core/agents/AgentCatalogService.ts`（聚合时标记 backend） |
| 修改 | `src/features/chat/OpenCodianView.ts`（解耦 send 调用） |
| 修改 | `src/features/chat/runtime/SendPipelineRuntime.ts`（通过 BackendRouter） |

**验证**：所有现有测试通过，Chat 行为与重构前完全一致。

### Phase 2 — Copilot Chat 集成（3–4 周）

**目标**：Copilot 作为第二个可用后端出现在 Agent 选择器中。

**关键文件**：

| 操作 | 文件 |
|---|---|
| 新建 | `src/core/copilot/CopilotBackend.ts` |
| 新建 | `src/core/copilot/CopilotChatAdapter.ts` |
| 新建 | `src/core/copilot/CopilotAuthAdapter.ts` |
| 新建 | `src/core/copilot/CopilotModelAdapter.ts` |
| 新建 | `src/core/copilot/CopilotSessionAdapter.ts` |
| 新建 | `src/core/copilot/CopilotTransport.ts` |
| 新建 | `src/core/copilot/types.ts` |
| 修改 | `src/core/types/settings.ts`（加 CopilotAgentSettings） |
| 修改 | `src/features/settings/`（加 Copilot 配置 UI） |

**验证**：

- 用户能在 Agent 选择器中看到 Copilot agent
- 切换到 Copilot 后端后能发送消息并收到流式响应
- 模型选择器显示 Copilot 可用模型
- 能切换回 OpenCode 后端且会话状态保持
- OAuth 登录流程正常（订阅模式）
- BYOK 模式正常（配置自定义端点后能通信）

### Phase 3 — 会话持久化 + 错误归一化（2 周）

- 跨重启的 Copilot 会话恢复
- 统一 `AgentError` 类型（标注 backend 来源）
- 后端切换时的状态清理
- Copilot 设置 UI 完善

### Phase 4 — 内联编辑 + Diff（4–6 周）

- Copilot Agent 的内联编辑能力（选中文本 → AI 修改 → Diff 展示）
- CM6 装饰扩展（参考 Go2Engle 的 `InlineDiffView.ts`）
- Keep / Undo 操作

### Phase 5 — Ghost Text 内联补全（4–8 周）

- 独立研究 Copilot LSP 协议在 Obsidian 中的可行性
- CM6 ViewPlugin + StateField 实现 Ghost Text
- Tab 接受、多建议切换
- 可配置触发延迟和范围

### Phase 6 — MCP + Skills + 多模态（2–4 周）

- 透传 Copilot SDK 的 MCP Server 能力
- Copilot Skills 发现和加载
- 图片/截图输入支持

## Risk Matrix

| 风险 | 概率 | 影响 | 缓解措施 |
|---|---|---|---|
| `@github/copilot-sdk` 不可用或 API 不足 | 高 | 致命 | Phase 0 验证；ACP 作为备选路径 |
| Send Pipeline 重构回归 | 中 | 高 | 重构前确保测试覆盖；渐进式重构 |
| Copilot CLI 二进制分发 | 高 | 中 | 不捆绑；要求用户 `npm install -g @github/copilot` |
| Beta SDK breaking changes | 高 | 中 | 薄适配层 + feature flags 隔离 |
| 双后端错误混淆 | 高 | 中 | 统一 `AgentError` 带 backend 标签 |
| OAuth token 安全存储 | 中 | 中 | 系统 Keychain + 清晰的安全文档 |
| Obsidian 社区审核拒绝 | 中 | 高 | 预审沟通；不捆绑大体积二进制 |

## Product Principles

- **Backend parity**：Copilot 后端与 OpenCode 后端在 UI 层享有同等地位，不在 UI 中暴露实现差异
- **Fail distinctly**：两个后端的错误各自清晰标注来源，不混淆
- **Zero regression**：Phase 1 重构不改变任何现有 OpenCode 行为
- **Validate before build**：Phase 0 必须通过才进入 Phase 1
- **Thin adapter**：Copilot 模块是薄适配层，不做 Copilot 已有能力的重复实现
