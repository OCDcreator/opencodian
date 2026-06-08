# 分阶段实施计划和回滚策略

> **状态**: `[DRAFT]`
> **最后更新**: 2026-05-20

## 概述

多 agent 基座采用渐进式实施策略。每个阶段都是自包含的，可以独立验证和回滚。

## 0. 2026-05-20 Claude Code 分阶段修正

当前 Phase 0 worktree 已有 `AgentServiceRegistry`、`OpenCodeAdapter`、backend settings gate 和 OpenCode disable/availability 防线，但 chat/session 路径仍没有完全 backend-neutral。因此 Claude Code 不能直接进入生产实现，必须先完成 Phase 0 的剩余抽象和 OpenCode 回归验证。

新的 Claude rollout 原则：

1. Phase 0 先保证 backend abstraction 和 OpenCode 不回归。
2. Phase 1 做 Claude 最小可落地闭环，但闭环必须包含 persistent query、stream/tool/permission/question/session resume，而不是单次 prompt demo。
3. Phase 2-5 逐步覆盖“全部能力”：models/thinking/MCP/settings source/additional dirs、history/fork/subagents、skills/hooks/agents authoring、最终 cross-backend polish。
4. Claude runtime UI 只有在 smoke 通过后才加入 `IMPLEMENTED_AGENT_BACKENDS`。

### 0.1 Claude-specific phase gates

| Phase | 目标 | 退出条件 | 回滚 |
|---|---|---|---|
| Phase 0 | 完成 chat/session backend contract；OpenCode 通过 focused tests 和 `npm run verify`。 | OpenCode new session/send/history/settings 均不回归；Claude 仍不暴露。 | 删除/回退 contract slice，保留 OpenCode 直接路径。 |
| Phase 1 | Claude SDK persistent query 最小闭环。 | Obsidian Electron runtime 证明 SDK executable starts、streams、permissions/questions、MCP pass-through、session resume；OpenCode disabled/enabled smoke 通过。 | 从 registry/gate 移除 Claude，保留 docs/disabled code 或直接删除 adapter。 |
| Phase 2 | Claude runtime settings completeness。 | model/thinking/effort/settingSources/additionalDirectories/executable diagnostics 可操作。 | 隐藏 Claude settings section，保留 adapter core。 |
| Phase 3 | Claude session/history/fork completeness。 | JSONL import/resume/fork/resume-at tests + runtime sample 通过。 | 禁用 history/fork capability，保留 chat。 |
| Phase 4 | Skills/hooks/agents/MCP authoring。 | 文件写入兼容 Claude Code 官方格式，runtime discovery 可见。 | 回退 authoring UI，只读 runtime discovery。 |
| Phase 5 | Full capability polish。 | Capability dashboard、diagnostics export、cross-backend UX 完成。 | 保持 backend core，关闭高级 panels。 |

## 1. 阶段总览

```
Phase 0: 前端 Capability 驱动改造 ──── UI 先行，零 backend 依赖
  ├── 0a: 定义 AgentCapability 类型枚举
  ├── 0b: 聊天 UI: hasCapability() 替换硬编码
  ├── 0c: 设置 UI: Backend 管理 + 条件显示
  └── 0d: 会话归属 + 历史过滤（硬编码 'opencode'）

Phase 1: Backend 抽象 — OpenCodeAdapter ──── 接口已被前端验证
  ├── 1a: 定义完整 AgentService 接口 + 实现 OpenCodeAdapter
  ├── 1b: 视图层迁移到 AgentServiceRegistry
  └── 1c: 模型选择器 / Server Badge 适配

Phase 2: 第二个 Agent ────── 架构可行性验证
  ├── 2a: 实现 ClaudeCodeAdapter（核心）
  └── 2b: Claude Code 设置标签

Phase 3: 扩展更多 Agent ─── 横向扩展
  ├── 3a: 实现 CodexAdapter
  └── 3b: 实现 CopilotAdapter

Phase 4: 完善生态 ──────── 补齐最后一块
  ├── 4a: 实现 PiAdapter
  └── 4b: 统一事件归一化层

Phase 5: 编排层对接
  └── 5a: 与 multi-agent-board.md 的编排层对接
```

## 2. Phase 0 详细计划 — 前端 Capability 驱动改造

