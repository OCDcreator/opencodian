import { capturedNotices, clearCapturedNotices } from 'obsidian';

import { MessageSendPreparationService } from '../../../../src/features/chat/services/MessageSendPreparationService';
import { buildContextAttachment } from '../../../../src/shared';
import {
  createComposerSendContext,
  createConversation,
  createHost,
  createPromptContextItem,
} from './MessageSendPreparationService.testSupport';

/**
 * R-B2 send-path parity: a context entry whose vault path no longer resolves
 * (deleted/moved/trashed after attach) must never fail the turn with a raw
 * "File not found" filesystem error as the assistant reply. It is skipped
 * with the group-attach notice vocabulary, its draft chip is dropped, and the
 * remaining context rides along unchanged.
 */
describe('MessageSendPreparationService missing context paths', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearCapturedNotices();
  });

  it('sends with the remaining context intact when one attached path no longer exists', async () => {
    const conversation = createConversation();
    const existingItem = createPromptContextItem({
      id: 'context-existing',
      path: 'notes/alive.md',
      label: 'alive.md',
    });
    const missingItem = createPromptContextItem({
      id: 'context-deleted',
      kind: 'file',
      path: 'rb1-chat-ref.md',
      label: 'rb1-chat-ref.md',
      lineRange: undefined,
      textSnapshot: undefined,
    });
    const composerSendContext = createComposerSendContext([], {
      getDraftContextItems: jest.fn().mockReturnValue([existingItem, missingItem]),
      hasVaultEntryAtPath: jest.fn()
        .mockImplementation((path: string) => path !== 'rb1-chat-ref.md'),
    });
    const host = createHost(conversation);
    const service = new MessageSendPreparationService(host, composerSendContext);

    const result = await service.prepareMessageSend({ content: 'Hello' });

    expect(result).not.toBeNull();
    // The request and the optimistic user message carry only living entries.
    expect(result?.contextItems).toEqual([existingItem]);
    expect(host.buildStructuredPromptSendPayload).toHaveBeenCalledWith('Hello', {
      contextItems: [existingItem],
    });
    expect(result?.userMessage.contextAttachments).toEqual([buildContextAttachment(existingItem)]);
    // The stale chip is dropped from the composer draft store.
    expect(composerSendContext.removeDraftContextItemsByPaths).toHaveBeenCalledWith(
      ['rb1-chat-ref.md'],
      'tab-1',
    );
    // Honest notice: names the missing vault path, never the raw exception
    // text or an absolute machine path.
    expect(capturedNotices).toHaveLength(1);
    expect(capturedNotices[0]).toContain('rb1-chat-ref.md');
    expect(capturedNotices[0]).toContain('1');
    expect(capturedNotices[0]).not.toContain('File not found');
    expect(capturedNotices[0]).not.toContain('/Volumes/');
  });

  it('still sends when every attached path is missing, with the notice and no context', async () => {
    const conversation = createConversation();
    const firstMissing = createPromptContextItem({
      id: 'context-deleted-1',
      kind: 'file',
      path: 'notes/gone-one.md',
      label: 'gone-one.md',
      lineRange: undefined,
      textSnapshot: undefined,
    });
    const secondMissing = createPromptContextItem({
      id: 'context-deleted-2',
      kind: 'file',
      path: 'notes/gone-two.md',
      label: 'gone-two.md',
      lineRange: undefined,
      textSnapshot: undefined,
    });
    const composerSendContext = createComposerSendContext([], {
      getDraftContextItems: jest.fn().mockReturnValue([firstMissing, secondMissing]),
      hasVaultEntryAtPath: jest.fn().mockReturnValue(false),
    });
    const host = createHost(conversation);
    const service = new MessageSendPreparationService(host, composerSendContext);

    const result = await service.prepareMessageSend({ content: 'Hello' });

    expect(result).not.toBeNull();
    expect(result?.contextItems).toEqual([]);
    expect(host.buildStructuredPromptSendPayload).toHaveBeenCalledWith('Hello', {
      contextItems: [],
    });
    expect(result?.userMessage.contextAttachments).toBeUndefined();
    expect(composerSendContext.removeDraftContextItemsByPaths).toHaveBeenCalledWith(
      ['notes/gone-one.md', 'notes/gone-two.md'],
      'tab-1',
    );
    expect(capturedNotices).toHaveLength(1);
    expect(capturedNotices[0]).toContain('notes/gone-one.md');
    expect(capturedNotices[0]).toContain('notes/gone-two.md');
  });

  it('leaves a fully valid context set unchanged with no notice and no chip pruning', async () => {
    const conversation = createConversation();
    const existingItem = createPromptContextItem({
      id: 'context-existing',
      path: 'notes/alive.md',
      label: 'alive.md',
    });
    const composerSendContext = createComposerSendContext([], {
      getDraftContextItems: jest.fn().mockReturnValue([existingItem]),
      hasVaultEntryAtPath: jest.fn().mockReturnValue(true),
    });
    const host = createHost(conversation);
    const service = new MessageSendPreparationService(host, composerSendContext);

    const result = await service.prepareMessageSend({ content: 'Hello' });

    expect(result).not.toBeNull();
    expect(result?.contextItems).toEqual([existingItem]);
    expect(composerSendContext.removeDraftContextItemsByPaths).not.toHaveBeenCalled();
    expect(capturedNotices).toHaveLength(0);
  });

  it('compacts more than three missing entries with the groupMissingMore vocabulary', async () => {
    const conversation = createConversation();
    const missingItems = ['a.md', 'b.md', 'c.md', 'd.md', 'e.md'].map((path, index) =>
      createPromptContextItem({
        id: `context-deleted-${index}`,
        kind: 'file',
        path: `notes/${path}`,
        label: path,
        lineRange: undefined,
        textSnapshot: undefined,
      }));
    const composerSendContext = createComposerSendContext([], {
      getDraftContextItems: jest.fn().mockReturnValue(missingItems),
      hasVaultEntryAtPath: jest.fn().mockReturnValue(false),
    });
    const host = createHost(conversation);
    const service = new MessageSendPreparationService(host, composerSendContext);

    const result = await service.prepareMessageSend({ content: 'Hello' });

    expect(result).not.toBeNull();
    expect(capturedNotices).toHaveLength(1);
    expect(capturedNotices[0]).toContain('notes/a.md');
    expect(capturedNotices[0]).toContain('2');
    expect(capturedNotices[0]).not.toContain('notes/d.md');
  });
});
