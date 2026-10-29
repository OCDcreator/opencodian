import type { ChatMessage, PromptSessionReferenceSnapshot } from '../../../../../src/core/types/chat';
import { ConversationAuthoritativeMessageMergeCoordinator, mergePiNativeConversationMessages } from '../../../../../src/features/chat/services/sync/ConversationAuthoritativeMessageMergeCoordinator';

const capture: PromptSessionReferenceSnapshot = {
  reference: { version: 1, id: 'source', kind: 'session', label: 'Earlier decision', vaultPath: '/vault',
    backend: 'claude-code', conversationId: 'c1', sessionId: 'native-source' },
  strategy: 'snapshot', source: 'backend', capturedAt: 123, messageCount: 1,
  omittedMessages: 0, truncated: false, text: 'Keep the agreed interface.',
};
const user = (): ChatMessage => ({ id: 'local', role: 'user', content: 'Use @Earlier decision',
  timestamp: 1, sourceMessageId: 'u1', sessionReferences: [capture] });

describe('session reference evidence during native transcript synchronization', () => {
  it.each(['opencode2', 'claude-code', 'codex', 'zcode', 'dsh'])('%s retains the captured source and readable user text', (backend) => {
    const coordinator = new ConversationAuthoritativeMessageMergeCoordinator({
      logAssistantFinalizationDebug: jest.fn(), summarizeChatMessageForDebug: jest.fn(),
    });
    const synced: ChatMessage = { ...user(), id: 'server', content: 'Use native reference plus expanded history',
      sessionReferences: undefined, contentBlocks: [{ type: 'text', text: 'Expanded history' }] };
    const [result] = coordinator.mergeSyncedConversationMessages([user()], [synced], false, backend);
    expect(result.sessionReferences).toEqual([capture]);
    expect(result.content).toBe('Use @Earlier decision');
    expect(result.contentBlocks).toBeUndefined();
  });

  it('Pi keeps reference evidence on the matched native user identity', () => {
    const result = mergePiNativeConversationMessages([user()], [{ ...user(), id: 'native',
      content: 'Native prefix Use @Earlier decision', sessionReferences: undefined }]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 'local', content: 'Use @Earlier decision', sessionReferences: [capture] });
  });

  it('ordinary authoritative text updates continue to replace unreferenced local messages', () => {
    const coordinator = new ConversationAuthoritativeMessageMergeCoordinator({
      logAssistantFinalizationDebug: jest.fn(), summarizeChatMessageForDebug: jest.fn(),
    });
    const local = { ...user(), sessionReferences: undefined };
    const result = coordinator.mergeClientOnlyMessageFields(local, { ...local, content: 'Canonical correction' }, false);
    expect(result.content).toBe('Canonical correction');
  });

  it('retains native plugin identities and readable text when there is no session snapshot', () => {
    const coordinator = new ConversationAuthoritativeMessageMergeCoordinator({
      logAssistantFinalizationDebug: jest.fn(), summarizeChatMessageForDebug: jest.fn(),
    });
    const local: ChatMessage = { ...user(), sessionReferences: undefined, content: 'Use @Review',
      promptReferences: [{ version: 1, id: 'review', kind: 'plugin', label: 'Review',
        vaultPath: '/vault', backend: 'codex', nativePath: 'plugin://review' }] };
    const [result] = coordinator.mergeSyncedConversationMessages([local], [{ ...local,
      content: 'Use [Review](plugin://review)', promptReferences: undefined }], false, 'codex');
    expect(result.content).toBe('Use @Review');
    expect(result.promptReferences).toEqual(local.promptReferences);
  });
});
