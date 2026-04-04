# Title Generation System Prompt

> **源码**: `src/core/prompts/titleGeneration.ts`
> **状态**: [DRAFT]

## 概述

定义 AI 生成会话标题所使用的 system prompt 模板和 user prompt 构建函数。标题上限 50 字符，输出语言由插件 locale 设置驱动（`en` / `zh`）。`TitleGenerationService` 在创建临时会话时调用此模块生成 prompt，获取到 AI 响应后删除临时会话。

## 导入关系

上游: 无外部依赖（纯函数模块）
下游: `src/features/chat/services/TitleGenerationService.ts`

## 核心类型 / 接口

| 类型 | 说明 |
|------|------|
| `TitleGenerationLocale` | `'en' \| 'zh'` — 标题输出语言 |

## 核心逻辑

### Prompt 规则
System prompt 要求 AI 遵循 7 条规则：仅返回纯文本标题、句首强动词、≤50 字符、包含技术上下文、无引号/markdown/前缀/尾部标点、避免 "Help with" 等泛化短语、以指定语言输出。

### Locale 归一化
`normalizeTitleGenerationLocale()` 将任意字符串归一为 `'zh'` 或 `'en'`（默认）。

## 关键方法

| 方法 | 说明 |
|------|------|
| `buildTitleGenerationSystemPrompt(locale)` | 根据 locale 构建包含 7 条规则的 system prompt |
| `buildTitleGenerationPrompt(userMessage, locale)` | 将用户首条消息包装为 user prompt，要求生成短标题 |
| `normalizeTitleGenerationLocale(locale)` | 将 locale 归一化为 `'en'` 或 `'zh'` |

## 数据流

1. `TitleGenerationService` 读取当前 `settings.locale`
2. 调用 `buildTitleGenerationSystemPrompt(locale)` → system prompt
3. 调用 `buildTitleGenerationPrompt(userMessage, locale)` → user prompt
4. 发送到 AI 模型获取标题文本

## 与其他模块的交互

- **TitleGenerationService**: 唯一消费者，负责调用 prompt 构建函数和处理 AI 响应
- **Settings**: 通过 `settings.locale` 控制标题输出语言

## 配置项

- `settings.locale` — 驱动标题语言（`'zh'` → 中文，`'en'` → 英文）
- `settings.aiTitleModel` — 可覆盖标题生成使用的模型（格式 `provider/model`），为空时跟随当前会话模型

## 注意事项

- `TITLE_GENERATION_SYSTEM_PROMPT` 常量是默认英文 system prompt 的缓存副本，用于不需要动态 locale 的场景
- 标题长度硬编码为 ≤50 字符，无外部配置

## 待补充
- [ ] 补充实际 AI 生成标题的质量示例和边界情况处理
- [ ] 记录 `aiTitleModel` 设置如何影响此模块的选择逻辑
