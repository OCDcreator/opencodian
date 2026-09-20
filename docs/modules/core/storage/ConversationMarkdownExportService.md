# ConversationMarkdownExportService

> **源码**: `src/core/storage/ConversationMarkdownExportService.ts`
> **状态**: [REVIEW]

## 概述

R-D1（advantage-parity）对话导出的 vault 编排半边（纯序列化见 `ConversationMarkdownExporter.ts`）：手动导出的目录/命名冲突处理、内容寻址图片附件落盘、自动导出（默认关）的防抖调度、用户编辑检测与插件私有状态文件。

## 对外 API

```typescript
interface ConversationExportVault { /* vault 子集：create/modify/createFolder/
  getAbstractFileByPath/getAvailablePathForAttachments/writeBinary/exists/trash/getFileMtime */ }
interface ConversationExportAdapter { read; write; exists; }

class ConversationMarkdownExportService {
  exportConversation(conversation): Promise<{ path }>;  // 手动导出：纯新增文件
  scheduleAutoExport(conversation): void;              // 自动导出：防抖 + 条件门
  dispose(): void;
}
```

## 不变量

- **手动导出纯新增**：`vault.create`（让 Obsidian 索引新笔记）；同名 `-2/-3…` 追加序号（上限 100），绝不覆盖；不触碰会话存储。
- **失败不留半个文件**：笔记写入失败 → 本次导出写入的附件 best-effort `vault.trash` 回收后原样抛错。
- **自动导出只刷新自己创建的笔记**：路径/时间戳记在 `.opencodian/conversation-export-state.json`；刷新前比对 mtime（1.5s 宽限），被用户改过即停用该会话自动导出 + 回调提示；笔记被删则重建。调度在设置关闭或 `lastResponseAt` 未前进时零成本返回。
- **附件内容寻址去重**：消息 id + 序号 + 内容哈希命名，重复导出复用；放置经 `getAvailablePathForAttachments`，越界 fail-closed。
- **locale 纪律**：core 不 import i18n；用户可见提示经 main.ts 调用层本地化（返回值 + `onUserEditedAutoExport` 回调）。

## 关联模块

- `src/core/storage/ConversationMarkdownExporter.ts`：纯序列化（frontmatter/正文/占位符）与文件名模板渲染。
- `src/main.ts`：组合根——vault/adapter 缝、自动导出钩子（`saveConversation` 后）、命令、Notice。
- `src/core/storage/ImageAssetStorage.ts`：附件放置规则的同源先例（共享 `shared/vault.ts` 清洗/安全路径函数）。
