import { SDK_FEATURE_FLAG_ROLLOUT_DEFAULTS } from '../../../../src/core/opencode/sdkFeatureFlags';
import { DEFAULT_SETTINGS } from '../../../../src/core/types';
import {
  createOpenCodeServiceTestContext,
  mockCreateSdkClient,
  type MockOpenCodeServiceSdkClient,
  mockRequestUrl,
  OpenCodeService,
} from './OpenCodeService.testSupport';

let service: OpenCodeService;
let mockSdkClient: MockOpenCodeServiceSdkClient;

const createServiceWithSdkFlags = () => new OpenCodeService(
  DEFAULT_SETTINGS,
  {},
  { sdkFeatureFlags: SDK_FEATURE_FLAG_ROLLOUT_DEFAULTS },
);

beforeEach(() => {
  ({ service, mockSdkClient } = createOpenCodeServiceTestContext());
});

describe('OpenCodeService SDK session lifecycle', () => {
  it('uses SDK createSession when rollout flags are enabled', async () => {
    service = createServiceWithSdkFlags();
    mockSdkClient.session.create.mockResolvedValue({
      id: 'sdk-session',
      title: 'Test',
      time: { created: 1, updated: 1 },
    });

    const sessionId = await service.createSession('Test');

    expect(sessionId).toBe('sdk-session');
    expect(mockCreateSdkClient).toHaveBeenCalled();
    expect(mockSdkClient.session.create).toHaveBeenCalledWith({
      title: 'Test',
    });
    expect(mockRequestUrl).not.toHaveBeenCalled();
  });

  it('normalizes SDK 1.4.0 session.diff patch payloads', async () => {
    service = createServiceWithSdkFlags();
    mockSdkClient.session.diff.mockResolvedValue({
      data: [
        {
          file: 'notes/today.md',
          patch: '@@ -1 +1 @@\n-old\n+new',
          additions: 3,
          deletions: 1,
          status: 'modified',
        },
      ],
      error: undefined,
      request: {} as Request,
      response: {} as Response,
    });

    await expect(service.getSessionDiff('sdk-session', 'message-1')).resolves.toEqual([
      {
        file: 'notes/today.md',
        patch: '@@ -1 +1 @@\n-old\n+new',
        additions: 3,
        deletions: 1,
        status: 'modified',
      },
    ]);
    expect(mockSdkClient.session.diff).toHaveBeenCalledWith({
      sessionID: 'sdk-session',
      messageID: 'message-1',
    });
    expect(mockRequestUrl).not.toHaveBeenCalled();
  });

  it('falls back to legacy HTTP for read-only listSessions failures', async () => {
    service = createServiceWithSdkFlags();
    mockSdkClient.session.list.mockRejectedValue(new Error('sdk read failed'));
    mockRequestUrl.mockResolvedValue({
      status: 200,
      json: [{ id: 'legacy-session', title: 'Legacy' }],
      text: '[{"id":"legacy-session","title":"Legacy"}]',
    });

    const sessions = await service.listSessions();

    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe('legacy-session');
    expect(mockSdkClient.session.list).toHaveBeenCalled();
    expect(mockRequestUrl).toHaveBeenCalledWith(expect.objectContaining({
      url: 'http://127.0.0.1:4196/session',
      method: 'GET',
    }));
  });

  it('applies session revert state when loading messages via SDK', async () => {
    service = createServiceWithSdkFlags();
    mockSdkClient.session.messages.mockResolvedValue([
      { info: { id: 'msg-1', role: 'user' }, parts: [] },
      { info: { id: 'msg-2', role: 'assistant' }, parts: [] },
      { info: { id: 'msg-3', role: 'user' }, parts: [] },
      { info: { id: 'msg-4', role: 'assistant' }, parts: [] },
    ]);
    mockSdkClient.session.get.mockResolvedValue({
      id: 'sdk-session',
      title: 'SDK',
      revert: { messageID: 'msg-3' },
      time: { created: 1, updated: 1 },
    });

    const messages = await service.getSessionMessages('sdk-session');
    const canonicalState = service.getCanonicalSessionState('sdk-session');

    expect(messages.map((message) => message.info.id)).toEqual(['msg-1', 'msg-2']);
    expect(canonicalState?.messages.map((message) => message.id)).toEqual(['msg-1', 'msg-2']);
    expect(canonicalState?.messages[0]?.sessionID).toBe('sdk-session');
    expect(mockSdkClient.session.messages).toHaveBeenCalledWith({ sessionID: 'sdk-session' });
    expect(mockSdkClient.session.get).toHaveBeenCalledWith({ sessionID: 'sdk-session' });
  });

  it('loads session todos via SDK and normalizes entries', async () => {
    service = createServiceWithSdkFlags();
    mockSdkClient.session.todo = jest.fn().mockResolvedValue([
      { id: 'todo-1', content: 'Inspect docs', status: 'in_progress', priority: 'high' },
      { content: 'Draft spec', status: 'pending', priority: 'medium' },
      { content: '', status: 'pending' },
    ]);

    await expect(service.getSessionTodos('sdk-session')).resolves.toEqual([
      { id: 'todo-1', content: 'Inspect docs', status: 'in_progress', priority: 'high' },
      { content: 'Draft spec', status: 'pending', priority: 'medium' },
    ]);
    expect(mockSdkClient.session.todo).toHaveBeenCalledWith({ sessionID: 'sdk-session' });
  });

  it('loads session statuses via SDK and normalizes entries', async () => {
    service = createServiceWithSdkFlags();
    mockSdkClient.session.status = jest.fn().mockResolvedValue({
      data: {
        'sdk-session': { type: 'busy' },
        'retry-session': { type: 'retry', attempt: 2, message: 'Retrying', next: 123 },
        'invalid-session': { type: 'unknown' },
      },
    });

    await expect(service.getSessionStatuses()).resolves.toEqual({
      'sdk-session': { type: 'busy' },
      'retry-session': { type: 'retry', attempt: 2, message: 'Retrying', next: 123 },
    });
    expect(mockSdkClient.session.status).toHaveBeenCalledWith();
  });
});

