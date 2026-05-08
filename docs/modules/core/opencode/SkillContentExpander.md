# SkillContentExpander

> **源码**: `src/core/opencode/SkillContentExpander.ts`
> **状态**: [REVIEW]

## 概述

`SkillContentExpander` 负责在用户发送消息前，将文本中的 `/skillName` 引用展开为对应的 skill 内容块。

当用户输入包含 `/skill` 的消息时（例如 `/analyze this file`），该服务会：
1. 从文本中提取所有 `/name` token
2. 查询 OpenCode skill 目录，只匹配已知的 skill
3. 将匹配到的 skill 内容包装在 `<skill>` XML 标签中
4. 作为 synthetic text part 附加到 prompt 中发送给 AI

## 设计目的

- 让用户可以在消息中引用 skill，而不需要直接执行命令
- AI 可以看到 skill 的完整内容，并据此工作
- UI 仍显示简洁的 `/skillName`，发送内容包含展开后的内容

## 公开接口

```typescript
export interface SkillRecord {
  name: string;
  description: string;
  location: string;
  content: string;
}

export interface SkillExpansionResult {
  readonly syntheticBlocks: string[];
  readonly expandedSkillNames: string[];
}

export class SkillContentExpander {
  constructor(host: SkillContentExpanderHost);
  expand(content: string): Promise<SkillExpansionResult>;
}
```

## 使用方式

由 `MessageSendPreparationService` 在 `prepareMessageSend` 中调用。展开后的 skill 内容作为 `syntheticTextParts` 传递给 `buildStructuredPromptSendPayload`。

## 缓存策略

Skill 目录通过 `sdk.app.skills()` 获取，结果缓存 60 秒，避免每次发送消息都请求服务器。
