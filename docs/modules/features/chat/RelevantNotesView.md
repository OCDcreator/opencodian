# RelevantNotesView

> **源码**: `src/features/chat/RelevantNotesView.ts`
> **状态**: [REVIEW]

## 概述

R-E3（advantage-parity）相关笔记侧栏视图（`opencodian-relevant-notes`）：对活动笔记给出「链接图谱 + 整库检索」双通道相关笔记列表。继承 Copilot 的 Relevant Notes 入口，本地实现、零云依赖。

## 对外 API

```typescript
class RelevantNotesView extends ItemView {
  getViewType(): 'opencodian-relevant-notes';
  // onOpen 注册 active-leaf-change / metadataCache.resolved（500ms 防抖刷新）
  // onClose 注销事件与定时器
}
```

## 不变量

- **图谱通道**：读 `metadataCache.resolvedLinks`（与反链面板同源同结论）；活动笔记与自环不出现；按链接数排序、平分按路径。
- **检索通道**：复用 R-C1 `VaultIndexService.select`（查询=活动笔记标题+正文前 2000 字符清洗），**绝不建第二套索引**；按笔记去重取最高分 Top8。
- **诚实降级**：`vaultRetrievalEnabled` 关 → 明示「未启用」文案；无活动 markdown → 空态；检索失败 → 可见错误行；并发刷新按序号丢弃过期结果。
- **附加动作**：经 main.ts 共享 `ContextAttachmentBuilder` 通道（`attachVaultFileToActiveChatContext`），与 `+` picker 产出逐字段一致的上下文条目。
- **纯逻辑下沉**：分组/排序/查询构造在 `RelevantNotesModel.ts`（无 Obsidian 依赖）。

## 关联模块

- `src/features/chat/RelevantNotesModel.ts`：纯计算。
- `src/main.ts`：视图注册、`open-relevant-notes` 命令、`activateRelevantNotesView`、`attachVaultFileToActiveChatContext`。
- `src/core/memory/VaultIndexService.ts`：检索通道数据源（R-C1）。
