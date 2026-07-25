# ConversationSessionSettingsModal

> **源码**: `src/features/chat/ui/ConversationSessionSettingsModal.ts`
> **状态**: [REVIEW]
> **Updated**: 2026-07-24 — added an Approval Policy dropdown to the Codex section (inherit/untrusted/on-request/never). The blank option means "Use global setting" (null override, inherits the real global); the explicit "inherit" choice forces the backend default (no override). Persisted as the nullable `codexApprovalPolicy` session override.

## 概述

`ConversationSessionSettingsModal` 是 per-conversation session settings 的 dedicated modal。它展示当前会话标题、继承全局默认值的说明，并允许用户为会话级显示设置输入覆盖值，同时在 Display 分组下方展示当前全局默认值摘要：

- `chatFontSizePx`

modal 本身只负责 DOM、输入解析和同步校验；真正的会话保存与 runtime reapply 仍交给 `ConversationSessionSettingsCoordinator`。

本 modal 还显示当前会话的分享动作区：`Share and copy link` 会触发上游 `onShare()`，`Cancel sharing` 会触发 `onUnshare()`。它只负责按钮状态和错误展示，不直接调用 OpenCode SDK。

标题生成、上下文压缩、会话分享和问答卡片摘要都不是 modal 的固有能力；它们必须由 coordinator/host 按当前 backend capability 显式开启。Claude Code 会话当前只显示通用的 Display / Rendering 摘要，避免把尚未接入的 OpenCode-only 标题、问答或分享机制露到会话 UI。Codex 会话在 `showCodexControls` 开启时额外显示 Codex 分组，包含模型覆盖、额外目录、沙盒模式、推理强度、网络访问、网页搜索和线程目标（含可选 tokenBudget 输入）。

## 公开接口

```typescript
export interface ConversationSessionSettingsModalDefaults {
  chatFontSizePx: number;
  codexSandboxMode?: CodexSandboxMode;
  codexModelReasoningEffort?: CodexReasoningEffort;
  codexModelOverride?: string;
  codexAdditionalDirectories?: string[];
  codexNetworkAccessEnabled?: boolean;
  codexWebSearchMode?: CodexWebSearchMode;
  codexApprovalPolicy?: CodexApprovalPolicy;
  /** Available Codex models for the session selector; empty/undefined falls back to a plain text input. */
  codexAvailableModels?: CodexModelSummary[];
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
      showCodexControls?: boolean;
      onSave(overrides: ConversationSessionSettings | undefined): Promise<void> | void;
      onPreview?(overrides: ConversationSessionSettings | undefined): void;
      onCancelPreview?(): void;
      onShare?(): Promise<void> | void;
      onUnshare?(): Promise<void> | void;
      shareUrl?: string | null;
      shareMode?: OpencodeShareMode;
      onStartReview?(target: AppServerReviewTarget): Promise<AppServerReviewResult | null>;
    },
  )
}
```

## 关键行为

- 顶部 hero 区显示当前会话标题、继承说明与“会话覆盖”语义 badge，避免用户把它误认为全局设置
- modal 主体包含聊天字体大小的单一显示设置
- `showCodexControls` 开启时，在 Display 分组下方渲染 Codex 分组，包含模型覆盖（下拉，含“Inherit”、可用模型和“Custom...”自定义输入）、沙盒模式（read-only / workspace-write / danger-full-access）、推理强度（minimal / low / medium / high / xhigh）、审批策略（Use global setting / inherit / untrusted / on-request / never）等下拉；分组内含 boundary hint 说明"这些设置在下一个线程生效，不影响当前对话"
- 会话级模型、沙盒、推理、网络、网页搜索和目录控件会生成稳定的 `id`，并通过对应 `<label for>`、`aria-labelledby` 与 `aria-label` 关联；Codex code-review target 下拉也提供明确的可访问名称，避免仅依赖视觉标题。
- Codex 审批策略下拉：空值表示「Use global setting」（null 覆盖，继承真实全局值）；显式「inherit」强制后端默认（不覆盖）。二者语义不同，UI 与 `buildOverrides` 明确区分
- Codex 下拉选择“Inherit”时回写 `null`（与字体大小行为一致），全字段为 null 时 `buildOverrides()` 返回 `undefined`
- 分享分组显示当前 session 的分享状态。`shareUrl === null` 时展示 Not shared 并隐藏取消分享；存在 URL 时展示 Shared、公开链接和取消分享动作；`shareMode === "disabled"` 且当前未分享时展示 Sharing disabled、禁用分享按钮，并显示跳转主设置页的 plain-language 提示；`undefined` 保留兼容的未知状态
- 分享分组提供“分享并复制链接”和“取消分享”两个会话级动作；保存显示设置不会触发分享动作
- Codex 分组还包含 thread goal 区（显示当前目标、状态、token/时间用量；支持设定和清除）和 code review 区（仅当 `onStartReview` callback 提供时渲染）。Review 区提供 target 下拉（uncommittedChanges / baseBranch / commit / custom）、条件参数输入和“开始审查”按钮；点击后状态从 idle → in_progress → completed/interrupted/error，`normalizeReviewStatus()` 将 app-server 的 camelCase 状态（如 `inProgress`）映射为内部 snake_case
- Display 分组下方显示只读摘要：Display / Rendering 始终可见，Title generation / Context compaction / Question cards 只有对应 `show*Summary` option 开启时才出现，每行提供一个 “Open settings” 按钮
- Title generation 摘要会根据当前全局模式显示用户向说明：首条消息标题会说明直接使用第一条用户消息开头，智能标题会说明先等待 OpenCode 自动命名，失败时再使用备用模型
- 摘要通过 `this.app.plugins` 读取 `PLUGIN_ID` 对应插件的当前 settings，用于展示正在继承的全局默认值
- “Open settings” 会把全局设置页定位到 Conversation 对应二级项；tabbed layout 下更新 `settingsTabbedPrimaryTab` / `settingsTabbedSecondaryTabByPrimary`，classic layout 下优先通过 `data-settings-target="conversation-*"` 找到二级分组并做 deferred scroll，标题文本匹配只作为兼容兜底
- "Open settings" 动作中的 `openTabById('opencodian')` 已加 try/catch 防护：当 Obsidian 设置 modal DOM 尚未就绪时（race condition），错误被静默捕获；设置 modal 已成功打开，用户可手动切换标签
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
| `createCodexModelOverrideField()` | 渲染会话级模型覆盖下拉：Inherit / 可用模型 / Custom...，附带自定义输入框 |
| `createCodexSection()` | 渲染 Codex 分组（模型、目录、沙盒、推理、审批策略、网络、网页搜索、线程目标） |
| `createCodexGoalSection()` | 渲染线程目标区块：readback（objective + status + tokens + time + budget）、set（objective + 可选 tokenBudget 输入 + 设定按钮）、clear |
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

### Experimental action launcher

当上游传入 `onOpenExperimentalActions` 时，modal 提供一个仅作跳转的实验性操作入口。是否可见完全由 coordinator 的 OpenCode conversation/capability gate 决定；modal 本身不执行 action、保存 gate 或读取服务端能力。
