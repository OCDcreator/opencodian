import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';

import { BUSY_ALLOWED, executeCommand } from '../../../../../../assets/pi/commands.mjs';
import { loadModelThinkingLevels } from '../../../../../../assets/pi/service.mjs';

test('loads an import-only public models export from the SDK installation rather than CommonJS resolution', async () => {
  const tempRoot = path.resolve('.tmp');
  mkdirSync(tempRoot, { recursive: true });
  const root = mkdtempSync(path.join(tempRoot, 'pi-model-levels-'));
  const sdkPath = path.join(root, 'index.mjs');
  const directory = path.join(root, 'node_modules/@earendil-works/pi-ai');
  mkdirSync(directory, { recursive: true });
  const metadata = path.join(directory, 'package.json');
  const modelFile = path.join(directory, 'levels.mjs');
  writeFileSync(sdkPath, 'export {};');
  writeFileSync(metadata, JSON.stringify({ type: 'module', exports: { './models': { import: './levels.mjs' } } }));
  writeFileSync(modelFile, "export const getSupportedThinkingLevels = model => model.id === 'a' ? ['low'] : ['high', 'max'];");
  try {
    const read = await loadModelThinkingLevels(sdkPath);
    assert.deepEqual(read({ id: 'a' }), ['low']);
    assert.deepEqual(read({ id: 'b' }), ['high', 'max']);
    assert.equal(JSON.parse(readFileSync(metadata, 'utf8')).exports['./models'].import, './levels.mjs');
  } finally {
    for (const file of [modelFile, metadata, sdkPath]) unlinkSync(file);
    for (const folder of [directory, path.dirname(directory), path.dirname(path.dirname(directory)), root]) rmdirSync(folder);
  }
});

function hostFor(session = {}, sdkVersion = 'fixture-sdk') {
  return { sdk: { VERSION: sdkVersion }, auth: {}, runtime: { session: {
    messages: [], modelRegistry: {}, sessionManager: {}, ...session,
  } } };
}

const nativeEntries = [
  { id: 'native-root', parentId: null, type: 'thinking_level_change', thinkingLevel: 'low', timestamp: '2026-10-02T00:00:00Z' },
  { id: 'native-old-branch', parentId: 'native-root', type: 'message', message: { role: 'user', content: 'First branch' } },
  { id: 'native-current-branch', parentId: 'native-root', type: 'custom', customType: 'fixture', data: { untouched: true } },
];

function nativeManager(entries = nativeEntries, leafId = 'native-current-branch') {
  return { getEntries: () => entries, getLeafId: () => leafId };
}

test('model catalog includes SDK-supported levels per model without mutating the current session', async () => {
  const models = [{ provider: 'pi', id: 'a', reasoning: true }, { provider: 'pi', id: 'b', reasoning: true }];
  const current = { provider: 'pi', id: 'native-default' };
  const host = hostFor({ model: current, thinkingLevel: 'medium', modelRegistry: { getAvailable: () => models } });
  host.getSupportedThinkingLevels = model => model.id === 'a' ? ['off', 'low'] : ['high', 'max'];
  assert.deepEqual(await executeCommand(host, { type: 'get_available_models' }), {
    models: [{ ...models[0], thinkingLevels: ['off', 'low'] }, { ...models[1], thinkingLevels: ['high', 'max'] }],
  });
  assert.equal(host.runtime.session.model, current);
  assert.equal(host.runtime.session.thinkingLevel, 'medium');
  assert.equal(models[0].thinkingLevels, undefined);
});

test('handshake advertises the installed SDK methods independently and keeps both reads usable while busy', async () => {
  const host = hostFor({ getAvailableThinkingLevels: () => ['off', 'high'], sessionManager: nativeManager() }, 'fixture-modern');
  const state = await executeCommand(host, { type: 'get_state' });
  assert.equal(state.sdkVersion, 'fixture-modern');
  for (const command of ['get_available_thinking_levels', 'get_entries']) {
    assert.ok(state.commands.includes(command));
    assert.deepEqual(state.capabilities[command], { status: 'available', source: 'sdk' });
    assert.ok(BUSY_ALLOWED.has(command));
  }
  delete host.runtime.session.getAvailableThinkingLevels;
  const changed = await executeCommand(host, { type: 'get_state' });
  assert.ok(!changed.commands.includes('get_available_thinking_levels'));
  assert.ok(changed.commands.includes('get_entries'));
});

