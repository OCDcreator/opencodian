/**
 * OpenCodeService session HTTP runtime unit tests.
 */

import {
  createOpenCodeServiceTestContext,
  mockRequestUrl,
  type OpenCodeService,
} from './OpenCodeService.testSupport';

let service: OpenCodeService;

beforeEach(() => {
  ({ service } = createOpenCodeServiceTestContext());
  mockRequestUrl.mockResolvedValue({
    status: 200,
    json: { id: 'test-session' },
    text: '{"id":"test-session"}',
  });
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('OpenCodeService session HTTP runtime', () => {
  it('should create session via HTTP API', async () => {
    const sessionId = await service.createSession('Test');
    expect(sessionId).toBe('test-session');
    expect(mockRequestUrl).toHaveBeenCalledWith(expect.objectContaining({
      url: 'http://127.0.0.1:4196/session',
      method: 'POST',
    }));
  });

  it('should list sessions via HTTP API', async () => {
    mockRequestUrl.mockResolvedValue({
      status: 200,
      json: [{ id: '1', title: 'Test' }],
      text: '[{"id":"1","title":"Test"}]',
    });

    const sessions = await service.listSessions();
    expect(sessions).toHaveLength(1);
  });

  it('should get session messages via HTTP API', async () => {
    mockRequestUrl
      .mockResolvedValueOnce({
        status: 200,
        json: [{ info: { id: 'm1', role: 'user' }, parts: [] }],
        text: '[{"info":{"id":"m1","role":"user"},"parts":[]}]',
      })
      .mockResolvedValueOnce({
        status: 200,
        json: {
          id: 'test-id',
          title: 'Test',
          time: { created: 1, updated: 1 },
        },
        text: '{"id":"test-id","title":"Test","time":{"created":1,"updated":1}}',
      });

    const messages = await service.getSessionMessages('test-id');
    expect(messages).toHaveLength(1);
  });

  it('applies session revert state when loading messages via HTTP API', async () => {
    mockRequestUrl
      .mockResolvedValueOnce({
        status: 200,
        json: [
          { info: { id: 'msg-1', role: 'user' }, parts: [] },
          { info: { id: 'msg-2', role: 'assistant' }, parts: [] },
          { info: { id: 'msg-3', role: 'user' }, parts: [] },
          { info: { id: 'msg-4', role: 'assistant' }, parts: [] },
        ],
        text: '[]',
      })
      .mockResolvedValueOnce({
        status: 200,
        json: {
          id: 'test-id',
          title: 'Test',
          revert: {
            messageID: 'msg-3',
          },
          time: { created: 1, updated: 1 },
        },
        text: '{"id":"test-id","title":"Test","revert":{"messageID":"msg-3"},"time":{"created":1,"updated":1}}',
      });

    const messages = await service.getSessionMessages('test-id');
    expect(messages.map((message) => message.info.id)).toEqual(['msg-1', 'msg-2']);
  });

  it('returns session revert state via HTTP API', async () => {
    mockRequestUrl.mockResolvedValue({
      status: 200,
      json: {
        id: 'test-id',
        title: 'Test',
        revert: { messageID: 'msg-1' },
        time: { created: 1, updated: 1 },
      },
      text: '{"id":"test-id","title":"Test","revert":{"messageID":"msg-1"},"time":{"created":1,"updated":1}}',
    });

    await expect(service.getSessionRevertState('test-id')).resolves.toEqual({ messageID: 'msg-1' });
  });

  it('should delete session via HTTP API', async () => {
    mockRequestUrl.mockResolvedValue({ status: 204, json: {}, text: '' });

    await service.deleteSession('test-id');
    expect(mockRequestUrl).toHaveBeenCalledWith(expect.objectContaining({
      url: 'http://127.0.0.1:4196/session/test-id',
      method: 'DELETE',
    }));
  });

  it('should update session title via HTTP API', async () => {
    mockRequestUrl.mockResolvedValue({
      status: 200,
      json: { id: 'test-id', title: 'Renamed' },
      text: '{"id":"test-id","title":"Renamed"}',
    });

    await service.updateSessionTitle('test-id', 'Renamed');
    expect(mockRequestUrl).toHaveBeenCalledWith(expect.objectContaining({
      url: 'http://127.0.0.1:4196/session/test-id',
      method: 'PATCH',
    }));
  });

  it('should fork session via HTTP API', async () => {
    mockRequestUrl.mockResolvedValue({
      status: 200,
      json: { id: 'fork-session', title: 'Fork Session' },
      text: '{"id":"fork-session","title":"Fork Session"}',
    });

    const result = await service.forkSession('test-id', 'msg-1');
    expect(result).toEqual({ id: 'fork-session', title: 'Fork Session' });
    expect(mockRequestUrl).toHaveBeenCalledWith(expect.objectContaining({
      url: 'http://127.0.0.1:4196/session/test-id/fork',
      method: 'POST',
    }));
  });

  it('should revert session via HTTP API', async () => {
    mockRequestUrl.mockResolvedValue({
      status: 200,
      json: true,
      text: 'true',
    });

    const reverted = await service.revertSession('test-id', 'msg-1');
    expect(reverted).toBe(true);
    expect(mockRequestUrl).toHaveBeenCalledWith(expect.objectContaining({
      url: 'http://127.0.0.1:4196/session/test-id/revert',
      method: 'POST',
    }));
  });

  it('restores reverted session via HTTP API', async () => {
    mockRequestUrl.mockResolvedValue({
      status: 200,
      json: { id: 'test-id', title: 'Test', time: { created: 1, updated: 1 } },
      text: '{"id":"test-id","title":"Test","time":{"created":1,"updated":1}}',
    });

    await expect(service.unrevertSession('test-id')).resolves.toBe(true);
    expect(mockRequestUrl).toHaveBeenCalledWith(expect.objectContaining({
      url: 'http://127.0.0.1:4196/session/test-id/unrevert',
      method: 'POST',
    }));
  });

  it('treats 204 revert response as success', async () => {
    mockRequestUrl.mockResolvedValue({
      status: 204,
      json: null,
      text: '',
    });

    const reverted = await service.revertSession('test-id', 'msg-1');
    expect(reverted).toBe(true);
  });

  it('treats session object revert response as success', async () => {
    mockRequestUrl.mockResolvedValue({
      status: 200,
      json: {
        id: 'test-id',
        title: 'New Conversation (fork #1)',
      },
      text: '{"id":"test-id","title":"New Conversation (fork #1)"}',
    });

    const reverted = await service.revertSession('test-id', 'msg-1');
    expect(reverted).toBe(true);
  });
});
