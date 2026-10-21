import { describe, expect, it, jest } from '@jest/globals';

import { AgentCapability } from '../../../../../src/core/agents/AgentCapability';
import {
  backendSessionCatalogFailure,
  BackendSessionCatalogReadError,
  readBackendSessionsCatalog,
} from '../../../../../src/core/agents/backend/AgentBackendRouting';
import type { AgentServiceRegistry } from '../../../../../src/core/agents/backend/AgentServiceRegistry';
import { OpenCode2Adapter } from '../../../../../src/core/agents/backend/OpenCode2Adapter';

function adapterWithList(list: (request: { cursor?: string }) => Promise<unknown>): OpenCode2Adapter {
  const adapter = new OpenCode2Adapter({
    workingDirectory: '/owned',
    getSettings: () => ({ mode: 'remote', executablePath: '', baseUrl: 'http://127.0.0.1:4096', password: '' }),
  });
  Object.assign(adapter, {
    client: { server: { info: async () => ({ version: '2.0.24' }) }, session: { list } },
    connectionKey: JSON.stringify(['remote', '', 'http://127.0.0.1:4096', '', '']),
  });
  return adapter;
}

function registry(listSessions: () => Promise<unknown>) {
  return { getActive: () => ({ kind: 'opencode2', hasCapability: (cap: AgentCapability) => cap === AgentCapability.Sessions, listSessions }) } as unknown as AgentServiceRegistry;
}

describe('OpenCode 2 session catalogs', () => {
  it('follows native cursors even when a page is shorter than the requested limit and deduplicates IDs', async () => {
    const list = jest.fn(async ({ cursor }: { cursor?: string }) => {
      if (!cursor) return { data: [{ id: 'one' }], cursor: { next: 'p2' } };
      if (cursor === 'p2') return { data: [{ id: 'one' }, { id: 'two' }], cursor: { next: 'p3' } };
      return { data: [{ id: 'three' }], cursor: {} };
    });
    expect(await adapterWithList(list).listSessions()).toEqual([{ id: 'one' }, { id: 'two' }, { id: 'three' }]);
    expect(list.mock.calls.map(([arg]) => arg.cursor)).toEqual([undefined, 'p2', 'p3']);
  });

  it('retains partial pages and the failed cursor without exposing raw error data', async () => {
    const adapter = adapterWithList(async ({ cursor }) => {
      if (cursor) throw Object.assign(new Error('credential=SENSITIVE failure'), { status: 403 });
      return { data: [{ id: 'one', title: 'owned' }], cursor: { next: 'p2' } };
    });
    const result = await readBackendSessionsCatalog(registry(() => adapter.listSessions()));
    expect(result).toEqual({ status: 'partial', data: [{ id: 'one', title: 'owned', shareUrl: null, updatedAt: null }], nextCursor: 'p2', errorReason: 'Permission denied' });
    expect(JSON.stringify(result)).not.toContain('SENSITIVE');
  });

  it('reports a repeated cursor as partial, rather than a complete truncated array', async () => {
    const adapter = adapterWithList(async ({ cursor }) => ({ data: [{ id: cursor ?? 'first' }], cursor: { next: 'same' } }));
    await expect(adapter.listSessions()).rejects.toMatchObject({
      result: { status: 'partial', nextCursor: 'same', errorReason: 'Session catalog cursor repeated' },
    });
  });

  it('distinguishes empty success, denied, ordinary failure, invalid response and absent method', async () => {
    expect(await readBackendSessionsCatalog(registry(async () => []))).toEqual({ status: 'complete', data: [], nextCursor: null });
    expect(await readBackendSessionsCatalog(registry(async () => { throw Object.assign(new Error('secret'), { status: 401 }); }))).toMatchObject({ status: 'failed', errorReason: 'Permission denied' });
    expect(await readBackendSessionsCatalog(registry(async () => { throw new Error('secret'); }))).toMatchObject({ status: 'failed', errorReason: 'Session catalog read failed' });
    expect(await readBackendSessionsCatalog(registry(async () => ({ sessions: [] })))).toMatchObject({ status: 'failed' });
    expect(await readBackendSessionsCatalog(registry(async () => { throw Object.assign(new Error('secret'), { code: -32601 }); }))).toMatchObject({ status: 'unavailable' });
    expect(await readBackendSessionsCatalog(null)).toMatchObject({ status: 'unavailable' });
  });

  it('rejects synthetic session identities and retains valid rows', async () => {
    expect(await readBackendSessionsCatalog(registry(async () => [{ title: 'missing ID' }, { id: 'real' }, { id: 'real' }]))).toMatchObject({ status: 'partial', data: [{ id: 'real' }] });
    const adapter = adapterWithList(async () => ({ data: [{ title: 'no ID' }], cursor: {} }));
    await expect(adapter.listSessions()).rejects.toBeInstanceOf(BackendSessionCatalogReadError);
  });

  it('classifies native SDK unauthorized tags and nested HTTP cause fields safely', () => {
    expect(backendSessionCatalogFailure({ _tag: 'UnauthorizedError', message: 'secret' }).errorReason).toBe('Permission denied');
    expect(backendSessionCatalogFailure(new Error('secret', { cause: { response: { status: 403 } } })).errorReason).toBe('Permission denied');
  });
});
