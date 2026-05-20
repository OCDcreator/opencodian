# ConversationMetadataCache

> **源码**: `src/core/storage/ConversationMetadataCache.ts`
> **状态**: [REVIEW]

## 概述

`ConversationMetadataCache` 是 `StorageService` 内部使用的会话元数据 sidecar owner。它的目标很单一：

- 把历史列表真正需要的轻量字段写到 `.opencodian/session-metas/{id}.json`
- 冷启动时优先读取 sidecar，而不是回退解析整份 `sessions/{id}.json`
- sidecar 缺失或损坏时，安全回退到完整 session JSON，并补回新的 sidecar
- 顺手维护最近一次列表扫描的结构化 diagnostics，供 `main.ts` 的 startup analysis 使用

它不是对外暴露的“第二套存储层”；完整会话数据的真值仍然是 `.opencodian/sessions/{id}.json`。

## 对外 API

```typescript
class ConversationMetadataCache {
  getMetadataDirectoryPath(): string;
  getMetadataFileCount(): Promise<number>;
  loadConversationMeta(
    id: string,
    sessionPath: string,
    diagnostics?: MutableConversationListDiagnostics,
  ): Promise<ConversationMeta | null>;
  writeConversationMeta(meta: ConversationMeta, source: string): Promise<boolean>;
  removeConversationMeta(id: string): Promise<void>;
}
```

同时导出：

- `buildConversationMetaFromStoredRecord(...)`
- `cloneConversationListDiagnostics(...)`
- `ConversationListDiagnostics`
- `MutableConversationListDiagnostics`

## 核心逻辑

### Sidecar 布局

每条会话 metadata sidecar 结构如下：

```json
{
  "schemaVersion": 1,
  "updatedAt": 1710000000000,
  "data": {
    "id": "conv-1",
    "title": "Example",
    "createdAt": 1710000000000,
    "updatedAt": 1710000001000,
    "messageCount": 12,
    "openCodeSessionId": "session-1",
    "backendSessionId": "session-1"
  }
}
```

`data` 里只保留历史列表必需字段，不复制完整 `messages`。Phase 0/1 multi-backend 迁移后，sidecar 会同时保留 `openCodeSessionId` 兼容字段和通用 `backendSessionId` / `backendAgentId`；从旧完整 session JSON fallback 时，缺失的 `backendSessionId` 会由 `openCodeSessionId` 或 legacy `acpSessionId` 回填。

### 读取路径

`loadConversationMeta()` 的顺序是：

1. 先读 `.opencodian/session-metas/{id}.json`
2. sidecar 有效时直接返回
3. sidecar 缺失/损坏时，再读完整 `sessionPath`
4. 从完整 JSON 提取轻量 metadata
5. 异步回填新的 sidecar

这样第一次升级后的冷启动仍可能回退，但之后的冷启动会越来越多命中 sidecar。

### Diagnostics

当 `StorageService.listConversations()` 传入 `MutableConversationListDiagnostics` 时，这个 owner 会持续更新：

- `metadataHitCount`
- `fullSessionFallbackCount`
- `metadataBackfillScheduledCount`
- `totalFallbackBytes`
- `slowestFallbacks`
- `largestFallbackSessions`

`main.ts` 会把这些统计拼进 startup perf 的自动诊断文案里。

## 注意事项

- sidecar 是性能缓存，不是唯一真值；不能因为 sidecar 失败就让历史列表彻底不可用。
- sidecar 写入失败时会尽量删除可能已过期的旧 sidecar，避免未来读到陈旧 metadata。
- 当前只负责单条会话 metadata sidecar，不负责完整会话正文、设置文件或背景图资产。
