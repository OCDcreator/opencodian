import type {
  ChatMessage,
  Conversation,
} from '../../../core/types';
import { getConversationBackendSessionId, getTurnDiffNoticeMeta } from '../../../core/types';
import {
  buildMessageRenderGroups,
  injectLiveCompactionDivider,
  mergeAssistantMessagesForRender,
  tagCompactionSummaries,
} from '../renderGroups';
import type { TabId } from '../tabs';

export interface ConversationIdentityRuntimeHost {
  /** Returns the canonical fingerprint builder from OpenCodeService if available. */
  getCanonicalConversationFingerprint(messages: ChatMessage[]): string | undefined;
  /** Returns the active tab ID for compaction divider injection. */
  getActiveTabId(): TabId | null;
  /** Returns context usage state for a tab (used for compaction divider injection). */
  getTabContextUsage(tabId: TabId): { compactingAt?: number | null } | null;
  /** Returns whether persisted turn-change records should be included in render output. */
  showTurnChangeRecords(): boolean;
}

export class ConversationIdentityRuntime {
  constructor(private readonly host: ConversationIdentityRuntimeHost) {}

  getConversationSyncFingerprint(messages: ChatMessage[]): string {
    const canonicalFingerprint = this.host.getCanonicalConversationFingerprint(messages);
    if (typeof canonicalFingerprint === 'string') {
      return canonicalFingerprint;
    }

    return JSON.stringify(messages.map((message) => ({
      id: message.id,
      role: message.role,
      modelId: message.modelId ?? null,
      sourceMessageId: message.sourceMessageId ?? null,
      streamState: message.streamState ?? null,
      displayStyle: message.displayStyle ?? null,
      noticeTitle: message.noticeTitle ?? null,
      noticeTone: message.noticeTone ?? null,
      noticeActions: message.noticeActions ?? null,
      noticeMeta: message.noticeMeta ?? null,
      content: message.content,
      timestamp: message.timestamp,
      images: message.images ?? null,
      toolCalls: message.toolCalls ?? null,
      contentBlocks: message.contentBlocks ?? null,
      contextAttachments: message.contextAttachments ?? null,
      questionResolution: message.questionResolution ?? null,
      omo: message.omo ?? null,
      structured: message.structured ?? null,
      parts: message.parts ?? null,
    })));
  }

  getInterruptedSyncPreservationLogFingerprint(
    conversation: Conversation,
    messages: ChatMessage[],
  ): string {
    return JSON.stringify({
      conversationId: conversation.id,
      sessionId: getConversationBackendSessionId(conversation),
      messages: messages.map((message) => ({
        id: message.id,
        sourceMessageId: message.sourceMessageId ?? null,
        streamState: message.streamState ?? null,
        timestamp: message.timestamp,
        content: message.content,
        contentBlocks: message.contentBlocks ?? [],
      })),
    });
  }

  getMessageVisualSignature(message: ChatMessage): string {
    return JSON.stringify({
      role: message.role,
      streamState: message.streamState ?? null,
      displayStyle: message.displayStyle ?? null,
      content: message.content,
      timestamp: message.timestamp,
      modelId: message.modelId ?? null,
      sourceMessageId: message.sourceMessageId ?? null,
      summaryKind: message.summaryKind ?? null,
      compactionDivider: message.compactionDivider ?? null,
      noticeTitle: message.noticeTitle ?? null,
      noticeTone: message.noticeTone ?? null,
      noticeActions: message.noticeActions ?? null,
      images: message.images ?? null,
      omo: message.omo ?? null,
      questionResolution: message.questionResolution ? {
        requestId: message.questionResolution.request.id,
        status: message.questionResolution.status,
        answers: message.questionResolution.answers ?? null,
      } : null,
      contentBlocks: (message.contentBlocks ?? []).map((block) => ({
        type: block.type,
        text: block.text ?? null,
        thinking: block.thinking ?? null,
        durationSeconds: block.durationSeconds ?? null,
        toolId: block.toolId ?? null,
        toolName: block.toolName ?? null,
        toolKind: block.toolKind ?? null,
        toolInput: block.toolInput ?? null,
        toolMetadata: block.toolMetadata ?? null,
        toolStatus: block.toolStatus ?? null,
        toolResult: block.toolResult ?? null,
        toolResultVisibility: block.toolResultVisibility ?? null,
        subagentId: block.subagentId ?? null,
        subagentMode: block.subagentMode ?? null,
      })),
      structured: message.structured ?? null,
    });
  }

  getMessagesForRender(messages: ChatMessage[]): ChatMessage[] {
    const filtered = messages.filter((message) => this.shouldRenderConversationMessage(message));
    const rendered = buildMessageRenderGroups(filtered).map((group) =>
      group.mergedAssistant && group.messages.length > 1
        ? mergeAssistantMessagesForRender(group.messages)
        : group.messages[0],
    );
    const activeTabId = this.host.getActiveTabId();
    const contextUsage = activeTabId ? this.host.getTabContextUsage(activeTabId) : null;
    const injected = injectLiveCompactionDivider({
      messages: rendered,
      compactingAt: contextUsage?.compactingAt ?? null,
      tabId: activeTabId ?? '',
    });

    return tagCompactionSummaries(injected);
  }

  shouldRenderConversationMessage(message: ChatMessage): boolean {
    if (this.isBackgroundTaskCompletionReminder(message)) {
      return false;
    }

    if (message.displayStyle === 'notice') {
      if (this.isTurnChangeRecordHidden(message)) {
        return false;
      }
      return true;
    }

    if (message.role !== 'assistant') {
      return this.hasRenderableNonAssistantContent(message);
    }

    return this.hasRenderableAssistantContent(message);
  }

  private hasRenderableNonAssistantContent(message: ChatMessage): boolean {
    return Boolean(
      message.content?.trim()
      || (message.contentBlocks?.length ?? 0) > 0
      || (message.contextAttachments?.length ?? 0) > 0
      || (message.images?.length ?? 0) > 0
      || message.questionResolution
      || message.omo
      || message.compactionDivider,
    );
  }

  private hasRenderableAssistantContent(message: ChatMessage): boolean {
    return Boolean(
      message.content?.trim()
      || (message.contentBlocks?.length ?? 0) > 0
      || (message.toolCalls?.length ?? 0) > 0
      || message.questionResolution
      || message.omo
      || message.structured,
    );
  }

  private isTurnChangeRecordHidden(message: ChatMessage): boolean {
    return getTurnDiffNoticeMeta(message) !== null && !this.host.showTurnChangeRecords();
  }

  private isBackgroundTaskCompletionReminder(message: ChatMessage): boolean {
    return message.omo?.kind === 'system-reminder'
      && (
        message.omo.reminderType === 'background-task-completed'
        || message.omo.reminderType === 'all-background-tasks-complete'
      );
  }
}
