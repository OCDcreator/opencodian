# ConversationSessionSettingsModal

> **源码**: `src/features/chat/ui/ConversationSessionSettingsModal.ts`
> **状态**: [REVIEW]

## 概述

`ConversationSessionSettingsModal` 是 per-conversation session settings 的 dedicated modal。它展示当前会话标题、继承全局默认值的说明，并允许用户为会话级显示设置输入覆盖值，同时在 Display 分组下方展示当前全局默认值摘要：

- `chatFontSizePx`

modal 本身只负责 DOM、输入解析和同步校验；真正的会话保存与 runtime reapply 仍交给 `ConversationSessionSettingsCoordinator`。

本 modal 还显示当前会话的分享动作区：`Share and copy link` 会触发上游 `onShare()`，`Cancel sharing` 会触发 `onUnshare()`。它只负责按钮状态和错误展示，不直接调用 OpenCode SDK。

标题生成、上下文压缩、会话分享和问答卡片摘要都不是 modal 的固有能力；它们必须由 coordinator/host 按当前 backend capability 显式开启。Claude Code 会话当前只显示通用的 Display / Rendering 摘要，避免把尚未接入的 OpenCode-only 标题、问答或分享机制露到会话 UI。

## 公开接口

```typescript
export interface ConversationSessionSettingsModalDefaults {
  chatFontSizePx: number;
}

type PluginSettingsSummary = {
  titleGeneration: string;
  compaction: string;
  display: string;
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
      showTitleSummary?: boolean;
      showCompactionSummary?: boolean;
      showQuestionsSummary?: boolean;
      onSave(overrides: ConversationSessionSettings | undefined): Promise<void> | void;
      onPreview?(overrides: ConversationSessionSettings | undefined): void;
      onCancelPreview?(): void;
      onShare?(): Promise<void> | void;
      onUnshare?(): Promise<void> | void;
      shareUrl?: string | null;
      shareMode?: OpencodeShareMode;
    },
  )
}
```

## 关键行为

- 顶部 hero 区显示当前会话标题、继承说明与“会话覆盖”语义 badge，避免用户把它误认为全局设置
- modal 主体包含聊天字体大小的单一显示设置
- 分享分组显示当前 session 的分享状态。`shareUrl === null` 时展示 Not shared 并隐藏取消分享；存在 URL 时展示 Shared、公开链接和取消分享动作；`shareMode === "disabled"` 且当前未分享时展示 Sharing disabled、禁用分享按钮，并显示跳转主设置页的 plain-language 提示；`undefined` 保留兼容的未知状态
- 分享分组提供“分享并复制链接”和“取消分享”两个会话级动作；保存显示设置不会触发分享动作
- Display 分组下方显示只读摘要：Display / Rendering 始终可见，Title generation / Context compaction / Question cards 只有对应 `show*Summary` option 开启时才出现，每行提供一个 “Open settings” 按钮
- Title generation 摘要会根据当前全局模式显示用户向说明：首条消息标题会说明直接使用第一条用户消息开头，智能标题会说明先等待 OpenCode 自动命名，失败时再使用备用模型
- 摘要通过 `this.app.plugins` 读取 `PLUGIN_ID` 对应插件的当前 settings，用于展示正在继承的全局默认值
- “Open settings” 会把全局设置页定位到 Conversation 对应二级项；tabbed layout 下更新 `settingsTabbedPrimaryTab` / `settingsTabbedSecondaryTabByPrimary`，classic layout 下优先通过 `data-settings-target="conversation-*"` 找到二级分组并做 deferred scroll，标题文本匹配只作为兼容兜底
- number input 留空时会回写 `null` 语义（继承）；只有输入内容时才做正数 / supported-range 校验
- 聊天字体大小输入与步进按钮会通过 `onPreview()` 实时预览当前会话字号，但不写入 conversation；右上角关闭或取消会调用 `onCancelPreview()` 让 coordinator 恢复打开弹窗前的 effective state
- 如果字段回到 inherit，`buildOverrides()` 会直接返回 `undefined`，上游可以把 `Conversation.sessionSettings` 折叠删除
- `handleSave()` 支持 async `onSave`，保存期间会 disable save/cancel button；成功保存后不会触发 preview restore，错误显示在 modal 内部

## 关键方法

| 方法 | 说明 |
|------|------|
| `readPluginSettingsSummary()` | 从当前插件实例读取全局默认值并格式化为只读摘要 |
| `createSummaryDivider()` | 在显示设置与全局默认摘要之间插入视觉分隔与说明 |
| `createSummaryRows()` | 创建当前 backend capability 允许展示的全局默认摘要 |
| `createSummaryRow()` | 渲染单行标签、摘要 chip 与 “Open settings” 动作 |
| `prepareSettingsTarget()` | 在打开全局设置页前同步 tabbed layout 的目标 primary/secondary tab，或准备 classic layout 的滚动定位 |
| `runSharingAction()` | 执行分享 / 取消分享回调，期间禁用当前按钮并把 coordinator 归一化后的错误显示在 modal 内 |

## 与其他模块的交互

- 上游由 `ConversationSessionSettingsCoordinator.openCurrentConversationSettings()` 打开
- 使用 `normalizeChatFontSizePx()` 复用现有 settings normalization 规则
- 所有展示文案都走 `chat.sessionSettings.*` 与 `chat.sessionSharing.*` locale key
- 样式落在 `src/style/modals/config-editor-modal.css` 的 `opencodian-session-settings-*` block，复用主设置页的两栏字段、卡片边框、弱化默认值 hint 与 CTA 语言；footer 位于 scrollable body 外侧并 sticky 在 modal 底部，确保 Cancel / Save 不随长内容滚走
- “Open settings” 动作会跳转到主设置页的 conversation settings 位置，用于修改这些只读全局默认值

## 注意事项

- 这个 modal 不直接写存储，也不直接写 `.opencode/opencode.json`
- 这个 modal 不直接调用 OpenCode share/unshare；它只调用传入回调，便于 coordinator 统一处理 notice、剪贴板和 OpenCode session id
- 不要在 modal 内用当前 settings 内容推断后端能力；是否展示 title / compaction / question 摘要必须来自上游 capability gate
- 视觉重设计不改变保存语义、runtime reapply 或 `Conversation.sessionSettings` 的 normalized shape

## 2026-04-23 Compaction config alignment

Compaction config is now project-scoped (`.opencode/opencode.json`). Ownership facts:
1. Compaction config source of truth is `.opencode/opencode.json`, not plugin settings or conversation session settings.
2. This modal no longer exposes compaction fields; it only manages `chatFontSizePx` per conversation.
3. Manual `session.summarize()` remains a per-session action available through session control, not managed by this modal.
