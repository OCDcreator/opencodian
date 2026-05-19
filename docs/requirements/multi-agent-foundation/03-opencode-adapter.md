# OpenCode Adapter 设计

> **状态**: `[DRAFT]`
> **最后更新**: 2026-05-18
> **优先级**: P0 — 第一个要实现的 adapter

## 概述

OpenCode adapter 是从现有 `OpenCodeService` 包装而来的 AgentService 实现。它不改 `OpenCodeService` 内部代码，而是作为外观层（Facade），将其方法映射到统一的 AgentService 接口。

## 1. 涉及的现有模块

| 现有模块 | 文件 | 在 adapter 中的角色 |
|---------|------|-------------------|
| OpenCodeService | `src/core/opencode/OpenCodeService.ts` | 核心被包装对象 |
| OpenCodeSdkFacade | `src/core/opencode/OpenCodeSdkFacade.ts` | SDK 命名空间映射 |
| ServerManager | `src/core/opencode/ServerManager.ts` | 进程生命周期管理 |
| OpenCodeStreamingRuntimeCoordinator | `src/core/opencode/OpenCodeStreamingRuntimeCoordinator.ts` | 流式运行时 |
| OpenCodeSyncEventRuntimeCoordinator | `src/core/opencode/OpenCodeSyncEventRuntimeCoordinator.ts` | 同步事件 |
| OpenCodeSessionStateStore | `src/core/opencode/OpenCodeSessionStateStore.ts` | 会话状态存储 |
| OpencodeConfigManager | `src/core/config/OpencodeConfigManager.ts` | 配置管理 |
| ModelConfigService | `src/core/config/ModelConfigService.ts` | 模型配置 |
| OpenCodeServiceLifecycleCoordinator | `src/core/opencode/OpenCodeServiceLifecycleCoordinator.ts` | 生命周期协调 |

## 2. 能力声明

OpenCode adapter 支持以下能力：

```typescript
const OPENCODE_CAPABILITIES = new Set<AgentCapability>([
  'tools',       // 通过 sdk.tool.list()
  'mcp',         // 通过 sdk.mcp.*
  'permissions', // 通过 OpenCodePermissionHub
  'branching',   // forkSession, revertSession, unrevertSession
  'config',      // 通过 OpencodeConfigManager
  'models',      // 通过 ModelConfigService
  'todos',       // 通过 getSessionTodos
  'questions',   // 通过 QuestionDock
  'subagents',   // 通过 task 工具
  'context',     // 通过 context usage
  'providers',   // 通过 provider.list
  'hooks',       // 通过 OpenCode hook 系统
]);
```

## 3. 方法映射表

### 3.1 核心接口映射

| AgentService 方法 | OpenCodeService 方法 | 备注 |
|---|---|---|
| `start()` | `start()` | 委托给 LifecycleCoordinator |
| `stop()` | `stop()` | 委托给 LifecycleCoordinator |
| `createSession()` | `createSession()` | 直接映射 |
| `listSessions()` | `sdk.session.list()` | 需要格式转换 |
| `getSession()` | `sdk.session.get()` | 需要格式转换 |
| `deleteSession()` | `sdk.session.delete()` | 直接映射 |
| `sendMessage()` | `sendMessage()` + 流式协调器 | 需要事件归一化 |
| `cancelStream()` | `cancelStream()` | 直接映射 |
| `onStatusChange()` | `onServerStatusChange()` | 状态映射 |

### 3.2 流式事件归一化

```
OpenCode SDK Event → StreamChunk

text_delta     → { type: 'text', content }
tool_use_start → { type: 'tool_use', id, name, input }
tool_use_delta → merge into existing { type: 'tool_use', id, name, input }
tool_result    → { type: 'tool_result', toolUseId, content, isError? }
reasoning      → { type: 'thinking', content }
usage          → { type: 'usage', inputTokens, outputTokens, sessionId? }
error          → { type: 'error', content, errorClass? }
```

