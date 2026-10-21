import { expect, it, jest } from '@jest/globals';

import { ZCodeAdapter } from '../../../../../src/core/agents/backend/zcode/ZCodeAdapter';
import type { ZCodeAppServerTransport } from '../../../../../src/core/agents/backend/zcode/ZCodeAppServerTransport';

it('expires only a matching native-resolved question and rejects late answers', async () => {
  const handlers = new Map<string, (params: Record<string, unknown>) => unknown>();
  let onEvent: ((params: Record<string, unknown>) => void) | undefined;
  const adapter = new ZCodeAdapter({
    resolveRuntime: () => ({ mode: 'ready', launch: {
      command: '/runtime/zcode-agent', args: ['app-server', '--stdio'],
      entryKind: 'native-binary', entryPath: '/runtime/zcode-agent', source: 'app-bundled', extraEnv: {},
    } }),
    discoverProviderConfig: () => ({
      dataRoot: '/home/tester/.zcode', configPath: '/home/tester/.zcode/v2/provider_config.json',
      builtinConfigPath: '/builtin/zcode-builtin.json', state: 'validated', providerCount: 1,
      detail: null, env: { ZCODE_STORAGE_DIR: '/home/tester/.zcode' },
    }),
    createTransport: () => ({
      start: jest.fn(async () => {}), request: jest.fn(async () => ({})), dispose: jest.fn(),
      onNotification: (method: string, handler: (params: Record<string, unknown>) => void) => {
        if (method === 'session/event') onEvent = handler;
        return { dispose: jest.fn() };
      },
      onServerRequest: (method: string, handler: (params: Record<string, unknown>) => unknown) => {
        handlers.set(method, handler);
        return { dispose: jest.fn() };
      },
    } as unknown as ZCodeAppServerTransport),
  });
  try {
    await adapter.start();
    const params = {
      requestId: 'question-a', sessionId: 'session-a', turnId: 'turn-a', toolCallId: 'call-a',
      questions: [{ question: 'Favorite color?', header: 'Color', options: [
        { label: 'red', description: 'Red' }, { label: 'green', description: 'Green' },
      ] }],
    };
    const handler = handlers.get('interaction/requestUserInput');
    const first = handler?.(params) as Promise<unknown>;
    const other = handler?.({ ...params, requestId: 'question-b', sessionId: 'session-b' }) as Promise<unknown>;
    onEvent?.({ type: 'permission.resolved', sessionId: 'session-b', payload: { requestId: 'question-a' } });
    onEvent?.({ type: 'permission.resolved', sessionId: 'session-a', payload: { requestId: 'unknown' } });
    expect(await adapter.getPendingQuestions()).toHaveLength(2);

    onEvent?.({ type: 'permission.resolved', sessionId: 'session-a', turnId: 'turn-a', payload: {
      requestId: 'question-a', toolCallId: 'call-a', decision: 'modify', modifiedInput: { answers: {} },
    } });
    expect((await adapter.getPendingQuestions()).map((request) => request.id)).toEqual(['question-b']);
    await expect(first).resolves.toMatchObject({ action: 'cancel' });
    await expect(adapter.replyToQuestion('question-a', [['green']])).rejects.toThrow('not pending');
    await expect(handler?.(params) as Promise<unknown>).resolves.toMatchObject({ action: 'cancel' });
    await adapter.replyToQuestion('question-b', [['red']]);
    await expect(other).resolves.toMatchObject({ action: 'accept', content: { answers: { 'Favorite color?': ['red'] } } });
  } finally {
    adapter.dispose();
  }
});
