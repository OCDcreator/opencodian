# ConversationSessionSettingsModal

> **源码**: `src/features/chat/ui/ConversationSessionSettingsModal.ts`
> **状态**: [REVIEW]

## 概述

`ConversationSessionSettingsModal` 是 per-conversation session settings 的 dedicated modal。它展示当前会话标题、global defaults hint，并允许用户为三项会话级设置输入覆盖值：

- `autoCompactionEnabled`
- `compactionReservedTokens`
- `chatFontSizePx`

modal 本身只负责 DOM、输入解析和同步校验；真正的会话保存与 runtime reapply 仍交给 `ConversationSessionSettingsCoordinator`。

## 公开接口

```typescript
export interface ConversationSessionSettingsModalDefaults {
  autoCompactionEnabled: boolean;
  compactionReservedTokens: number;
  chatFontSizePx: number;
}

class ConversationSessionSettingsModal extends Modal {
  constructor(
    app: App,
    options: {
      conversationTitle: string;
      defaults: ConversationSessionSettingsModalDefaults;
      initialOverrides?: ConversationSessionSettings;
      onSave(overrides: ConversationSessionSettings | undefined): Promise<void> | void;
    },
  )
}
```

## 关键行为

- tri-state `autoCompactionEnabled` 使用 `inherit / enabled / disabled` select，而不是单纯 toggle，确保能显式回到“继承全局默认值”
- number input 留空时会回写 `null` 语义（继承）；只有输入内容时才做正数 / supported-range 校验
- 如果三个字段都回到 inherit，`buildOverrides()` 会直接返回 `undefined`，上游可以把 `Conversation.sessionSettings` 折叠删除
- `handleSave()` 支持 async `onSave`，保存期间会 disable save/cancel button，并把错误显示在 modal 内部

## 与其他模块的交互

- 上游由 `ConversationSessionSettingsCoordinator.openCurrentConversationSettings()` 打开
- 使用 `normalizeCompactionReservedTokens()` 与 `normalizeChatFontSizePx()` 复用现有 settings normalization 规则
- 所有展示文案都走 `chat.sessionSettings.*` locale key

## 注意事项

- 这个 modal 不直接写存储，也不直接写 `.opencode/opencode.json`
- 本轮没有引入额外 modal CSS；class 主要用于测试与后续样式扩展