test('thinking levels come from the current SDK session on every query, including an empty supported set', async () => {
  let levels = ['off', 'minimal'];
  const host = hostFor({ getAvailableThinkingLevels: () => levels });
  assert.deepEqual(await executeCommand(host, { type: 'get_available_thinking_levels' }), { levels });
  levels = ['high'];
  assert.deepEqual(await executeCommand(host, { type: 'get_available_thinking_levels' }), { levels: ['high'] });
  levels = [];
  assert.deepEqual(await executeCommand(host, { type: 'get_available_thinking_levels' }), { levels: [] });
});

test('legacy SDK returns unavailable without guessed thinking levels or fabricated entries', async () => {
  const host = hostFor({ model: { reasoning: true }, messages: [{ role: 'user', content: 'Cannot infer native entries' }] }, 'fixture-legacy');
  const state = await executeCommand(host, { type: 'get_state' });
  for (const command of ['get_available_thinking_levels', 'get_entries']) {
    assert.ok(!state.commands.includes(command));
    assert.equal(state.capabilities[command].status, 'unavailable');
    const result = await executeCommand(host, { type: command });
    assert.equal(result.command, command);
    assert.equal(result.status, 'unavailable');
    assert.equal(typeof result.reason, 'string');
    assert.ok(!('entries' in result) && !('leafId' in result) && !('levels' in result));
  }
});

test('native entry data, IDs, chronological branches and current leaf are preserved', async () => {
  const host = hostFor({ sessionManager: nativeManager() });
  const result = await executeCommand(host, { type: 'get_entries' });
  assert.deepEqual(result, { entries: nativeEntries, leafId: 'native-current-branch' });
  assert.equal(result.entries[2], nativeEntries[2]);
  assert.deepEqual(await executeCommand(host, { type: 'get_entries', since: 'native-root' }), {
    entries: nativeEntries.slice(1), leafId: 'native-current-branch',
  });
  assert.deepEqual(await executeCommand(host, { type: 'get_entries', since: 'native-current-branch' }), {
    entries: [], leafId: 'native-current-branch',
  });
  host.runtime.session.sessionManager = nativeManager(nativeEntries, 'native-old-branch');
  assert.deepEqual(await executeCommand(host, { type: 'get_entries', since: 'native-current-branch' }), {
    entries: [], leafId: 'native-old-branch',
  });
});

test('unknown since IDs fail without full-history fallback, and numeric/null cursors are rejected', async () => {
  const host = hostFor({ sessionManager: nativeManager() });
  for (const since of ['missing-entry', '0', '']) {
    await assert.rejects(executeCommand(host, { type: 'get_entries', since }), /Entry not found:/);
  }
  for (const since of [0, null, {}]) {
    await assert.rejects(executeCommand(host, { type: 'get_entries', since }), /since must be a native entry ID/);
  }
});

test('an empty native history retains null leaf identity', async () => {
  assert.deepEqual(await executeCommand(hostFor({ sessionManager: nativeManager([], null) }), { type: 'get_entries' }), {
    entries: [], leafId: null,
  });
});

test('partial legacy manager cannot claim entries support without native leaf identity', async () => {
  for (const sessionManager of [{ getEntries: () => nativeEntries }, { getLeafId: () => 'native-root' }]) {
    const host = hostFor({ sessionManager });
    assert.ok(!(await executeCommand(host, { type: 'get_state' })).commands.includes('get_entries'));
    assert.equal((await executeCommand(host, { type: 'get_entries' })).status, 'unavailable');
  }
});

test('installed SDK public read methods work in memory without a model request or persistent configuration', {
  skip: !process.env.PI_SDK_TEST_ROOT,
}, async (t) => {
  const root = process.env.PI_SDK_TEST_ROOT;
  const metadata = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  assert.ok(['@earendil-works/pi-coding-agent', '@mariozechner/pi-coding-agent'].includes(metadata.name));
  t.diagnostic(`Installed SDK: ${metadata.name}@${metadata.version}; ${root}`);
  const { SessionManager } = await import(pathToFileURL(path.join(root, 'dist/core/session-manager.js')).href);
  const { AgentSession } = await import(pathToFileURL(path.join(root, 'dist/core/agent-session.js')).href);
  const manager = SessionManager.inMemory(process.cwd());
  const session = { sessionManager: manager, model: { reasoning: false } };
  if (typeof AgentSession.prototype.getAvailableThinkingLevels === 'function') {
    session.getAvailableThinkingLevels = () => AgentSession.prototype.getAvailableThinkingLevels.call(session);
  }
  const host = hostFor(session, metadata.version);
  assert.deepEqual(await executeCommand(host, { type: 'get_entries' }), { entries: [], leafId: null });
  const rootId = manager.appendThinkingLevelChange('off');
  manager.appendCustomEntry('first-branch', { original: true });
  manager.branch(rootId);
  const leafId = manager.appendCustomEntry('current-branch', { original: true });
  const expected = manager.getEntries();
  assert.deepEqual(await executeCommand(host, { type: 'get_entries', since: rootId }), { entries: expected.slice(1), leafId });
  assert.deepEqual(await executeCommand(host, { type: 'get_entries' }), { entries: expected, leafId });
  const levels = await executeCommand(host, { type: 'get_available_thinking_levels' });
  if (session.getAvailableThinkingLevels) assert.deepEqual(levels, { levels: session.getAvailableThinkingLevels() });
  else assert.equal(levels.status, 'unavailable');
});

