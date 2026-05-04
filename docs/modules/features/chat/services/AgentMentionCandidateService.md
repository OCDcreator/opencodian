# AgentMentionCandidateService

> **源码**: `src/features/chat/services/AgentMentionCandidateService.ts`
> **状态**: [REVIEW]

## 概述

`AgentMentionCandidateService` 为 chat composer 的 `@agent` picker 提供候选目录。它复用 core agent surface 的 `AgentCatalogService`，把 runtime `app.agents()` 与项目 agent config 聚合后投影成 `AgentMentionCandidate[]`。

## 公开接口

```typescript
export interface AgentMentionCandidateServiceHost {
  loadRuntimeAgents(): Promise<unknown>;
  loadProjectAgents(): Promise<OpencodeAgentConfigRecord>;
  loadFileAgents?(): Promise<readonly SurfaceAgentFile[]>;
}

export class AgentMentionCandidateService {
  load(): Promise<AgentMentionCandidate[]>;
  projectCandidates(input: {
    runtimeAgentsResult: unknown;
    projectAgents: OpencodeAgentConfigRecord;
    fileAgents?: readonly SurfaceAgentFile[];
  }): AgentMentionCandidate[];
}
```

## 行为

- runtime 输入会先归一化成 `RuntimeAgentShape[]`，避免 SDK 返回异常形状时污染 picker
- `AgentCatalogService.aggregate()` 仍是唯一合并 owner；本服务只做 chat picker 投影
- `projectCandidates()` 让已有 catalog owner 在已经拿到 runtime/project snapshot 后复用同一投影逻辑，避免为了 `@agent` picker 重复 I/O 或把合并规则复制到 composer
- 输出只保留 `subagentVisible` 的条目，即 `subagent` / `all` 且非 hidden
- `all` agent 排在 `subagent` 前，随后按 agent id 稳定排序
- `loadFileAgents()` 是可选 seam；当前聊天入口先接 runtime + project config，后续若要把 Markdown file truth 也拉进 composer，可以通过这个 seam 扩展而不改 picker 协议

## 边界

- 不渲染菜单，也不解析 `@` 查询
- 不读取 settings UI 的内部状态
- 不把候选转换成 request part；它只产出 composer 候选，发送闭环仍通过 `SurfaceInvocationIntent.mentions`
