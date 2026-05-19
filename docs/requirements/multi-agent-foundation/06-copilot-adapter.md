# GitHub Copilot Adapter 设计

> **状态**: `[DRAFT]`
> **最后更新**: 2026-05-18
> **优先级**: P2

## 概述

Copilot adapter 将 `@github/copilot-sdk` 封装为 AgentService 接口实现。Copilot SDK 使用 JSON-RPC over stdio/TCP 通信，支持 BYOK（无需 GitHub 订阅也可以使用）。

## 1. SDK 信息

- **npm 包**: `@github/copilot-sdk`
- **版本**: v1.0.0-beta.3 (Public Preview)
- **通信模式**: JSON-RPC over stdio (默认) 或 TCP
- **多平台**: TS, Python, Go, .NET, Java, Rust
- **认证**: GitHub OAuth, PAT, env vars, BYOK

## 2. 能力声明

```typescript
const COPILOT_CAPABILITIES = new Set<AgentCapability>([
  'tools',       // File system, Git, web requests
  'mcp',         // Local/stdio + remote HTTP/SSE MCP servers
  'permissions', // onPermissionRequest callback
  'models',      // client.listModels() + BYOK
  'questions',   // Elicitation requests (form-based dialogs)
  'context',     // Automatic context compaction
  'providers',   // BYOK: OpenAI, Azure, Anthropic, Ollama
  'hooks',       // System message transform hooks
]);
```

**不支持**: todos, branching (fork), subagents, config (rich), cost-tracking, export

## 3. 方法映射表

| AgentService 方法 | Copilot SDK 方法 | 备注 |
|---|---|---|
| `start()` | `new CopilotClient()` | SDK 自动管理 CLI 进程 |
| `stop()` | client 清理 | SDK 管理 |
| `createSession()` | `client.createSession()` | 需要认证信息 |
| `listSessions()` | 无直接 API | 可能需要本地管理 |
| `sendMessage()` | `session.send()` + event listeners | 流式通过 on("assistant.message_delta") |
| `cancelStream()` | Session 取消机制 | |
| `onSessionEvent()` | `session.on(event, handler)` | 多种事件类型 |

## 4. 关键设计决策

### 4.1 认证模型

Copilot SDK 支持多种认证方式：
1. **GitHub signed-in user** — 使用已存储的 OAuth token
2. **GitHub App OAuth** — 传入 `gho_` / `ghu_` tokens
3. **Environment variables** — `COPILOT_GITHUB_TOKEN`, `GH_TOKEN`
4. **BYOK** — 不需要 GitHub 订阅

Adapter 需要支持配置选择认证方式：
```typescript
interface CopilotAdapterConfig {
  authMode: 'github-oauth' | 'github-pat' | 'byok';
  // BYOK 模式需要额外配置
  byokProvider?: 'openai' | 'anthropic' | 'azure' | 'ollama';
  byokApiKey?: string;
  byokModel?: string;
}
```

### 4.2 流式模型差异

Copilot SDK 的流式模型是基于事件的：
```typescript
// Copilot SDK
session.on("assistant.message_delta", (delta) => { /* text chunk */ });
session.on("tool_call", (call) => { /* tool use start */ });
session.on("tool_output", (output) => { /* tool result */ });
```

需要使用共享 `callbackToAsyncGenerator` utility 转换为 AsyncGenerator，避免在 adapter 内重复实现队列/唤醒逻辑：
```typescript
async *sendMessage(sessionId: string, content: string, options?: ChatSendOptions) {
  const session = this.sessions.get(sessionId);

  const stream = callbackToAsyncGenerator<StreamChunk>(({ push, complete, fail }) => {
    session.on("assistant.message_delta", (delta) => {
      push({ type: 'text', content: delta.text });
    });
    session.on("tool_call", (call) => {
      push({ type: 'tool_use', id: call.id, name: call.name, input: call.input });
    });
    session.on("tool_output", (output) => {
      push({ type: 'tool_result', toolUseId: output.id, content: output.content });
    });
    session.on("error", fail);
    session.on("done", complete);
  });

  await session.send(content, options);

  for await (const chunk of stream) {
    yield chunk;
  }
}
```

### 4.3 无限会话与上下文压缩

Copilot SDK 有自动 context compaction，需要映射到 AgentSessionStatus：
```
compacting 状态 → { type: 'thinking', content: 'Compacting context...' }
```

> 注：上述字段名需在实现时再次对照 `src/core/types/chat.ts` 的 `StreamChunk` 联合类型校验，避免 SDK 事件字段名泄漏到 UI 层。

## 5. Phase 0 技术验证门控

Copilot adapter 在正式开发前，必须先通过 Phase 0 技术验证：

