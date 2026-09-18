# Vault Index FileSystem

> **源码**: `src/app/memory/VaultIndexFileSystem.ts`
> **状态**: [REVIEW]

## 概述

R-C1 整库检索的 vault 侧 fs 适配器（`app.memory-runtime` owner）：用 Obsidian vault API 实现 `core.memory` 的 `VaultIndexFs` 端口。笔记列表/读取只读（过滤非 `.md` 与点前缀目录）；索引写入被 `assertIndexPath` 硬性限制在 `.opencodian/vault-index/**`。vault 事件（modify/create/delete/rename）转发给索引服务做增量更新；rename 拆成 delete(old)+create(new) 两事件，shard 永不悬挂。`main.ts` 是唯一构造方。

## 关键导出

| 导出 | 说明 |
|------|------|
| `VaultIndexFileSystem` | 实现 `VaultIndexFs`；`onVaultChanged` 返回去订阅函数 |

## 边界与约束

- 唯一写动作在 `.opencodian/vault-index/**`（manifest + shards）；对 vault 笔记零写入。
- 点前缀目录对 Obsidian 文件列表/快速切换/搜索不可见，故索引不出现在用户 vault 的常规视图（验收 6）。
- 适配器之上的所有逻辑（分块、打分、防抖、时间预算）都在 `core/memory`，便于单测。
