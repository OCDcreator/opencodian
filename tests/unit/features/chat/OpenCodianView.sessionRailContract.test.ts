/**
 * OpenCodianView session rail behaviour (R-F5 quality follow-up).
 *
 * The previous version of this file asserted on the *source text* of
 * OpenCodianView.ts: `readFileSync`, `String.match` counts and `indexOf`
 * ordering. That proves a string is present, not that the rail behaves
 * correctly — a rename or a reordering inside the method kept the test green
 * while the behaviour changed.
 *
 * These tests drive a real `OpenCodianView` and read the rendered rail DOM:
 *   - the rail and the history actions consume the SAME active-backend
 *     filtering result;
 *   - a persisted title change refreshes the rail;
 *   - both history deletion paths refresh the rail from their `finally`
 *     block, so the rail recovers even when the deletion itself throws.
 */

import { WorkspaceLeaf } from 'obsidian';

jest.mock('../../../../src/core/opencode', () => ({
  OpenCodeService: class OpenCodeService {
    static openCodeMessageToChatMessage = jest.fn();
  },
}));

import type { Conversation } from '../../../../src/core/types';
import { DEFAULT_SETTINGS } from '../../../../src/core/types';
import { OpenCodianView } from '../../../../src/features/chat/OpenCodianView';
import { setLocale, t } from '../../../../src/i18n';

interface ViewInternals {
  messagesShellEl: HTMLElement | null;
  currentConversation: Conversation | null;
  conversationSessionRailCoordinator: {
    host: { getConversations(): Conversation[] };
  };
  createConversationHistoryActionsHost(service: unknown): {
    getConversations(): Conversation[];
  };
  updateConversationTitleState(
    conversationId: string,
    update: { title?: string; titleGenerationStatus?: 'pending' | 'success' | 'failed' },
  ): Promise<void>;
  deleteConversationsAndCleanupTabs(conversationIds: string[]): Promise<void>;
  deleteAllConversationsAndReset(conversationIds: string[]): Promise<void>;
  refreshCurrentConversationRendering(): void;
  conversationLoadRecoveryCoordinator: {
    deleteConversationsAndRecover(ids: string[]): Promise<void>;
    deleteAllConversationsAndReset(ids: string[]): Promise<void>;
  };
}

function conversation(id: string, title: string, backend: string): Conversation {
  return {
    id,
    title,
    backend,
    createdAt: 1000,
    updatedAt: 1000,
    messages: [],
    openCodeSessionId: `${id}-session`,
  } as Conversation;
}

function createHarness(options: {
  conversations: Conversation[];
  activeBackend?: string;
}): { view: OpenCodianView; internals: ViewInternals; saveConversation: jest.Mock } {
  const saveConversation = jest.fn().mockResolvedValue(undefined);
  const view = new OpenCodianView(new WorkspaceLeaf(), {
    settings: {
      ...DEFAULT_SETTINGS,
      locale: 'en',
      enabledBackends: ['opencode', 'codex'],
      activeBackend: options.activeBackend ?? 'opencode',
      chatSessionRailEnabled: true,
    },
    openCodeService: {},
    storage: {},
    getConversations: () => options.conversations,
    saveConversation,
    getConversationById: async (id: string) =>
      options.conversations.find((item) => item.id === id) ?? null,
  } as never);

  const internals = view as unknown as ViewInternals;
  // The rail renders into the shell the view mounts at runtime; the tests only
  // need the element, not the rest of the chat shell.
  const shellEl = document.body.createDiv({ cls: 'opencodian-messages-shell' });
  internals.messagesShellEl = shellEl;
  return { view, internals, saveConversation };
}

function railItemTitles(): string[] {
  return Array.from(document.querySelectorAll('.opencodian-session-rail-item-title'))
    .map((el) => el.textContent ?? '');
}

describe('OpenCodianView session rail behaviour (R-F5)', () => {
  beforeEach(() => {
    setLocale('en');
    document.body.empty();
  });

  afterEach(() => {
    document.body.empty();
    jest.restoreAllMocks();
  });

  it('feeds the rail and the history actions from the same active-backend list', () => {
    const { view, internals } = createHarness({
      conversations: [
        conversation('a', 'OpenCode A', 'opencode'),
        conversation('b', 'Codex B', 'codex'),
        conversation('c', 'OpenCode C', 'opencode'),
      ],
    });

    const railList = internals.conversationSessionRailCoordinator.host.getConversations();
    const historyList = internals.createConversationHistoryActionsHost({}).getConversations();

    expect(railList.map((item) => item.id)).toEqual(['a', 'c']);
    expect(historyList.map((item) => item.id)).toEqual(railList.map((item) => item.id));

    // The shared predicate really is backend-scoped: the rendered rail agrees.
    internals.refreshCurrentConversationRendering();
    expect(railItemTitles()).toEqual(['OpenCode A', 'OpenCode C']);

    // Switching the active backend moves both lists together.
    (view as unknown as { plugin: { settings: { activeBackend: string } } }).plugin.settings.activeBackend = 'codex';
    expect(internals.conversationSessionRailCoordinator.host.getConversations().map((item) => item.id))
      .toEqual(['b']);
    expect(internals.createConversationHistoryActionsHost({}).getConversations().map((item) => item.id))
      .toEqual(['b']);
  });

  it('refreshes the rail after a persisted title change', async () => {
    const { internals, saveConversation } = createHarness({
      conversations: [conversation('a', 'Old title', 'opencode')],
    });
    internals.refreshCurrentConversationRendering();
    expect(railItemTitles()).toEqual(['Old title']);

    await internals.updateConversationTitleState('a', { title: 'New title' });

    expect(saveConversation).toHaveBeenCalled();
    expect(railItemTitles()).toEqual(['New title']);
  });

  it('refreshes the rail from the finally block when a single-conversation delete throws', async () => {
    const conversations = [
      conversation('a', 'Keep me', 'opencode'),
      conversation('b', 'Delete me', 'opencode'),
    ];
    const { internals } = createHarness({ conversations });
    internals.refreshCurrentConversationRendering();
    expect(railItemTitles()).toEqual(['Keep me', 'Delete me']);

    // The deletion removes 'b' from the source list but then fails.
    internals.conversationLoadRecoveryCoordinator.deleteConversationsAndRecover = jest.fn(async () => {
      conversations.splice(1, 1);
      throw new Error('delete failed');
    });

    await expect(internals.deleteConversationsAndCleanupTabs(['b'])).rejects.toThrow('delete failed');

    // The finally-block refresh already reconciled the rail with reality.
    expect(railItemTitles()).toEqual(['Keep me']);
  });

  it('refreshes the rail from the finally block when delete-all throws', async () => {
    const conversations = [
      conversation('a', 'First', 'opencode'),
      conversation('b', 'Second', 'opencode'),
    ];
    const { internals } = createHarness({ conversations });
    internals.refreshCurrentConversationRendering();
    expect(railItemTitles()).toHaveLength(2);

    internals.conversationLoadRecoveryCoordinator.deleteAllConversationsAndReset = jest.fn(async () => {
      conversations.length = 0;
      throw new Error('delete-all failed');
    });

    await expect(internals.deleteAllConversationsAndReset(['a', 'b'])).rejects.toThrow('delete-all failed');

    expect(railItemTitles()).toEqual([]);
    expect(document.querySelector('.opencodian-session-rail-empty')?.textContent)
      .toBe(t('chat.sessionRail.empty'));
  });
});
