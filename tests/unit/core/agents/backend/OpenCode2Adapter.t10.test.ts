import { OpenCode2Adapter } from '../../../../../src/core/agents/backend/OpenCode2Adapter';

function adapterWithClient(client: object) {
  const adapter = new OpenCode2Adapter({ workingDirectory: '/vault',
    getSettings: () => ({ mode: 'remote', executablePath: '', baseUrl: 'http://fixture', password: '' }),
  });
  Object.assign(adapter, { client: { server: { info: async () => ({ version: '2.0.18' }) }, ...client },
    connectionKey: JSON.stringify(['remote', '', 'http://fixture', '', '']) });
  return adapter;
}

describe('T10 OpenCode 2 native pagination contract', () => {
  it('follows the opaque cursor without combining it with first-page order', async () => {
    const list = jest.fn(async (input: { cursor?: string; order?: string }) => {
      if (input.cursor && input.order) throw new Error('Cursor cannot be combined with order');
      return input.cursor ? { cursor: {}, data: [{ id: 'last', type: 'user', text: 'last', time: { created: 101 } }] }
        : { cursor: { next: 'opaque-next' }, data: Array.from({ length: 100 }, (_, index) => ({ id: 'u' + index,
          type: 'user', text: 'page one', time: { created: index } })) };
    });
    const adapter = adapterWithClient({ message: { list } });
    const messages = await adapter.getChatMessages('native-v2');
    expect(messages).toHaveLength(101);
    expect(messages.at(-1)?.id).toBe('last');
    expect(list).toHaveBeenNthCalledWith(1, { sessionID: 'native-v2', limit: 100, order: 'asc' });
    expect(list).toHaveBeenNthCalledWith(2, { sessionID: 'native-v2', limit: 100, cursor: 'opaque-next' });
  });

  it('propagates page two failure instead of reporting an incomplete history as complete', async () => {
    const list = jest.fn(async (input: { cursor?: string }) => {
      if (input.cursor) throw new Error('history read denied');
      return { cursor: { next: 'next' }, data: Array.from({ length: 100 }, (_, index) => ({ id: 'u' + index,
        type: 'user', text: 'first page', time: { created: index } })) };
    });
    await expect(adapterWithClient({ message: { list } }).getChatMessages('native-v2')).rejects.toThrow('history read denied');
  });
});


describe('T10 OpenCode 2 foreground, history and change-evidence isolation', () => {
  it('ignores child completion while the admitted parent foreground continues', async () => {
    async function* events() {
      yield { type: 'server.connected' };
      yield { type: 'session.inbox.delivered', data: { sessionID: 'parent', inboxID: 'inbox-current' } };
      yield { type: 'session.execution.succeeded', data: { sessionID: 'child' } };
      yield { type: 'session.text.delta', data: { sessionID: 'child', delta: 'child output' } };
      yield { type: 'session.text.delta', data: { sessionID: 'parent', delta: 'foreground output' } };
      yield { type: 'session.execution.succeeded', data: { sessionID: 'parent' } };
    }
    const prompt = jest.fn().mockResolvedValue({ id: 'inbox-current' });
    const adapter = adapterWithClient({ event: { subscribe: () => events() }, session: { prompt } });
    const chunks = [];
    for await (const chunk of adapter.sendMessage({ sessionId: 'parent', content: 'test' })) chunks.push(chunk);
    expect(chunks).toEqual([{ type: 'message_start' }, { type: 'text', content: 'foreground output' }, { type: 'message_stop' }]);
    expect(prompt).toHaveBeenCalledTimes(1);
  });

  it('keeps non-Git file hints limited to visible completed writes after native revert', async () => {
    const diff = jest.fn();
    const tool = (file: string, status: string) => ({ type: 'tool', id: file, name: 'write', state: { status, input: { file } } });
    const adapter = adapterWithClient({
      session: { get: async () => ({ revert: { messageID: 'retracted-user' } }), diff },
      message: { list: async () => ({ cursor: {}, data: [
        { id: 'visible-user', type: 'user' },
        { id: 'visible-answer', type: 'assistant', content: [tool('visible.md', 'completed'), tool('failed.md', 'error')] },
        { id: 'retracted-user', type: 'user' },
        { id: 'hidden-answer', type: 'assistant', content: [tool('hidden.md', 'completed')] },
      ] }) },
    });
    expect(await adapter.getSessionDiff('parent')).toEqual([{ file: 'visible.md', additions: 0, deletions: 0, statsUnavailable: true }]);
    expect(diff).not.toHaveBeenCalled();
  });

  it('does not attribute an unrelated child change to the parent turn', async () => {
    const list = jest.fn().mockResolvedValue({ cursor: {}, data: [] });
    const adapter = adapterWithClient({ session: { list: async () => ({ data: [{ id: 'owned-child', outcome: 'succeeded' }] }) }, message: { list } });
    expect(await adapter.getBackgroundTaskChanges('parent', 'unrelated-child')).toBeNull();
    expect(list).not.toHaveBeenCalled();
  });

  it('keeps selected native model defaults local to each adapter instance', async () => {
    const catalog = (providerID: string) => ({ model: {
      list: async () => ({ data: [{ providerID, id: 'model', enabled: true, name: 'Model', limit: { context: 100 }, variants: [] }] }),
      default: async () => ({ data: { providerID, id: 'model' } }),
    } });
    const first = adapterWithClient(catalog('provider-one'));
    const second = adapterWithClient(catalog('provider-two'));
    await Promise.all([first.getModelSelectorProviders(), second.getModelSelectorProviders()]);
    expect(first.getDefaultModelSelection()).toEqual({ provider: 'provider-one', model: 'model' });
    expect(second.getDefaultModelSelection()).toEqual({ provider: 'provider-two', model: 'model' });
  });
});
