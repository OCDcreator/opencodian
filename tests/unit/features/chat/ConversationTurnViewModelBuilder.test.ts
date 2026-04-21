import type {
  OpenCodeCanonicalMessageInfo,
  OpenCodeCanonicalPart,
  OpenCodeCanonicalSessionState,
} from '../../../../src/core/opencode';
import type { ChatMessage } from '../../../../src/core/types';
import { ConversationTurnViewModelBuilder } from '../../../../src/features/chat/services/ConversationTurnViewModelBuilder';
import { OpenCodeService } from '../../core/opencode/OpenCodeService.testSupport';

function createMessage(
  overrides: Partial<OpenCodeCanonicalMessageInfo> & {
    id: string;
    role: OpenCodeCanonicalMessageInfo['role'];
  },
): OpenCodeCanonicalMessageInfo {
  return {
    sessionID: 'session-1',
    time: { created: 1 },
    ...overrides,
  };
}

function createPart(
  overrides: Partial<OpenCodeCanonicalPart> & {
    id: string;
    messageID: string;
    type: string;
  },
): OpenCodeCanonicalPart {
  return {
    sessionID: 'session-1',
    ...overrides,
  };
}

function createState(
  messages: OpenCodeCanonicalMessageInfo[],
  parts: OpenCodeCanonicalPart[],
): OpenCodeCanonicalSessionState {
  const partsByMessageID: Record<string, OpenCodeCanonicalPart[]> = {};
  for (const part of parts) {
    partsByMessageID[part.messageID] = [
      ...(partsByMessageID[part.messageID] ?? []),
      part,
    ];
  }

  return {
    sessionID: 'session-1',
    messages,
    partsByMessageID,
  };
}

function hydrateMessage(
  info: OpenCodeCanonicalMessageInfo,
  parts: OpenCodeCanonicalPart[],
): ChatMessage {
  return {
    id: info.id,
    role: info.role,
    content: parts
      .filter((part) => typeof part.text === 'string')
      .map((part) => part.text as string)
      .join(''),
    timestamp: info.time.created,
    sourceMessageId: info.id,
    parts,
  };
}

function hydrateCanonicalChatMessage(
  info: OpenCodeCanonicalMessageInfo,
  parts: OpenCodeCanonicalPart[],
): ChatMessage {
  return OpenCodeService.openCodeMessageToChatMessage(info as never, parts as never);
}

