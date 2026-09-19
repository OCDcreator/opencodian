/**
 * R-B1 (chat) auto-internal-link boundary tests — the chat-side complement to
 * InlineEditAutoLinkFlow.test.ts (docs/requirements/flowtext-parity.md R-B1):
 *
 * - the finalization service applies the SHARED processor seam
 *   (`createInlineEditAutoLinkProcessor`) once the turn's assistant text is
 *   final — after the authoritative sync and before render apply + final
 *   save — so stored and rendered text are the same linked text;
 * - a heading that does not exist in the reference note yields no link and
 *   no render apply (宁可不链，不产生死链);
 * - with `autoInternalLinkEnabled` off the stored text is byte-identical to
 *   the previous behaviour and no render apply happens (验收 4 regression);
 * - the locally persisted path (claude-code / codex / pi) post-processes the
 *   stored message and re-renders the foreground tail;
 * - an empty reference set is a no-op.
 */

import { TFile } from 'obsidian';

import type { ChatMessage, Conversation, PromptContextItem } from '../../../../src/core/types';
import { AssistantAutoInternalLinkService } from '../../../../src/features/chat/services/AssistantAutoInternalLinkService';
import {
  type MessageFinalizationHost,
  MessageFinalizationService,
  type MessageFinalizationSyncResult,
} from '../../../../src/features/chat/services/MessageFinalizationService';
import { createInlineEditAutoLinkProcessor } from '../../../../src/features/inline-edit/InlineEditAutoLink';
import { createConversation, createHost, createMessage } from './MessageFinalizationService.testSupport';

/**
 * Fake vault backing the shared R-B1 processor: each entry maps a note path
 * to the headings its CachedMetadata reports. Paths not present fail the
 * existence verification, so dead links are impossible by construction.
 */
function createFakeVaultApp(noteHeadings: Record<string, string[]>): unknown {
  const files = new Map<string, TFile>();
  for (const path of Object.keys(noteHeadings)) {
    const file = new TFile();
    file.path = path;
    files.set(path, file);
  }
  return {
    vault: {
      getAbstractFileByPath: (path: string) => files.get(path) ?? null,
    },
    metadataCache: {
      getFileCache: (file: TFile) => {
        const headings = noteHeadings[file.path];
        return headings ? { headings: headings.map((heading) => ({ heading })) } : null;
      },
    },
  };
}

function createContextItem(overrides: Partial<PromptContextItem> = {}): PromptContextItem {
  return {
    id: 'ctx-1',
    kind: 'file',
    path: 'notes/ref-attention.md',
    label: 'ref-attention.md',
    mime: 'text/markdown',
    ...overrides,
  };
}

interface AutoLinkHarnessOptions {
  readonly enabled: boolean;
  readonly noteHeadings: Record<string, string[]>;
  readonly canonicalSync?: (conversation: Conversation) => {
    messages: ChatMessage[];
    changed: boolean;
  };
}

function createAutoLinkFinalization(
  conversation: Conversation,
  options: AutoLinkHarnessOptions,
): { host: ReturnType<typeof createHost>; service: MessageFinalizationService; logStage: jest.Mock } {
  const host = createHost(conversation, {
    syncConversationMessagesFromServer: jest.fn(),
  }) as ReturnType<typeof createHost> & {
    syncConversationMessagesFromCanonicalState: jest.Mock<
      Promise<MessageFinalizationSyncResult | null>,
      [Conversation, string | null, string]
    >;
  };
  if (options.canonicalSync) {
    host.syncConversationMessagesFromCanonicalState = jest.fn().mockImplementation(
      async (targetConversation: Conversation) => {
        const next = options.canonicalSync!(targetConversation);
        targetConversation.messages = next.messages;
        return {
          messages: next.messages,
          changed: next.changed,
          fingerprint: `fp-${next.messages.length}`,
        };
      },
    );
  }
  const service = new MessageFinalizationService(
    host as unknown as MessageFinalizationHost,
    new AssistantAutoInternalLinkService(createInlineEditAutoLinkProcessor({
      app: createFakeVaultApp(options.noteHeadings) as never,
      isEnabled: () => options.enabled,
      getExcludedTerms: () => [],
    })),
  );
  return { host, service, logStage: jest.fn() };
}

