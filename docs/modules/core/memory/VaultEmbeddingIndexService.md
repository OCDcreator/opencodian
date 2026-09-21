# VaultEmbeddingIndexService

> **源码**: `src/core/memory/VaultEmbeddingIndexService.ts`
> **状态**: [REVIEW]

## 概述

R-E4（advantage-parity）语义检索增强层：R-C1 词面索引之上的可选 embedding 通道。设计文档 `docs/requirements/advantage-parity-re4-design.md`（端点选型：放弃无公开面的 OpenCode 服务端、采用已配置供应商的 OpenAI 兼容 `/embeddings`；规模：**笔记级向量**——10k×1536 维 float32 ≈ 61MB 上界，「万篇级可控」据此成立，chunk 级被规模数学否决）。

## 对外 API

```typescript
class VaultEmbeddingIndexService {
  onSettingsChanged(watch): Promise<void>;      // 开启时挂 vault 事件 + 增量索引
  ensureIndexed(): Promise<number>;            // 内容哈希增量：跳过未变/删已删/150ms 串行节流
  query(text, options): Promise<{ hits, degradation }>;  // 平铺余弦 TopK；失败路径全部带原因
  dispose(): void;
  static scopeMatcher(excludedPaths): (p) => boolean;   // 复用 R-C1 isIndexablePath 规则
}
// 纯函数（测试导出）
encodeFloat32 / decodeFloat32 / cosineSimilarity / hashEmbeddingContent / buildEmbeddingText;
createOpenAiCompatibleEmbeddingClient({ baseUrl, apiKey, model }): EmbeddingClient;
```

## 不变量

- **默认完全休眠**：`semanticRetrievalEnabled` 关 → 客户端 null、无索引、无事件监听，行为与该特性存在前逐字节一致（§8 Q3「先词面」不推翻）。
- **存储**：`.opencodian/vault-embeddings/`（点前缀目录）；分片 ≤256 条、base64(Float32Array) 编码；manifest 内容寻址（哈希+长度）。
- **不做 SSRF 回环拦截**：目标是用户自己配置的供应商端点（本地 Ollama 合法），与 R-E1 的任意 URL 抓取语义不同——设计文档明示。
- **诚实降级**：未配置/索引空/嵌入失败 → `{ hits: [], degradation: <原因> }` + 一次性回调（应用层本地化 Notice），绝不伪造命中；语义通道异常不破坏词面流。
- **维度上限** 1536（超出拒收）；查询文本与笔记同走 `buildEmbeddingText` 清洗（frontmatter/代码块剔除、4000 字符上限）。

## 关联模块

- `src/app/memory/VaultEmbeddingFileSystem.ts`：vault 适配（只读笔记、写仅限 embeddings 目录、2s 防抖变更监听）。
- `src/features/chat/services/VaultRetrievalComposerCoordinator.ts`：合并注入（词面优先、语义补位、通道标注）。
- `src/core/memory/VaultIndexService.ts`：`VaultRetrievalSettingsSlice` 共享设置切片。
