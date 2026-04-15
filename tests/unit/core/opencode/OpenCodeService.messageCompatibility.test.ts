import { OpenCodeService } from './OpenCodeService.testSupport';

type OpenCodeMessageToChatMessage = typeof OpenCodeService.openCodeMessageToChatMessage;
type OpenCodeMessageInfo = Parameters<OpenCodeMessageToChatMessage>[0];
type OpenCodeMessagePart = Parameters<OpenCodeMessageToChatMessage>[1][number];

function createAssistantInfo(overrides: Partial<OpenCodeMessageInfo> = {}): OpenCodeMessageInfo {
  return {
    id: 'msg-1',
    sessionID: 'session-1',
    role: 'assistant',
    time: { created: 1234567890 },
    parentID: 'msg-0',
    modelID: 'claude-3-5-sonnet',
    providerID: 'anthropic',
    mode: 'default',
    path: { cwd: '/test', root: '/test' },
    cost: 0.001,
    tokens: { input: 10, output: 20, reasoning: 0, cache: { read: 0, write: 0 } },
    ...overrides,
  } as OpenCodeMessageInfo;
}

function createUserInfo(overrides: Partial<OpenCodeMessageInfo> = {}): OpenCodeMessageInfo {
  return {
    id: 'msg-user',
    sessionID: 'session-1',
    role: 'user',
    time: { created: 1234567891 },
    ...overrides,
  } as OpenCodeMessageInfo;
}

describe('OpenCodeService.openCodeMessageToChatMessage basic compatibility', () => {
  it('transforms assistant messages with text parts', () => {
    const info = createAssistantInfo();
    const parts: OpenCodeMessagePart[] = [
      { type: 'text', id: 'part-1', sessionID: 'session-1', messageID: 'msg-1', text: 'Hello world' },
    ];

    const message = OpenCodeService.openCodeMessageToChatMessage(info, parts);

    expect(message.id).toBe('msg-1');
    expect(message.role).toBe('assistant');
    expect(message.content).toBe('Hello world');
    expect(message.timestamp).toBe(1234567890);
    expect(message.sourceMessageId).toBe('msg-1');
  });

  it('transforms user messages', () => {
    const info = createUserInfo({
      id: 'msg-2',
      agent: 'default',
      model: { providerID: 'anthropic', modelID: 'claude-3-5-sonnet' },
    });
    const parts: OpenCodeMessagePart[] = [
      { type: 'text', id: 'part-2', sessionID: 'session-1', messageID: 'msg-2', text: 'User message' },
    ];

    const message = OpenCodeService.openCodeMessageToChatMessage(info, parts);

    expect(message.id).toBe('msg-2');
    expect(message.role).toBe('user');
    expect(message.content).toBe('User message');
    expect(message.sourceMessageId).toBe('msg-2');
  });

  it('joins multiple text parts and handles empty parts', () => {
    const multiTextMessage = OpenCodeService.openCodeMessageToChatMessage(
      createAssistantInfo({
        id: 'msg-4',
        time: { created: 1234567893 },
      }),
      [
        { type: 'text', id: 'part-5', sessionID: 'session-1', messageID: 'msg-4', text: 'First part. ' },
        { type: 'text', id: 'part-6', sessionID: 'session-1', messageID: 'msg-4', text: 'Second part.' },
      ],
    );
    const emptyMessage = OpenCodeService.openCodeMessageToChatMessage(
      createAssistantInfo({
        id: 'msg-5',
        time: { created: 1234567894 },
        cost: 0,
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      }),
      [],
    );

    expect(multiTextMessage.content).toBe('First part. Second part.');
    expect(emptyMessage.content).toBe('');
  });

  it('preserves assistant structured payloads and filters internal StructuredOutput tool parts', () => {
    const structuredInfo = createAssistantInfo({
      id: 'msg-structured-tool',
      structured: { title: 'Generated title' },
      time: { created: 1234567896 },
      parentID: 'msg-structured-user',
      modelID: 'gpt-5',
      providerID: 'openai',
      cost: 0,
      tokens: { input: 5, output: 5, reasoning: 0, cache: { read: 0, write: 0 } },
    });
    const plainStructured = OpenCodeService.openCodeMessageToChatMessage(structuredInfo, [
      {
        type: 'text',
        id: 'part-structured',
        sessionID: 'session-1',
        messageID: 'msg-structured-tool',
        text: 'Generated title',
      },
    ]);
    const filteredStructured = OpenCodeService.openCodeMessageToChatMessage(
      structuredInfo,
      [
        {
          type: 'tool',
          id: 'part-structured-tool',
          sessionID: 'session-1',
          messageID: 'msg-structured-tool',
          callID: 'call-structured-tool',
          tool: 'structured_output',
          state: {
            status: 'completed',
            input: { schema: { type: 'object' } },
            output: '{"title":"Generated title"}',
          },
        },
        {
          type: 'text',
          id: 'part-structured-text',
          sessionID: 'session-1',
          messageID: 'msg-structured-tool',
          text: 'Generated title',
        },
      ] as unknown as OpenCodeMessagePart[],
    );

    expect(plainStructured.content).toBe('Generated title');
    expect(plainStructured.structured).toEqual({ title: 'Generated title' });
    expect(filteredStructured.content).toBe('Generated title');
    expect(filteredStructured.structured).toEqual({ title: 'Generated title' });
    expect(filteredStructured.toolCalls).toBeUndefined();
    expect(filteredStructured.contentBlocks).toEqual([
      {
        type: 'text',
        text: 'Generated title',
      },
    ]);
  });
});

