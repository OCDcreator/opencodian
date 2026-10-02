import { mkdir, mkdtemp, readdir, readFile, symlink, writeFile } from 'node:fs/promises';
import * as path from 'node:path';

import { ZCodeRemoteRequestError } from '../../../../../src/core/agents/backend/zcode/ZCodeAppServerTransport';
import { ZCodeManagementService } from '../../../../../src/core/agents/backend/zcode/ZCodeManagementService';

const pluginId = 'fixture@local';
let workspace: string;
let target: string;
let archiveRoot: string;
let request: jest.Mock<Promise<unknown>, [string, Record<string, unknown>]>;

function service(): ZCodeManagementService {
  return new ZCodeManagementService({ workingDirectory: workspace, request, archiveRootPath: archiveRoot });
}

async function declared(): Promise<Record<string, unknown>> {
  try { return JSON.parse(await readFile(target, 'utf8')) as Record<string, unknown>; }
  catch { return {}; }
}

beforeEach(async () => {
  // Worktree boundary: retain explicit fixtures; never clean unrelated temp roots.
  const fixtureRoot = path.join(process.cwd(), 'node_modules', '.cache', 'zcode-t09-tests');
  await mkdir(fixtureRoot, { recursive: true });
  workspace = await mkdtemp(path.join(fixtureRoot, 'workspace-'));
  target = path.join(workspace, '.zcode', 'config.json');
  archiveRoot = path.join(workspace, 'archive');
  request = jest.fn(async (method, params) => {
    if (method === 'plugins/setEnabled') {
      if (Object.keys(params).length !== 0) throw new Error('Unexpected valid native writer dispatch');
      throw new ZCodeRemoteRequestError(-32602, 'fixture validation');
    }
    if (method === 'plugins/list') {
      const config = await declared();
      const enabledPlugins = (config['plugins'] as { enabledPlugins?: Record<string, boolean> } | undefined)?.enabledPlugins;
      const configured = enabledPlugins?.[pluginId];
      return { plugins: [{ id: pluginId, enabled: configured ?? true, ...(configured !== undefined ? { enabledSource: 'workspace' } : {}), mcpServerNames: [], hookDetails: [] }] };
    }
    if (method !== 'mcp/list' || params['mode'] !== 'status') throw new Error('Unexpected connecting MCP request');
    return { statuses: {} };
  });
});

it('persists, reopens, archives and independently resolves effective workspace plugin config', async () => {
  await mkdir(path.dirname(target));
  const original = { provider: { marker: 'preserve-other-owner' }, plugins: { enabledPlugins: { other: false } } };
  await writeFile(target, JSON.stringify(original));
  const catalog = await service().readCatalog();
  const result = await service().setPluginEnabled(pluginId, false, catalog.configuration.revision);
  expect(result).toMatchObject({ status: 'success', evidence: { persistence: 'verified', application: 'pending', runtime: 'verified' } });
  const reopened = await new ZCodeManagementService({ workingDirectory: workspace, request, archiveRootPath: archiveRoot }).readCatalog();
  expect(reopened.plugins.entries?.[0]).toMatchObject({ enabled: false, enabledSource: 'workspace' });
  expect(await declared()).toEqual({ ...original, plugins: { enabledPlugins: { other: false, [pluginId]: false } } });
  // Only an invalid schema probe is sent to the unguarded native writer.
  expect(request.mock.calls.filter(([method]) => method === 'plugins/setEnabled').every(([, params]) => Object.keys(params).length === 0)).toBe(true);
  const archivedPaths = await readdir(archiveRoot, { recursive: true });
  const archivedVersion = archivedPaths.find((entry) => entry.includes('versions') && entry.endsWith('.json'));
  expect(archivedVersion).toBeDefined();
  expect(JSON.parse(await readFile(path.join(archiveRoot, archivedVersion!), 'utf8'))).toEqual(original);
});

it('creates an absent workspace override and preserves explicit false after reopening', async () => {
  const result = await service().setPluginEnabled(pluginId, false, null);
  expect(result.status).toBe('success');
  expect((await service().readCatalog()).configuration.pluginOverrideCount).toBe(1);
  expect(await declared()).toEqual({ plugins: { enabledPlugins: { [pluginId]: false } } });
});

it('rejects external edits using the full FileRevision and leaves the external file intact', async () => {
  await mkdir(path.dirname(target));
  await writeFile(target, '{}');
  const catalog = await service().readCatalog();
  await writeFile(target, '{"external":true}');
  const result = await service().setPluginEnabled(pluginId, false, catalog.configuration.revision);
  expect(result.status).toBe('conflict');
  expect(await declared()).toEqual({ external: true });
});

it('rejects an unexpected file appearing after the absent snapshot', async () => {
  await mkdir(path.dirname(target));
  await writeFile(target, '{}');
  expect((await service().setPluginEnabled(pluginId, false, null)).status).toBe('conflict');
  expect(await declared()).toEqual({});
});

it('does not echo the requested value when native readback disagrees', async () => {
  request = jest.fn(async (method) => {
    if (method === 'plugins/setEnabled') throw new ZCodeRemoteRequestError(-32602, 'validation');
    if (method === 'plugins/list') return { plugins: [{ id: pluginId, enabled: true, enabledSource: 'user' }] };
    return { statuses: {} };
  });
  expect(await service().setPluginEnabled(pluginId, false, null)).toMatchObject({
    status: 'readback-failed', evidence: { persistence: 'verified', application: 'pending', runtime: 'failed' },
  });
});