> **核心原则**: 前端先行，UI 层解耦 backend 假设。
> Phase 0 全程只操作 OpenCode，不改任何 backend 代码，零风险、完全可逆。

### Phase 0a: 定义 Capability 类型

**目标**: 创建 `AgentCapability` 枚举和最小查询接口

**产出文件**:
- `src/core/agents/capabilities.ts`（或扩展 `types.ts`）

**关键任务**:
1. 定义 `AgentCapability` 枚举：`tools` / `mcp` / `permissions` / `branching` / `todos` / `questions` / `models` / `subagents` / `context` / `providers` / `compaction` / `cost-tracking` / `thinking` / `hooks` / `config` / `file-ops` / `shell` / `export`
2. 定义 `BackendCapabilities` 类型（`ReadonlySet<AgentCapability>`，与 02-architecture 保持一致）
3. 定义 `getActiveBackendCapabilities()` 工具方法
   - 第一版：硬编码返回 OpenCode 的全量 capabilities（全部 `true`）
   - Phase 1 后自动切换到从 AgentServiceRegistry 读取

**验证**:
- TypeScript 编译通过
- `hasCapability('todos')` → `true`
- 无业务逻辑变更

**回滚**: 删除新文件即可

### Phase 0b: 聊天 UI Capability 驱动

**目标**: 聊天界面用 `hasCapability()` 替换硬编码的 OpenCode 假设

**前置依赖**: Phase 0a

**关键任务**（按 §09 优先级排序）:
1. TodoDock → `todos` capability
2. QuestionDock → `questions` capability
3. Fork/Revert buttons → `branching` capability
4. PermissionInlineCard → `permissions` capability
5. ContextRing → `context` capability
6. BackgroundTaskPanel → `subagents` capability
7. ChildSessionTree → `subagents` capability
8. ModifiedFilesSidebar → session diff data
9. Agent mention / Slash command / LSP → OpenCode only
10. Tool skill blocks → OpenCode only

**验证**:
- OpenCode 下所有 UI 不变（全量 capability）
- mock 空 capability 集合 → 验证隐藏逻辑
- `npm run verify` 通过

**回滚**: 移除 `hasCapability()` 包裹，恢复无条件渲染

### Phase 0c: 设置 UI Backend 管理 + 条件显示

**目标**: 设置界面新增智能体管理，10 个 OpenCode 专属标签 + Conversation 的 3 个子标签（compaction/sharing/questions）改为条件显示

**前置依赖**: Phase 0a

**关键任务**（详见 §10）:
1. 扩展 `OpenCodianSettings` 加 `activeBackend` / `enabledBackends`
2. General 标签下新增 `智能体管理` 子标签
3. 10 个 OpenCode 专属标签 + Conversation 的 3 个子标签（compaction/sharing/questions）加条件判断
4. normalize 旧数据（旧用户保持 `['opencode']`，新安装默认 `[]`）

**验证**:
- 默认状态（OpenCode 启用）所有设置不变
- 禁用 OpenCode → 10 个标签 + 3 个子标签消失（所有智能体都可禁用）
- 重新启用 → 标签恢复

**回滚**: 恢复无条件标签注册

### Phase 0d: 会话归属 + 历史过滤

**目标**: 每个会话绑定 backend 标记

**前置依赖**: Phase 0b

**关键任务**:
1. Conversation 类型加 `backend: AgentBackendKind`
2. 新建会话时标记 `'opencode'`（硬编码，Phase 1 后自动切换）
3. 历史列表按 `activeBackend` 过滤
4. 旧数据 fallback 为 `'opencode'`

**验证**:
- 现有会话（无 backend 字段）显示正常
- 新建会话有 `backend: 'opencode'` 标记
- 历史过滤不丢失数据

**验收标准**:
- 所有现有聊天功能正常
- 无性能退化
- `npm run verify` 通过
- grep `openCodeService` 调用数量不增不减（Phase 0 不改 backend 调用）

## 3. Phase 1 详细计划 — Backend 抽象

> Phase 0 已验证 Capability 接口设计和 UI 条件逻辑。
> Phase 1 正式实现 backend 抽象层，接入已准备好的前端。

### Phase 1a: 定义完整接口 + 实现 OpenCodeAdapter

