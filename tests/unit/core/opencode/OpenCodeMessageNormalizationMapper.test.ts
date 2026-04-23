import { OpenCodeMessageNormalizationMapper } from '../../../../src/core/opencode/OpenCodeMessageNormalizationMapper';

const mapper = new OpenCodeMessageNormalizationMapper();

describe('OpenCodeMessageNormalizationMapper question normalization', () => {
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
});

describe('OpenCodeMessageNormalizationMapper context hydration', () => {
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

  it('deduplicates context attachments from Obsidian tags and file parts', () => {
    const message = mapper.openCodeMessageToChatMessage(
      {
        id: 'msg-user-context',
        sessionID: 'session-1',
        role: 'user',
        time: { created: 123 },
      } as never,
      [
        {
          type: 'text',
          id: 'part-user-text',
          sessionID: 'session-1',
          messageID: 'msg-user-context',
          text: '处理这个文件',
        },
        {
          type: 'text',
          id: 'part-user-context-tag',
          sessionID: 'session-1',
          messageID: 'msg-user-context',
          text: '<obsidian_context kind="selection" path="docs/note.md" lines="3-4">摘录</obsidian_context>',
        },
        {
          type: 'file',
          id: 'part-user-file',
          sessionID: 'session-1',
          messageID: 'msg-user-context',
          url: 'file:///vault/docs/note.md?start=3&end=4',
        },
      ] as never,
      '/vault',
    );

    expect(message.content).toBe('处理这个文件');
    expect(message.contextAttachments).toEqual([
      expect.objectContaining({
        kind: 'selection',
        path: 'docs/note.md',
        label: 'note.md:3-4',
        lineRange: { startLine: 3, endLine: 4 },
        textSnapshot: '摘录',
      }),
    ]);
  });

  it('renders compaction parts as readable user markers and hides compaction-continue follow-ups', () => {
    const compactionMessage = mapper.openCodeMessageToChatMessage(
      {
        id: 'msg-user-compaction',
        sessionID: 'session-1',
        role: 'user',
        time: { created: 123 },
      } as never,
      [
        {
          type: 'compaction',
          id: 'part-user-compaction',
          sessionID: 'session-1',
          messageID: 'msg-user-compaction',
          auto: true,
          overflow: true,
          tail_start_id: 'msg-tail-start',
        },
      ] as never,
    );
    const continueMessage = mapper.openCodeMessageToChatMessage(
      {
        id: 'msg-user-compaction-continue',
        sessionID: 'session-1',
        role: 'user',
        time: { created: 124 },
      } as never,
      [
        {
          type: 'text',
          id: 'part-user-compaction-continue',
          sessionID: 'session-1',
          messageID: 'msg-user-compaction-continue',
          text: 'Continue if you have next steps...',
          metadata: {
            compaction_continue: true,
          },
        },
      ] as never,
    );

    expect(compactionMessage.content).toContain('Context compaction');
    expect(compactionMessage.content).toContain('Automatic compaction');
    expect(compactionMessage.content).toContain('Triggered after context overflow');
    expect(continueMessage.content).toBe('');
  });

  it('maps user compaction parts into structured compaction divider metadata', () => {
    const message = mapper.openCodeMessageToChatMessage(
      {
        id: 'msg-compaction-divider',
        sessionID: 'session-1',
        role: 'user',
        time: { created: 200 },
      } as never,
      [
        {
          type: 'compaction',
          id: 'part-compaction-divider',
          sessionID: 'session-1',
          messageID: 'msg-compaction-divider',
          auto: true,
          overflow: false,
          tail_start_id: 'msg-tail',
        },
      ] as never,
    );

    expect(message).toMatchObject({
      role: 'user',
      compactionDivider: {
        auto: true,
        overflow: false,
        tailStartId: 'msg-tail',
      },
    });
  });

  it('does not model compaction divider user messages as notice cards', () => {
    const message = mapper.openCodeMessageToChatMessage(
      {
        id: 'msg-compaction-not-notice',
        sessionID: 'session-1',
        role: 'user',
        time: { created: 201 },
      } as never,
      [
        {
          type: 'compaction',
          id: 'part-compaction-not-notice',
          sessionID: 'session-1',
          messageID: 'msg-compaction-not-notice',
          auto: false,
          overflow: true,
          tail_start_id: 'msg-tail-2',
        },
      ] as never,
    );

    expect(message.compactionDivider).toBeDefined();
    expect(message.displayStyle).not.toBe('notice');
    expect(message.noticeTone).toBeUndefined();
  });

  it('keeps compaction_continue user messages hidden with no compaction divider and no notice style', () => {
    const message = mapper.openCodeMessageToChatMessage(
      {
        id: 'msg-continue-hidden',
        sessionID: 'session-1',
        role: 'user',
        time: { created: 202 },
      } as never,
      [
        {
          type: 'text',
          id: 'part-continue-hidden',
          sessionID: 'session-1',
          messageID: 'msg-continue-hidden',
          text: 'Continue if you have next steps...',
          metadata: {
            compaction_continue: true,
          },
        },
      ] as never,
    );

    expect(message.content).toBe('');
    expect(message.compactionDivider).toBeUndefined();
    expect(message.displayStyle).not.toBe('notice');
  });
});

