import { WorkspaceLeaf } from 'obsidian';

jest.mock('../../../../src/core/opencode', () => ({
  OpenCodeService: class OpenCodeService {
    static openCodeMessageToChatMessage = jest.fn();
  },
}));

import { OpenCodianView } from '../../../../src/features/chat/OpenCodianView';

describe('OpenCodianView interrupted conversation sync preservation', () => {
  function createView(overrides: Record<string, unknown> = {}): OpenCodianView {
    return new OpenCodianView(new WorkspaceLeaf(), {
      settings: {
        effortLevel: 'medium',
        thinkingBudget: 0,
        locale: 'en',
      },
      openCodeService: {
        getSessionMessages: jest.fn().mockResolvedValue([]),
        getSessionRevertState: jest.fn().mockResolvedValue(null),
      },
      saveConversation: jest.fn().mockResolvedValue(undefined),
      storage: {},
      ...overrides,
    } as never);
  }

  it('preserves a local interrupted assistant message when server sync has no matching message', async () => {
    const view = createView() as unknown as {
      syncConversationMessagesFromServer: (conversation: Record<string, unknown>, tabId: string) => Promise<{
        messages: Array<Record<string, unknown>>;
      }>;
      getTabRuntimeState: () => { lastConversationSyncFingerprint: string | null };
    };
    jest.spyOn(view, 'getTabRuntimeState').mockReturnValue({
      lastConversationSyncFingerprint: null,
    });

    const conversation = {
      id: 'conv-1',
      title: 'Conversation',
      openCodeSessionId: 'session-1',
      messages: [
        {
          id: 'assistant-local-1',
          role: 'assistant',
          content: 'Partial interrupted reply',
          timestamp: 1000,
          streamState: 'interrupted',
          contentBlocks: [
            {
              type: 'text',
              text: 'Partial interrupted reply',
            },
          ],
        },
      ],
      updatedAt: 1000,
    };

    const result = await view.syncConversationMessagesFromServer(conversation, 'tab-1');

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toMatchObject({
      id: 'assistant-local-1',
      streamState: 'interrupted',
      content: 'Partial interrupted reply',
    });
  });
});
