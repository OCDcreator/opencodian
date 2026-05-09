# ConversationSessionSettingsModal

> **源码**: `src/features/chat/ui/ConversationSessionSettingsModal.ts`
> **状态**: [REVIEW]

## 概述

`ConversationSessionSettingsModal` 是 per-conversation session settings 的 dedicated modal。它展示当前会话标题、继承全局默认值的说明，并允许用户为会话级显示设置输入覆盖值，同时在 Display 分组下方展示当前全局默认值摘要：

- `chatFontSizePx`

modal 本身只负责 DOM、输入解析和同步校验；真正的会话保存与 runtime reapply 仍交给 `ConversationSessionSettingsCoordinator`。

## 公开接口

```typescript
export interface ConversationSessionSettingsModalDefaults {
  chatFontSizePx: number;
}

type PluginSettingsSummary = {
  titleGeneration: string;
  compaction: string;
  projectLevel: string;
  questions: string;
  rendering: string;
};

const PLUGIN_ID = 'opencodian';

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

- 顶部 hero 区显示当前会话标题、继承说明与“会话覆盖”语义 badge，避免用户把它误认为全局设置
- modal 主体包含聊天字体大小的单一显示设置
- Display 分组下方新增 4 行只读摘要：Title generation、Context compaction、Question cards、Rendering，每行提供一个 “Open settings” 按钮
- 摘要通过 `this.app.plugins` 读取 `PLUGIN_ID` 对应插件的当前 settings，用于展示正在继承的全局默认值
- number input 留空时会回写 `null` 语义（继承）；只有输入内容时才做正数 / supported-range 校验
- 如果字段回到 inherit，`buildOverrides()` 会直接返回 `undefined`，上游可以把 `Conversation.sessionSettings` 折叠删除
- `handleSave()` 支持 async `onSave`，保存期间会 disable save/cancel button，并把错误显示在 modal 内部

## 关键方法

| 方法 | 说明 |
|------|------|
| `readPluginSettingsSummary()` | 从当前插件实例读取全局默认值并格式化为只读摘要 |
| `createSummaryDivider()` | 在显示设置与全局默认摘要之间插入视觉分隔与说明 |
| `createSummaryRows()` | 创建 Title generation / Context compaction / Question cards / Rendering 四行摘要 |
| `createSummaryRow()` | 渲染单行标签、摘要 chip 与 “Open settings” 动作 |

## 与其他模块的交互

- 上游由 `ConversationSessionSettingsCoordinator.openCurrentConversationSettings()` 打开
- 使用 `normalizeChatFontSizePx()` 复用现有 settings normalization 规则
- 所有展示文案都走 `chat.sessionSettings.*` locale key
- 样式落在 `src/style/modals/config-editor-modal.css` 的 `opencodian-session-settings-*` block，复用主设置页的两栏字段、卡片边框、弱化默认值 hint 与 CTA 语言
- “Open settings” 动作会跳转到主设置页的 conversation settings 位置，用于修改这些只读全局默认值

## 注意事项

- 这个 modal 不直接写存储，也不直接写 `.opencode/opencode.json`
- 视觉重设计不改变保存语义、runtime reapply 或 `Conversation.sessionSettings` 的 normalized shape

## 2026-04-23 Compaction config alignment

Compaction config is now project-scoped (`.opencode/opencode.json`). Ownership facts:
1. Compaction config source of truth is `.opencode/opencode.json`, not plugin settings or conversation session settings.
2. This modal no longer exposes compaction fields; it only manages `chatFontSizePx` per conversation.
3. Manual `session.summarize()` remains a per-session action available through session control, not managed by this modal.
