# SkillContentExpander

> **源码**: `src/core/opencode/SkillContentExpander.ts`
> **状态**: [REVIEW]

## 概述

`SkillContentExpander` 负责在用户发送消息前，将文本中的 `/skillName` 引用展开为对应的 skill 内容块。

当用户输入包含 `/skill` 的消息时（例如 `/analyze this file`），该服务会：
1. 先通过 `sdk.app.skills()` 加载完整 skill 目录
2. 用已知 skill 名称匹配文本中的 `/token`，采用最长优先策略匹配含 `/` 的名称（如 `x-reader/video`）
3. 将匹配到的 skill 内容包装在 `<skill_content>` XML 标签中
4. 返回结构化 `syntheticParts`（含 text 和 skillName）与已展开名称列表

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

export interface SkillSyntheticPart {
  text: string;
  skillName: string;
}

export interface SkillExpansionResult {
  readonly syntheticParts: SkillSyntheticPart[];
  readonly expandedSkillNames: string[];
}

export class SkillContentExpander {
  constructor(host: SkillContentExpanderHost);
  expand(content: string): Promise<SkillExpansionResult>;
}
```

## 使用方式

由 `MessageSendPreparationService` 在 `prepareMessageSend` 中调用。展开后的 skill 内容作为 `syntheticParts`（含 `text` 和 `skillName`）传递给 `buildStructuredPromptSendPayload`，每个 part 携带 `{ kind: 'skill-expansion', skillName }` metadata，以便下游渲染层识别并隐藏 skill 合成内容。

## 缓存与匹配策略

- Skill 目录通过 `sdk.app.skills()` 获取，结果缓存 60 秒，避免每次发送消息都请求服务器
- 采用 catalog-first 匹配：先加载完整目录，再用已知名称反向匹配文本中的 token
- 支持含 `/` 的 skill 路径名称（如 `x-reader/video`），使用最长优先匹配避免短名称误匹配
- XML 输出格式为 `<skill_content name="...">`，不再使用旧的 `<skill name="..." description="...">` 格式