describe('OpenCodeService SDK sync events', () => {
  it('emits todo.updated payloads from SDK sync events', async () => {
    service = createServiceWithSdkFlags();
    const updates: Array<{ sessionId: string; todos: unknown[] }> = [];
    mockSdkClient.global.event.mockResolvedValue({
      stream: (async function* () {
        yield {
          type: 'todo.updated',
          properties: {
            sessionID: 'sdk-session',
            todos: [
              { content: 'Inspect docs', status: 'in_progress', priority: 'high' },
              { content: 'Draft spec', status: 'pending', priority: 'medium' },
            ],
          },
        };
      })(),
    });

    const dispose = service.subscribeToSessionTodoUpdates((update) => {
      updates.push(update as unknown as { sessionId: string; todos: unknown[] });
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    dispose();

    expect(mockSdkClient.global.event).toHaveBeenCalled();
    expect(updates).toEqual([
      {
        sessionId: 'sdk-session',
        todos: [
          { content: 'Inspect docs', status: 'in_progress', priority: 'high' },
          { content: 'Draft spec', status: 'pending', priority: 'medium' },
        ],
      },
    ]);
  });

  it('emits session.status payloads from SDK sync events', async () => {
    service = createServiceWithSdkFlags();
    const updates: Array<{ sessionId: string; status: unknown }> = [];
    mockSdkClient.global.event.mockResolvedValue({
      stream: (async function* () {
        yield {
          type: 'session.status',
          properties: {
            sessionID: 'sdk-session',
            status: { type: 'idle' },
          },
        };
      })(),
    });

    const dispose = service.subscribeToSessionStatusUpdates((update) => {
      updates.push(update as unknown as { sessionId: string; status: unknown });
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    dispose();

    expect(mockSdkClient.global.event).toHaveBeenCalled();
    expect(updates).toEqual([
      {
        sessionId: 'sdk-session',
        status: { type: 'idle' },
      },
    ]);
  });
});

describe('OpenCodeService SDK sync message mutations', () => {
  it('applies and emits message.updated payloads from SDK sync events', async () => {
    service = createServiceWithSdkFlags();
    const updates: Array<unknown> = [];
    mockSdkClient.global.event.mockResolvedValue({
      stream: (async function* () {
        yield {
          type: 'message.updated',
          properties: {
            sessionID: 'sdk-session',
            info: {
              id: 'msg-1',
              sessionID: 'sdk-session',
              role: 'assistant',
              time: { created: 1 },
              providerID: 'openai',
              modelID: 'gpt-test',
            },
          },
        };
      })(),
    });

    const dispose = (service as unknown as {
      subscribeToSessionSyncEvents: (listener: (update: unknown) => void) => () => void;
    }).subscribeToSessionSyncEvents((update) => {
      updates.push(update);
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    dispose();

    expect(updates).toEqual([
      {
        sessionId: 'sdk-session',
        type: 'message.updated',
        info: {
          id: 'msg-1',
          sessionID: 'sdk-session',
          role: 'assistant',
          time: { created: 1 },
          providerID: 'openai',
          modelID: 'gpt-test',
        },
      },
    ]);
    expect(service.getCanonicalSessionState('sdk-session')?.messages).toEqual([
      expect.objectContaining({
        id: 'msg-1',
        role: 'assistant',
        providerID: 'openai',
      }),
    ]);
  });

  it('applies and emits message part mutation payloads from SDK sync events', async () => {
    service = createServiceWithSdkFlags();
    const updates: Array<unknown> = [];
    mockSdkClient.global.event.mockResolvedValue({
      stream: (async function* () {
        yield {
          type: 'message.updated',
          properties: {
            sessionID: 'sdk-session',
            info: {
              id: 'msg-1',
              sessionID: 'sdk-session',
              role: 'assistant',
              time: { created: 1 },
            },
          },
        };
        yield {
          type: 'message.part.updated',
          properties: {
            sessionID: 'sdk-session',
            part: {
              id: 'part-1',
              sessionID: 'sdk-session',
              type: 'tool',
              messageID: 'msg-1',
              text: 'Hel',
            },
            time: 42,
          },
        };
        yield {
          type: 'message.part.delta',
          properties: {
            sessionID: 'sdk-session',
            messageID: 'msg-1',
            partID: 'part-1',
            field: 'text',
            delta: 'lo',
          },
        };
      })(),
    });

    const dispose = (service as unknown as {
      subscribeToSessionSyncEvents: (listener: (update: unknown) => void) => () => void;
    }).subscribeToSessionSyncEvents((update) => {
      updates.push(update);
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    dispose();

    expect(updates).toEqual([
      {
        sessionId: 'sdk-session',
        type: 'message.updated',
        info: {
          id: 'msg-1',
          sessionID: 'sdk-session',
          role: 'assistant',
          time: { created: 1 },
        },
      },
      {
        sessionId: 'sdk-session',
        type: 'message.part.updated',
        part: {
          id: 'part-1',
          sessionID: 'sdk-session',
          type: 'tool',
          messageID: 'msg-1',
          text: 'Hel',
        },
        time: 42,
      },
      {
        sessionId: 'sdk-session',
        type: 'message.part.delta',
        messageId: 'msg-1',
        partId: 'part-1',
        field: 'text',
        delta: 'lo',
      },
    ]);
    expect(service.getCanonicalSessionMessages('sdk-session')).toEqual([
      {
        info: expect.objectContaining({
          id: 'msg-1',
          role: 'assistant',
        }),
        parts: [
          expect.objectContaining({
            id: 'part-1',
            messageID: 'msg-1',
            text: 'Hello',
          }),
        ],
      },
    ]);
  });
});

describe('OpenCodeService SDK sync removals', () => {
  it('applies message and part removals from SDK sync events', async () => {
    service = createServiceWithSdkFlags();
    mockSdkClient.global.event.mockResolvedValue({
      stream: (async function* () {
        yield {
          type: 'message.updated',
          properties: {
            sessionID: 'sdk-session',
            info: {
              id: 'msg-1',
              sessionID: 'sdk-session',
              role: 'assistant',
              time: { created: 1 },
            },
          },
        };
        yield {
          type: 'message.part.updated',
          properties: {
            sessionID: 'sdk-session',
            part: {
              id: 'part-1',
              sessionID: 'sdk-session',
              messageID: 'msg-1',
              type: 'text',
              text: 'temporary',
            },
          },
        };
        yield {
          type: 'message.part.removed',
          properties: {
            sessionID: 'sdk-session',
            messageID: 'msg-1',
            partID: 'part-1',
          },
        };
        yield {
          type: 'message.removed',
          properties: {
            sessionID: 'sdk-session',
            messageID: 'msg-1',
          },
        };
      })(),
    });

    const dispose = (service as unknown as {
      subscribeToSessionSyncEvents: (listener: (update: unknown) => void) => () => void;
    }).subscribeToSessionSyncEvents(jest.fn());

    await new Promise((resolve) => setTimeout(resolve, 0));
    dispose();

    expect(service.getCanonicalSessionMessages('sdk-session')).toEqual([]);
  });
});

describe('OpenCodeService SDK sync reload events', () => {
  it('emits session.diff payloads from SDK sync events', async () => {
    service = createServiceWithSdkFlags();
    const updates: Array<{ sessionId: string; type: string }> = [];
    mockSdkClient.global.event.mockResolvedValue({
      stream: (async function* () {
        yield {
          type: 'session.diff',
          properties: {
            sessionID: 'sdk-session',
            diff: [
              {
                file: 'notes.md',
                additions: 1,
                deletions: 0,
                status: 'modified',
              },
            ],
          },
        };
      })(),
    });

    const dispose = (service as unknown as {
      subscribeToSessionSyncEvents: (listener: (update: unknown) => void) => () => void;
    }).subscribeToSessionSyncEvents((update) => {
      updates.push(update as { sessionId: string; type: string });
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    dispose();

    expect(updates).toEqual([
      {
        sessionId: 'sdk-session',
        type: 'session.diff',
        diff: [
          {
            file: 'notes.md',
            additions: 1,
            deletions: 0,
            status: 'modified',
          },
        ],
      },
    ]);
  });
});

describe('OpenCodeService SDK revert lifecycle', () => {
  it('returns session revert state via SDK', async () => {
    service = createServiceWithSdkFlags();
    mockSdkClient.session.get.mockResolvedValue({
      id: 'sdk-session',
      title: 'SDK',
      revert: { messageID: 'msg-1', partID: 'part-1' },
      time: { created: 1, updated: 1 },
    });

    await expect(service.getSessionRevertState('sdk-session')).resolves.toEqual({
      messageID: 'msg-1',
      partID: 'part-1',
    });
    expect(mockSdkClient.session.get).toHaveBeenCalledWith({ sessionID: 'sdk-session' });
  });

  it('falls back to legacy HTTP when SDK session.get fails', async () => {
    service = createServiceWithSdkFlags();
    mockSdkClient.session.get.mockRejectedValue(new Error('sdk get failed'));
    mockRequestUrl.mockResolvedValue({
      status: 200,
      json: {
        id: 'legacy-session',
        title: 'Legacy',
        revert: { messageID: 'msg-legacy' },
        time: { created: 1, updated: 2 },
      },
      text: '{"id":"legacy-session","title":"Legacy","revert":{"messageID":"msg-legacy"},"time":{"created":1,"updated":2}}',
    });

    await expect(service.getSessionRevertState('legacy-session')).resolves.toEqual({
      messageID: 'msg-legacy',
    });
    expect(mockSdkClient.session.get).toHaveBeenCalledWith({ sessionID: 'legacy-session' });
    expect(mockRequestUrl).toHaveBeenCalledWith(expect.objectContaining({
      url: 'http://127.0.0.1:4196/session/legacy-session',
      method: 'GET',
    }));
  });

  it('restores reverted session via SDK', async () => {
    service = createServiceWithSdkFlags();
    mockSdkClient.session.unrevert.mockResolvedValue({
      id: 'sdk-session',
      title: 'SDK',
      time: { created: 1, updated: 1 },
    });

    await expect(service.unrevertSession('sdk-session')).resolves.toBe(true);
    expect(mockSdkClient.session.unrevert).toHaveBeenCalledWith({ sessionID: 'sdk-session' });
  });
});