> 注：上述字段名需在实现时再次对照 `src/core/types/chat.ts` 的 `StreamChunk` 联合类型校验，避免 SDK 事件字段名泄漏到 UI 层。

## 4. OpenCodeAdapter 骨架

```typescript
class OpenCodeAdapter implements AgentService,
  AgentToolCapability,
  AgentMcpCapability,
  AgentPermissionCapability,
  AgentBranchCapability,
  AgentConfigCapability,
  AgentModelCapability,
  AgentTodoCapability,
  AgentQuestionCapability {

  readonly kind = 'opencode' as const;
  readonly displayName = 'OpenCode';
  readonly capabilities = OPENCODE_CAPABILITIES;

  private service: OpenCodeService;

  constructor(openCodeService: OpenCodeService) {
    // 复用现有 OpenCodeService 实例
    this.service = openCodeService;
  }

  hasCapability(cap: AgentCapability): boolean {
    return this.capabilities.has(cap);
  }

  // --- 核心 ---
  get status() { return mapServerStatus(this.service.getServerStatus()); }
  async start() { /* delegate to existing lifecycle */ }
  async stop() { /* delegate to existing lifecycle */ }

  async createSession(options?: SessionCreateOptions) {
    // 映射 options → OpenCode 的 createSession 参数
  }

  async *sendMessage(sessionId: string, content: string, options?: ChatSendOptions) {
    // 包装 OpenCodeService.sendMessage() 的 AsyncGenerator
    // 转换 OpenCode SDK 事件 → StreamChunk
    for await (const chunk of this.service.sendMessage(sessionId, content, options)) {
      yield normalizeStreamChunk(chunk);
    }
  }

  // --- ToolCapability ---
  async listTools() { /* sdk.tool.list() */ }

  // --- ModelCapability ---
  async listModels() { /* ModelConfigService.getEffectiveCatalog() */ }

  // --- BranchCapability ---
  async forkSession(sessionId, options) { /* service.forkSession() */ }
  async revertSession(sessionId, options) { /* service.revertSession() */ }

  // ... 其他能力方法
}
```

## 5. 迁移策略

### 5.1 Phase 0a: 最小包装

1. 创建 `OpenCodeAdapter` 类
2. 实现核心接口（start/stop/session/message）
3. 实现 `hasCapability()` 总是返回 true（暂时）
4. 让 `AgentServiceRegistry` 默认注册并返回 OpenCodeAdapter

### 5.2 Phase 0b: 完整能力

1. 逐一实现每个 Capability 接口
2. 编写映射测试
3. 验证现有聊天功能通过 adapter 工作正常

### 5.3 Phase 0c: 视图层迁移

1. Phase 0d-2 使用 Proxy 委托模式（见架构文档 §10.1）承接会话管理迁移
2. `OpenCodianView` 代码保持不变，继续调用 `this.plugin.openCodeService.xxx`
3. Proxy 透明地将 AgentService 方法路由到当前 active adapter，不在视图层逐处替换

## 6. 风险

| 风险 | 缓解 |
|------|------|
| OpenCodeService 的方法签名可能不完全匹配 AgentService | adapter 层做必要的参数转换 |
| 现有代码直接引用 `openCodeService` 类型 | Phase 0c/0d-2 通过 Proxy 委托保持视图层不变 |
| 流式事件的归一化可能丢失 OpenCode 特有的信息 | StreamChunk.metadata 保留原始数据 |
| 128 次方法调用，53 个方法，26 个文件需要迁移 | 分批迁移，不急于一次完成 |

## 7. 验收标准

1. OpenCodeAdapter 实现了完整的 AgentService 接口
2. 所有现有聊天功能通过 adapter 正常工作
3. `npm run verify` 通过
4. 流式对话、工具调用、权限管理、会话分支等功能不受影响
5. 无性能退化（adapter 层不应引入可感知的延迟）
