import { DEFAULT_SETTINGS } from '../../../../src/core/types';
import {
  createOpenCodeServiceTestContext,
  mockRequestUrl,
  OpenCodeService,
  REMOTE_CONTEXT_LIMIT_BYTES,
} from './OpenCodeService.testSupport';

let service: OpenCodeService;

beforeEach(() => {
  ({ service } = createOpenCodeServiceTestContext());
});

describe('OpenCodeService.sendMessage transport', () => {
  it('should yield error when no active session', async () => {
    const chunks: unknown[] = [];
    for await (const chunk of service.sendMessage('Hello')) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toEqual({ type: 'error', content: 'No active session' });
  });

  it('should send message with active session', async () => {
    service.setSessionId('test-session');

    mockRequestUrl.mockResolvedValue({
      status: 204,
      json: {},
      text: '',
    });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      body: {
        getReader: () => ({
          read: jest.fn().mockResolvedValue({ done: true, value: undefined }),
          cancel: jest.fn(),
          releaseLock: jest.fn(),
        }),
      },
    });

    const chunks: unknown[] = [];
    for await (const chunk of service.sendMessage('Hello')) {
      chunks.push(chunk);
    }

    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks[0]).toEqual({ type: 'message_start' });
    expect(chunks[chunks.length - 1]).toEqual({ type: 'message_stop' });
  });

  it('should request a full assistant response without SSE', async () => {
    service.setSessionId('test-session');
    mockRequestUrl.mockResolvedValue({
      status: 200,
      json: {
        info: {
          id: 'assistant-1',
          sessionID: 'test-session',
          role: 'assistant',
          time: { created: 1234567890 },
        },
        parts: [
          {
            id: 'part-1',
            sessionID: 'test-session',
            messageID: 'assistant-1',
            type: 'text',
            text: 'Generated title',
          },
        ],
      },
      text: '{"info":{"id":"assistant-1","sessionID":"test-session","role":"assistant","time":{"created":1234567890}},"parts":[{"id":"part-1","sessionID":"test-session","messageID":"assistant-1","type":"text","text":"Generated title"}]}',
    });

    const response = await service.requestAssistantResponse('Create a title', {
      sessionId: 'test-session',
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-20241022',
      system: 'Return only the title',
    });

    expect(response?.content).toBe('Generated title');
    expect(mockRequestUrl).toHaveBeenCalledWith(expect.objectContaining({
      url: 'http://127.0.0.1:4196/session/test-session/message',
      method: 'POST',
    }));
  });
});

describe('OpenCodeService.sendMessage context attachments', () => {
  it('maps local Obsidian context items to file:// parts', async () => {
    service.setSessionId('test-session');
    service.setVaultPath('C:\\vault');
    mockRequestUrl.mockResolvedValue({
      status: 200,
      json: {
        info: {
          id: 'assistant-1',
          sessionID: 'test-session',
          role: 'assistant',
          time: { created: 1234567890 },
        },
        parts: [],
      },
      text: '{"info":{"id":"assistant-1","sessionID":"test-session","role":"assistant","time":{"created":1234567890}},"parts":[]}',
    });

    await service.requestAssistantResponse('Use context', {
      sessionId: 'test-session',
      contextItems: [
        {
          id: 'ctx-1',
          kind: 'file',
          path: 'docs/spec.md',
          label: 'spec.md',
          mime: 'text/markdown',
        },
        {
          id: 'ctx-2',
          kind: 'selection',
          path: 'docs/spec.md',
          label: 'spec.md:3-5',
          mime: 'text/markdown',
          lineRange: { startLine: 3, endLine: 5 },
          textSnapshot: 'selected lines',
        },
      ],
    });

    const requestBody = JSON.parse(mockRequestUrl.mock.calls[0][0].body);
    expect(requestBody.parts[1]).toMatchObject({
      type: 'file',
      mime: 'text/plain',
    });
    expect(requestBody.parts[1].url).toContain('file:///C:/vault/docs/spec.md');
    expect(requestBody.parts[2]).toMatchObject({
      type: 'file',
      mime: 'text/plain',
      source: {
        type: 'file',
        path: 'docs/spec.md',
        text: {
          value: 'selected lines',
          start: 0,
          end: 'selected lines'.length,
        },
      },
    });
    expect(requestBody.parts[2].url).toContain('start=3');
    expect(requestBody.parts[2].url).toContain('end=5');
  });

  it('falls back to synthetic text parts for remote Obsidian context', async () => {
    service = new OpenCodeService({
      ...DEFAULT_SETTINGS,
      server: {
        ...DEFAULT_SETTINGS.server,
        mode: 'remote',
      },
    });
    service.setSessionId('test-session');
    mockRequestUrl.mockResolvedValue({
      status: 200,
      json: {
        info: {
          id: 'assistant-1',
          sessionID: 'test-session',
          role: 'assistant',
          time: { created: 1234567890 },
        },
        parts: [],
      },
      text: '{"info":{"id":"assistant-1","sessionID":"test-session","role":"assistant","time":{"created":1234567890}},"parts":[]}',
    });

    await service.requestAssistantResponse('Use remote context', {
      sessionId: 'test-session',
      contextItems: [
        {
          id: 'ctx-1',
          kind: 'current_note',
          path: 'notes/today.md',
          label: 'today.md',
          mime: 'text/markdown',
          textSnapshot: 'Remote note body',
        },
      ],
    });

    const requestBody = JSON.parse(mockRequestUrl.mock.calls[0][0].body);
    expect(requestBody.parts[1]).toMatchObject({
      id: expect.stringMatching(/^prt_/),
      type: 'text',
      text: '<obsidian_context kind="current_note" path="notes/today.md">Remote note body</obsidian_context>',
      synthetic: true,
      metadata: {
        kind: 'current_note',
        path: 'notes/today.md',
      },
    });
  });

  it('rejects remote binary or oversized Obsidian context before sending', async () => {
    service = new OpenCodeService({
      ...DEFAULT_SETTINGS,
      server: {
        ...DEFAULT_SETTINGS.server,
        mode: 'remote',
      },
    });
    service.setSessionId('test-session');

    await expect(service.requestAssistantResponse('Use remote context', {
      sessionId: 'test-session',
      contextItems: [
        {
          id: 'ctx-1',
          kind: 'file',
          path: 'assets/image.png',
          label: 'image.png',
          mime: 'image/png',
          textSnapshot: 'ignored',
        },
      ],
    })).rejects.toThrow('Only text context is supported in remote mode');

    await expect(service.requestAssistantResponse('Use remote context', {
      sessionId: 'test-session',
      contextItems: [
        {
          id: 'ctx-2',
          kind: 'file',
          path: 'notes/huge.md',
          label: 'huge.md',
          mime: 'text/markdown',
          textSnapshot: 'a'.repeat(REMOTE_CONTEXT_LIMIT_BYTES + 1),
        },
      ],
    })).rejects.toThrow('Context exceeds remote size limit');

    expect(mockRequestUrl).not.toHaveBeenCalled();
  });
});

