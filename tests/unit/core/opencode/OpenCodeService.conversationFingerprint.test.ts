import { OpenCodeService } from './OpenCodeService.testSupport';

describe('OpenCodeService.getCanonicalConversationFingerprint', () => {
  it('changes when assistant tool-first canonical parts change without visible text', () => {
    const blankAssistant = [
      {
        id: 'assistant-blank',
        role: 'assistant' as const,
        content: '',
        timestamp: 1,
        sourceMessageId: 'assistant-blank',
        parts: [
          {
            id: 'part-text',
            sessionID: 'session-1',
            messageID: 'assistant-blank',
            type: 'text',
            text: '',
          },
        ],
      },
    ];
    const toolFirstAssistant = [
      {
        ...blankAssistant[0],
        contentBlocks: [
          {
            type: 'tool_use' as const,
            toolId: 'call-read-1',
            toolName: 'read',
            toolInput: { filePath: 'docs/architecture/README.md' },
            toolStatus: 'running' as const,
          },
        ],
        parts: [
          ...(blankAssistant[0].parts ?? []),
          {
            id: 'part-tool',
            sessionID: 'session-1',
            messageID: 'assistant-blank',
            type: 'tool',
            callID: 'call-read-1',
            tool: 'read',
            state: {
              status: 'running',
              input: { filePath: 'docs/architecture/README.md' },
            },
          },
        ],
      },
    ];

    expect(OpenCodeService.getCanonicalConversationFingerprint(blankAssistant)).not.toBe(
      OpenCodeService.getCanonicalConversationFingerprint(toolFirstAssistant),
    );
  });

  it('changes when hidden plugin synthetic user parts drift', () => {
    const visibleUserMessage = [
      {
        id: 'user-1',
        role: 'user' as const,
        content: 'Question',
        timestamp: 1,
        sourceMessageId: 'user-1',
        parts: [
          {
            id: 'part-visible',
            sessionID: 'session-1',
            messageID: 'user-1',
            type: 'text',
            text: 'Question',
          },
        ],
      },
    ];
    const pluginAugmentedUserMessage = [
      {
        ...visibleUserMessage[0],
        parts: [
          ...(visibleUserMessage[0].parts ?? []),
          {
            id: 'part-plugin',
            sessionID: 'session-1',
            messageID: 'user-1',
            type: 'text',
            text: 'Injected plugin prompt',
            synthetic: true,
            metadata: {
              source: 'plugin',
              pluginName: 'opencode-plugin-x',
            },
          },
        ],
      },
    ];

    expect(OpenCodeService.getCanonicalConversationFingerprint(visibleUserMessage)).not.toBe(
      OpenCodeService.getCanonicalConversationFingerprint(pluginAugmentedUserMessage),
    );
  });
});
