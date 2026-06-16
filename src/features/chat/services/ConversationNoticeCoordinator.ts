import type { ChatMessage, Conversation, SessionDiffEntry } from '../../../core/types';
import { t } from '../../../i18n';
import { buildStreamErrorNotice } from '../runtime/AssistantNoticeRenderer';
import type { TabId } from '../tabs';
import type { ModelSelectorSelection } from '../ui/modelSelector/types';
import type { PersistentAssistantNoticeMessageOptions } from './PersistentAssistantNoticeService';

function readActiveBackendDisplayNameFromPlugin(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const plugin = (globalThis as any).app?.plugins?.plugins?.opencodian as {
      settings?: { activeBackend?: string };
      agentServiceRegistry?: { get?: (id: string) => { displayName?: string } | null };
    } | undefined;
    const activeBackend = plugin?.settings?.activeBackend ?? 'opencode';
    return plugin?.agentServiceRegistry?.get?.(activeBackend)?.displayName ?? activeBackend;
  } catch {
    return 'opencode';
  }
}

const NETWORK_ERROR_PATTERNS = [
  'failed to fetch',
  'econnrefused',
  'networkerror',
  'sse connection failed',
  'fetch failed',
  'http 0',
] as const;

export interface ConversationNoticeCoordinatorHost {
  getCurrentSessionModel(): ModelSelectorSelection | null;
  formatModelId(model: ModelSelectorSelection | null | undefined): string | undefined;
  isConversationRewound(): boolean;
  getActiveTabId(): TabId | null;
  getSessionDiff(
    sessionId: string,
    sourceMessageId: string,
  ): Promise<SessionDiffEntry[]>;
  getCachedSessionDiffEntries(sessionId: string): SessionDiffEntry[];
  appendPersistentNotice(
    options: PersistentAssistantNoticeMessageOptions,
  ): Promise<void>;
  renderBackgroundTaskIndicatorIfNeeded(tabId: TabId | null): Promise<void>;
  handleRestoreRewindRequest(): Promise<void>;
  openPluginSettingsPreservingScroll(): void;
  hasAnyEnabledBackend(): boolean;
  hasBackendConnection(): boolean;
}

export class ConversationNoticeCoordinator {
  constructor(
    private readonly host: ConversationNoticeCoordinatorHost,
  ) {}

  createStreamErrorNotice(message: string): ChatMessage {
    const timestamp = Date.now();
    const modelId = this.host.formatModelId(this.host.getCurrentSessionModel());
    return buildStreamErrorNotice(timestamp, message, modelId);
  }

  shouldRenderEmptyConversationNotice(): boolean {
    return this.host.isConversationRewound();
  }

  createEmptyConversationNotice(): ChatMessage {
    const rewound = this.host.isConversationRewound();
    const hasAnyEnabledBackend = this.host.hasAnyEnabledBackend();
    const hasBackendConnection = this.host.hasBackendConnection();

    if (!rewound && !hasAnyEnabledBackend) {
      return {
        id: 'opencodian-empty-state-no-backend',
        role: 'assistant',
        content: t('chat.empty.noBackend.description'),
        timestamp: Date.now(),
        displayStyle: 'notice',
        noticeTitle: t('chat.empty.noBackend.title'),
        noticeTone: 'warning',
        noticeActions: [{ type: 'open_model_settings' as const }],
      };
    }

    if (!rewound && !hasBackendConnection) {
      const backendName = readActiveBackendDisplayNameFromPlugin();
      return {
        id: 'opencodian-empty-state-backend-offline',
        role: 'assistant',
        content: t('chat.empty.backendOffline.descriptionWithBackend', { backend: backendName }),
        timestamp: Date.now(),
        displayStyle: 'notice',
        noticeTitle: t('chat.empty.backendOffline.titleWithBackend', { backend: backendName }),
        noticeTone: 'warning',
        noticeActions: [{ type: 'open_model_settings' as const }],
      };
    }

    return {
      id: rewound ? 'opencodian-empty-rewind' : 'opencodian-empty-state',
      role: 'assistant',
      content: rewound
        ? t('chat.rewind.empty.description')
        : t('chat.empty.description'),
      timestamp: Date.now(),
      displayStyle: 'notice',
      noticeTitle: rewound
        ? t('chat.rewind.empty.title')
        : t('chat.empty.title'),
      noticeTone: rewound ? 'warning' : 'info',
      noticeActions: rewound ? [{ type: 'restore_rewind' as const }] : undefined,
    };
  }

