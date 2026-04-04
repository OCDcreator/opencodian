# Title Generation System Prompt

> **源码**: `src/core/prompts/titleGeneration.ts`
> **状态**: [REVIEW]

## 概述

`titleGeneration.ts` 是一个纯函数模块，专门给会话标题生成链路构造 prompt。它不直接和 OpenCode 服务交互，也不做响应解析；这些工作在 `TitleGenerationService` 中完成。

模块负责 3 件事：

- 归一化标题生成语言
- 构造 system prompt
- 构造 user prompt

## 导入关系

```text
上游: 无
下游: src/features/chat/services/TitleGenerationService.ts
```

## 核心类型 / 接口

```typescript
export type TitleGenerationLocale = 'en' | 'zh';

export function normalizeTitleGenerationLocale(locale: string): TitleGenerationLocale;
export function buildTitleGenerationSystemPrompt(locale: string): string;
export function buildTitleGenerationPrompt(userMessage: string, locale: string): string;
export const TITLE_GENERATION_SYSTEM_PROMPT: string;
```

## 核心逻辑

### 语言归一化

`normalizeTitleGenerationLocale(locale)` 的规则非常简单：

- 输入 `zh` -> 返回 `zh`
- 其他任意值 -> 返回 `en`

也就是说，源码只显式支持英文和简体中文两种输出语言。

### system prompt 规则

`buildTitleGenerationSystemPrompt(locale)` 会把语言标签映射成：

- `en` -> `English`
- `zh` -> `Simplified Chinese`

再生成一段固定规则文本，要求模型：

1. 只返回原始标题文本
2. 尽量使用 sentence case，并在自然时以动词开头
3. 长度不超过 50 个字符
4. 尽量包含主要技术上下文
5. 不要引号、markdown、前缀或结尾标点
6. 避免通用短语，例如 “Help with”
7. 以指定语言输出

### user prompt 模板

`buildTitleGenerationPrompt(userMessage, locale)` 只负责把调用方提供的首条用户消息放进模板：

```text
First user message:
"""
{userMessage}
"""

Generate the best short conversation title in {Language}.
```

它不会自己裁剪消息长度，截断是在 `TitleGenerationService.truncateText()` 里完成的。

### 预构建常量

`TITLE_GENERATION_SYSTEM_PROMPT` 等价于：

```typescript
buildTitleGenerationSystemPrompt('en')
```

当前仓库内没有检索到这个常量的实际消费方；`TitleGenerationService` 会动态按 locale 调用构造函数。

## 与其他模块的交互

- `src/features/chat/services/TitleGenerationService.ts` 在每次生成标题前调用 `normalizeTitleGenerationLocale()`、`buildTitleGenerationPrompt()` 和 `buildTitleGenerationSystemPrompt()`。
- 响应解析、长度二次裁剪和临时 session 生命周期都不在这个模块里。

## 注意事项

- 这是纯 prompt 模块，改动规则文字会直接影响 AI 标题风格，但不会自动更新任何解析逻辑。
- 由于 locale 只有 `zh` 特判，新增更多语言时必须同时扩展 `TitleGenerationLocale` 和 `TITLE_LANGUAGE_LABELS`。
