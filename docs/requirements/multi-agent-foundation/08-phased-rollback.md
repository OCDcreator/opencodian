# 分阶段实施计划和回滚策略

> **状态**: `[DRAFT]`
> **最后更新**: 2026-05-18

## 概述

多 agent 基座采用渐进式实施策略。每个阶段都是自包含的，可以独立验证和回滚。

## 1. 阶段总览

```
Phase 0: 抽象 OpenCode ──── 基础设施搭建
  ├── 0a: 定义 AgentService 接口 + 类型
  ├── 0b: 实现 OpenCodeAdapter（核心）
  ├── 0c: 实现 OpenCodeAdapter（全部能力）
  └── 0d: 视图层迁移到 AgentServiceRegistry

Phase 1: 第二个 Agent ────── 验证架构可行性
  ├── 1a: 实现 ClaudeCodeAdapter（核心）
  ├── 1b: Agent 选择器 UI
  └── 1c: 会话归属和切换

Phase 2: 扩展更多 Agent ─── 横向扩展
  ├── 2a: 实现 CodexAdapter
  └── 2b: 实现 CopilotAdapter

Phase 3: 完善生态 ──────── 补齐最后一块
  ├── 3a: 实现 PiAdapter
  └── 3b: 统一事件归一化层

Phase 4: Agent 选择器 + UI 完善
  └── 4a: 完整的 agent 管理界面
```

## 2. Phase 0 详细计划

### Phase 0a: 定义接口 + 类型

**目标**: 创建 `src/core/agents/` 目录，定义所有接口和类型

**产出文件**:
- `src/core/agents/types.ts`
- `src/core/agents/AgentService.ts`
- `src/core/agents/capabilities/index.ts` + 各能力接口文件

**验证**:
- TypeScript 编译通过
- 接口类型正确
- 无业务逻辑变更

**回滚**: 删除 `src/core/agents/` 目录即可

### Phase 0b: OpenCodeAdapter 核心

**目标**: 包装 OpenCodeService 为 AgentService

**产出文件**:
- `src/core/agents/adapters/OpenCodeAdapter.ts`
- `src/core/agents/AgentServiceRegistry.ts`

**关键任务**:
1. OpenCodeAdapter 实现核心 AgentService 接口
2. 实现 sendMessage 的流式事件归一化
3. 实现 AgentServiceRegistry
4. 注册 OpenCodeAdapter 为默认 agent

**验证**:
- `npm run verify` 通过
- 现有聊天功能不受影响
- adapter 的单元测试通过

**回滚**: 移除 adapter 和 registry 代码，现有代码不变

### Phase 0c: OpenCodeAdapter 全部能力

**目标**: 实现所有 Capability 接口

**关键任务**:
1. 实现 AgentToolCapability
2. 实现 AgentMcpCapability
3. 实现 AgentPermissionCapability
4. 实现 AgentBranchCapability
5. 实现 AgentConfigCapability
6. 实现 AgentModelCapability
7. 实现 AgentTodoCapability
8. 实现 AgentQuestionCapability

**验证**:
- 每个 capability 的映射测试
- 现有功能通过 adapter 工作正常

**回滚**: 保留核心接口，移除未完成的 capability 实现

### Phase 0d: 视图层迁移

**目标**: 分三步把视图层和相关服务迁移到 AgentServiceRegistry，避免一次性替换造成所有权守卫和回归风险

**关键任务**:
1. Phase 0d-1: Server lifecycle（62 次调用，约 7 个文件）
2. Phase 0d-2: Session management（32 次调用，OpenCodianView + 4 个服务），使用 Proxy delegation pattern 避免 Owner Guard violation
3. Phase 0d-3: MCP/Config/Model/Events（34 次调用，约 15 个 settings 文件）
4. 使用 `hasCapability()` 做条件渲染

**风险**: 128 次方法调用，53 个不同方法，26 个文件需要分阶段迁移

**回滚**: 恢复直接使用 `openCodeService` 的代码

