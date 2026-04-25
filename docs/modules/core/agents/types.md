# Agent Surface Types

> **源码**: `src/core/agents/types.ts`
> **状态**: [DRAFT]

## 概述

Agent surface layer 的统一类型定义。定义了三层真相源（runtime / config / file）的合并视图类型，保持各层数据可见且不虚假合并为单一状态。

## 导入关系

```text
上游: src/core/types/opencodeConfig.ts (OpencodeAgentConfig, OpencodeAgentMode)
下游: src/core/agents/AgentCatalogService.ts, src/core/agents/ChildSessionGraphService.ts, src/core/agents/SystemAgentGuardService.ts, src/core/agents/index.ts
```

## 核心类型

| 类型 | 说明 |
|------|------|
| `SurfaceAgentSource` | Agent 来源层：`runtime` / `config` / `file` |
| `SurfaceAgent` | 统一 catalog 条目，含来源标记、模式、可见性、覆盖状态 |
| `SurfaceAgentFile` | Markdown agent 文件层真相（解析状态、frontmatter、scope） |
| `SurfaceAgentFileParseStatus` | 文件解析状态：`ok` / `parse-error` / `duplicate-id` / `conflict` |
| `SurfaceAgentFileScope` | 文件范围：`project`（`.opencode/`）或 `root` |
| `RuntimeAgentShape` | 运行时 agent 最小形状，从 `app.agents()` 映射 |
| `AgentCatalogInput` | Catalog 聚合输入：runtime / config / file 三层快照 |
| `SystemAgentGuardResult` | 系统 agent 写入检查结果 |
| `SystemAgentId` | 已知系统 agent ID 联合类型 |
| `SurfaceInvocationIntent` | 单次聊天发送的显式代理调用意图 |
| `AgentMentionIntent` | `@subagent` mention 的结构化描述 |
| `SubtaskIntent` | 原生 `subtask` 部分的结构化描述 |
| `InvocationPromptPart` | `agent` / `subtask` 原生 request part 变体 |
| `ResolvedAgentInvocation` | `AgentInvocationService` 输出的 top-level `agent` + native invocation parts |
| `ChildSessionEdgeStatus` | child-session 边状态：`active` / `completed` / `error` / `unknown` |
| `ChildSessionEdge` | 一条 task 调用到 child session 的重建边 |
| `ChildSessionGraphStatus` | child-session 图状态：`complete` / `partial` / `empty` |
| `OrphanedChildSession` | 未匹配到任何 task 边、但出现在 `session.children()` 里的 orphaned child session 显示条目 |
| `ChildSessionGraph` | 单个父会话的重建 child-session 图 |
| `ChildSessionInfo` | `session.children()` 返回的最小子会话形状 |
| `ChildSessionGraphInput` | child-session 图重建输入：父会话、消息、可选 live children |

## 核心常量与函数

| 导出 | 说明 |
|------|------|
| `SYSTEM_AGENT_IDS` | 已知系统 agent：`['title', 'summary', 'compaction']` |
| `isSystemAgentId()` | 判断 ID 是否为系统 agent，带类型收窄 |

## 关键设计决策

- `SurfaceAgent.sources` 是数组，一个 agent 可以同时出现在多个层
- `runtimeAvailable` / `hasProjectOverride` / `disabled` 分别表达各层状态
- `defaultEligible` 和 `subagentVisible` 由 mode + hidden + disabled 推导
- `builtin` 来自运行时 `native` 或 `builtIn` 字段，config-only agent 无此值
- `rawConfig` 保留原始 config 条目供上层使用
- A2 新增的 invocation 类型刻意继续放在 `core/agents`，因为它们也是 agent surface 的一部分；聊天发送链路只消费这些结构，不直接发明插件私有语法
- A3 新增 child-session 图类型，专门承载从持久化 task 元数据恢复 `task → child session` 边的结果；SDK 实时子会话只作为补充输入，不和持久化边混成单一真相
- `ChildSessionGraph.orphanedSessions` 为 orphan child session 提供稳定展示字段（`id` / `title` / `createdAt` / `updatedAt`），而 `orphanedSessionIds` 继续保留给旧消费方做兼容读取

## 注意事项

- `fileAgents` 输入在 A1 slice 中为可选；完整 Markdown 扫描推迟到 A4
- 不在此模块做任何 runtime/config/file 合并逻辑——合并由 `AgentCatalogService` 负责
- `SurfaceInvocationIntent.kind` 目前只有 `'prompt'` 会被 A2 发送链路消费；`command` / `shell` 仅作为未来扩展占位
- child-session 图输入中的 `toolMetadata.sessionId` 是持久化层唯一可靠的父子会话链接字段；该模块只建模，不负责扫描/恢复逻辑