describe('OpenCodeService.openCodeMessageToChatMessage user context restoration', () => {
  it('strips inline read-tool hydration text from user messages and restores file attachments', () => {
    const message = OpenCodeService.openCodeMessageToChatMessage(
      createUserInfo({ id: 'msg-2b' }),
      [
        {
          type: 'text',
          id: 'part-2b',
          sessionID: 'session-1',
          messageID: 'msg-2b',
          text: '你能看到动画集成需求文档吗？Called the Read tool with the following input:\n{"filePath":"C:\\\\vault\\\\动画集成需求文档.md"}',
        },
      ],
      'C:\\vault',
    );

    expect(message.content).toBe('你能看到动画集成需求文档吗？');
    expect(message.contextAttachments).toEqual([
      {
        kind: 'file',
        path: '动画集成需求文档.md',
        label: '动画集成需求文档.md',
        mime: 'text/markdown',
      },
    ]);
  });

  it('ignores synthetic read-tool text while restoring context attachments', () => {
    const message = OpenCodeService.openCodeMessageToChatMessage(
      createUserInfo({ id: 'msg-user-synthetic', time: { created: 1234567899 } }),
      [
        {
          type: 'text',
          id: 'part-user-text',
          sessionID: 'session-1',
          messageID: 'msg-user-synthetic',
          text: '能看到选中文字吗？',
        },
        {
          type: 'text',
          id: 'part-user-synth',
          sessionID: 'session-1',
          messageID: 'msg-user-synthetic',
          synthetic: true,
          text: 'Called the Read tool with the following input: {"filePath":"C:\\\\vault\\\\obsidian 联动设置.md","offset":6,"limit":1}',
        } as unknown as OpenCodeMessagePart,
        {
          type: 'text',
          id: 'part-user-synth-output',
          sessionID: 'session-1',
          messageID: 'msg-user-synthetic',
          synthetic: true,
          text: '6| 这是被读取的选中文本',
        } as unknown as OpenCodeMessagePart,
        {
          type: 'file',
          id: 'part-user-file',
          sessionID: 'session-1',
          messageID: 'msg-user-synthetic',
          mime: 'text/plain',
          url: 'file:///C:/vault/obsidian%20%E8%81%94%E5%8A%A8%E8%AE%BE%E7%BD%AE.md?start=6&end=6',
          source: {
            type: 'file',
            path: 'obsidian 联动设置.md',
            text: {
              value: '这是被读取的选中文本',
            },
          },
        } as unknown as OpenCodeMessagePart,
      ],
      'C:\\vault',
    );

    expect(message.content).toBe('能看到选中文字吗？');
    expect(message.contextAttachments).toEqual([
      expect.objectContaining({
        kind: 'selection',
        path: 'obsidian 联动设置.md',
        lineRange: { startLine: 6, endLine: 6 },
      }),
    ]);
  });

  it('restores selection attachments from inline read-tool metadata when no file part is present', () => {
    const message = OpenCodeService.openCodeMessageToChatMessage(
      createUserInfo({
        id: 'msg-user-inline-selection',
        time: { created: 1234567900 },
      }),
      [
        {
          type: 'text',
          id: 'part-user-inline-selection',
          sessionID: 'session-1',
          messageID: 'msg-user-inline-selection',
          text: '请看这里 Called the Read tool with the following input: {"filePath":"C:\\\\vault\\\\obsidian 联动设置.md","offset":6,"limit":1}',
        },
      ],
      'C:\\vault',
    );

    expect(message.content).toBe('请看这里');
    expect(message.contextAttachments).toEqual([
      expect.objectContaining({
        kind: 'selection',
        path: 'obsidian 联动设置.md',
        lineRange: { startLine: 6, endLine: 6 },
      }),
    ]);
  });
});

