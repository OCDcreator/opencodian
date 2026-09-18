# InlineCompletionPrompt

> **源码**: `src/features/inline-edit/InlineCompletionPrompt.ts`
> **状态**: [REVIEW]

## 概述

R-C3 的补全输出契约（纯函数）：请求窗口构建、建议校验、双语系统提示词。与行内编辑的 XML 协议**刻意隔离**——补全回复只允许纯文本续写，任何行内编辑标签出现即整条拒绝（§3.5）。

## 职责

- `buildInlineCompletionWindows(docText, cursor)`：prefix 截到 ≤4000 且落在整行边界（无边界可切的单行硬切）；suffix 硬切 ≤1000；空文档 = 空窗口
- `inlineCompletionPrefixTail()`：取前文末尾 ≤200 字符，供重复检测与接受前一致性校验（§4.2）
- `validateCompletion({prefixTail,text,maxChars})`：先按 `maxChars` **截断**（硬上限，验收 5）→ `empty`（纯空白拒绝）→ `protocol-tag`（`<replacement>`/`<insertion>`/`<im`/`<clarify>`/`<editor_*`/`<attached_context>` 及闭合标签，大小写不敏感）→ `prefix-duplicate`（建议开头与前文结尾的最长重叠 > 短侧一半即「复读机」，拒绝）；拒绝静默不 Notice
- `buildInlineCompletionSystemPrompt(locale, maxChars)`：续写专用系统提示词，**不含**任何行内编辑 XML 标签体系

## 依赖

- `../../i18n`、`../../core/agents/backend/AgentInlineCompletionCapability`（窗口常量）

## 维护约束

- 校验规则改动必须同步 `InlineCompletionPrompt.test.ts`（§8.1 R-C3 两项为最低集合：长度上限、前缀不重复）
- 禁止标签清单以行内编辑协议的实际标签名为准，两边不要各自漂移
- `prefix-duplicate` 阈值（重叠 > 短侧一半）是设计定案，调整需回到设计文档