| 验证项 | 方法 | 判定标准 |
|--------|------|---------|
| `@github/copilot-sdk` 是否可用 | `npm install @github/copilot-sdk` + 最小 TS 调用 | 能创建 Client、创建 Session、发送一条消息并收到流式响应 |
| SDK 在 Obsidian Electron 环境中是否正常 | 在测试插件中引入 SDK | CLI 进程能启动、JSON-RPC 通信正常、无 native module 冲突 |
| ACP 备选路径 | `copilot --acp --stdio` 子进程测试 | 能通过 ACP 协议发送消息（作为 SDK 不可用时的 fallback） |
| BYOK 模式验证 | 配置自定义 OpenAI 兼容端点（如 GLM） | 能用第三方模型发送消息 |
| CLI binary 体积 | 测量 | 确认 SDK bundled CLI 不超过可接受范围（如 +55MB 则不捆绑） |

**门控**：如果所有路径（SDK + ACP）都不可行，暂停后续 Phase 并重新评估。

## 6. 认证架构详细设计

Copilot 支持两种认证模式：

| 模式 | 流程 | 存储 |
|---|---|---|
| **GitHub 订阅** | OAuth Device Flow → GitHub token → Copilot API token | 系统 Keychain |
| **BYOK** | 用户配置 Provider URL + API Key | 设置加密存储 |

```typescript
// src/core/agents/adapters/copilot/CopilotAuthAdapter.ts

export class CopilotAuthAdapter implements AgentAuthCapability {
  private mode: 'subscription' | 'byok';
  private tokenStore: SecureTokenStore;  // 复用 OpenCodian 现有安全存储

  get isAuthenticated(): boolean {
    return this.mode === 'byok'
      ? !!this.settings.copilotAgent?.providerApiKey
      : !!this.tokenStore.get('copilot-github-token');
  }

  get authMode() {
    return this.mode === 'byok' ? 'byok' : 'subscription';
  }

  async authenticate(): Promise<void> {
    if (this.mode === 'subscription') {
      await this.deviceFlowAuth();
    } else {
      await this.validateByokCredentials();
    }
  }

  private async deviceFlowAuth(): Promise<void> {
    // 1. 请求 GitHub device code
    // 2. 用户在浏览器中授权
    // 3. 获取 token 并存入 Keychain
  }
}
```

**BYOK 独立管理**：BYOK 不混入 Copilot 认证逻辑。它是一个独立的 provider 管理层，可被多个 agent 共享。

## 7. 模块结构

```
src/core/agents/adapters/copilot/
├── CopilotAdapter.ts             # implements AgentService
├── CopilotChatAdapter.ts         # sendMessage 流式适配
├── CopilotAuthAdapter.ts         # OAuth Device Flow + BYOK
├── CopilotModelAdapter.ts        # client.listModels()
├── CopilotSessionAdapter.ts      # 会话管理
├── CopilotTransport.ts           # 底层通信（SDK / ACP / HTTP，Phase 0 决定）
└── types.ts                      # Copilot 特有类型
```

## 8. 设置扩展

```typescript
// src/core/types/settings.ts — 扩展

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
```

## 9. 风险矩阵

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| `@github/copilot-sdk` 不可用或 API 不足 | 高 | 致命 | Phase 0 验证；ACP 作为备选路径 |
| SDK 仍处于 Preview，breaking changes | 高 | 中 | 薄适配层 + 锁定版本 + feature flags 隔离 |
| CLI binary 体积 (+55MB) | 高 | 中 | 不捆绑到插件；要求用户单独安装 |
| 认证模型复杂 | 中 | 中 | 先支持最简单的一种（env var / PAT） |
| 双后端错误混淆 | 高 | 中 | 统一 `AgentError` 带 backend 标签 |
| OAuth token 安全存储 | 中 | 中 | 系统 Keychain + 清晰的安全文档 |
| Obsidian 社区审核拒绝 | 中 | 高 | 不捆绑大体积二进制；预审沟通 |
| BYOK 配置泄露 | 中 | 中 | 加密存储；不记录敏感信息到日志 |

## 10. 未来功能路径（不在本 spec scope）

| 功能 | 备注 | 预计 Phase |
|------|------|-----------|
| Ghost Text 内联补全 | 需独立 LSP 连接，非 SDK 路径 | Phase 5+ |
| 内联编辑 + Diff | CM6 装饰扩展 | Phase 4+ |
| MCP Server 透传 | SDK 支持 MCP | Phase 6+ |
| Copilot Skills | SDK 支持 skills | Phase 6+ |
| 多模态 / 图片输入 | SDK 支持 | Phase 6+ |

## 11. 验收标准

1. Phase 0 技术验证通过（SDK 或 ACP 至少一条路径可行）
2. Copilot adapter 实现 AgentService 核心接口
3. 至少一种认证方式正常工作
4. 能发送消息、接收流式回复
5. 工具调用正确归一化到 StreamChunk
6. 权限请求正确转发到 UI 层
7. 切换回 OpenCode 后会话状态保持
8. 错误信息带 `backend: 'copilot'` 标签
9. 切换 agent 后不影响其他 adapter