describe('ConversationTurnViewModelBuilder', () => {
  it('groups assistant messages under the latest user message until the next user turn', () => {
    const userOne = createMessage({ id: 'user-1', role: 'user', time: { created: 1 } });
    const assistantOne = createMessage({ id: 'assistant-1', role: 'assistant', time: { created: 2 } });
    const assistantTwo = createMessage({ id: 'assistant-2', role: 'assistant', time: { created: 3 } });
    const userTwo = createMessage({ id: 'user-2', role: 'user', time: { created: 4 } });
    const assistantThree = createMessage({ id: 'assistant-3', role: 'assistant', time: { created: 5 } });
    const state = createState(
      [userOne, assistantOne, assistantTwo, userTwo, assistantThree],
      [
        createPart({ id: 'part-user-1', messageID: 'user-1', type: 'text', text: 'Hello' }),
        createPart({ id: 'part-assistant-1', messageID: 'assistant-1', type: 'text', text: 'One' }),
        createPart({ id: 'part-assistant-2', messageID: 'assistant-2', type: 'text', text: 'Two' }),
        createPart({ id: 'part-user-2', messageID: 'user-2', type: 'text', text: 'Again' }),
        createPart({ id: 'part-assistant-3', messageID: 'assistant-3', type: 'text', text: 'Three' }),
      ],
    );

    const turns = new ConversationTurnViewModelBuilder().buildTurns(state);

    expect(turns).toHaveLength(2);
    expect(turns[0]).toMatchObject({
      userMessageID: 'user-1',
      assistantMessages: [
        expect.objectContaining({ id: 'assistant-1' }),
        expect.objectContaining({ id: 'assistant-2' }),
      ],
    });
    expect(Object.keys(turns[0].assistantPartsByMessageID)).toEqual([
      'assistant-1',
      'assistant-2',
    ]);
    expect(turns[1]).toMatchObject({
      userMessageID: 'user-2',
      assistantMessages: [expect.objectContaining({ id: 'assistant-3' })],
    });
  });

  it('keeps tool-first, reasoning-first, and text-late parts attached to one assistant turn', () => {
    const user = createMessage({ id: 'user-1', role: 'user' });
    const assistant = createMessage({
      id: 'assistant-1',
      role: 'assistant',
      error: {
        name: 'AbortError',
        data: { message: 'The request was aborted' },
      },
    });
    const toolPart = createPart({
      id: 'part-tool',
      messageID: 'assistant-1',
      type: 'tool',
      tool: 'bash',
      state: { status: 'completed', input: { command: 'pwd' } },
    });
    const reasoningPart = createPart({
      id: 'part-reasoning',
      messageID: 'assistant-1',
      type: 'reasoning',
      text: 'Thinking first',
    });
    const textPart = createPart({
      id: 'part-text',
      messageID: 'assistant-1',
      type: 'text',
      text: 'Final answer',
    });
    const state = createState(
      [user, assistant],
      [
        createPart({ id: 'part-user', messageID: 'user-1', type: 'text', text: 'Run pwd' }),
        toolPart,
        reasoningPart,
        textPart,
      ],
    );

    const turns = new ConversationTurnViewModelBuilder().buildTurns(state);

    expect(turns).toHaveLength(1);
    expect(turns[0].assistantPartsByMessageID['assistant-1']).toEqual([
      toolPart,
      reasoningPart,
      textPart,
    ]);
    expect(turns[0].interrupted).toBe(true);
    expect(turns[0].error).toEqual({
      name: 'AbortError',
      message: 'The request was aborted',
    });
  });

  it('builds the same turn structure for live stream mutations and reload snapshots', () => {
    const user = createMessage({ id: 'user-1', role: 'user' });
    const assistant = createMessage({ id: 'assistant-1', role: 'assistant' });
    const parts = [
      createPart({ id: 'part-user', messageID: 'user-1', type: 'text', text: 'Question' }),
      createPart({
        id: 'part-tool',
        messageID: 'assistant-1',
        type: 'tool',
        tool: 'grep',
        state: { status: 'running', input: { pattern: 'TODO' } },
      }),
      createPart({ id: 'part-text', messageID: 'assistant-1', type: 'text', text: 'Answer' }),
    ];
    const liveState = createState([user, assistant], parts);
    const reloadedState = createState(
      [
        createMessage({ id: 'user-1', role: 'user' }),
        createMessage({ id: 'assistant-1', role: 'assistant' }),
      ],
      parts.map((part) => ({ ...part })),
    );
    const builder = new ConversationTurnViewModelBuilder();

    expect(builder.buildTurns(liveState)).toEqual(builder.buildTurns(reloadedState));
  });

  it('hydrates turn view-models back into the existing OpenCodian message shell input', () => {
    const user = createMessage({ id: 'user-1', role: 'user', time: { created: 10 } });
    const assistant = createMessage({
      id: 'assistant-1',
      role: 'assistant',
      time: { created: 20 },
      error: 'interrupted by user',
    });
    const state = createState(
      [user, assistant],
      [
        createPart({ id: 'part-user', messageID: 'user-1', type: 'text', text: 'Hi' }),
        createPart({ id: 'part-assistant', messageID: 'assistant-1', type: 'text', text: 'Hello' }),
      ],
    );
    const builder = new ConversationTurnViewModelBuilder();
    const turns = builder.buildTurns(state);

    const messages = builder.buildRenderMessages(turns, hydrateMessage);

    expect(messages.map((message) => message.id)).toEqual(['user-1', 'assistant-1']);
    expect(messages[1]).toMatchObject({
      content: 'Hello',
      sourceMessageId: 'assistant-1',
      streamState: 'interrupted',
    });
  });
});

