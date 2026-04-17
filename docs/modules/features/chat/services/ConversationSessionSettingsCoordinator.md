# ConversationSessionSettingsCoordinator

> **源码**: `src/features/chat/services/ConversationSessionSettingsCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`ConversationSessionSettingsCoordinator` 收束了 per-conversation session settings 的 owner：它负责打开 dedicated modal、把会话覆盖设置写回 `Conversation.sessionSettings`、把聊天字体大小应用到当前 conversation root CSS variable，并把 auto-compaction / reserved-token effective state 写回项目级 `.opencode/opencode.json` 的 `compaction` 字段。

它让 `OpenCodianView` 不必再直接管理：

- per-conversation session settings modal 的打开/保存
- global defaults + conversation overrides 的 effective merge
- conversation switch / clear / hydration 后的 session runtime reapply
- compaction config 写回的排队与去重

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
- `applyConversationRuntimeState()` 在 visual state 之外，还会把 effective `auto` / `reserved` 通过 `OpencodeConfigManager.updateCompactionConfig()` 写回项目配置
- compaction 写回内部带有 queue；快速切 tab / hydration 时只会顺序落最新的 pending effective config，避免 view 层自己管理 async race
- `saveConversationOverrides()` 会先归一化并持久化 `Conversation.sessionSettings`，全为 `null` 时会折叠回 `undefined`，避免存储纯“继承”空壳

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 只负责装配 host seam，并在 header action、tab activation state bridge、hydration outcome 与 appearance refresh 处调用 coordinator
- modal 具体 DOM 与校验留在 `ui/ConversationSessionSettingsModal.ts`
- `.opencode/opencode.json` 的实际 merge / preserve-unknown-fields 语义继续留在 `OpencodeConfigManager`

## 注意事项

- runtime reapply 是会话级的 view-side effective state；它不会修改 plugin settings 自身的 global defaults
- compaction config 写的是项目级 `.opencode/opencode.json`，因此本模块只使用 vault-scoped config manager，不接触全局 OpenCode config
- 当前 round 只覆盖 session settings owner/modal 与 activation/hydration runtime reapply，不包含 Agents / Commands UI