describe('OpenCodeMessageNormalizationMapper tool content', () => {
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

  it('deduplicates renderable tool content while preserving pending tool calls', () => {
    const message = mapper.openCodeMessageToChatMessage(
      {
        id: 'msg-tool-assembly',
        sessionID: 'session-1',
        role: 'assistant',
        providerID: 'openai',
        modelID: 'gpt-5',
        time: { created: 123 },
      } as never,
      [
        {
          type: 'reasoning',
          id: 'part-reasoning',
          sessionID: 'session-1',
          messageID: 'msg-tool-assembly',
          text: 'Planning steps',
          time: {
            start: 1000,
            end: 3000,
          },
        },
        {
          type: 'tool',
          id: 'part-tool-running',
          sessionID: 'session-1',
          messageID: 'msg-tool-assembly',
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
          messageID: 'msg-tool-assembly',
          callID: 'call-1',
          tool: 'vault_tool',
          state: {
            status: 'completed',
            input: { path: '/vault/file.md' },
            output: 'done',
          },
        },
        {
          type: 'text',
          id: 'part-tool-text',
          sessionID: 'session-1',
          messageID: 'msg-tool-assembly',
          text: 'Final response',
        },
      ] as never,
      undefined,
      {
        registryTools: ['vault_tool'],
      },
    );

    expect(message.toolCalls).toEqual([
      expect.objectContaining({
        id: 'call-1',
        name: 'vault_tool',
        kind: 'custom',
        status: 'pending',
      }),
    ]);
    expect(message.contentBlocks).toEqual([
      {
        type: 'thinking',
        thinking: 'Planning steps',
        durationSeconds: 2,
      },
      expect.objectContaining({
        type: 'tool_use',
        toolId: 'call-1',
        toolName: 'vault_tool',
        toolKind: 'custom',
        toolInput: { path: '/vault/file.md' },
        toolStatus: 'completed',
        toolResult: 'done',
      }),
      {
        type: 'text',
        text: 'Final response',
      },
    ]);
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
});

describe('OpenCodeMessageNormalizationMapper task metadata', () => {
  it('projects task session metadata into persisted tool content blocks', () => {
    const message = mapper.openCodeMessageToChatMessage(
      {
        id: 'msg-task-metadata',
        sessionID: 'session-1',
        role: 'assistant',
        providerID: 'openai',
        modelID: 'gpt-5',
        time: { created: 123 },
      } as never,
      [
        {
          type: 'tool',
          id: 'part-task-complete',
          sessionID: 'session-1',
          messageID: 'msg-task-metadata',
          callID: 'call-task-1',
          tool: 'task',
          state: {
            status: 'completed',
            input: {
              description: 'Audit routes',
              subagent_type: 'explorer',
            },
            metadata: {
              sessionId: 'child-session-1',
              ignored: 'value',
            },
            output: 'task_id: child-session-1\n\n<task_result>\nHidden\n</task_result>',
          },
        },
      ] as never,
    );

    expect(message.contentBlocks).toContainEqual(expect.objectContaining({
      type: 'tool_use',
      toolId: 'call-task-1',
      toolName: 'task',
      toolKind: 'task',
      toolResultVisibility: 'hidden',
      toolMetadata: {
        sessionId: 'child-session-1',
      },
    }));
  });
});

describe('OpenCodeMessageNormalizationMapper OMO metadata', () => {
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
    const reminderText = '<system-reminder>\n[BACKGROUND TASK COMPLETED]\n**ID:** `bg_8f454ac6`\n**Description:** 探索系统进程和文件管理\n</system-reminder>\n<!-- OMO_INTERNAL_INITIATOR -->';
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
          text: reminderText,
        },
      ] as never,
    );

    expect(message.displayStyle).toBe('notice');
    expect(message.noticeTone).toBe('info');
    expect(message.content).toContain('[BACKGROUND TASK COMPLETED]');
    expect(message.contentBlocks).toContainEqual({
      type: 'text',
      text: reminderText,
    });
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

  it('preserves assistant summary markers for compaction reports', () => {
    const message = mapper.openCodeMessageToChatMessage(
      {
        id: 'msg-summary',
        sessionID: 'session-1',
        role: 'assistant',
        summary: true,
        providerID: 'anthropic',
        modelID: 'claude-3-5-sonnet',
        time: { created: 123 },
      } as never,
      [
        {
          type: 'text',
          id: 'part-summary',
          sessionID: 'session-1',
          messageID: 'msg-summary',
          text: 'Compressed 12 earlier turns.',
        },
      ] as never,
    );

    expect(message.summary).toBe(true);
    expect(message.content).toBe('Compressed 12 earlier turns.');
  });
});
