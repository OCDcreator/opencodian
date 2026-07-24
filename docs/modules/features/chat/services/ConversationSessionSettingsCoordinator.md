# ConversationSessionSettingsCoordinator

> **源码**: `src/features/chat/services/ConversationSessionSettingsCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`ConversationSessionSettingsCoordinator` 收束了 per-conversation session settings 的 owner：它负责打开 dedicated modal、把会话覆盖设置写回 `Conversation.sessionSettings`、把聊天字体大小应用到当前 conversation root CSS variable。

它还负责把会话设置弹窗里的分享动作桥接到底层 OpenCode session API：用户可以为当前会话创建分享链接并复制，也可以取消当前会话的分享。coordinator 使用 `ShareInspectionEntry` 最小检查类型（`{ id?, share? }`）而非完整 OpenCode `Session` 类型，避免在 share-URL 读取路径上引入 OpenCode 类型依赖。

coordinator 也是会话设置弹窗的 capability gate。分享和压缩由 host seam 显式提供能力；标题生成和问答卡片如果没有 host override，则按当前 conversation backend 判断，OpenCode 旧会话默认显示，Claude Code 默认隐藏。Claude Code 当前未接入这些 OpenCode-only 能力时，modal 只显示后端无关的字体/渲染摘要。

它让 `OpenCodianView` 不必再直接管理：

- per-conversation session settings modal 的打开/保存
- global defaults + conversation overrides 的 effective merge
- conversation switch / clear / hydration 后的 session runtime reapply

## 公开接口

```typescript
export interface ResolvedConversationSessionSettings {
  chatFontSizePx: number;
  codexSandboxMode?: CodexSandboxMode;
  codexModelReasoningEffort?: CodexReasoningEffort;
  codexModelOverride?: string;
  codexAdditionalDirectories?: string[];
  codexNetworkAccessEnabled?: boolean;
  codexWebSearchMode?: CodexWebSearchMode;
  codexApprovalPolicy?: CodexApprovalPolicy;
}

export interface ShareInspectionEntry {
  id?: string;
  share?: unknown;
}

