import { CapabilityLabSessionStore } from '../../../../src/features/settings/SettingsCapabilityLabSection';

describe('CapabilityLabSessionStore', () => {
  it('round-trips entries through append and load', async () => {
    const store = new CapabilityLabSessionStore();
    const key = { projectKey: 'vault-a', sessionId: 'session-1' };
    const entry = { type: 'message', uuid: 'entry-1', timestamp: '123', content: 'hello' };

    await store.append(key, [entry]);

    const loaded = await store.load(key);
    expect(loaded).toEqual([entry]);
    expect(loaded).not.toBeNull();
    expect(loaded).not.toBeUndefined();
    expect(loaded![0]).not.toBe(entry);
  });

  it('returns null for missing keys', async () => {
    const store = new CapabilityLabSessionStore();
    await expect(store.load({ projectKey: 'vault-a', sessionId: 'missing' })).resolves.toBeNull();
  });

  it('accumulates repeated append calls for the same key', async () => {
    const store = new CapabilityLabSessionStore();
    const key = { projectKey: 'vault-a', sessionId: 'session-1' };

    await store.append(key, [{ type: 'message', uuid: 'entry-1' }]);
    await store.append(key, [{ type: 'message', uuid: 'entry-2' }]);

    await expect(store.load(key)).resolves.toEqual([
      { type: 'message', uuid: 'entry-1' },
      { type: 'message', uuid: 'entry-2' },
    ]);
  });

  it('lists sessions with updated mtimes', async () => {
    const store = new CapabilityLabSessionStore();
    const key = { projectKey: 'vault-a', sessionId: 'session-1' };
    const nowSpy = jest.spyOn(Date, 'now');
    nowSpy.mockReturnValueOnce(1111).mockReturnValueOnce(2222);

    await store.append(key, [{ type: 'message', uuid: 'entry-1' }]);
    await store.append(key, [{ type: 'message', uuid: 'entry-2' }]);

    await expect(store.listSessions('vault-a')).resolves.toEqual([
      { sessionId: 'session-1', mtime: 2222 },
    ]);
  });

  it('lists only non-empty subkeys', async () => {
    const store = new CapabilityLabSessionStore();
    const key = { projectKey: 'vault-a', sessionId: 'session-1', subpath: 'sub-a' };
    const emptySubpathKey = { projectKey: 'vault-a', sessionId: 'session-1', subpath: '' };

    await store.append(key, [{ type: 'message', uuid: 'entry-1' }]);
    await store.append(emptySubpathKey, [{ type: 'message', uuid: 'entry-2' }]);

    await expect(store.listSubkeys({ projectKey: 'vault-a', sessionId: 'session-1' })).resolves.toEqual(['sub-a']);
  });

  it('keeps empty stores isolated', async () => {
    const store = new CapabilityLabSessionStore();

    await expect(store.listSessions('vault-a')).resolves.toEqual([]);
    await expect(store.listSubkeys({ projectKey: 'vault-a', sessionId: 'session-1' })).resolves.toEqual([]);
    await expect(store.load({ projectKey: 'vault-a', sessionId: 'session-1' })).resolves.toBeNull();
  });

  it('isolates different project keys', async () => {
    const store = new CapabilityLabSessionStore();

    await store.append({ projectKey: 'vault-a', sessionId: 'session-1' }, [{ type: 'message', uuid: 'entry-1' }]);
    await store.append({ projectKey: 'vault-b', sessionId: 'session-2' }, [{ type: 'message', uuid: 'entry-2' }]);

    await expect(store.listSessions('vault-a')).resolves.toEqual([
      { sessionId: 'session-1', mtime: expect.any(Number) },
    ]);
    await expect(store.listSessions('vault-b')).resolves.toEqual([
      { sessionId: 'session-2', mtime: expect.any(Number) },
    ]);
  });
});
