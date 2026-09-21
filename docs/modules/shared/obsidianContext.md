# Obsidian Context Helpers
> 2026-09-21 (advantage-parity R-E4)：buildContextAttachment 透传 retrievalChannel。
> 2026-09-21 (advantage-parity R-E5)：TEXT_MIME_BY_EXTENSION 新增 base → text/plain（Bases 文件按纯文本进上下文）。
> 2026-09-21 (advantage-parity R-E1)：新增 buildUrlContextTag/Body（ok 载荷带标题/最终 URL/截断标记，或诚实失败头）；buildContextAttachment 透传 url 元数据（不落正文）。

> **源码**: `src/shared/obsidianContext.ts`
> **状态**: [REVIEW]

## 概述

R-C4：`<obsidian_context>` 格式扩展到 PDF 条目——`buildPdfContextTag` 以 `kind="pdf_document|pdf_selection"` + 可选 `page`/`selection`/`pages` 属性渲染，正文由 `buildPdfContextBody` 从结构化 `pdfPages`（页标题 + 页文本）或 `pdfSelection` 生成，PDF 条目永不写 `textSnapshot`。`parseObsidianContextTag` 白名单加入两种 PDF kind；`buildContextAttachment` 持久化 `pdf` 元数据与 ≤200 字符截断的 `pdfSelection`（`PDF_SELECTION_EXCERPT_MAX_CHARS`），从不持久化 `pdfPages`。


2026-09-18（R-C1）：`buildContextAttachment` 透传可选 `origin`（条目存在时）；`buildObsidianContextTag` 不受影响——origin 永不进入请求 wire 格式，旧条目的附件序列化逐字节不变。

Obsidian 显式上下文（explicit context）工具函数。处理 `<obsidian_context>` 标签的构建和解析、上下文附件对象与标签格式之间的转换、附件去重、文件路径 MIME 类型解析和行范围格式化。用于在 AI 聊天消息中编码和还原编辑器上下文信息。

## 导入关系
上游: `./contextPath`, `../core/types/chat` (MessageContextAttachment, PromptContextItem, PromptContextKind, PromptContextLineRange)
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
- `TEXT_MIME_BY_EXTENSION` — 文本文件（css, html, java, js, json, jsonc, jsx, md, mjs, py, sh, sql, text, toml, ts, tsx, txt, xml, yaml, yml 等 20 种）
- `CONTEXT_MIME_BY_EXTENSION` — 全类型（含图片、文档、压缩包等 80+ 种）

`resolveContextMimeFromPath(path)` → 扩展名 → MIME 类型，默认 `application/octet-stream`

### 行范围格式化

`formatLineRange(range)`:
- 单行：`"10"`
- 多行：`"10-25"`

`parseLineRange(lines)` 逆解析。

### file URL 构建

`toFileContextUrl(path, range?)` 会委托 `contextPath.pathToContextFileUrl()` 构建 `file:///` URL，再追加 `start` / `end` 行范围参数。这样在 macOS/Linux 测试环境处理 Windows vault path（例如 `C:\vault`）时，也会稳定输出 `file:///C:/vault/...`，不会被当前宿主平台误解析成仓库内的相对路径。

### 跨后端上下文投递（claude/codex seam）

`buildContextItemPromptBlock(item)` 是唯一的条目→文本序列化分发：PDF 条目走 `buildPdfContextTag`，其余走 `buildObsidianContextTag`。`OpenCodeContextPartSerializer`（请求 part）与 claude/codex 适配器（prompt 追加块）都经由它，保证同一条目在四个后端渲染一致。

`extractPromptContextItems(options)` 从发送 options 袋读取 `contextItems`，丢弃畸形条目（惰性：无键/空数组返回空）。`appendObsidianContextBlocks(content, options)` 把条目块以 `\n\n` 追加到 prompt 文本——仅 claude/codex 使用；OpenCode/Pi 走请求 part 路径，不得调用（防重复投递）。排序约束：每轮的上下文块必须严格位于每 epoch 的 memory/tooling 注入前缀与用户文本之后，保证缓存稳定前缀不被逐轮内容移动。

### 文件路径判断

- `isHiddenContextPath(path)` — 检查是否包含 `.` 开头的目录段
- `isEligibleContextFilePath(path)` — 非隐藏且有扩展名

## 关键方法

| 方法 | 说明 |
|------|------|
| `buildObsidianContextTag(item)` | 构建 XML 标签字符串 |
| `buildPdfContextTag(item)` | 构建 PDF 条目的 XML 标签（正文来自 pdfPages/pdfSelection） |
| `buildContextItemPromptBlock(item)` | 单条目 → `<obsidian_context>` 文本（kind 分发，跨后端唯一序列化点） |
| `extractPromptContextItems(options)` | 从 options 袋读取 `contextItems`（丢弃畸形条目） |
| `appendObsidianContextBlocks(content, options)` | 上下文块追加到 prompt 文本（仅 claude/codex seam） |
| `parseObsidianContextTag(text)` | 解析 XML 标签为附件对象 |
| `buildContextAttachment(item)` | PromptContextItem → MessageContextAttachment |
| `dedupeContextAttachments(attachments)` | 按 kind/path/line-range 去重上下文附件 |
| `resolveContextMimeFromPath(path)` | 路径 → MIME 类型 |
| `resolveTextMimeFromPath(path)` | 路径 → 文本 MIME（非文本回退 text/plain） |
| `isTextLikeMime(mime)` | 检查是否为文本类 MIME |
| `formatLineRange(range)` | 行范围 → 字符串 |
| `formatContextLabel(path, range?)` | `basename:lines` 格式标签 |
| `toFileContextUrl(path, range?)` | 构建 `file:///` URL（含 start/end 参数） |
| `parseLineRangeFromFileUrl(url)` | 从 file URL 解析行范围 |
| `getContextPathExtension(path)` | 从路径中提取文件扩展名 |
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
- `dedupeContextAttachments()` 使用 `kind:path:startLine:endLine` 作为稳定 key；不会比较 `label`、`mime` 或 `textSnapshot`，以避免同一上下文来源因展示字段变化而重复
- MIME 检测仅基于扩展名，不检查文件内容
- `toFileContextUrl()` 的底层 file URL path 规范化由 `contextPath.ts` 负责；如果要调整 Windows/POSIX 路径兼容行为，应优先扩展该模块


> 2026-09-18 (R-A7)：`parseObsidianContextTag` 接受 `kind="folder"`（目录条目的 `<obsidian_context>` 标签可无损往返）。

## 维护约束
