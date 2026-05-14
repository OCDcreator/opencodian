# ConversationSessionSettingsCoordinator

> **源码**: `src/features/chat/services/ConversationSessionSettingsCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`ConversationSessionSettingsCoordinator` 收束了 per-conversation session settings 的 owner：它负责打开 dedicated modal、把会话覆盖设置写回 `Conversation.sessionSettings`、把聊天字体大小应用到当前 conversation root CSS variable。

它还负责把会话设置弹窗里的分享动作桥接到底层 OpenCode session API：用户可以为当前会话创建分享链接并复制，也可以取消当前会话的分享。

它让 `OpenCodianView` 不必再直接管理：

- per-conversation session settings modal 的打开/保存
- global defaults + conversation overrides 的 effective merge
- conversation switch / clear / hydration 后的 session runtime reapply

## 公开接口

```typescript
export interface ResolvedConversationSessionSettings {
  chatFontSizePx: number;
}

export interface ConversationSessionSettingsCoordinatorHost {
  app: App;
  getCurrentConversation(): Conversation | null;
  getSessionSettingsDefaults(): ResolvedConversationSessionSettings;
  getChatContainerEl(): HTMLElement | null;
  saveConversation(conversation: Conversation): Promise<void>;
  showNotice(message: string): void;
  shareSession?(sessionId: string): Promise<Session>;
  unshareSession?(sessionId: string): Promise<Session>;
  listSessions?(): Promise<Session[]>;
  copyText?(text: string): Promise<void>;
  getProjectShareMode?(): Promise<OpencodeShareMode | undefined>;
}

export class ConversationSessionSettingsCoordinator {
  openCurrentConversationSettings(): void;
  resolveEffectiveSettings(conversation: Conversation | null | undefined): ResolvedConversationSessionSettings;
  applyConversationVisualState(conversation: Conversation | null | undefined): ResolvedConversationSessionSettings;
  saveConversationOverrides(
    conversation: Conversation,
    overrides?: Partial<ConversationSessionSettings> | null,
  ): Promise<void>;
}
```

## 关键行为

- `openCurrentConversationSettings()` 只对当前会话开放；没有 active conversation 时直接给出 notice。打开前会读取 `listSessions()` 中当前 session 的 `share.url`，并读取项目级 `share` 模式，把已分享/未分享/禁用状态传给 modal
- `resolveEffectiveSettings()` 使用 plugin-level defaults 作为 base，再让 `Conversation.sessionSettings` 中的 `number / null` 覆盖或显式继承
- `applyConversationVisualState()` 只负责把 effective `chatFontSizePx` 写到 `--opencodian-chat-font-size`
- modal 输入期间会调用 preview path 临时应用 `chatFontSizePx`，不修改 `Conversation.sessionSettings` 也不触发 save；取消或关闭弹窗时重新应用真实 conversation state
- `saveConversationOverrides()` 会先归一化并持久化 `Conversation.sessionSettings`，全为 `null` 时会折叠回 `undefined`，避免存储纯"继承"空壳
- `shareCurrentConversation()` 调用 `OpenCodeService.shareSession()`，从返回的 `session.share.url` 提取公开链接并复制到剪贴板；如果 OpenCode 将分享失败映射成 HTTP 500，coordinator 会把 SDK 原始错误归一化为用户可理解的分享失败说明
- `unshareCurrentConversation()` 调用 `OpenCodeService.unshareSession()`，用于取消当前会话的公开分享

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 只负责装配 host seam，并在 header action、tab activation state bridge、hydration outcome 与 appearance refresh 处调用 coordinator
- coordinator 优先使用 host seam 提供的 list/share/unshare/copyText 回调；未提供时从 `app.plugins.plugins.opencodian.openCodeService` 解析 OpenCode session wrappers，并直接使用 `navigator.clipboard.writeText()`
- modal 具体 DOM 与校验留在 `ui/ConversationSessionSettingsModal.ts`

## 注意事项

- runtime reapply 是会话级的 view-side effective state；它不会修改 plugin settings 自身的 global defaults
- 当前 round 只覆盖 session settings owner/modal 与 activation/hydration runtime reapply，不包含 Agents / Commands UI

## 2026-04-23 Compaction config alignment

Compaction config is now project-scoped (`.opencode/opencode.json`). Ownership facts:
1. Compaction config source of truth is `.opencode/opencode.json`, not plugin settings or conversation session settings.
2. This coordinator no longer owns compaction fields; it only manages `chatFontSizePx`. `applyCompactionConfig()` and `applyConversationRuntimeState()` compaction logic were removed.
3. Manual `session.summarize()` remains a per-session action available through `OpenCodeService` session control, not managed by this coordinator.
