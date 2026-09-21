/**
 * Linked-note binding save contract (R-F2 quality follow-up).
 *
 * The review found that `ConversationSessionSettingsModal.handleSave` always
 * passed the select's current value to `onSave`, and the coordinator wrote it
 * back whenever it was not `undefined`. Because the select is populated once in
 * `createLinkedNoteSection` from `conversation.linkedNotePath`, a vault rename
 * that landed while the modal stayed open (main.ts
 * `followConversationLinkedNoteRename` mutates the same conversation object)
 * was silently reverted by the next "save other settings": the stale path
 * captured at open time overwrote the rename follow.
 *
 * The fixed contract distinguishes the three states of the binding field:
 *   - `undefined` — the user never touched the binding, so nothing is written
 *     back and a concurrent rename follow survives;
 *   - `null`      — the user explicitly unbound the conversation;
 *   - `string`    — the user explicitly chose that path.
 *
 * These tests drive the REAL modal (no module mock) wired to a REAL
 * coordinator, so the interleaving is exercised end to end.
 */

import type { Conversation } from '../../../../src/core/types';
import {
  ConversationSessionSettingsCoordinator,
  type ConversationSessionSettingsCoordinatorHost,
} from '../../../../src/features/chat/services/ConversationSessionSettingsCoordinator';
import { ConversationSessionSettingsModal } from '../../../../src/features/chat/ui/ConversationSessionSettingsModal';
import { setLocale } from '../../../../src/i18n';

interface Wired {
  conversation: Conversation;
  saveConversation: jest.Mock;
  openSettings(): Promise<void>;
  select(): HTMLSelectElement;
  save(): Promise<void>;
}

function createConversation(linkedNotePath?: string): Conversation {
  return {
    id: 'conversation-1',
    title: 'Session Settings',
    createdAt: 1,
    updatedAt: 1,
    openCodeSessionId: 'session-1',
    messages: [],
    ...(linkedNotePath ? { linkedNotePath } : {}),
  };
}

/** Build a coordinator whose modal is the real implementation, and open it. */
async function openRealSettingsModal(conversation: Conversation): Promise<Wired> {
  const chatContainerEl = document.createElement('div');
  const saveConversation = jest.fn().mockResolvedValue(undefined);
  const host = {
    app: {} as never,
    getCurrentConversation: jest.fn().mockReturnValue(conversation),
    getSessionSettingsDefaults: jest.fn().mockReturnValue({ chatFontSizePx: 13 }),
    getChatContainerEl: jest.fn().mockReturnValue(chatContainerEl),
    listMarkdownNotePaths: jest.fn().mockReturnValue(['drafts/old.md', 'drafts/new.md', 'drafts/other.md']),
    noteExists: jest.fn().mockReturnValue(true),
    saveConversation,
    showNotice: jest.fn(),
    supportsSessionSharing: jest.fn().mockReturnValue(false),
    supportsCompaction: jest.fn().mockReturnValue(false),
    canOpenExperimentalActions: jest.fn().mockReturnValue(false),
    openExperimentalActions: jest.fn(),
  } as unknown as jest.Mocked<ConversationSessionSettingsCoordinatorHost>;

  const coordinator = new ConversationSessionSettingsCoordinator(host);
  // Drive the real modal without `Modal.open()`, which needs a live Obsidian
  // app: `onOpen()` is what builds the content, and `contentEl` is a real
  // detached element the DOM queries below can search.
  const openSpy = jest.spyOn(ConversationSessionSettingsModal.prototype, 'open')
    .mockImplementation(function mockOpen(this: ConversationSessionSettingsModal) {
      this.onOpen();
    });
  try {
    await coordinator.openCurrentConversationSettings();
  } finally {
    openSpy.mockRestore();
  }

  const activeModal = (coordinator as unknown as {
    activeModal: ConversationSessionSettingsModal | null;
  }).activeModal;
  if (!activeModal) {
    throw new Error('Expected the coordinator to hold an open session settings modal');
  }
  const modalEl = activeModal.contentEl;
  const selectEl = modalEl.querySelector<HTMLSelectElement>('[data-linked-note-path="true"]');
  const saveButton = modalEl.querySelector<HTMLButtonElement>('.opencodian-session-settings-save');
  if (!selectEl || !saveButton) {
    throw new Error('Expected linked-note select and save button');
  }

  return {
    conversation,
    saveConversation,
    openSettings: async () => undefined,
    select: () => selectEl,
    save: async () => {
      saveButton.click();
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}

describe('linked-note binding save contract (R-F2)', () => {
  beforeEach(() => {
    setLocale('en');
    document.body.empty();
  });

  afterEach(() => {
    document.body.empty();
  });

  it('does not write back the binding when the user only saved other settings', async () => {
    const wired = await openRealSettingsModal(createConversation('drafts/old.md'));
    // The select was populated from the binding at open time; the user does not
    // touch it and saves an unrelated setting.
    expect(wired.select().value).toBe('drafts/old.md');

    await wired.save();

    expect(wired.conversation.linkedNotePath).toBe('drafts/old.md');
    expect(wired.saveConversation).toHaveBeenCalledTimes(1);
  });

  it('preserves a rename follow that landed while the modal stayed open', async () => {
    const conversation = createConversation('drafts/old.md');
    const wired = await openRealSettingsModal(conversation);
    expect(wired.select().value).toBe('drafts/old.md');

    // main.ts followConversationLinkedNoteRename mutates the same object.
    conversation.linkedNotePath = 'drafts/new.md';

    // The user only saves other settings; the stale select value must not win.
    await wired.save();

    expect(conversation.linkedNotePath).toBe('drafts/new.md');
  });

  it('clears the binding when the user explicitly unbinds', async () => {
    const wired = await openRealSettingsModal(createConversation('drafts/old.md'));

    wired.select().value = '';
    wired.select().dispatchEvent(new Event('change', { bubbles: true }));
    await wired.save();

    expect(wired.conversation.linkedNotePath).toBeUndefined();
  });

  it('persists a path the user explicitly picked', async () => {
    const wired = await openRealSettingsModal(createConversation('drafts/old.md'));

    wired.select().value = 'drafts/other.md';
    wired.select().dispatchEvent(new Event('change', { bubbles: true }));
    await wired.save();

    expect(wired.conversation.linkedNotePath).toBe('drafts/other.md');
  });

  it('still writes an explicit binding when a rename follow raced the modal', async () => {
    const conversation = createConversation('drafts/old.md');
    const wired = await openRealSettingsModal(conversation);

    conversation.linkedNotePath = 'drafts/new.md';
    wired.select().value = 'drafts/other.md';
    wired.select().dispatchEvent(new Event('change', { bubbles: true }));
    await wired.save();

    // An explicit user choice wins over the rename follow — that is the point.
    expect(conversation.linkedNotePath).toBe('drafts/other.md');
  });
});