  async appendTurnDiffNoticeIfNeeded(
    conversation: Conversation,
    editedFiles: string[],
    tabId: TabId | null = this.host.getActiveTabId(),
  ): Promise<void> {
    // Diff notices are OpenCode-only.  The getSessionDiff and
    // getCachedSessionDiffEntries APIs are OpenCode-specific and do not
    // have a backend-neutral equivalent yet.
    const backend = conversation.backend ?? 'opencode';
    if (!conversation.openCodeSessionId || editedFiles.length === 0 || backend !== 'opencode') {
      return;
    }

    const latestUserMessage = [...conversation.messages]
      .reverse()
      .find((msg) => msg.role === 'user' && msg.sourceMessageId);
    if (!latestUserMessage?.sourceMessageId) {
      return;
    }

    const diffEntries = await this.host.getSessionDiff(
      conversation.openCodeSessionId,
      latestUserMessage.sourceMessageId,
    );
    const cachedEntries = this.host.getCachedSessionDiffEntries(
      conversation.openCodeSessionId,
    );
    const fallbackEntries: SessionDiffEntry[] = [...new Set(editedFiles)].map(
      (file) => ({ file, additions: 0, deletions: 0 }),
    );

    const entries =
      diffEntries.length > 0
        ? diffEntries
        : cachedEntries.length > 0
          ? cachedEntries
          : fallbackEntries;
    if (entries.length === 0) {
      return;
    }

    await this.host.appendPersistentNotice({
      title: t('chat.diffNotice.title'),
      content: this.formatDiffNoticeMarkdown(entries),
      tone: 'info',
      conversation,
      tabId,
    });

    if (tabId === this.host.getActiveTabId()) {
      await this.host.renderBackgroundTaskIndicatorIfNeeded(tabId);
    }
  }

  formatDiffNoticeMarkdown(entries: SessionDiffEntry[]): string {
    const lines = entries.map((entry) => {
      const link = `[[${entry.file}]]`;
      const stats =
        entry.additions > 0 || entry.deletions > 0
          ? ` (+${entry.additions} / -${entry.deletions})`
          : '';
      const status = entry.status ? ` ${entry.status}` : '';
      return `- ${link}${status}${stats}`;
    });

    return [t('chat.diffNotice.description'), '', ...lines].join('\n');
  }

  getFriendlyStreamErrorMessage(rawMessage: string): string {
    const message = rawMessage.trim();
    const lowerMessage = message.toLowerCase();

    if (!message) {
      return t('chat.error.serverNoResponse');
    }

    if (lowerMessage.includes('claude code')) {
      return `${t('chat.error.sendFailed')}\n${message}`;
    }

    if (NETWORK_ERROR_PATTERNS.some((pattern) => lowerMessage.includes(pattern))) {
      return t('chat.error.serverConnection');
    }

    if (lowerMessage.includes('opencode not found')) {
      return t('chat.error.serverBinaryMissing');
    }

    return `${t('chat.error.sendFailed')}\n${message}`;
  }

  async routeNoticeAction(
    actionType: NonNullable<ChatMessage['noticeActions']>[number]['type'],
  ): Promise<void> {
    switch (actionType) {
      case 'open_model_settings':
        this.host.openPluginSettingsPreservingScroll();
        return;
      case 'restore_rewind':
        await this.host.handleRestoreRewindRequest();
        return;
      default:
        return;
    }
  }
}