describe('OpenCodeService HTTP linkage helpers', () => {
  it('parses synthetic context tags and file parts into context attachments', () => {
    const message = OpenCodeService.openCodeMessageToChatMessage(
      {
        id: 'user-1',
        sessionID: 'test-session',
        role: 'user',
        time: { created: 123 },
      } as unknown as Parameters<typeof OpenCodeService.openCodeMessageToChatMessage>[0],
      [
        {
          id: 'text-1',
          sessionID: 'test-session',
          messageID: 'user-1',
          type: 'text',
          text: 'Summarize this',
        },
        {
          id: 'text-2',
          sessionID: 'test-session',
          messageID: 'user-1',
          type: 'text',
          text: '<obsidian_context kind="current_note" path="notes/today.md">Body</obsidian_context>',
        },
        {
          id: 'file-1',
          sessionID: 'test-session',
          messageID: 'user-1',
          type: 'file',
          mime: 'text/markdown',
          url: 'file:///C:/vault/notes/today.md?start=2&end=4',
          source: {
            type: 'file',
            path: 'notes/today.md',
            text: {
              value: 'Selected text',
            },
          },
        },
      ] as unknown as Parameters<typeof OpenCodeService.openCodeMessageToChatMessage>[1],
      'C:\\vault',
    );

    expect(message.content).toBe('Summarize this');
    expect(message.contextAttachments).toEqual([
      {
        kind: 'current_note',
        path: 'notes/today.md',
        label: 'today.md',
        mime: 'text/markdown',
        textSnapshot: 'Body',
      },
      {
        kind: 'selection',
        path: 'notes/today.md',
        label: 'today.md:2-4',
        mime: 'text/markdown',
        lineRange: { startLine: 2, endLine: 4 },
        textSnapshot: 'Selected text',
      },
    ]);
  });

  it('replies to and rejects question requests via HTTP', async () => {
    mockRequestUrl.mockResolvedValue({ status: 200, json: true, text: 'true' });

    await service.replyToQuestion('question-1', [['Fast']]);
    await service.rejectQuestion('question-2');

    expect(mockRequestUrl).toHaveBeenNthCalledWith(1, expect.objectContaining({
      url: 'http://127.0.0.1:4196/question/question-1/reply',
      method: 'POST',
      body: JSON.stringify({ answers: [['Fast']] }),
    }));
    expect(mockRequestUrl).toHaveBeenNthCalledWith(2, expect.objectContaining({
      url: 'http://127.0.0.1:4196/question/question-2/reject',
      method: 'POST',
      body: JSON.stringify({}),
    }));
  });

  it('loads session diffs via HTTP', async () => {
    mockRequestUrl.mockResolvedValue({
      status: 200,
      json: [
        {
          file: 'notes/today.md',
          before: 'old',
          after: 'new',
          additions: 3,
          deletions: 1,
          status: 'modified',
        },
      ],
      text: '[{"file":"notes/today.md","before":"old","after":"new","additions":3,"deletions":1,"status":"modified"}]',
    });

    await expect(service.getSessionDiff('test-session', 'message-1')).resolves.toEqual([
      {
        file: 'notes/today.md',
        before: 'old',
        after: 'new',
        additions: 3,
        deletions: 1,
        status: 'modified',
      },
    ]);
    expect(mockRequestUrl).toHaveBeenCalledWith(expect.objectContaining({
      url: 'http://127.0.0.1:4196/session/test-session/diff?messageID=message-1',
      method: 'GET',
    }));
  });
});
