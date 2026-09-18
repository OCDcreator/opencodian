# Vault Retrieval Composer Coordinator

> **源码**: `src/features/chat/services/VaultRetrievalComposerCoordinator.ts`
> **状态**: [REVIEW]

## 概述

R-C1 整库检索的“可见、可取消”半边（`feature.chat-services` owner）。`vaultRetrievalEnabled` 开启时：观察 composer 文本变化（600ms 防抖）→ 调 `VaultIndexService.select()` → 把命中片段构造为 `origin: 'vault-retrieval'`、`kind: 'selection'`（携带 lineRange + textSnapshot）的草稿上下文条目，经 `ComposerSendContextPort.mergeVaultRetrievalDraftItems` 原子替换托管 chips（手动附加的条目不动）。chips 复用既有 composer 上下文 UI 渲染、逐条 ✕ 取消，并经既有 `contextItems` 通道进入请求；发送后的乐观用户消息经 `buildContextAttachment` 携带 origin 徽标。

## 关键导出

| 导出 | 说明 |
|------|------|
| `VaultRetrievalComposerCoordinator` | `onComposerInputChanged(value)` / `onComposerSubmitted()` / `dispose()` |
| `VaultRetrievalComposerPort` | 对 `ComposerSendContextPort` 的窄化端口 |
| `VaultRetrievalQueryPort` | 对 `VaultIndexService.select` 的窄化端口 |

## 边界与约束

- **关闭态结构性零成本**：设置关闭或索引服务缺席时不发 select、不改草稿；发现遗留托管 chips 时一次性清理。发送载荷与无本功能的基线逐字节一致（契约测试锁定）。
- **取消粘滞**：用户 ✕ 掉的片段 key 在当前草稿周期内不会被刷新悄悄加回；提交边界（`onComposerSubmitted`）重置，下一轮重新检索。
- **刷新串行**：序号守卫丢弃过期刷新；检索抛错时保留现有 chips（可见可删），不注入新内容。
- 双重上限：服务端 topK 之外，协调器对结果再做一次 `vaultRetrievalTopK` 防御性裁剪。
- `origin` 只是客户端元数据：不进入请求 wire 格式（`buildObsidianContextTag` 不含 origin）。
