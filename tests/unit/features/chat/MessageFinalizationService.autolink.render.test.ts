/**
 * R-B1 (chat) turn-boundary consistency tests — pins the live-acceptance
 * defect where storage carried the auto-internal link but the rendered DOM
 * did not, and a later authoritative resync dropped the link from storage:
 *
 * - the synced finalization must leave the conversation messages linked AND
 *   the render apply it triggers must produce DOM text that carries the same
 *   link (storage and render agree at the turn boundary);
 * - a later authoritative canonical resync (the post-reload path) must adopt
 *   server text WITH the links re-applied, so a reload never silently removes
 *   a link the user just saw;
 * - when the turn carries no note attachments, no rewrite happens anywhere
 *   (fail-closed: the pass never invents references);
 * - with the setting off, stored text and DOM stay byte-identical to the
 *   server text.
 *
 * Unlike MessageFinalizationService.autolink.test.ts (which mocks the
 * finalization host), these tests wire the REAL ConversationAuthoritative
 * SyncCoordinator and the REAL ConversationRenderService behind
 * MessageFinalizationService — the render half was exactly what the mocked
 * tests could not see.
 */

import { TFile } from 'obsidian';

import type {
  ChatMessage,
  Conversation,
} from '../../../../src/core/types';
import { AssistantAutoInternalLinkService } from '../../../../src/features/chat/services/AssistantAutoInternalLinkService';
import {
  ConversationAuthoritativeSyncCoordinator,
  type ConversationAuthoritativeSyncHost,
} from '../../../../src/features/chat/services/ConversationAuthoritativeSyncCoordinator';
import {
  type ConversationCanonicalRenderSource,
  ConversationRenderService,
} from '../../../../src/features/chat/services/ConversationRenderService';
import { MessageFinalizationService } from '../../../../src/features/chat/services/MessageFinalizationService';
import { createInlineEditAutoLinkProcessor } from '../../../../src/features/inline-edit/InlineEditAutoLink';
import {
  createHost as createRenderHost,
} from './ConversationRenderService.testSupport';
import {
  createConversation,
  createHost as createFinalizationHost,
  createMessage,
} from './MessageFinalizationService.testSupport';

const SESSION_ID = 'session-autolink-render';
const NOTE_PATH = 'notes/rb1-chat-ref.md';
const NOTE_HEADING = '注意力机制';
const USER_TEXT = '用一句话介绍注意力机制。';
const GENERATED = '注意力机制让模型针对输入的不同位置动态分配权重。';
const LINKED = `[[${NOTE_PATH}#${NOTE_HEADING}]]让模型针对输入的不同位置动态分配权重。`;
const ATTACHMENT = { kind: 'file' as const, path: NOTE_PATH, label: 'rb1-chat-ref.md', mime: 'text/markdown' };

/**
 * Fake vault backing the shared R-B1 processor (same shape as the finalization
 * autolink tests): the reference note exists and carries the heading.
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

function createAutoLinkService(enabled = true): AssistantAutoInternalLinkService {
  return new AssistantAutoInternalLinkService(createInlineEditAutoLinkProcessor({
    app: createFakeVaultApp({ [NOTE_PATH]: [NOTE_HEADING] }) as never,
    isEnabled: () => enabled,
    getExcludedTerms: () => [],
  }));
}

/**
 * Server-shaped canonical state for one completed turn. `withAttachment`
 * mirrors whether the attachment survived the server round trip (opencode
 * stores the context file part and hydration re-derives it).
 */