function ownedForkFixture({ cancelled = false, persistent = false, missingDirectory = false } = {}) {
  const tempRoot = path.resolve('.tmp');
  mkdirSync(tempRoot, { recursive: true });
  const root = mkdtempSync(path.join(tempRoot, 'pi-fork-persistence-'));
  const parentFile = path.join(root, 'parent.jsonl');
  const childFile = path.join(root, ...(missingDirectory ? ['missing'] : []), 'child.jsonl');
  const parentBytes = JSON.stringify({ type: 'session', id: 'native-parent', version: 3 }) + '\n';
  writeFileSync(parentFile, parentBytes);
  const header = { type: 'session', version: 3, id: 'native-child', parentSession: parentFile, cwd: root, timestamp: '2026-10-07T00:00:00Z' };
  const prefix = [{ id: 'native-model', parentId: null, type: 'model_change', provider: 'fixture', modelId: 'one' },
    { id: 'native-effort', parentId: 'native-model', type: 'thinking_level_change', thinkingLevel: 'high' }];
  const existingBytes = [header, ...prefix].map(value => JSON.stringify(value)).join('\n') + '\n';
  if (persistent) writeFileSync(childFile, existingBytes);
  const child = { sessionFile: childFile, sessionId: 'native-child', sessionManager: {
    getHeader: () => header, getEntries: () => prefix, getLeafId: () => 'native-effort', getSessionId: () => 'native-child',
  }, modelRegistry: {} };
  const parent = { sessionFile: parentFile, sessionId: 'native-parent', sessionManager: { getLeafId: () => 'native-leaf' }, modelRegistry: {} };
  const calls = [];
  const host = hostFor(parent);
  host.runtime.fork = async (entryId, options) => { calls.push({ entryId, options }); if (!cancelled) host.runtime.session = child; return { cancelled }; };
  return { host, root, parentFile, childFile, header, prefix, calls, parentBytes, existingBytes, cleanup() {
    for (const file of [parentFile, childFile]) if (existsSync(file)) unlinkSync(file);
    rmdirSync(root);
  } };
}

test('persists a native fork before the first message before its in-memory actor can be restored', async () => {
  const f = ownedForkFixture();
  try {
    const result = await executeCommand(f.host, { type: 'fork', entryId: 'native-first-user' });
    assert.equal(result.cancelled, false);
    assert.deepEqual(f.calls, [{ entryId: 'native-first-user', options: { position: 'before' } }]);
    assert.equal(existsSync(f.childFile), true, 'returned native branch file must exist before parent restoration');
    const bytes = readFileSync(f.childFile, 'utf8');
    assert.equal(bytes, f.existingBytes);
    assert.deepEqual(JSON.parse(bytes.split('\n')[0]), f.header);
    assert.equal(readFileSync(f.parentFile, 'utf8'), f.parentBytes);
  } finally { f.cleanup(); }
});

test('does not rewrite an already persisted SDK clone or a cancelled fork', async () => {
  const clone = ownedForkFixture({ persistent: true });
  try { await executeCommand(clone.host, { type: 'clone' }); assert.equal(readFileSync(clone.childFile, 'utf8'), clone.existingBytes);
    assert.deepEqual(clone.calls, [{ entryId: 'native-leaf', options: { position: 'at' } }]);
  } finally { clone.cleanup(); }
  const cancelled = ownedForkFixture({ cancelled: true });
  try { assert.deepEqual(await executeCommand(cancelled.host, { type: 'fork', entryId: 'native-first-user' }), { cancelled: true });
    assert.equal(existsSync(cancelled.childFile), false); assert.equal(readFileSync(cancelled.parentFile, 'utf8'), cancelled.parentBytes);
  } finally { cancelled.cleanup(); }
});

test('rejects a fork whose native file cannot be persisted rather than acknowledging a dangling file', async () => {
  const f = ownedForkFixture({ missingDirectory: true });
  try { await assert.rejects(executeCommand(f.host, { type: 'fork', entryId: 'native-first-user' }), /ENOENT/);
    assert.equal(existsSync(f.childFile), false); assert.equal(readFileSync(f.parentFile, 'utf8'), f.parentBytes);
  } finally { f.cleanup(); }
});
