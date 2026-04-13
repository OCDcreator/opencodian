import { OpenCodeMessageNormalizationMapper } from '../../../../src/core/opencode/OpenCodeMessageNormalizationMapper';

describe('OpenCodeMessageNormalizationMapper', () => {
  const mapper = new OpenCodeMessageNormalizationMapper();

  it('normalizes question requests with trimmed prompts and options', () => {
    expect(mapper.normalizeQuestionRequest({
      id: 'question-1',
      sessionID: 'session-1',
      questions: [
        {
          question: '  Pick a mode  ',
          header: '  Mode  ',
          options: [
            { label: ' Fast ', description: '  Lower latency ' },
            { label: '  ' },
          ],
          multiple: true,
        },
        {
          question: '   ',
        },
      ],
    })).toEqual({
      id: 'question-1',
      sessionId: 'session-1',
      questions: [
        {
          question: 'Pick a mode',
          header: 'Mode',
          options: [
            {
              label: 'Fast',
              description: 'Lower latency',
            },
          ],
          multiple: true,
          custom: true,
        },
      ],
    });
  });

  it('restores inline read-tool context attachments for hydrated user messages', () => {
    const message = mapper.openCodeMessageToChatMessage(
      {
        id: 'msg-user-inline',
        sessionID: 'session-1',
        role: 'user',
        time: { created: 123 },
      } as never,
      [
        {
          type: 'text',
          id: 'part-user-inline',
          sessionID: 'session-1',
          messageID: 'msg-user-inline',
          text: '请看这里 Called the Read tool with the following input: {"filePath":"C:\\\\vault\\\\obsidian 联动设置.md","offset":6,"limit":1}',
        },
      ] as never,
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

  it('hydrates historical tool metadata using the catalog identity context', () => {
    const message = mapper.openCodeMessageToChatMessage(
      {
        id: 'msg-tool-history',
        sessionID: 'session-1',
        role: 'assistant',
        providerID: 'openai',
        modelID: 'gpt-5',
        time: { created: 123 },
      } as never,
      [
        {
          type: 'tool',
          id: 'part-tool-running',
          sessionID: 'session-1',
          messageID: 'msg-tool-history',
          callID: 'call-1',
          tool: 'vault_tool',
          state: {
            status: 'running',
            input: { path: '/vault/file.md' },
          },
        },
        {
          type: 'tool',
          id: 'part-tool-complete',
          sessionID: 'session-1',
          messageID: 'msg-tool-history',
          callID: 'call-2',
          tool: 'exa_search',
          state: {
            status: 'completed',
            input: { query: 'latest docs' },
            output: 'done',
          },
        },
      ] as never,
      undefined,
      {
        registryTools: ['vault_tool'],
        knownMcpTools: ['exa_search'],
      },
    );

    expect(message.toolCalls).toEqual([
      expect.objectContaining({
        id: 'call-1',
        name: 'vault_tool',
        kind: 'custom',
      }),
    ]);
    expect(message.contentBlocks).toContainEqual(expect.objectContaining({
      type: 'tool_use',
      toolId: 'call-2',
      toolName: 'exa_search',
      toolKind: 'mcp',
      toolResult: 'done',
    }));
  });

  it('filters internal structured-output tools while preserving structured payloads', () => {
    const message = mapper.openCodeMessageToChatMessage(
      {
        id: 'msg-structured-tool',
        sessionID: 'session-1',
        role: 'assistant',
        structured: { title: 'Generated title' },
        providerID: 'openai',
        modelID: 'gpt-5',
        time: { created: 123 },
      } as never,
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
      ] as never,
    );

    expect(message.structured).toEqual({ title: 'Generated title' });
    expect(message.toolCalls).toBeUndefined();
    expect(message.contentBlocks).toEqual([
      {
        type: 'text',
        text: 'Generated title',
      },
    ]);
  });

  it('extracts OMO user-injection metadata into normalized content', () => {
    const message = mapper.openCodeMessageToChatMessage(
      {
        id: 'msg-omo-user',
        sessionID: 'session-1',
        role: 'user',
        time: { created: 123 },
      } as never,
      [
        {
          type: 'text',
          id: 'part-omo-user',
          sessionID: 'session-1',
          messageID: 'msg-omo-user',
          text: '[search-mode]\nMAXIMIZE SEARCH EFFORT\n\n---\n使用工具搜索一下史料',
        },
      ] as never,
    );

    expect(message.content).toBe('使用工具搜索一下史料');
    expect(message.omo).toMatchObject({
      kind: 'user-injection',
      modeTag: 'search-mode',
      injectedPrompt: 'MAXIMIZE SEARCH EFFORT',
      originalText: '使用工具搜索一下史料',
    });
  });

  it('maps OMO system reminders to notice messages', () => {
    const message = mapper.openCodeMessageToChatMessage(
      {
        id: 'msg-omo-reminder',
        sessionID: 'session-1',
        role: 'assistant',
        providerID: 'anthropic',
        modelID: 'claude-3-5-sonnet',
        time: { created: 123 },
      } as never,
      [
        {
          type: 'text',
          id: 'part-omo-reminder',
          sessionID: 'session-1',
          messageID: 'msg-omo-reminder',
          text: '<system-reminder>\n[BACKGROUND TASK COMPLETED]\n**ID:** `bg_8f454ac6`\n**Description:** 探索系统进程和文件管理\n</system-reminder>\n<!-- OMO_INTERNAL_INITIATOR -->',
        },
      ] as never,
    );

    expect(message.displayStyle).toBe('notice');
    expect(message.noticeTone).toBe('info');
    expect(message.content).toContain('[BACKGROUND TASK COMPLETED]');
    expect(message.omo).toMatchObject({
      kind: 'system-reminder',
      reminderType: 'background-task-completed',
      isInternalInitiator: true,
      tasks: [
        {
          id: 'bg_8f454ac6',
          description: '探索系统进程和文件管理',
        },
      ],
    });
  });
});