function createCanonicalTurnFixture(withAttachment: boolean) {
  const userInfo = { id: 'user-server', role: 'user', sessionID: SESSION_ID, time: { created: 10 } };
  const userParts = [{
    id: 'part-user-server',
    sessionID: SESSION_ID,
    messageID: 'user-server',
    type: 'text',
    text: USER_TEXT,
  }];
  const assistantInfo = {
    id: 'assistant-server',
    role: 'assistant',
    sessionID: SESSION_ID,
    time: { created: 20 },
  };
  const assistantParts = [{
    id: 'part-assistant-server',
    sessionID: SESSION_ID,
    messageID: 'assistant-server',
    type: 'text',
    text: GENERATED,
  }];
  const userAttachments = withAttachment ? [ATTACHMENT] : undefined;

  /**
   * Mirrors production hydration: server text only (never the local rewrite),
   * with the attachment echo on the user message when the server stored it.
   */
  const hydrate = (info: Record<string, unknown>, parts: Record<string, unknown>[]): ChatMessage => {
    const isUser = info.role === 'user';
    return {
      id: String(info.id),
      role: isUser ? 'user' : 'assistant',
      content: isUser ? USER_TEXT : GENERATED,
      timestamp: (info.time as { created: number }).created,
      sourceMessageId: String(info.id),
      ...(isUser && userAttachments ? { contextAttachments: userAttachments } : {}),
      parts: parts as never,
    };
  };

  const canonicalSessionMessages = [
    { info: userInfo, parts: userParts },
    { info: assistantInfo, parts: assistantParts },
  ];

  const canonicalRenderSource: ConversationCanonicalRenderSource = {
    getCanonicalSessionState: jest.fn().mockImplementation((sessionId: string) => {
      if (sessionId !== SESSION_ID) {
        return null;
      }
      return {
        sessionID: SESSION_ID,
        messages: [userInfo, assistantInfo] as never[],
        partsByMessageID: {
          [String(userInfo.id)]: userParts as never,
          [String(assistantInfo.id)]: assistantParts as never,
        },
      };
    }),
    hydrateOpenCodeMessage: jest.fn().mockImplementation(
      (info, parts) => hydrate(info as never, parts as never),
    ),
    getLocalTurnDiffNotices: jest.fn().mockReturnValue([]),
  };

  return { hydrate, canonicalSessionMessages, canonicalRenderSource };
}