export interface ConversationSessionSettingsCoordinatorHost {
  app: App;
  getCurrentConversation(): Conversation | null;
  getSessionSettingsDefaults(): ResolvedConversationSessionSettings;
  getCodexGlobalDefaults?(): { sandboxMode: CodexSandboxMode; modelReasoningEffort: CodexReasoningEffort; model: string; additionalDirectories: string[]; networkAccessEnabled: boolean; webSearchMode: CodexWebSearchMode; approvalPolicy?: CodexApprovalPolicy };
  getChatContainerEl(): HTMLElement | null;
  saveConversation(conversation: Conversation): Promise<void>;
  showNotice(message: string): void;
  shareSession?(sessionId: string): Promise<ShareInspectionEntry>;
  unshareSession?(sessionId: string): Promise<ShareInspectionEntry>;
  listSessions?(): Promise<ShareInspectionEntry[]>;
  copyText?(text: string): Promise<void>;
  getProjectShareMode?(): Promise<OpencodeShareMode | undefined>;
  supportsSessionSharing?(): boolean;
  supportsTitleGeneration?(): boolean;
  supportsCompaction?(): boolean;
  supportsQuestions?(): boolean;
  applyCodexRuntimeOverrides?(overrides: { sandboxMode: CodexSandboxMode; modelReasoningEffort: CodexReasoningEffort; model?: string; additionalDirectories?: string[]; networkAccessEnabled?: boolean; webSearchMode?: CodexWebSearchMode }): void;
  agentServiceRegistry?: AgentServiceRegistry;
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

- `openCurrentConversationSettings()` 只对当前会话开放；没有 active conversation 时直接给出 notice。打开前会用 `getConversationBackendSessionId()` 解析当前 session，通过 `loadCodexModelOptions()` 从 adapter 读取可用 Codex 模型列表，再通过 `readBackendSessionShareUrl()` 路由读取当前 session 的分享链接；同时读取项目级 `share` 模式，把已分享/未分享/禁用状态与可用模型传给 modal。同时通过 `loadCodexThreadGoal()` 读取当前线程目标（objective + status + tokenBudget + tokensUsed + timeUsedSeconds），传给 modal defaults。legacy 兜底路径和 share/unshare 写入路径只使用 `ShareInspectionEntry`（`{ id?, share? }`），不依赖 OpenCode `Session` 类型。
- `resolveEffectiveSettings()` 使用 plugin-level defaults 作为 base，再让 `Conversation.sessionSettings` 中的 `number / null` 覆盖或显式继承；Codex conversation 的普通字段使用 host `getCodexGlobalDefaults()`，approvalPolicy 优先使用该 host 的可选值，缺失时从 `app.plugins.plugins.opencodian.settings` 读取真实 global policy，再缺失才回退 `inherit`。这样无需修改 guarded `OpenCodianView`。
- `applyConversationVisualState()` 只负责把 effective `chatFontSizePx` 写到 `--opencodian-chat-font-size`；`applyConversationRuntimeState()` 把 sandbox/reasoning/model/additionalDirectories/networkAccessEnabled/webSearchMode 交给既有 host，并通过自身持有的 `agentServiceRegistry` 直接调用 Codex adapter `updateApprovalPolicy()` 与 `invalidateLiveThread(backendSessionId)`。approval 只有这一条 coordinator-owned action path；`untrusted`/`on-request` fail-closed 仍由 `CodexAdapter` 承担。随后丢弃缓存的 SDK `Thread`，使下一 turn 重新 resume 同一 backend thread 并使用最新 options。
- modal 输入期间会调用 preview path 临时应用 `chatFontSizePx`，不修改 `Conversation.sessionSettings` 也不触发 save；取消或关闭弹窗时重新应用真实 conversation state
- `saveConversationOverrides()` 会先归一化并持久化 `Conversation.sessionSettings`，全为 `null` 时会折叠回 `undefined`，避免存储纯"继承"空壳；保存后对当前活跃会话会调用 `applyConversationRuntimeState()` 以同时更新 visual state 和 Codex runtime overrides
- `supportsTitleGeneration()` / `supportsQuestions()` / `supportsCompaction()` 控制 modal 中继承摘要行是否出现；它们只影响 UI 可见性，不改变 per-session `chatFontSizePx` 保存语义。标题/问答没有 host override 时，coordinator 会把 OpenCode conversation 视为支持、Claude Code conversation 视为不支持。
- `shareCurrentConversation()` 只允许 `conversation.backend ?? 'opencode'` 为 `opencode` 时调用 host 或 `OpenCodeService.shareSession()`，从返回的 `ShareInspectionEntry.share.url` 提取公开链接并复制到剪贴板；如果 OpenCode 将分享失败映射成 HTTP 500，coordinator 会把 SDK 原始错误归一化为用户可理解的分享失败说明。分享写入本身仍是 OpenCode-only 能力，即使 modal 被错误/测试强制显示，Claude Code 的 `backendSessionId` 也不能进入 OpenCode write seam。
- `unshareCurrentConversation()` 同样只允许 OpenCode conversation 调用 host 或 `OpenCodeService.unshareSession()`，用于取消当前会话的公开分享；非 OpenCode backend 复用现有 sharing unavailable 失败文案。
- `onStartReview` callback 仅对 Codex conversation 提供（`isCodex` gate）；它通过 `startCodexReview()` 把 target 传给 `CodexAdapter.startReview(sessionId, target)`，adapter 先 resume thread 再调 `review/start` 并等待 `turn/completed`。审查完成后，若 status 为 `completed` 或 `interrupted`，coordinator 调用 `host.openBackendSessionAsConversation(reviewThreadId, title)` 把审查线程作为新会话打开到 chat——复用 `createConversationFromBackendSession` + `loadConversation` 路径，与 BackendSessionBrowserModal 的 resume 流程一致。`reviewThreadId` 与输入 `threadId` 相同（审查在同一线程上运行）；审查 turn 的 item（`agentMessage` 等）已持久化到 thread，`thread/read` 可读取。coordinator 打开会话后关闭 modal 并显示 notice。审查结果通过 chat 消息流呈现，用户可在 chat 中继续对话。

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 只负责装配 host seam，并在 header action、tab activation state bridge、hydration outcome 与 appearance refresh 处调用 coordinator
- coordinator 优先使用 host seam 提供的 `agentServiceRegistry` 通过 `readBackendSessionShareUrl()` 进行 backend-aware 分享链接读取；未提供 registry 时优先使用 host seam 提供的 listSessions/copyText 回调（不再穿透到 `openCodeService.listSessions()`）；都未提供时从 `app.plugins.plugins.opencodian.openCodeService` 解析 OpenCode share/unshare 写入方法，并直接使用 `navigator.clipboard.writeText()`
- modal 具体 DOM 与校验留在 `ui/ConversationSessionSettingsModal.ts`

## 注意事项

- runtime reapply 是会话级的 view-side effective state；它不会修改 plugin settings 自身的 global defaults
- 分享写入、压缩、标题生成、问答卡片都必须经过 coordinator 的 capability/backend gate；不要因为 modal 能读到全局 settings 或 `supportsSessionSharing()` 被强制为 true，就默认在所有 backend 调用 OpenCode-only 写路径。分享链接读取仍通过 backend-aware `readBackendSessionShareUrl()` 单独处理。
- 当前 round 只覆盖 session settings owner/modal 与 activation/hydration runtime reapply，不包含 Agents / Commands UI

## 2026-04-23 Compaction config alignment

Compaction config is now project-scoped (`.opencode/opencode.json`). Ownership facts:
1. Compaction config source of truth is `.opencode/opencode.json`, not plugin settings or conversation session settings.
2. This coordinator no longer owns compaction fields; it only manages `chatFontSizePx`. `applyCompactionConfig()` and `applyConversationRuntimeState()` compaction logic were removed.
3. Manual `session.summarize()` remains a per-session action available through `OpenCodeService` session control, not managed by this coordinator.

### Experimental action launcher

host 可选提供 `canOpenExperimentalActions()` 与 `openExperimentalActions()`。coordinator 仅在当前 OpenCode conversation 且 host 已确认存在可用 action 时把 launcher callback 交给 modal；它不读取 gate、不调用 OpenCode SDK，也不会为其他 backend 展示入口。
