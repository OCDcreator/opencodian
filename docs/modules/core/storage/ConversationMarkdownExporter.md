# ConversationMarkdownExporter

> **源码**: `src/core/storage/ConversationMarkdownExporter.ts`
> **状态**: [REVIEW]

## 概述

`ConversationMarkdownExporter` 是 R-D1（advantage-parity）对话导出的**纯序列化半边**（`core.storage`）：把存储层保存的会话（`Conversation.messages` 原始 markdown，非渲染 HTML）投影为笔记文档（frontmatter 元数据 + 分轮正文 + 折叠工具调用 + 图片占位符）。无 vault 访问、无副作用、无 i18n；vault 编排见 `ConversationMarkdownExportService.ts`。对标 Copilot 的 save-chat-to-note 能力，本地实现、零云依赖。

## 对外 API

```typescript
// 纯序列化（可独立测试）
buildConversationMarkdown(conversation, options?): {
  markdown: string;
  pendingImages: Array<ImageAttachment & { messageId; index }>;
  frontmatterModel: string | null;
};

// 文件名模板渲染（服务层消费）
renderFileName(conversation, template): string;
shortConversationId(conversationId): string;

// 设置归一化（定义在 core/types/settings.ts，load 边界合流消费）
normalizeConversationExportSettings(raw): ConversationExportSettings;
normalizeConversationExportDirectory(raw): string | null;
```

## 不变量

- **纯函数**：无 vault 访问、无时钟依赖注入点（`exportedAt` 可注入）；图片以 `{{opencodian:image:<messageId>:<index>}}` 占位符输出，由服务层在附件落盘后解析为 `![[…]]`。
- **locale 纪律**：导出笔记内固定英文标签（"User"/"Assistant"/callout 标题）是有意的文档产物稳定性；用户可见提示全部在 main.ts 调用层本地化。
- **文件名模板**：`{$date}/{$time}/{$topic}/{$backend}/{$id}` 占位符（未知占位符原样保留）；清洗复用 `shared/vault.ts` 的 `sanitizeVaultFileBaseName`（与 R-C2 附件名同一套边界规则），空白折叠为 `_`。
- **截断**：工具调用 input 500 字符 / result 1000 字符，截断处标注总长（诚实截断）。

## 关联模块

- `src/core/storage/ConversationMarkdownExportService.ts`：vault 编排（目录/冲突/附件落盘/自动导出）。
- `src/core/types/settings.ts`：`ConversationExportSettings` 类型、默认值与归一化器（load 边界在 `settingsLoadNormalization.ts` 合流）。
- `src/shared/vault.ts`：`sanitizeVaultFileBaseName` / `isSafeVaultRelativePath`（与 `ImageAssetStorage` 共用，后者保留历史名再导出）。