**目标**: 实现 AgentService 接口和 OpenCodeAdapter

**前置依赖**: Phase 0 完成（Capability 类型已被 UI 验证）

**产出文件**:
- `src/core/agents/AgentService.ts`
- `src/core/agents/AgentServiceRegistry.ts`
- `src/core/agents/adapters/OpenCodeAdapter.ts`

**关键任务**:
1. 定义完整 `AgentService` 接口
2. 实现 OpenCodeAdapter 核心 + 全部 Capability
3. 实现 AgentServiceRegistry
4. 注册 OpenCodeAdapter 为默认 agent
5. 替换 Phase 0a 中 `getActiveBackendCapabilities()` 的硬编码实现为从 Registry 读取

**验证**:
- `npm run verify` 通过
- 现有聊天功能不受影响
- adapter 的单元测试通过

**回滚**: 移除 adapter 和 registry 代码，恢复 Phase 0a 的硬编码 capabilities

### Phase 1b: 视图层迁移到 AgentServiceRegistry

**目标**: 把视图层和相关服务从直接调用 `openCodeService` 迁移到 AgentServiceRegistry

**前置依赖**: Phase 1a

**关键任务**:
1. Server lifecycle（62 次调用，约 7 个文件）
2. Session management（32 次调用，OpenCodianView + 4 个服务），使用 direct registry routing + capability narrowing 避免隐式 OpenCode fallback
3. MCP/Config/Model/Events（34 次调用，约 15 个 settings 文件）

**风险**: 128 次方法调用，53 个不同方法，26 个文件需分阶段迁移

**回滚**: 恢复直接使用 `openCodeService` 的代码

### Phase 1c: 模型选择器 / Server Badge 适配

**目标**: 模型选择器和 Badge 接入 AgentService

**前置依赖**: Phase 1b

**关键任务**:
1. 模型列表从 `adapter.listModels()` 获取
2. Backend 切换时刷新列表
3. Badge 状态订阅 `adapter.onStatusChange()`
4. Badge 文案改为 "BackendName · Status"

## 4. Phase 2 详细计划

### Phase 2a: ClaudeCodeAdapter 核心

**目标**: 实现第二个 agent adapter

**前置依赖**: Phase 1 完成

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
- Phase CS-1 的 `hasCapability()` 自动正确隐藏 Claude Code 不支持的 UI

**回滚**: 移除 ClaudeCodeAdapter + SDK 依赖

### Phase 2b: Claude Code 设置标签

**关键任务**:
1. 实现 Claude Code 专属设置标签（API key + 默认模型）
2. 注册为条件显示
3. 启用后显示，禁用后隐藏

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
    "@anthropic-ai/claude-agent-sdk": "^0.3.x",  // Phase 1; 2026-05-20 latest verified as 0.3.145
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

当 Phase 0-2 完成后：
- 前端已经完全 backend-aware（Phase 0 验证）
- `AgentService` 接口已被前端消费验证（Phase 1）
- 第二个 adapter 已实现并验证（Phase 2）
- `AgentServiceRegistry` 可作为 board 的 adapter 来源
- 每个 adapter 的 capabilities 直接驱动看板卡片的动作可用性

建议在 Phase 2 完成后再启动 board spec 的 Phase 0b。

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
| Phase 0a | Capability 类型枚举是否覆盖所有 UI 需求 | 对照 §09 §10 的 UI 映射表 |
| Phase 0b | hasCapability() 在 OpenCode 全量下 UI 不变 | 全流程回归 |
| Phase 0c | 设置条件显示逻辑 | mock 禁用 OpenCode → 10 个标签 + 3 个子标签消失 |
| Phase 0d | 会话归属 + 旧数据 fallback | 新旧会话都能正常打开 |
| Phase 1a | OpenCodeAdapter 包装是否完整 | 现有聊天功能全流程回归 |
| Phase 1b | 视图层迁移无遗漏 | grep `openCodeService` 确认无直接引用 |
| Phase 1c | 模型选择器/Badge 接入 | 切换 backend 后 UI 正确更新 |
| Phase 2 | 新 agent SDK 是否可用 | Phase 0b 的 hasCapability() 自动隐藏不支持 UI |
| Phase 3+ | agent 间切换无状态泄漏 | 切换后检查 registry 状态快照 |