**验收标准**:
- 所有现有聊天功能正常
- 无性能退化
- `npm run verify` 通过

## 3. Phase 1 详细计划

### Phase 1a: ClaudeCodeAdapter 核心

**目标**: 实现第二个 agent adapter

**前置依赖**: Phase 0 完成

**关键任务**:
1. `npm install @anthropic-ai/claude-agent-sdk`
2. 实现 ClaudeCodeAdapter 核心接口
3. 处理会话模型差异（Claude 无显式 createSession）
4. 实现流式事件归一化
5. 实现权限系统适配

**验证**:
- 能创建 Claude Code 会话
- 能发送消息并接收流式回复
- 工具调用正确显示
- 切换回 OpenCode 无问题

**回滚**: 移除 ClaudeCodeAdapter + SDK 依赖

### Phase 1b: Agent 选择器 UI

**目标**: 在聊天界面添加 agent 切换功能

**关键任务**:
1. 设计 agent 选择器组件（下拉/按钮组）
2. 实现切换逻辑
3. 切换时创建新会话
4. 显示当前 agent 图标和名称
5. 每个会话记住其 agent 归属

### Phase 1c: 会话归属

**目标**: 每个会话绑定一个 agent

**关键任务**:
1. Conversation 类型增加 `backend: AgentBackendKind` / `backendSessionId` 等字段
2. 打开会话时使用对应的 agent adapter
3. 会话列表显示 agent 标识
4. 本地持久化会话归属

## 4. 回滚策略总则

### 4.1 每个 Phase 都可独立回滚

- Phase 0 不改现有代码，只新增抽象层 → 回滚 = 删除新代码
- Phase 1 新增 SDK 依赖 → 回滚 = 移除 adapter + `npm uninstall`
- Phase 2/3 同 Phase 1

### 4.2 不允许跨 Phase 回滚影响其他 Phase

- 每个 adapter 独立注册到 registry
- 移除一个 adapter 不影响其他 adapter
- SDK 依赖互相独立

### 4.3 数据兼容性

- 旧版 Conversation 数据（无 `backend` 字段）默认为 `opencode`
- 不做数据迁移，通过 fallback 处理

## 5. 依赖管理

### 5.1 SDK 依赖

```json
{
  "dependencies": {
    "@anthropic-ai/claude-agent-sdk": "^0.2.x",  // Phase 1
    "@openai/codex-sdk": "^0.130.x",              // Phase 2
    "@github/copilot-sdk": "^1.0.0-beta.3",        // Phase 2
    "@mariozechner/pi-coding-agent": "^0.73.x"     // Phase 3
  }
}
```

### 5.2 Bundle Size 影响

每个 SDK 会增加插件 bundle 大小：
- 需要在 Phase 1 评估实际影响
- 如果影响过大，考虑 dynamic import 或 optional dependencies
- Pi 是纯 TS 库，可能最小
- Claude/Copilot bundled CLI binary 可能较大

### 5.3 按需加载策略

```typescript
// 可能需要延迟加载 adapter
const adapterRegistry = new AgentServiceRegistry();

// 注册时只传 factory，不立即实例化
adapterRegistry.register({
  kind: 'claude-code',
  factory: async () => {
    const { ClaudeCodeAdapter } = await import('./adapters/ClaudeCodeAdapter');
    return new ClaudeCodeAdapter(context);
  }
});
```

## 6. 质量门槛

每个 Phase 完成前必须通过：

### 6.1 标准验证

1. `npm run verify` — lint + typecheck + tests + build 全部通过
2. 现有聊天功能回归测试 — OpenCode adapter 下一切正常
3. 新 adapter 的核心功能测试
4. agent 切换不影响其他 agent
5. 无 bundle size 异常增长（+20% 以内）

### 6.2 架构守卫验证

6. `npm run check:module-docs` — 新增文件的 `module-docs.config.json` 映射已注册，`docs/modules/` 同步
7. `npm run check:graphify` — `npm run graphify:update:src` 后图不 stale
8. `npm run check:owner-guard` — 不在守卫文件中增加新的运行时所有权
9. lint 0 errors / 0 warnings