describe('OpenCodeService.openCodeMessageToChatMessage tool compatibility', () => {
  it('extracts tool calls from tool parts', () => {
    const message = OpenCodeService.openCodeMessageToChatMessage(
      createAssistantInfo({
        id: 'msg-3',
        time: { created: 1234567892 },
        parentID: 'msg-2',
        cost: 0.002,
        tokens: { input: 15, output: 25, reasoning: 0, cache: { read: 0, write: 0 } },
      }),
      [
        { type: 'text', id: 'part-3', sessionID: 'session-1', messageID: 'msg-3', text: 'Using tool' },
        {
          type: 'tool',
          id: 'part-4',
          sessionID: 'session-1',
          messageID: 'msg-3',
          callID: 'call-1',
          tool: 'file_read',
          state: {
            status: 'pending',
            input: { path: '/test/file.txt' },
            raw: '{"path": "/test/file.txt"}',
          },
        },
      ] as unknown as OpenCodeMessagePart[],
    );

    expect(message.toolCalls).toBeDefined();
    expect(message.toolCalls).toHaveLength(1);
    expect(message.toolCalls?.[0]).toMatchObject({
      id: 'call-1',
      name: 'file_read',
      kind: 'custom',
      input: { path: '/test/file.txt' },
    });
  });

  it('classifies known MCP tools and falls back to external-tool styling when the catalog is unavailable', () => {
    const info = createAssistantInfo({
      id: 'msg-mcp-history',
      time: { created: 1234567892 },
      parentID: 'msg-2',
      modelID: 'gpt-5',
      providerID: 'openai',
      cost: 0.002,
      tokens: { input: 15, output: 25, reasoning: 0, cache: { read: 0, write: 0 } },
    });
    const mcpParts = [
      {
        type: 'tool',
        id: 'part-mcp-history',
        sessionID: 'session-1',
        messageID: 'msg-mcp-history',
        callID: 'call-mcp-history',
        tool: 'exa_search',
        state: {
          status: 'completed',
          input: { query: 'latest docs' },
          output: 'done',
        },
      },
    ] as unknown as OpenCodeMessagePart[];
    const knownMcpMessage = OpenCodeService.openCodeMessageToChatMessage(
      info,
      mcpParts,
      undefined,
      { knownMcpTools: ['exa_search'] },
    );
    const fallbackMessage = OpenCodeService.openCodeMessageToChatMessage(
      createAssistantInfo({
        id: 'msg-custom-history',
        time: { created: 1234567892 },
        parentID: 'msg-2',
        modelID: 'gpt-5',
        providerID: 'openai',
        cost: 0.002,
        tokens: { input: 15, output: 25, reasoning: 0, cache: { read: 0, write: 0 } },
      }),
      [
        {
          ...mcpParts[0],
          id: 'part-custom-history',
          messageID: 'msg-custom-history',
          callID: 'call-custom-history',
        },
      ],
    );

    expect(knownMcpMessage.toolCalls).toBeUndefined();
    expect(knownMcpMessage.contentBlocks?.[0]).toMatchObject({
      type: 'tool_use',
      toolId: 'call-mcp-history',
      toolName: 'exa_search',
      toolKind: 'mcp',
      toolResult: 'done',
    });
    expect(fallbackMessage.contentBlocks?.[0]).toMatchObject({
      type: 'tool_use',
      toolName: 'exa_search',
      toolKind: 'custom',
    });
  });

  it('prefers SDK reasoning time windows for thinking duration and marks bash failures as errors', () => {
    const thinkingMessage = OpenCodeService.openCodeMessageToChatMessage(
      createAssistantInfo({
        id: 'msg-thinking-duration',
        time: { created: 1234567895 },
        parentID: 'msg-5',
        tokens: { input: 5, output: 10, reasoning: 0, cache: { read: 0, write: 0 } },
      }),
      [
        {
          type: 'reasoning',
          id: 'part-thinking-duration',
          sessionID: 'session-1',
          messageID: 'msg-thinking-duration',
          text: 'Let me think...',
          time: {
            start: 1_000,
            end: 3_450,
          },
        },
      ] as unknown as OpenCodeMessagePart[],
    );
    const bashFailure = OpenCodeService.openCodeMessageToChatMessage(
      createAssistantInfo({
        id: 'msg-6',
        time: { created: 1234567895 },
        parentID: 'msg-5',
        tokens: { input: 5, output: 10, reasoning: 0, cache: { read: 0, write: 0 } },
      }),
      [
        {
          type: 'tool',
          id: 'part-7',
          sessionID: 'session-1',
          messageID: 'msg-6',
          callID: 'call-2',
          tool: 'bash',
          state: {
            status: 'completed',
            input: { command: 'git status' },
            output: 'fatal: not a git repository (or any of the parent directories): .git',
            metadata: { exit: 128 },
          },
        },
      ] as unknown as OpenCodeMessagePart[],
    );

    expect(thinkingMessage.contentBlocks?.[0]).toMatchObject({
      type: 'thinking',
      thinking: 'Let me think...',
      durationSeconds: 2.45,
    });
    expect(bashFailure.contentBlocks?.[0]).toMatchObject({
      type: 'tool_use',
      toolId: 'call-2',
      toolName: 'bash',
      toolStatus: 'error',
      toolResult: 'fatal: not a git repository (or any of the parent directories): .git',
    });
  });
});
