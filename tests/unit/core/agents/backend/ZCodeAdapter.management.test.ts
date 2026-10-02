import { mkdir,mkdtemp } from 'node:fs/promises';
import * as path from 'node:path';

import { ZCodeAdapter } from '../../../../../src/core/agents/backend/zcode/ZCodeAdapter';
import { type ZCodeAppServerTransport, ZCodeRemoteRequestError } from '../../../../../src/core/agents/backend/zcode/ZCodeAppServerTransport';

async function harness(workingDirectory?: string) {
  const request = jest.fn(async (method: string) => {
    if (method === 'runtime/capabilities') return { independentPlanState: true };
    if (method === 'plugins/setEnabled') throw new ZCodeRemoteRequestError(-32602, 'validation');
    if (method === 'plugins/list') return { plugins: [] };
    if (method === 'mcp/list') return { statuses: {} };
    throw new Error('Unexpected model/session call');
  });
  const transport = { request, start: jest.fn(), dispose: jest.fn(), onNotification: jest.fn(), onServerRequest: jest.fn() };
  const adapter = new ZCodeAdapter({
    workingDirectory,
    resolveRuntime: () => ({ mode: 'ready', launch: { command: '/runtime', args: [], source: 'configured', entryKind: 'native-binary', entryPath: '/runtime', extraEnv: {} } }),
    discoverProviderConfig: () => ({ dataRoot: '/fixture', configPath: '/fixture/config.json', builtinConfigPath: null, state: 'validated', providerCount: null, detail: null, env: {} }),
    createTransport: () => transport as unknown as ZCodeAppServerTransport,
  });
  return { adapter, transport };
}

it('uses only current owned transport for management and leaves session/model paths untouched', async () => {
  const cache = path.join(process.cwd(), 'node_modules', '.cache', 'zcode-t09-tests');
  await mkdir(cache, { recursive: true });
  const workspace = await mkdtemp(path.join(cache, 'adapter-'));
  const { adapter, transport } = await harness(workspace);
  await adapter.start();
  const catalog = await adapter.getManagementCatalog();
  expect(catalog?.plugins).toEqual({ state: 'available', entries: [] });
  expect(catalog?.mcp).toEqual({ state: 'available', entries: [] });
  expect(transport.request.mock.calls.map(([method]) => method).sort()).toEqual(['mcp/list', 'plugins/list', 'plugins/setEnabled', 'runtime/capabilities'].sort());
  await adapter.stop();
  const calls = transport.request.mock.calls.length;
  expect((await adapter.getManagementCatalog())?.plugins.state).toBe('unavailable');
  expect(transport.request).toHaveBeenCalledTimes(calls);
  expect(transport.dispose).toHaveBeenCalledTimes(1);
});

it('fails closed without a resolved workspace and never starts the adapter implicitly', async () => {
  const { adapter, transport } = await harness();
  expect(await adapter.getManagementCatalog()).toBeNull();
  expect(await adapter.setManagedPluginEnabled('fixture@local', false, null)).toMatchObject({ status: 'unavailable' });
  expect(transport.start).not.toHaveBeenCalled();
  expect(transport.request).not.toHaveBeenCalled();
});

it('rejects delayed catalog responses from a transport stopped during a refresh', async () => {
  const cache = path.join(process.cwd(), 'node_modules', '.cache', 'zcode-t09-tests');
  await mkdir(cache, { recursive: true });
  const workspace = await mkdtemp(path.join(cache, 'stale-'));
  const { adapter, transport } = await harness(workspace);
  await adapter.start();
  let finish: (value: unknown) => void = () => {};
  transport.request.mockImplementation(async (method) => {
    if (method === 'plugins/list') return new Promise((resolve) => { finish = resolve; });
    if (method === 'plugins/setEnabled') throw new ZCodeRemoteRequestError(-32602, 'validation');
    return { statuses: {} };
  });
  const pending = adapter.getManagementCatalog();
  // File snapshot completes before the native query. Wait for the explicit request.
  for (let attempt = 0; attempt < 100 && !transport.request.mock.calls.some(([method]) => method === 'plugins/list'); attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  expect(transport.request.mock.calls.some(([method]) => method === 'plugins/list')).toBe(true);
  await adapter.stop();
  finish({ plugins: [{ id: 'fixture@local', enabled: false }] });
  expect((await pending)?.plugins).toEqual({ state: 'failed', entries: null });
});
