# R-E4 语义检索增强层设计（advantage-parity）

- 状态：**已实施**（2026-09-21，见文末证据）
- 需求来源：`advantage-parity.md` R-E4 + §8 Q3（「先词面」裁决不被推翻——本层是可选增强，默认关）
- 硬约束回顾：不建第二套索引（词面仍走 R-C1）、零包体积新增（不引入向量库）、不引入第三方云服务、无可用 embedding 端点时如实降级

## 1. 目标与非目标

**目标**：在 R-C1 词面检索之上加可选 embedding 通道；开启后检索注入 = 词面 ∪ 语义 TopK 合并去重，每条命中如实标注来源通道。

**非目标**：不替代 R-C1；不做 chunk 级向量（见 §3 规模测算）；不做混合重排（rerank）——两通道各自排序后按「词面优先、语义补位」去重合并。

## 2. Embedding 端点选型（Q3 裁决）

| 候选 | 结论 | 理由 |
|---|---|---|
| OpenCode 服务端 embedding | **放弃** | OpenCode 服务器无公开 embedding 端点（SDK v2 无此面）；为它造进程内模型不可行 |
| 已配置模型供应商的 OpenAI 兼容 `/v1/embeddings` | **采用** | 插件已有自定义供应商配置（`providers[]`：baseUrl + apiKey）与 Pi 供应商密钥；用户显式配置哪个供应商+模型就走哪个——与「已配置的模型供应商 embedding 端点」需求原文一致 |
| 本地模型（transformers.js 等） | 放弃 | 包体积新增（违反零新增约束）且首跑下载模型 |

**端点契约**：`POST {baseUrl}/embeddings`（OpenAI 兼容：`{ model, input: string[] }` → `{ data: [{ embedding: number[] }] }`）。baseUrl 取所选供应商的 `baseUrl`（无则不可用）。**不做 SSRF 回环拦截**：与 R-E1 不同，这里的目标是用户自己配置的供应商端点（本地 Ollama 是合法目标）。

## 3. 存储与规模测算（万篇级内存可控性）

- **粒度：笔记级向量**（一条 = 整篇笔记清洗文本的前 4000 字符 + 标题）。不做 chunk 级：10k 篇 × ~5 chunk = 50k 向量，1536 维 float32 = 300MB，不可控；笔记级 10k × 1536 × 4B = **61MB**（1536 维上限）/ 384 维小模型 = **15MB**——「万篇级内存可控」以笔记级成立。
- **落盘**：`.opencodian/vault-embeddings/`（插件私有目录），分片 JSON：向量以 base64(Float32Array) 编码（比十进制 JSON 小 ~55%），每分片 ≤ 256 条；manifest 记 `{path, contentHash, dim, shard}`。内容寻址：`contentHash`（djb2-64 + 长度，与既有哈希惯例同族）变更才重嵌入。
- **增量**：启动/开启时扫描 markdown（R-C1 的 `isIndexablePath` 同规则），新增/变更 → 入队嵌入（串行 + 150ms 间隔，避免打爆供应商限速）；删除 → 移除向量；未变更 → 跳过。重建 = 清目录重扫。
- **查询**：query 向量与全部笔记向量做平铺余弦（Float32Array 点积，10k × 1536 ≈ 15M 乘加，毫秒级），TopK（复用 `vaultRetrievalTopK`）。

## 4. 合并注入与通道标注

`VaultRetrievalComposerCoordinator.refresh` 扩展：词面 snippets + 语义 hits（各自 TopK）→ `PromptContextItem` 合并，key = `path`（语义命中无行区间，词面命中保留行区间）去重（词面优先保留原文区间）。通道标注：`MessageContextAttachment.retrievalChannel?: 'lexical' | 'semantic'`，chip 徽标文案「检索·词面 / 检索·语义」（既有 vault-retrieval 徽标机制扩展）。

## 5. 诚实降级（不伪造）

以下任一情况：语义开关关、未配置供应商/模型、嵌入调用失败、向量索引空 → 该轮注入**只有词面**，且语义通道状态经一次性 Notice 如实告知（如「语义检索不可用：未配置 embedding 供应商」）；不静默、不假装有语义命中。索引构建进度经 Notice 报告（「语义索引：n/m 已嵌入」）。

## 6. 设置面

`semanticRetrievalEnabled`（默认 **false**）+ `semanticEmbeddingProvider`（供应商 id，取自 `settings.providers`）+ `semanticEmbeddingModel`（自由文本模型名）。UI 落在「会话 → 整库检索」块内（语义是其增强层）；zh/en 双语 + load 归一化。

## 7. 实施拆分

1. `src/core/memory/VaultEmbeddingIndexService.ts`（core.memory owner，邻 R-C1）：存储/增量/余弦查询 + 注入式嵌入客户端缝。
2. `OpenAiCompatibleEmbeddingClient`（同文件内部）：node:https POST（构建 external 同 R-E1 先例；供应商 apiKey 为 Bearer）。
3. 合并与标注：`VaultRetrievalComposerCoordinator` + `PromptContextItem/MessageContextAttachment.retrievalChannel` + chip 徽标。
4. 设置 + i18n + main.ts 组合（服务构造、索引扫描调度、降级 Notice）。
5. 单测：余弦/存储编解码/增量决策/合并去重与通道标注/降级路径（注入假嵌入客户端）。

## 8. 实测与证据（2026-09-21）

- 单测：`VaultEmbeddingIndexService.test.ts`（base64 Float32 往返、余弦排序、增量跳过/删除、降级原因枚举）+ `vaultRetrievalComposerSemantic.test.ts`（合并去重词面优先、通道标注、语义失败回退词面）+ 设置归一化。
- 实机：见 `advantage-parity.md` R-E4 落地证据节。