describe('ConversationTurnViewModelBuilder canonical render input', () => {
  it('keeps assistant-only canonical messages in render input when no user turn exists yet', () => {
    const state = createState(
      [createMessage({ id: 'assistant-1', role: 'assistant', time: { created: 2 } })],
      [createPart({ id: 'part-assistant', messageID: 'assistant-1', type: 'text', text: 'Visible reply' })],
    );
    const builder = new ConversationTurnViewModelBuilder();

    const renderInput = builder.buildCanonicalRenderInput(state, hydrateCanonicalChatMessage);

    expect(renderInput.turns).toEqual([]);
    expect(renderInput.messages).toEqual([
      expect.objectContaining({
        id: 'assistant-1',
        content: 'Visible reply',
        sourceMessageId: 'assistant-1',
      }),
    ]);
  });

  it('builds identical canonical render input for live and reload normal assistant responses', () => {
    const liveState = createState(
      [
        createMessage({ id: 'user-1', role: 'user', time: { created: 1 } }),
        createMessage({ id: 'assistant-1', role: 'assistant', time: { created: 2 } }),
      ],
      [
        createPart({ id: 'part-user', messageID: 'user-1', type: 'text', text: 'Question' }),
        createPart({ id: 'part-assistant', messageID: 'assistant-1', type: 'text', text: 'Answer' }),
      ],
    );
    const reloadState = createState(
      liveState.messages.map((message) => ({ ...message, time: { ...message.time } })),
      Object.values(liveState.partsByMessageID).flat().map((part) => ({ ...part })),
    );
    const builder = new ConversationTurnViewModelBuilder();

    expect(builder.buildCanonicalRenderInput(liveState, hydrateCanonicalChatMessage)).toEqual(
      builder.buildCanonicalRenderInput(reloadState, hydrateCanonicalChatMessage),
    );
  });

  it('builds identical canonical render input for live and reload tool-first assistant responses', () => {
    const liveState = createState(
      [
        createMessage({ id: 'user-1', role: 'user', time: { created: 1 } }),
        createMessage({ id: 'assistant-1', role: 'assistant', time: { created: 2 } }),
      ],
      [
        createPart({ id: 'part-user', messageID: 'user-1', type: 'text', text: 'Inspect docs' }),
        createPart({
          id: 'part-tool',
          messageID: 'assistant-1',
          type: 'tool',
          tool: 'read',
          callID: 'call-read-1',
          state: {
            status: 'completed',
            input: { filePath: 'docs/architecture/README.md' },
            output: 'done',
          },
        }),
        createPart({ id: 'part-text', messageID: 'assistant-1', type: 'text', text: 'Done' }),
      ],
    );
    const reloadState = createState(
      liveState.messages.map((message) => ({ ...message, time: { ...message.time } })),
      Object.values(liveState.partsByMessageID).flat().map((part) => ({
        ...part,
        state: part.state && typeof part.state === 'object' ? { ...part.state as Record<string, unknown> } : part.state,
      })),
    );
    const builder = new ConversationTurnViewModelBuilder();

    const liveRenderInput = builder.buildCanonicalRenderInput(liveState, hydrateCanonicalChatMessage);
    const reloadRenderInput = builder.buildCanonicalRenderInput(reloadState, hydrateCanonicalChatMessage);

    expect(liveRenderInput).toEqual(reloadRenderInput);
    expect(liveRenderInput.messages[1]).toMatchObject({
      id: 'assistant-1',
      sourceMessageId: 'assistant-1',
      content: 'Done',
      contentBlocks: expect.arrayContaining([
        expect.objectContaining({
          type: 'tool_use',
          toolId: 'call-read-1',
          toolName: 'read',
        }),
        expect.objectContaining({
          type: 'text',
          text: 'Done',
        }),
      ]),
    });
  });
});
