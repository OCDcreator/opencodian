# Vault Index Service
> 2026-09-21 (advantage-parity R-E4)：VaultRetrievalSettingsSlice 新增 semanticRetrievalEnabled / semanticEmbeddingProvider / semanticEmbeddingModel 三字段（词面通道语义不变）。

> **源码**: `src/core/memory/VaultIndexService.ts`
> **状态**: [REVIEW]

## 概述

R-C1 整库检索的运行时协调：后台、增量、时间预算制的 vault 词面索引。存储位于 vault 内 `.opencodian/vault-index/`（manifest.json + shards/<sha1(path)>.json），点前缀目录对 Obsidian 文件列表/搜索不可见（验收 6）。索引只存 token + 行号；`select()` 时回读笔记正文、按 `vaultRetrievalMaxCharsPerNote` 截断并过 `memorySecretScan` 密钥守卫（命中的片段整体丢弃并计入 debug 日志）。所有 vault/磁盘交互走注入的 `VaultIndexFs` 端口（比照 `MemoryBackendService`；Obsidian 适配器在 `app.memory-runtime` 的 `VaultIndexFileSystem`）。

## 关键导出

| 导出 | 说明 |
|------|------|
| `VaultIndexService` | `attach()` 注入 fs + 设置；`onSettingsChanged()` 启停；`rebuildMissing(tickBudget)` 后台全量/增量；`select(query)` 查询；`invalidateAll()`；`dispose()` |
| `VaultIndexFs` | fs 端口：listMarkdownFiles / read / writeIndexFile / readIndexFile / deleteIndexFile / onVaultChanged |
| `VaultRetrievalSnippet` | 查询结果：path + 行号范围 + 截断后的正文文本 |
| `VAULT_MANIFEST_PATH` | `.opencodian/vault-index/manifest.json` |

## 边界与约束

- **关闭态零成本**：`vaultRetrievalEnabled === false` 时不订阅 vault 事件、不读写索引、查询直接返回空。
- **不阻塞 UI**：rebuild tick 默认 8ms 预算，超时让出主循环；rebuild 与变更 flush 串行在同一条 promise 链上。设置变更触发的 rebuild 为 fire-and-forget，绝不阻塞启动或设置页。
- **增量**：笔记 modify/create/delete/rename（rename = 旧删新建）防抖 2s 合并；mtime 相同跳过，mtime 变但 hash 相同仅推进 manifest mtime 不重写 shard；重启后从 shard 惰性水合（不重复全量哈希）。
- **fail-closed**：select 内部吞错返回空数组；索引未就绪即无结果；绝不部分注入或降级为全库注入。
- 体积保护：单 shard >512KB 裁剪为 `partial`；manifest 超 100MB 拒绝扩容。


| `VaultRetrievalSettingsSlice.pdfIndexEnabled` | R-C4：PDF 索引与笔记检索共用同一设置切片（composer 协调器据此覆盖两个检索面） |