it.each([-32601, -32603])('blocks mutation when exact runtime method probe returns %s', async (code) => {
  request = jest.fn(async () => { throw new ZCodeRemoteRequestError(code, 'SECRET-REMOTE-TEXT'); });
  const catalog = await service().readCatalog();
  expect(catalog.plugins.state).toBe(code === -32601 ? 'unavailable' : 'failed');
  expect(catalog.plugins.entries).toBeNull();
  expect(catalog.mutation.plugins).toBe(code === -32601 ? 'unavailable' : 'failed');
  expect((await service().setPluginEnabled(pluginId, false, null)).status).toBe('unavailable');
  expect(JSON.stringify(catalog)).not.toContain('SECRET');
  await expect(readFile(target)).rejects.toMatchObject({ code: 'ENOENT' });
});

it('a successful invalid-params request does not prove mutation support', async () => {
  request = jest.fn(async () => ({}));
  expect((await service().readCatalog()).mutation.plugins).toBe('unavailable');
  expect((await service().setPluginEnabled(pluginId, false, null)).status).toBe('unavailable');
});

it('never turns absent or malformed native arrays into a verified empty catalog', async () => {
  request = jest.fn(async (method) => {
    if (method === 'plugins/setEnabled') throw new ZCodeRemoteRequestError(-32602, 'validation');
    return {};
  });
  const catalog = await service().readCatalog();
  expect(catalog.plugins).toEqual({ state: 'failed', entries: null });
  expect(catalog.mcp).toEqual({ state: 'failed', entries: null });
});

it('rejects missing, duplicate or untrusted plugin identifiers before writing', async () => {
  for (const plugins of [[], [{ id: pluginId, enabled: true, packageStatus: 'missing' }], [{ id: pluginId, enabled: true }, { id: pluginId, enabled: false }]]) {
    request = jest.fn(async (method) => {
      if (method === 'plugins/setEnabled') throw new ZCodeRemoteRequestError(-32602, 'validation');
      return { plugins, statuses: {} };
    });
    expect((await service().setPluginEnabled(pluginId, false, null)).status).toBe('unavailable');
  }
  expect((await service().setPluginEnabled('../invalid secret', false, null)).status).toBe('unavailable');
});

it('keeps declarations, effective state and authentication unknown independent and redacts credentials', async () => {
  await mkdir(path.dirname(target));
  await writeFile(target, JSON.stringify({ hooks: { events: { Stop: [{ hooks: [{ command: 'SECRET-COMMAND' }] }] } }, mcp: { servers: { local: { env: { key: 'SECRET-ENV' } } } } }));
  request = jest.fn(async (method) => {
    if (method === 'plugins/setEnabled') throw new ZCodeRemoteRequestError(-32602, 'SECRET-ERROR');
    if (method === 'plugins/list') return { plugins: [{ id: pluginId, enabled: true, configuredOptions: { secret: 'SECRET-OPTION' }, hookDetails: [{ command: 'SECRET-HOOK' }] }] };
    return { statuses: {
      local: { status: 'connected', toolCount: 3, headers: { auth: 'SECRET-HEADER' } },
      oauth: { status: 'disconnected', toolCount: 0, authorization: { authorizationUrl: 'SECRET-AUTH-URL' } },
      denied: { status: 'failed', toolCount: 0, failureKind: 'not_authenticated', error: 'SECRET-ERROR' },
      future: { status: 'future', toolCount: -1 },
    } };
  });
  const catalog = await service().readCatalog();
  expect(catalog.configuration).toMatchObject({ hookDeclarationCount: 1, mcpDeclarationCount: 1 });
  expect(catalog.hooks).toEqual({ state: 'unavailable', effective: null });
  expect(catalog.mutation).toMatchObject({ mcp: 'unavailable', hooks: 'unavailable' });
  expect(catalog.mcp.entries?.map((entry) => entry.authentication)).toEqual(['unknown', 'required', 'failed', 'unknown']);
  expect(catalog.mcp.entries?.[3]).toMatchObject({ status: 'unknown', toolCount: null });
  expect(JSON.stringify(catalog)).not.toContain('SECRET');
  expect(request.mock.calls.find(([method]) => method === 'mcp/list')?.[1]).toMatchObject({ mode: 'status' });
});

it('returns disconnected runtime as unavailable while still exposing project declarations', async () => {
  const catalog = await new ZCodeManagementService({ workingDirectory: workspace, request: null }).readCatalog();
  expect(catalog.configuration.state).toBe('available');
  expect(catalog.plugins).toEqual({ state: 'unavailable', entries: null });
  expect(catalog.mcp).toEqual({ state: 'unavailable', entries: null });
});

it('rejects malformed JSON without overwriting it', async () => {
  await mkdir(path.dirname(target));
  await writeFile(target, '{broken');
  expect((await service().readCatalog()).configuration.state).toBe('failed');
  expect((await service().setPluginEnabled(pluginId, false, null)).status).toBe('invalid-content');
  expect(await readFile(target, 'utf8')).toBe('{broken');
});

it('fails closed if archive creation fails', async () => {
  await mkdir(path.dirname(target));
  await writeFile(target, '{}');
  await writeFile(archiveRoot, 'blocked');
  const before = await service().readCatalog();
  expect((await service().setPluginEnabled(pluginId, false, before.configuration.revision)).status).toBe('archive-failed');
  expect(await declared()).toEqual({});
});

it('rejects a configuration directory junction escaping the project root', async () => {
  const outside = await mkdtemp(path.join(path.dirname(workspace), 'outside-'));
  await writeFile(path.join(outside, 'config.json'), '{}');
  await symlink(outside, path.dirname(target), process.platform === 'win32' ? 'junction' : 'dir');
  expect((await service().setPluginEnabled(pluginId, false, null)).status).toBe('invalid-path');
  expect(await readFile(path.join(outside, 'config.json'), 'utf8')).toBe('{}');
});