type Mocked<T> = {
  [Key in keyof T]:
    T[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : T[Key];
};

function createSyncHost(
  fixture: ReturnType<typeof createCanonicalTurnFixture>,
): Mocked<ConversationAuthoritativeSyncHost> {
  return {
    getVaultBasePath: jest.fn().mockReturnValue(undefined),
    getTabRuntimeState: jest.fn().mockReturnValue(null),
    getCurrentConversationId: jest.fn().mockReturnValue(null),
    getCurrentConversationRevertState: jest.fn().mockReturnValue(null),
    getActiveTabId: jest.fn().mockReturnValue('tab-1'),
    getSessionMessages: jest.fn().mockResolvedValue([]),
    getCanonicalSessionMessages: jest.fn().mockReturnValue(fixture.canonicalSessionMessages as never),
    getSessionRevertState: jest.fn().mockResolvedValue(null),
    hydrateOpenCodeMessage: jest.fn().mockImplementation(
      (info, parts) => fixture.hydrate(info as never, parts as never),
    ),
    shouldRenderConversationMessage: jest.fn().mockReturnValue(true),
    getConversationSyncFingerprint: jest.fn().mockImplementation((messages: ChatMessage[]) =>
      JSON.stringify(messages.map((message) => ({
        id: message.id,
        sourceMessageId: message.sourceMessageId ?? null,
        streamState: message.streamState ?? null,
        displayStyle: message.displayStyle ?? null,
        content: message.content,
        contentBlocks: message.contentBlocks ?? null,
        timestamp: message.timestamp,
      })))),
    getInterruptedSyncPreservationLogFingerprint: jest.fn().mockImplementation(
      (conversation: Conversation, messages: ChatMessage[]) =>
        JSON.stringify({ conversationId: conversation.id, ids: messages.map((m) => m.id) }),
    ),
    createConversationWriteTicket: jest.fn().mockImplementation((conversationId: string) => ({
      conversationId,
      version: 0,
    })),
    commitConversationWrite: jest.fn().mockImplementation(async (
      _conversation: Conversation,
      _ticket,
      _reason,
      write,
    ) => {
      await write();
      return true;
    }),
    logOmoBackgroundTaskDiagnostics: jest.fn(),
    markBackgroundTaskAuthoritativeSync: jest.fn(),
    refreshContextUsageAfterActiveConversationSync: jest.fn().mockResolvedValue(undefined),
    armBackgroundTaskIndicatorForUserMessage: jest.fn(),
    updateHydratedUserMessageRuntimeAnchors: jest.fn(),
    rerenderSingleUserMessage: jest.fn().mockResolvedValue(undefined),
    renderBackgroundTaskIndicatorIfNeeded: jest.fn().mockResolvedValue(undefined),
    summarizeChatMessageForDebug: jest.fn().mockReturnValue(null),
    logAssistantFinalizationDebug: jest.fn(),
    stringifyLogPayload: jest.fn().mockImplementation((payload: unknown) => JSON.stringify(payload)),
    getLogPreview: jest.fn().mockImplementation((text: string) => text),
  };
}

interface Harness {
  readonly conversation: Conversation;
  readonly renderHost: ReturnType<typeof createRenderHost>;
  readonly syncHost: Mocked<ConversationAuthoritativeSyncHost>;
  readonly service: MessageFinalizationService;
}

function createHarness(options?: { readonly enabled?: boolean; readonly withAttachment?: boolean }): Harness {
  const enabled = options?.enabled ?? true;
  const withAttachment = options?.withAttachment ?? true;
  const fixture = createCanonicalTurnFixture(withAttachment);
  const autoLinks = createAutoLinkService(enabled);

  const conversation = createConversation([
    createMessage({
      id: 'user-local',
      role: 'user',
      content: USER_TEXT,
      timestamp: 1,
      ...(withAttachment ? { contextAttachments: [ATTACHMENT] } : {}),
    }),
  ]);
  conversation.openCodeSessionId = SESSION_ID;

  const syncHost = createSyncHost(fixture);
  const syncCoordinator = new ConversationAuthoritativeSyncCoordinator(syncHost, autoLinks);

  const renderHost = createRenderHost();
  // The render host must resolve the same conversation so the canonical
  // projection path (opencode backend + session id) is exercised.
  (renderHost.getCurrentConversation as jest.Mock).mockReturnValue(conversation);
  const renderService = new ConversationRenderService(
    renderHost as never,
    fixture.canonicalRenderSource,
    autoLinks,
  );

  const finalizationHost = createFinalizationHost(conversation, {
    syncConversationMessagesFromCanonicalState: jest.fn().mockImplementation(
      async (target: Conversation, tabId: string | null, reason: string) =>
        syncCoordinator.syncConversationMessagesFromCanonicalState(target, tabId, reason),
    ),
    applySyncedConversationUpdate: jest.fn().mockImplementation(
      async (previous: ChatMessage[], next: ChatMessage[]) =>
        renderService.applySyncedConversationUpdate(previous, next),
    ),
  } as never);

  const service = new MessageFinalizationService(finalizationHost as never, autoLinks);
  return { conversation, renderHost, syncHost, service };
}

async function runFinalization(harness: Harness, withAttachment = true): Promise<void> {
  await harness.service.finalizeAfterStream({
    conversation: harness.conversation,
    tabId: 'tab-1',
    shouldSyncFromServer: true,
    editedFiles: [],
    contextItems: withAttachment ? [{
      id: 'ctx-1',
      kind: 'file',
      path: NOTE_PATH,
      label: 'rb1-chat-ref.md',
      mime: 'text/markdown',
    }] : [],
    logStage: jest.fn(),
  });
}

function renderedText(harness: Harness): string {
  return harness.renderHost.messagesEl.textContent ?? '';
}

describe('MessageFinalizationService R-B1 turn-boundary consistency (real sync + render)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('leaves the stored text AND the rendered DOM linked at the turn boundary (synced opencode path)', async () => {
    const harness = createHarness();
    await runFinalization(harness);

    // (a) storage: the adopted assistant text carries the verified wikilink.
    const tail = harness.conversation.messages[harness.conversation.messages.length - 1];
    expect(tail?.role).toBe('assistant');
    expect(tail?.content).toBe(LINKED);

    // (b) render: the DOM the same finalization produced carries the SAME
    // link — zero anchors here is the live defect.
    expect(renderedText(harness)).toContain(`[[${NOTE_PATH}#${NOTE_HEADING}]]`);
  });

  it('keeps the link when a later authoritative canonical resync adopts server text (post-reload path)', async () => {
    const harness = createHarness();
    await runFinalization(harness);

    // Simulate the post-reload authoritative resync over the persisted
    // (linked) conversation: the canonical state still holds raw server text.
    const syncCoordinator = new ConversationAuthoritativeSyncCoordinator(
      harness.syncHost,
      createAutoLinkService(),
    );
    await syncCoordinator.syncConversationMessagesFromCanonicalState(
      harness.conversation,
      'tab-1',
      'conversation-reload',
    );

    const tail = harness.conversation.messages[harness.conversation.messages.length - 1];
    expect(tail?.content).toBe(LINKED);
  });

  it('rewrites nothing when the turn carries no note attachments (fail-closed)', async () => {
    const harness = createHarness({ withAttachment: false });
    await runFinalization(harness, false);

    const tail = harness.conversation.messages[harness.conversation.messages.length - 1];
    // No references ⇒ no rewrite anywhere: storage and DOM show the raw
    // server text, and neither side ever sees a link to lose.
    expect(tail?.content).toBe(GENERATED);
    expect(renderedText(harness)).not.toContain('[[');
  });

  it('stores and renders byte-identical server text when the setting is off', async () => {
    const harness = createHarness({ enabled: false });
    await runFinalization(harness);

    const tail = harness.conversation.messages[harness.conversation.messages.length - 1];
    expect(tail?.content).toBe(GENERATED);
    expect(renderedText(harness)).not.toContain('[[');
  });
});
