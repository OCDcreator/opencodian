# Obsidian Context Helpers

> **源码**: `src/shared/obsidianContext.ts`
> **状态**: [DRAFT]

## 概述

Obsidian 显式上下文（explicit context）工具函数。处理 `<obsidian_context>` 标签的构建和解析、上下文附件对象与标签格式之间的转换、文件路径 MIME 类型解析和行范围格式化。用于在 AI 聊天消息中编码和还原编辑器上下文信息。

## 导入关系
上游: `url` (pathToFileURL), `../core/types/chat` (MessageContextAttachment, PromptContextItem, PromptContextKind, PromptContextLineRange)
下游: `OpenCodeService`, `OpenCodianView` (上下文附件处理)

## 核心类型 / 接口

使用 `../core/types/chat` 中定义的类型：
- `PromptContextKind` — `'current_note' | 'selection' | 'file'`
- `PromptContextLineRange` — `{ startLine: number; endLine: number }`
- `PromptContextItem` — `{ kind, path, label, mime, lineRange?, textSnapshot? }`
- `MessageContextAttachment` — 持久化的上下文附件结构

## 核心逻辑

### Obsidian Context 标签格式

```xml
<obsidian_context kind="selection" path="src/main.ts" lines="10-25">
  文本快照内容...
</obsidian_context>
```

属性值通过 HTML 实体编码（`&`, `"`, `<`, `>`）。

### 标签构建

`buildObsidianContextTag(item)` → `<obsidian_context kind="..." path="..." lines="...">textSnapshot</obsidian_context>`

### 标签解析

`parseObsidianContextTag(text)` → 使用正则 `OBSIDIAN_CONTEXT_PATTERN` 提取属性 → 解码 HTML 实体 → 构建 `MessageContextAttachment`

### MIME 类型解析

两层 MIME 映射表：
- `TEXT_MIME_BY_EXTENSION` — 文本文件（ts, js, py, md 等 18 种）
- `CONTEXT_MIME_BY_EXTENSION` — 全类型（含图片、文档、压缩包等 80+ 种）

`resolveContextMimeFromPath(path)` → 扩展名 → MIME 类型，默认 `application/octet-stream`

### 行范围格式化

`formatLineRange(range)`:
- 单行：`"10"`
- 多行：`"10-25"`

`parseLineRange(lines)` 逆解析。

### 文件路径判断

- `isHiddenContextPath(path)` — 检查是否包含 `.` 开头的目录段
- `isEligibleContextFilePath(path)` — 非隐藏且有扩展名

## 关键方法

| 方法 | 说明 |
|------|------|
| `buildObsidianContextTag(item)` | 构建 XML 标签字符串 |
| `parseObsidianContextTag(text)` | 解析 XML 标签为附件对象 |
| `buildContextAttachment(item)` | PromptContextItem → MessageContextAttachment |
| `resolveContextMimeFromPath(path)` | 路径 → MIME 类型 |
| `resolveTextMimeFromPath(path)` | 路径 → 文本 MIME（非文本回退 text/plain） |
| `isTextLikeMime(mime)` | 检查是否为文本类 MIME |
| `formatLineRange(range)` | 行范围 → 字符串 |
| `formatContextLabel(path, range?)` | `basename:lines` 格式标签 |
| `toFileContextUrl(path, range?)` | 构建 `file:///` URL（含 start/end 参数） |
| `parseLineRangeFromFileUrl(url)` | 从 file URL 解析行范围 |
| `isHiddenContextPath(path)` | 检查隐藏路径 |
| `isEligibleContextFilePath(path)` | 检查可用的上下文文件路径 |

## 数据流

```
发送消息时（构建上下文）:
  PromptContextItem → buildObsidianContextTag(item)
    → <obsidian_context kind="selection" path="src/main.ts" lines="10-25">...</obsidian_context>
    → 附加到用户消息文本

接收消息时（解析上下文）:
  AI 回复中的 <obsidian_context> 标签
  → parseObsidianContextTag(text)
    → MessageContextAttachment { kind, path, label, mime, lineRange, textSnapshot }

显示上下文附件:
  → formatContextLabel("src/main.ts", { startLine: 10, endLine: 25 })
    → "main.ts:10-25"
```

## 与其他模块的交互

- **OpenCodeService**: 使用 `buildObsidianContextTag()` 构建发送给 AI 的上下文
- **OpenCodianView**: 使用 `parseObsidianContextTag()` 解析消息中的上下文标签，`formatContextLabel()` 显示标签
- **ContextDetailModal**: 显示上下文附件详情

## 配置项

无

## 注意事项

- HTML 属性编码/解码是双向对称的（`escapeHtmlAttribute` / `decodeHtmlAttribute`）
- `textSnapshot` 在 `buildContextAttachment()` 中仅对 `selection` 类型保留
- MIME 检测仅基于扩展名，不检查文件内容
- `toFileContextUrl()` 使用 Node.js `pathToFileURL`，在浏览器环境可能需要 polyfill

## 待补充
- [ ] 上下文标签嵌套和转义的边界情况
- [ ] 大文件上下文的截断策略
