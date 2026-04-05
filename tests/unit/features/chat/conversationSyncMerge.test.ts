import { WorkspaceLeaf } from 'obsidian';

jest.mock('../../../../src/core/opencode', () => ({
  OpenCodeService: class OpenCodeService {
    static openCodeMessageToChatMessage = jest.fn();
  },
}));

import { OpenCodianView } from '../../../../src/features/chat/OpenCodianView';

describe('OpenCodianView synced assistant merge preservation', () => {
  function createView(overrides: Record<string, unknown> = {}): OpenCodianView {
    return new OpenCodianView(new WorkspaceLeaf(), {
      settings: {
        effortLevel: 'medium',
        thinkingBudget: 0,
        locale: 'en',
      },
      openCodeService: {},
      saveConversation: jest.fn().mockResolvedValue(undefined),
      storage: {},
      ...overrides,
    } as never);
  }

  it('preserves richer local assistant content blocks when synced text matches but omits tool metadata', () => {
    const view = createView() as unknown as {
      mergeClientOnlyMessageFields: (
        existingMessage: Record<string, unknown>,
        syncedMessage: Record<string, unknown>,
      ) => Record<string, unknown>;
    };

    const merged = view.mergeClientOnlyMessageFields(
      {
        id: 'assistant-local',
        role: 'assistant',
        content: 'answer',
        timestamp: 1,
        sourceMessageId: 'msg-1',
        contentBlocks: [
          { type: 'tool_use', toolId: 'tool-1', toolName: 'structured_output' },
          { type: 'text', text: 'answer' },
        ],
      },
      {
        id: 'assistant-server',
        role: 'assistant',
        content: 'answer',
        timestamp: 2,
        sourceMessageId: 'msg-1',
        contentBlocks: [
          { type: 'text', text: 'answer' },
        ],
      },
    );

    expect(merged).toMatchObject({
      id: 'assistant-server',
      sourceMessageId: 'msg-1',
      content: 'answer',
      contentBlocks: [
        { type: 'tool_use', toolId: 'tool-1', toolName: 'structured_output' },
        { type: 'text', text: 'answer' },
      ],
    });
  });
});