### 6.3 可观测性验证

10. 新 adapter 日志带 `[agent:xxx]` 前缀
11. DevTools 控制台可查看 adapter 诊断快照
12. 错误信息带 `backend` 标签
13. 认证日志不记录敏感信息

### 6.4 类型安全验证

14. adapter 内部不泄漏 SDK 类型到上层
15. `AgentService` 接口的 TypeScript 类型完整
16. 契约测试通过（adapter 实现了全部接口方法）

## 7. 与 multi-agent-board.md 的对接

当 Phase 0-1 完成后：
- `AgentService` 接口可直接作为 board spec 中 `AgentAdapter` 的实现
- `AgentServiceRegistry` 可作为 board 的 adapter 来源
- 每个 adapter 的 capabilities 直接驱动看板卡片的动作可用性

建议在 Phase 1 完成后再启动 board spec 的 Phase 0b。

## 8. 开发调试指南

### 8.1 环境准备

```bash
# 基础开发（只涉及 OpenCode adapter）
npm install
npm run verify

# 接入新 agent 时，额外安装 SDK
npm install @anthropic-ai/claude-agent-sdk   # Phase 1
npm install @openai/codex-sdk                # Phase 2
npm install @github/copilot-sdk              # Phase 2
npm install @mariozechner/pi-coding-agent    # Phase 3
```

### 8.2 调试模式

```bash
# 只调试特定 agent
OPENCODIAN_DEBUG_AGENT=claude-code npm run dev

# 调试所有 agent
OPENCODIAN_DEBUG_AGENT=all npm run dev

# 关闭调试
npm run dev
```

### 8.3 DevTools 控制台命令

```javascript
// 查看所有 agent 状态
window.opencodian?.agents?.diagnostics()

// 查看特定 agent 诊断快照
window.opencodian?.agents?.get('copilot')?.getDiagnosticSnapshot()

// 查看当前活跃 agent
window.opencodian?.agents?.getActive()?.getDiagnosticSnapshot()

// 查看会话归属
window.opencodian?.agents?.getSessionOwner('session-xxx')
```

### 8.4 常见问题排查路径

| 现象 | 可能原因 | 排查路径 |
|------|---------|---------|
| 消息发不出去 | adapter 未连接 | console 查看 adapter status → 检查 `start()` 日志 |
| 流式中断 | SDK 连接断开 / 事件归一化错误 | 查看 `[agent:xxx]` 错误日志 → 检查 rawEvent vs normalizedEvent |
| 工具调用不显示 | 事件归一化缺失 | `OPENCODIAN_DEBUG_AGENT=xxx` 查看原始事件 → 对比 StreamChunk 类型 |
| 切换 agent 后白屏 | 状态清理不完整 | 查看 registry 切换日志 → 检查 `stop()` 是否清理了所有订阅 |
| 认证失败 | token 过期 / 配置错误 | 查看 auth 日志（不记录 token 值）→ 检查 authMode |
| CLI 启动失败 | CLI 未安装 / 路径错误 | 查看 processInfo → 检查 cliPath 配置 |
| 性能退化 | adapter 层引入延迟 | 对比直接使用 SDK vs 通过 adapter 的耗时 → 检查是否有不必要的序列化 |

### 8.5 每个 Phase 的调试关注点

| Phase | 关注点 | 验证方法 |
|-------|--------|---------|
| Phase 0a | 接口编译是否正确 | `npm run typecheck` |
| Phase 0b | OpenCodeAdapter 包装是否完整 | 现有聊天功能全流程回归 |
| Phase 0c | 能力映射是否正确 | 每个 capability 的单独测试 |
| Phase 0d | 视图层迁移无遗漏 | grep `openCodeService` 确认无直接引用 |
| Phase 1 | 新 agent SDK 是否可用 | Phase 0 技术验证门控 |
| Phase 2+ | agent 间切换无状态泄漏 | 切换后检查 registry 状态快照 |