describe('MessageFinalizationService R-B1 auto-internal-link boundary', () => {
  const USER_TEXT = '总结一下这篇笔记';
  const GENERATED = '本节介绍注意力机制的基本原理。';
  const LINKED = '本节介绍[[notes/ref-attention.md#注意力机制]]的基本原理。';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('links a verified reference heading into the completed synced assistant message (opencode path)', async () => {
    const userMessage = createMessage({ id: 'user-1', role: 'user', content: USER_TEXT, timestamp: 1 });
    const conversation = createConversation([userMessage]);
    const syncedMessages = [
      userMessage,
      createMessage({ id: 'assistant-1', content: GENERATED, timestamp: 10 }),
    ];
    const { host, service, logStage } = createAutoLinkFinalization(conversation, {
      enabled: true,
      noteHeadings: { 'notes/ref-attention.md': ['注意力机制'] },
      canonicalSync: () => ({ messages: syncedMessages, changed: true }),
    });

    await service.finalizeAfterStream({
      conversation,
      tabId: 'tab-1',
      shouldSyncFromServer: true,
      editedFiles: [],
      contextItems: [createContextItem()],
      logStage,
    });

    // Stored text carries the verified wikilink…
    expect(conversation.messages[1]?.content).toBe(LINKED);
    // …the foreground render applies the same linked text (previous = the
    // pre-sync message snapshot, next = the live linked array)…
    expect(host.applySyncedConversationUpdate).toHaveBeenCalledWith(
      [syncedMessages[0]],
      syncedMessages,
    );
    expect(logStage).toHaveBeenCalledWith('auto-internal-link-pass', {
      changed: true,
      reason: 'applied',
      referenceCount: 1,
    });
    expect(logStage).toHaveBeenCalledWith('post-sync-render-apply-complete');
    // …and the final save persists the linked conversation.
    expect(host.saveConversation).toHaveBeenCalledWith(conversation);
  });

  it('inserts no link for a heading that does not exist in the reference note (无死链)', async () => {
    const userMessage = createMessage({ id: 'user-1', role: 'user', content: USER_TEXT, timestamp: 1 });
    const conversation = createConversation([userMessage]);
    const syncedMessages = [
      userMessage,
      createMessage({ id: 'assistant-1', content: GENERATED, timestamp: 10 }),
    ];
    const { host, service, logStage } = createAutoLinkFinalization(conversation, {
      enabled: true,
      // The reference note exists but its headings do not contain the term.
      noteHeadings: { 'notes/ref-attention.md': ['自注意力'] },
      canonicalSync: () => ({ messages: syncedMessages, changed: false }),
    });

    await service.finalizeAfterStream({
      conversation,
      tabId: 'tab-1',
      shouldSyncFromServer: true,
      editedFiles: [],
      contextItems: [createContextItem()],
      logStage,
    });

    expect(conversation.messages[1]?.content).toBe(GENERATED);
    expect(host.applySyncedConversationUpdate).not.toHaveBeenCalled();
    expect(logStage).toHaveBeenCalledWith('auto-internal-link-pass', {
      changed: false,
      reason: 'unchanged',
      referenceCount: 1,
    });
  });

  it('keeps stored and rendered text byte-identical when the setting is off (回归)', async () => {
    const userMessage = createMessage({ id: 'user-1', role: 'user', content: USER_TEXT, timestamp: 1 });
    const conversation = createConversation([userMessage]);
    const syncedMessages = [
      userMessage,
      createMessage({ id: 'assistant-1', content: GENERATED, timestamp: 10 }),
    ];
    const { host, service, logStage } = createAutoLinkFinalization(conversation, {
      enabled: false,
      noteHeadings: { 'notes/ref-attention.md': ['注意力机制'] },
      canonicalSync: () => ({ messages: syncedMessages, changed: false }),
    });

    await service.finalizeAfterStream({
      conversation,
      tabId: 'tab-1',
      shouldSyncFromServer: true,
      editedFiles: [],
      contextItems: [createContextItem()],
      logStage,
    });

    expect(conversation.messages[1]?.content).toBe(GENERATED);
    expect(host.applySyncedConversationUpdate).not.toHaveBeenCalled();
    expect(logStage).toHaveBeenCalledWith('auto-internal-link-pass', {
      changed: false,
      reason: 'unchanged',
      referenceCount: 1,
    });
  });

  it('post-processes the locally persisted assistant message and re-renders the tail (non-opencode path)', async () => {
    const userMessage = createMessage({ id: 'user-1', role: 'user', content: USER_TEXT, timestamp: 1 });
    const assistantMessage = createMessage({ content: GENERATED, timestamp: 10 });
    const conversation = createConversation([userMessage, assistantMessage]);
    const { host, service, logStage } = createAutoLinkFinalization(conversation, {
      enabled: true,
      noteHeadings: { 'notes/ref-attention.md': ['注意力机制'] },
    });

    await service.finalizeAfterStream({
      conversation,
      tabId: 'tab-1',
      shouldSyncFromServer: false,
      editedFiles: [],
      contextItems: [createContextItem()],
      logStage,
    });

    expect(assistantMessage.content).toBe(LINKED);
    // The foreground tail is re-rendered from the mutated messages: the first
    // argument carries the pre-mutation clone of the rewritten message, the
    // second is the live linked array.
    expect(host.applySyncedConversationUpdate).toHaveBeenCalledTimes(1);
    const [previous, next] = host.applySyncedConversationUpdate.mock.calls[0] as [
      ChatMessage[],
      ChatMessage[],
    ];
    expect(previous[1]?.content).toBe(GENERATED);
    expect(previous[1]).not.toBe(assistantMessage);
    expect(next[1]?.content).toBe(LINKED);
    expect(next).toBe(conversation.messages);
    expect(logStage).toHaveBeenCalledWith('auto-internal-link-render-applied');
    expect(host.saveConversation).toHaveBeenCalledWith(conversation);
  });

  it('skips the pass entirely when the turn carried no reference notes', async () => {
    const assistantMessage = createMessage({ content: GENERATED, timestamp: 10 });
    const conversation = createConversation([
      createMessage({ id: 'user-1', role: 'user', content: USER_TEXT, timestamp: 1 }),
      assistantMessage,
    ]);
    const { host, service, logStage } = createAutoLinkFinalization(conversation, {
      enabled: true,
      noteHeadings: { 'notes/ref-attention.md': ['注意力机制'] },
    });

    await service.finalizeAfterStream({
      conversation,
      tabId: 'tab-1',
      shouldSyncFromServer: false,
      editedFiles: [],
      contextItems: [],
      logStage,
    });

    expect(assistantMessage.content).toBe(GENERATED);
    expect(host.applySyncedConversationUpdate).not.toHaveBeenCalled();
    expect(logStage).toHaveBeenCalledWith('auto-internal-link-pass', {
      changed: false,
      reason: 'no-references',
      referenceCount: 0,
    });
  });
});
