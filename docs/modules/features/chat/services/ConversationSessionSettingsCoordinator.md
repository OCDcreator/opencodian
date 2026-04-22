# ConversationSessionSettingsCoordinator

> **源码**: `src/features/chat/services/ConversationSessionSettingsCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`ConversationSessionSettingsCoordinator` 收束了 per-conversation session settings 的 owner：它负责打开 dedicated modal、把会话覆盖设置写回 `Conversation.sessionSettings`、把聊天字体大小应用到当前 conversation root CSS variable，并把 auto-compaction / reserved-token effective state 优先应用到当前 OpenCode backend 的 `config.get/config.update` 链路。

它让 `OpenCodianView` 不必再直接管理：

- per-conversation session settings modal 的打开/保存
- global defaults + conversation overrides 的 effective merge
- conversation switch / clear / hydration 后的 session runtime reapply
- compaction config backend apply / deferred fallback 的排队与去重

## 公开接口

```typescript
export interface ResolvedConversationSessionSettings {
  autoCompactionEnabled: boolean;
  compactionReservedTokens: number;
  chatFontSizePx: number;
}

export interface ConversationSessionSettingsCoordinatorHost {
  app: App;
  getCurrentConversation(): Conversation | null;
  getSessionSettingsDefaults(): ResolvedConversationSessionSettings;
  getChatContainerEl(): HTMLElement | null;
  applyCompactionConfig(...): Promise<{ status: 'applied' | 'deferred' | 'skipped'; reason?: string }>;
  refreshCurrentSessionState(): Promise<void>;
  getOpencodeConfigManager(): { updateCompactionConfig(...) } | null;
  saveConversation(conversation: Conversation): Promise<void>;
  showNotice(message: string): void;
}

export class ConversationSessionSettingsCoordinator {
  openCurrentConversationSettings(): void;
  resolveEffectiveSettings(conversation: Conversation | null | undefined): ResolvedConversationSessionSettings;
  applyConversationVisualState(conversation: Conversation | null | undefined): ResolvedConversationSessionSettings;
  applyConversationRuntimeState(
    conversation: Conversation | null | undefined,
    options?: { silent?: boolean },
  ): Promise<ResolvedConversationSessionSettings>;
  saveConversationOverrides(
    conversation: Conversation,
    overrides?: Partial<ConversationSessionSettings> | null,
  ): Promise<void>;
}
```

## 关键行为

- `openCurrentConversationSettings()` 只对当前会话开放；没有 active conversation 时直接给出 notice
- `resolveEffectiveSettings()` 使用 plugin-level defaults 作为 base，再让 `Conversation.sessionSettings` 中的 `boolean / number / null` 覆盖或显式继承
- `applyConversationVisualState()` 只负责把 effective `chatFontSizePx` 写到 `--opencodian-chat-font-size`
- `applyConversationRuntimeState()` 在 visual state 之外，会先请求 backend 应用 effective `auto` / `reserved`；成功后立刻触发当前 view 的最小 refresh
- backend apply 返回 deferred 时，coordinator 才会把 compaction 写回 vault-scoped `OpencodeConfigManager`，并显式保留“等 backend reload 后生效”的 notice 语义
- compaction apply 内部带有 queue；快速切 tab / hydration 时只会顺序落最新的 pending effective config，避免 view 层自己管理 async race
- `saveConversationOverrides()` 会先归一化并持久化 `Conversation.sessionSettings`，全为 `null` 时会折叠回 `undefined`，避免存储纯“继承”空壳

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 只负责装配 host seam，并在 header action、tab activation state bridge、hydration outcome 与 appearance refresh 处调用 coordinator
- modal 具体 DOM 与校验留在 `ui/ConversationSessionSettingsModal.ts`
- backend `config.get/config.update` 的 directory-scoped 应用留在 `OpenCodeService`；`.opencode/opencode.json` 的 merge / preserve-unknown-fields 只在 deferred fallback 时继续交给 `OpencodeConfigManager`

## 注意事项

- runtime reapply 是会话级的 view-side effective state；它不会修改 plugin settings 自身的 global defaults
- 本模块不再把“已保存到本地文件”误报成“当前 backend 已即时生效”；只有 backend apply 成功时才会走即时生效语义
- 当前 round 只覆盖 session settings owner/modal 与 activation/hydration runtime reapply，不包含 Agents / Commands UI
