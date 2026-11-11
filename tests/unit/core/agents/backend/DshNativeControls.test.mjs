import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lstatSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync, symlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createControlRuntime, managedProfileProof, mcpClientConfig } from '../../../../../assets/dsh/control.mjs';

const root = fileURLToPath(new URL('../../../../../', import.meta.url));
const fixtureRoot = path.join(root, '.impeccable', 'dsh-control-test-fixtures');
const posixProofSkip = process.platform === 'win32' && 'Managed profile proof requires POSIX mode bits; Windows has no ACL proof';
mkdirSync(fixtureRoot, { recursive: true, mode: 0o700 });
// Deliberately retained: this repository forbids test cleanup by deletion.
function profile() {
  const dir = mkdtempSync(path.join(fixtureRoot, 'owned-'));
  mkdirSync(path.join(dir, 'node_modules'), { mode: 0o700 });
  writeFileSync(path.join(dir, '.opencodian-dsh-profile.json'), JSON.stringify({ version: 1, owner: 'opencodian.dsh', vaultHash: 'a'.repeat(64), profile: 'sdk' }), { mode: 0o600 });
  return { profileContext: { dir, patchPath: path.join(dir, 'cordis.patch.yml') }, config: { managedProfileRoot: dir, nativeConfigRevision: 'revision-1' } };
}
function fixture(services = {}, config = {}, injected = {}) {
  const listeners = new Map();
  const updates = [];
  const notifications = [];
  const session = { id: 'parent' };
  const agent = { session };
  const record = { handle: { agent }, closing: false, mcp: new Map() };
  const sessions = new Map([['parent', record]]);
  const ctx = { get: (name) => services[name], tools: { schemas: () => [] },
    on(name, listener) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(listener);
      return () => listeners.get(name).delete(listener);
    } };
  const runtime = createControlRuntime(ctx, config, { sessions,
    requireSession(id) { const entry = sessions.get(id); if (!entry || entry.closing) throw new Error('unknown session'); return entry; },
    update: (id, value) => updates.push({ id, value }), notify: (method, value) => notifications.push({ method, value }), ...injected });
  return { runtime, rpc: (method, params) => runtime.methods[method](params), services, ctx, sessions, record, agent, session, updates, notifications,
    emit: (name, ...args) => { for (const listener of listeners.get(name) ?? []) listener(...args); } };
}

test('child continuation advertises only the installed public prompt method and admits the exact direct child', async (t) => {
  const calls = [];
  const f = fixture({ subagents: {
    listChildren: async (parent, signal) => { assert.equal(parent, 'parent'); assert.ok(signal instanceof AbortSignal); return [{ id: 'child', mode: 'continuable' }]; },
    prompt: async (request, signal) => { calls.push({ request, signal }); return { messageId: 'child-inbox-message' }; },
  } });
  t.after(() => f.runtime.dispose());
  assert.equal(f.runtime.capabilities().controlCapabilities.subagents.prompt, true);
  const result = await f.rpc('session/subagents', { sessionId: 'parent', action: 'prompt', childSessionId: 'child',
    requestId: 'request-1', delivery: 'queue', content: [{ type: 'text', text: 'Follow up\n' }] });
  assert.deepEqual(result, { messageId: 'child-inbox-message' });
  assert.deepEqual(calls[0].request, { requestId: 'request-1', parentSessionId: 'parent', childSessionId: 'child',
    mode: 'continuable', delivery: 'queue', content: [{ type: 'text', text: 'Follow up\n' }] });
  assert.ok(calls[0].signal instanceof AbortSignal);
  f.services.subagents.prompt = undefined;
  assert.equal(f.runtime.capabilities().controlCapabilities.subagents.prompt, false);
});

test('continuation rejects foreign, one-shot, external and unknown children without sending to any Agent', async (t) => {
  let sent = 0;
  const f = fixture({ subagents: {
    listChildren: async () => ['one-shot', 'external', 'unknown'].map(mode => ({ id: mode, mode })),
    prompt: async () => { sent++; return { messageId: 'must-not-happen' }; },
  } });
  t.after(() => f.runtime.dispose());
  for (const childSessionId of ['foreign', 'one-shot', 'external', 'unknown']) {
    const result = await f.rpc('session/subagents', { sessionId: 'parent', action: 'prompt', childSessionId,
      requestId: 'request-1', delivery: 'queue', content: [{ type: 'text', text: 'Synthetic follow-up' }] });
    assert.deepEqual(result, { failure: { code: childSessionId === 'foreign' ? 'subagent/unauthorized' : 'subagent/not-resumable' } });
  }
  assert.equal(sent, 0);
});

test('continuation validates minted identity, delivery and text-only admission before service dispatch', async (t) => {
  let sent = 0;
  const f = fixture({ subagents: {
    listChildren: async () => [{ id: 'child', mode: 'continuable' }],
    prompt: async () => { sent++; return { messageId: 'must-not-happen' }; },
  } });
  t.after(() => f.runtime.dispose());
  const base = { sessionId: 'parent', action: 'prompt', childSessionId: 'child', requestId: 'request-1',
    delivery: 'queue', content: [{ type: 'text', text: 'Synthetic follow-up' }] };
  for (const invalid of [
    { requestId: 'bad/id' }, { requestId: '' }, { delivery: 'other' },
    { content: [{ type: 'image', attachment: { attachmentId: '/private/file' } }] },
    { content: [{ type: 'text', text: '  ' }] }, { content: [{ type: 'text', text: 'x'.repeat(65537) }] },
    { content: [{ type: 'text', text: 'one' }, { type: 'text', text: 'two' }] },
  ]) await assert.rejects(() => f.rpc('session/subagents', { ...base, ...invalid }));
  assert.equal(sent, 0);
});

test('continuation forwards steer explicitly and preserves only the six public domain failure codes', async (t) => {
  const codes = ['subagent/parent-unavailable', 'subagent/not-resumable', 'subagent/unauthorized',
    'subagent/delivery-unavailable', 'subagent/attachment-invalid', 'subagent/invalid-time-zone'];
  let currentCode;
  const f = fixture({ subagents: {
    listChildren: async () => [{ id: 'child', mode: 'continuable' }],
    prompt: async request => {
      assert.equal(request.delivery, 'steer');
      const error = new Error('SYNTHETIC_PRIVATE_PROMPT'); error.code = currentCode;
      error.data = { rejectedInput: 'SYNTHETIC_PRIVATE_PROMPT' }; throw error;
    },
  } });
  t.after(() => f.runtime.dispose());
  const params = { sessionId: 'parent', action: 'prompt', childSessionId: 'child', requestId: 'request-1',
    delivery: 'steer', content: [{ type: 'text', text: 'SYNTHETIC_PRIVATE_PROMPT' }] };
  for (const code of codes) {
    currentCode = code;
    const result = await f.rpc('session/subagents', params);
    assert.deepEqual(result, { failure: { code } });
    assert.equal(JSON.stringify(result).includes('SYNTHETIC_PRIVATE_PROMPT'), false);
  }
  currentCode = 'unknown-private-code';
  await assert.rejects(() => f.rpc('session/subagents', params), error => {
    assert.equal(error.message.includes('SYNTHETIC_PRIVATE_PROMPT'), false);
    assert.equal(error.message.includes('unknown-private-code'), false);
    return true;
  });
});

test('closing the owning session aborts an in-flight continuation without claiming acceptance', async (t) => {
  let started;
  const ready = new Promise(resolve => { started = resolve; });
  const f = fixture({ subagents: {
    listChildren: async () => [{ id: 'child', mode: 'continuable' }],
    prompt: async (_request, signal) => {
      started();
      await new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true }));
      return { messageId: 'must-not-happen' };
    },
  } });
  t.after(() => f.runtime.dispose());
  const pending = f.rpc('session/subagents', { sessionId: 'parent', action: 'prompt', childSessionId: 'child',
    requestId: 'request-1', delivery: 'queue', content: [{ type: 'text', text: 'Synthetic follow-up' }] });
  await ready; f.runtime.closeSession('parent');
  await assert.rejects(pending);
});

test('capabilities probe actual public service methods and optional backend registrations', async () => {
  const f = fixture();
  const caps = f.runtime.capabilities();
  assert.equal(caps.configurationCapabilities.describe, false);
  assert.equal(caps.configurationCapabilities.credentials.set, false);
  assert.equal(caps.controlCapabilities.plan.set, false);
  assert.equal(caps.controlCapabilities.jobs.kill, false);
  assert.equal(caps.controlCapabilities.terminal.spawn, false);
  assert.deepEqual(await f.rpc('session/terminal', { sessionId: 'parent', action: 'availability' }), { available: false, backends: [] });
  f.services.terminals = { listBackends: () => [], spawn() { throw new Error('must not run'); } };
  assert.equal(f.runtime.capabilities().controlCapabilities.terminal.spawn, false);
  f.services.terminals.listBackends = () => ['shell'];
  assert.equal(f.runtime.capabilities().controlCapabilities.terminal.spawn, true);
  await f.runtime.dispose();
});

test('configuration describes native redacted forms without reading raw documents or mutating settings', async () => {
  const p = profile();
  let calls = 0;
  const f = fixture({ profileContext: p.profileContext, settings: { writable: true, documentPath: p.profileContext.patchPath,
    describe(options) {
      assert.deepEqual(options, { redactSecrets: true }); calls++;
      return [{ ns: 'llm', autoGenerate: true, revision: 7, applies: 'live', schema: { dict: { password: { role: 'secret', default: 'SECRET' }, timeout: { type: 'number' } } },
        value: { timeout: 12, headers: { Authorization: 'SECRET' }, apiKey: 'SECRET', apiKeyEnv: 'DSH_KEY' }, base: { timeout: 10 }, user: { timeout: 12 },
        secrets: [{ path: ['apiKey'], set: true }] }, { ns: 'other', value: {} }];
    }, mutate() { throw new Error('must not mutate'); } } }, p.config);
  const value = await f.rpc('config/describe', { namespaces: ['llm'] });
  assert.equal(calls, 1); assert.equal(value.forms.length, 1);
  assert.equal(value.appliedRevision, 'revision-1');
  assert.equal(value.forms[0].valueSource, 'effective'); assert.equal(value.forms[0].baseSource, 'resolved');
  assert.equal(value.forms[0].writable, false);
  assert.deepEqual(value.forms[0].value, { timeout: 12, apiKeyEnv: 'DSH_KEY' });
  assert.deepEqual(value.profile, { managed: process.platform !== 'win32', writable: true, hasDocument: true });
  assert.equal(JSON.stringify(value).includes('SECRET'), false);
  assert.equal(JSON.stringify(value).includes(p.profileContext.dir), false);
  await f.runtime.dispose();
});

function extensionMutationFixture(before, after) {
  const p = profile();
  const field = { type: 'string', meta: { volatile: true } };
  const array = { type: 'array', meta: { volatile: true }, inner: { type: 'string', meta: {} } };
  const schema = { type: 'object', meta: {}, dict: { label: field, inherited: field, sibling: field, items: array,
    group: { type: 'object', meta: { volatile: true }, dict: { items: array, sibling: field } } }, toJSON: () => ({}) };
  const entry = { id: 'include:sample-extension', options: { id: 'sample-extension', name: 'sample-extension' },
    fiber: { state: 2, runtime: { Config: schema } } };
  let mutated = false;
  return fixture({ profileContext: p.profileContext, pluginManager: { listPlugins: async () => [{ entryId: entry.id }] },
    configEditor: { documentPath: p.profileContext.patchPath, entries: () => [entry] },
    settings: { writable: true, documentPath: p.profileContext.patchPath,
      describe: () => [{ ns: 'sample-extension', schema: {}, secrets: [], applies: 'live', ...(mutated ? after : before) }],
      mutate: async (ns, ops, revision) => { assert.equal(revision, before.revision); mutated = true; },
    } }, p.config);
}

test('extension unset refuses a stale user override and unrelated concurrent revision even when effective matches', { skip: posixProofSkip }, async () => {
  const before = { revision: 4, value: { label: 'override', inherited: 'override', sibling: 'keep' },
    base: { inherited: 'fallback' }, user: { label: 'override', inherited: 'override', sibling: 'keep' } };
  for (const after of [
    { ...before, revision: 5 },
    { ...before, revision: 5, value: { inherited: 'override', sibling: 'keep' } },
    { ...before, revision: 6, value: { inherited: 'override', sibling: 'keep' }, user: { inherited: 'override', sibling: 'keep' } },
  ]) {
    const f = extensionMutationFixture(before, after);
    const result = await f.rpc('config/extension-settings', { action: 'mutate', ns: 'sample-extension', expectedRevision: 4, ops: [{ op: 'unset', path: ['label'] }] });
    assert.equal(result.persistence.status, 'verified');
    assert.equal(result.readback.status, 'verified');
    assert.equal(result.application.status, 'unavailable');
    await f.runtime.dispose();
  }
});

test('extension unset verifies removed user override against inherited effective fallback and whole snapshot', { skip: posixProofSkip }, async () => {
  const before = { revision: 4, value: { inherited: 'override', sibling: 'keep' }, base: { inherited: 'fallback' }, user: { inherited: 'override', sibling: 'keep' } };
  for (const [after, status] of [
    [{ revision: 5, value: { inherited: 'fallback', sibling: 'keep' }, base: before.base, user: { sibling: 'keep' } }, 'verified'],
    [{ revision: 5, value: { inherited: 'fallback', sibling: 'keep' }, base: before.base, user: { inherited: 'fallback', sibling: 'keep' } }, 'verified'],
    [{ revision: 5, value: { inherited: 'fallback', sibling: 'keep' }, base: before.base, user: before.user }, 'unavailable'],
    [{ revision: 5, value: { inherited: 'fallback', sibling: 'concurrent' }, base: before.base, user: { sibling: 'concurrent' } }, 'unavailable'],
  ]) {
    const f = extensionMutationFixture(before, after);
    const result = await f.rpc('config/extension-settings', { action: 'mutate', ns: 'sample-extension', expectedRevision: 4, ops: [{ op: 'unset', path: ['inherited'] }] });
    assert.equal(result.application.status, status);
    assert.equal(result.readback.status, 'verified');
    await f.runtime.dispose();
  }
});

test('extension array index edits preserve native array containers and inherited siblings', { skip: posixProofSkip }, async () => {
  const before = { revision: 4, value: { items: ['base-a', 'base-b'], sibling: 'inherited', group: { items: ['nested-a', 'nested-b'], sibling: 'nested-inherited' } },
    base: { items: ['base-a', 'base-b'], sibling: 'inherited', group: { items: ['nested-a', 'nested-b'], sibling: 'nested-inherited' } }, user: {} };
  const cases = [
    { ops: [{ op: 'set', path: ['items', '0'], value: 'edited' }], value: { ...before.value, items: ['edited', 'base-b'] }, user: { items: ['edited', 'base-b'] } },
    { ops: [{ op: 'unset', path: ['items', '0'] }], value: { ...before.value, items: ['base-b'] }, user: { items: ['base-b'] } },
    { ops: [{ op: 'set', path: ['group', 'items', '1'], value: 'nested-edit' }],
      value: { ...before.value, group: { items: ['nested-a', 'nested-edit'], sibling: 'nested-inherited' } },
      user: { group: { items: ['nested-a', 'nested-edit'], sibling: 'nested-inherited' } } },
    { ops: [{ op: 'set', path: ['items', '0'], value: 'edited' }, { op: 'unset', path: ['items', '1'] }],
      value: { ...before.value, items: ['edited'] }, user: { items: ['edited'] } },
  ];
  for (const sample of cases) {
    const f = extensionMutationFixture(before, { revision: 5, base: before.base, value: sample.value, user: sample.user });
    const result = await f.rpc('config/extension-settings', { action: 'mutate', ns: 'sample-extension', expectedRevision: 4, ops: sample.ops });
    assert.equal(result.application.status, 'verified');
    await f.runtime.dispose();
  }
  const raced = extensionMutationFixture(before, { revision: 6, base: before.base, value: { ...before.value, items: ['concurrent', 'base-b'] }, user: { items: ['concurrent', 'base-b'] } });
  const result = await raced.rpc('config/extension-settings', { action: 'mutate', ns: 'sample-extension', expectedRevision: 4,
    ops: [{ op: 'set', path: ['items', '0'], value: 'edited' }] });
  assert.equal(result.application.status, 'unavailable'); await raced.runtime.dispose();
});

test('capability presence comes from actual service identity independently of methods and terminal backend', async () => {
  const f = fixture();
  for (const key of ['jobs', 'terminal', 'subagents', 'goal']) assert.equal(f.runtime.capabilities().controlCapabilities[key]?.present, false);
  f.services.jobs = {}; f.services.terminals = {}; f.services.subagents = {}; f.services.goals = {};
  const present = f.runtime.capabilities().controlCapabilities;
  for (const key of ['jobs', 'terminal', 'subagents', 'goal']) assert.equal(present[key].present, true);
  assert.equal(present.jobs.list, false); assert.equal(present.terminal.spawn, false);
  f.services.terminals = { listBackends: () => [] };
  assert.equal(f.runtime.capabilities().controlCapabilities.terminal.present, true);
  f.services.goal = {}; f.services.goals = undefined;
  assert.equal(f.runtime.capabilities().controlCapabilities.goal.present, false);
  await f.runtime.dispose();
});

test('live capability readback observes service composition changes instead of reusing handshake absence', async () => {
  const f = fixture();
  const read = async () => (await f.rpc('control/capabilities', {})).controlCapabilities;
  assert.equal((await read()).readback, true);
  assert.equal((await read()).terminal.present, false);
  f.services.terminals = { listBackends: () => ['shell'], list: () => [], spawn() {} };
  assert.equal((await read()).terminal.present, true); assert.equal((await read()).terminal.spawn, true);
  const first = await read();
  f.services.terminals = { listBackends: () => ['shell'], list: () => [], spawn() {} };
  const replacement = await read();
  assert.ok(replacement.revision > first.revision);
  assert.equal((await read()).revision, replacement.revision);
  f.services.terminals = { listBackends: () => [] };
  assert.equal((await read()).terminal.present, true); assert.equal((await read()).terminal.spawn, false);
  f.services.terminals = undefined; f.services.goals = { get() {} };
  assert.equal((await read()).terminal.present, false); assert.equal((await read()).goal.present, true);
  await f.runtime.dispose();
});

test('extension persistence acknowledgement survives unavailable readback without claiming application', { skip: posixProofSkip }, async () => {
  const before = { revision: 4, value: { label: 'override' }, base: {}, user: { label: 'override' } };
  const f = extensionMutationFixture(before, { revision: 5, value: {}, base: {}, user: {} });
  const describe = f.services.settings.describe;
  let reads = 0;
  f.services.settings.describe = () => { if (++reads > 1) throw new Error('sensitive native failure'); return describe(); };
  const result = await f.rpc('config/extension-settings', { action: 'mutate', ns: 'sample-extension', expectedRevision: 4, ops: [{ op: 'unset', path: ['label'] }] });
  assert.equal(result.persistence.status, 'verified'); assert.equal(result.application.status, 'unavailable');
  assert.equal(result.readback.status, 'unavailable'); assert.equal(result.form, null);
  assert.equal(JSON.stringify(result).includes('sensitive'), false);
  await f.runtime.dispose();
});

test('credential reference mutations return metadata readback, including fallback after unset', async () => {
  let stored;
  const seen = [];
  const f = fixture({ credentials: {
    async describe(ref) { assert.equal(ref, 'DSH_KEY'); seen.push('describe'); return { configured: true, source: stored ? 'file' : 'env', writable: true, value: 'should-never-leak' }; },
    async set(ref, value) { seen.push(['set', ref]); stored = value; },
    async unset(ref) { seen.push(['unset', ref]); stored = undefined; },
    async resolve() { throw new Error('control metadata must not resolve secrets'); },
  } });
  const set = await f.rpc('config/credentials', { action: 'set', ref: 'DSH_KEY', value: 'sensitive-value' });
  assert.deepEqual(set, { credentials: [{ ref: 'DSH_KEY', configured: true, writable: true, source: 'file' }] });
  assert.deepEqual((await f.rpc('config/credentials', { action: 'unset', ref: 'DSH_KEY' })).credentials[0],
    { ref: 'DSH_KEY', configured: true, writable: true, source: 'env' });
  assert.deepEqual(seen.slice(0, 3), ['describe', ['set', 'DSH_KEY'], 'describe']);
  await assert.rejects(f.rpc('config/credentials', { action: 'set', ref: '../PRIVATE', value: 'x' }), /Invalid credential reference/);
  f.services.credentials.set = async () => { throw new Error('Authorization: sensitive-value?token=secret'); };
  await assert.rejects(f.rpc('config/credentials', { action: 'set', ref: 'DSH_KEY', value: 'sensitive-value' }), (error) =>
    !error.message.includes('sensitive-value') && !error.message.includes('secret') && error.cause === undefined);
  await f.runtime.dispose();
});

test('permission setters use Session and preserve custom derived state and upstream rejection', async () => {
  let current = 'custom';
  const options = [{ value: 'workspace-write', name: 'Workspace' }];
  const catalog = { options, defaultOptions: options, defaultPreset: 'workspace-write' };
  const f = fixture({ permissionPresets: { catalog: () => catalog, defaultPreset: 'workspace-write',
    current(session) { assert.equal(session, f.session); return current; },
    set(session, value) { assert.equal(session, f.session); if (value === 'custom') throw new Error('not selectable'); current = value; } } });
  assert.equal((await f.rpc('session/permission-presets', { sessionId: 'parent' })).current, 'custom');
  assert.deepEqual(await f.rpc('session/permission-presets', { sessionId: 'parent', action: 'set', preset: 'workspace-write' }),
    { catalog, current: 'workspace-write', defaultPreset: 'workspace-write' });
  await assert.rejects(f.rpc('session/permission-presets', { sessionId: 'parent', action: 'set', preset: 'custom' }));
  await f.runtime.dispose();
});

test('Plan keeps queued native selection distinct from committed active state and permissions', async () => {
  let state = { active: false };
  const f = fixture({ planMode: { get: (agent) => { assert.equal(agent, f.agent); return state; },
    set: (agent, active) => { assert.equal(agent, f.agent); state = { active: false, pending: active }; return 'queued'; } },
    permissionPresets: { set: () => { throw new Error('plan must not alter permissions'); } } });
  assert.deepEqual(await f.rpc('session/plan', { sessionId: 'parent', action: 'set', active: true }), { active: false, pending: true, disposition: 'queued' });
  assert.equal(f.updates[0].value.sessionUpdate, 'plan_update');
  state = { active: true };
  f.emit('session/event', f.session, { type: 'plan/mode', data: { active: true } });
  assert.equal(f.updates.at(-1).value.active, true);
  await f.runtime.dispose();
});

test('todos read real projection and relay complete snapshots only for the exact owned Session', async () => {
  const list = [{ content: 'First', status: 'pending' }, { content: 'Second', status: 'in_progress' }];
  const f = fixture({ sessionProjections: { snapshot(session, keys) { assert.equal(session, f.session); assert.deepEqual(keys, ['todos']); return { values: { todos: list } }; } } });
  assert.deepEqual(await f.rpc('session/todos', { sessionId: 'parent' }), { todos: [
    { id: 'todo-0', content: 'First', status: 'pending' }, { id: 'todo-1', content: 'Second', status: 'in_progress' } ] });
  f.emit('session/event', { id: 'parent' }, { type: 'todo/write', data: { todos: list } });
  assert.equal(f.updates.length, 0);
  f.emit('session/event', f.session, { type: 'todo/write', data: { todos: [] } });
  assert.deepEqual(f.updates[0], { id: 'parent', value: { sessionUpdate: 'todo_update', todos: [] } });
  f.record.closing = true;
  f.emit('session/event', f.session, { type: 'todo/write', data: { todos: list } });
  assert.equal(f.updates.length, 1);
  await f.runtime.dispose();
});

test('jobs fence ownership for every action, bound output, preserve native cancellation and filter events', async () => {
  const own = { id: 'own', owner: 'parent', status: 'running' };
  let callback;
  let killed = 0;
  let unsubscribed = false;
  const f = fixture({ jobs: {
    events: { subscribe(filter, listener) { assert.deepEqual(filter, { owners: 'scope' }); callback = listener; return () => { unsubscribed = true; }; } },
    list(caller) { assert.equal(caller, 'parent'); return [own, { id: 'unowned' }, { id: 'foreign', owner: 'elsewhere' }]; },
    get(id, caller) { assert.equal(caller, 'parent'); return id === 'own' ? own : { id, owner: id === 'foreign' ? 'elsewhere' : undefined }; },
    read(id, caller) { assert.equal(caller, 'parent'); return { chunks: [{ at: 0, text: 'abcdefghijklmnop' }], lossy: false, result: 'too-long', job: own }; },
    readAt(id, from, caller) { assert.equal(caller, 'parent'); assert.equal(from, 0); return { chunks: [{ at: 12, text: 'ijklmnop' }], next: 20, lossy: false }; },
    wait(id, ms, caller, signal) { assert.equal(ms, 15); assert.equal(caller, 'parent'); assert.ok(signal instanceof AbortSignal); return Promise.resolve(own); },
    kill(id, caller) { assert.equal(caller, 'parent'); assert.equal(id, 'own'); killed++; own.status = 'stopping'; return 'requested'; },
  } });
  f.runtime.capabilities();
  assert.deepEqual((await f.rpc('session/jobs', { sessionId: 'parent', action: 'list' })).jobs, [own]);
  for (const action of ['get', 'read', 'readAt', 'wait', 'kill']) for (const jobId of ['foreign', 'unowned'])
    await assert.rejects(f.rpc('session/jobs', { sessionId: 'parent', action, jobId }), /not owned/);
  assert.equal(killed, 0);
  const read = await f.rpc('session/jobs', { sessionId: 'parent', action: 'read', jobId: 'own', maxBytes: 8 });
  assert.equal(read.chunks[0].text, 'abcdefgh'); assert.equal(read.lossy, true); assert.equal(read.truncated, true);
  const at = await f.rpc('session/jobs', { sessionId: 'parent', action: 'readAt', jobId: 'own', from: 12 });
  assert.equal(at.next, 20);
  assert.equal((await f.rpc('session/jobs', { sessionId: 'parent', action: 'wait', jobId: 'own', timeoutMs: 15 })).job.id, 'own');
  assert.deepEqual(await f.rpc('session/jobs', { sessionId: 'parent', action: 'kill', jobId: 'own' }), { disposition: 'requested', job: own });
  callback({ type: 'registered', job: { id: 'foreign', owner: 'elsewhere' } });
  callback({ type: 'output', id: 'unowned', total: 1 });
  assert.equal(f.updates.length, 0);
  callback({ type: 'output', id: 'own', owner: 'parent', total: 5 });
  assert.equal(f.updates[0].value.sessionUpdate, 'jobs_update');
  await f.runtime.dispose(); assert.equal(unsubscribed, true);
  callback({ type: 'registered', job: own }); assert.equal(f.updates.length, 1);
});

test('readAt paginates native UTF-8 source spans without omissions or duplicate overlap', async () => {
  const texts = ['甲😀乙'.repeat(4000), 'omega終'.repeat(4000)];
  const chunks = [{ at: 0, text: texts[0] }, { at: Buffer.byteLength(texts[0]), text: texts[1] }];
  const total = texts.reduce((sum, value) => sum + Buffer.byteLength(value), 0);
  const f = fixture({ jobs: { get: () => ({ id: 'job', owner: 'parent' }),
    readAt(id, from, caller) { assert.equal(from, 0); assert.equal(caller, 'parent'); return { chunks, next: total, lossy: false }; } } });
  let from = 0; let joined = '';
  for (let page = 0; from < total && page < 1000; page++) {
    const result = await f.rpc('session/jobs', { sessionId: 'parent', action: 'readAt', jobId: 'job', from, maxBytes: 997 });
    const text = result.chunks.map((chunk) => chunk.text).join('');
    assert.ok(Buffer.byteLength(text) <= 997); assert.ok(!text.includes('\uFFFD'));
    assert.ok(result.next > from); joined += text; from = result.next;
  }
  assert.equal(from, total); assert.equal(joined, texts.join(''));
  await f.runtime.dispose();
});

test('job output redacts known secrets before native chunks and byte pages split them', async () => {
  const secret = 'unique-credential-16';
  const raw = 'x'.repeat(32760) + secret + '\nfinished';
  const chunks = [{ at: 0, text: raw.slice(0, 32768) }, { at: 32768, text: raw.slice(32768) }];
  const f = fixture({ credentials: { describe: async () => ({ configured: true, writable: true }), set: async () => {} },
    jobs: { get: () => ({ id: 'job', owner: 'parent' }), readAt: () => ({ chunks, next: raw.length, lossy: false }),
      read: () => ({ chunks, lossy: false, result: secret, job: { id: 'job', owner: 'parent' } }) } });
  await f.rpc('config/credentials', { action: 'set', ref: 'JOB_KEY', value: secret });
  const first = await f.rpc('session/jobs', { sessionId: 'parent', action: 'readAt', jobId: 'job', from: 0 });
  const second = await f.rpc('session/jobs', { sessionId: 'parent', action: 'readAt', jobId: 'job', from: first.next });
  const joined = [...first.chunks, ...second.chunks].map((chunk) => chunk.text).join('');
  assert.equal(joined, 'x'.repeat(32760) + '*'.repeat(secret.length) + '\nfinished');
  const read = await f.rpc('session/jobs', { sessionId: 'parent', action: 'read', jobId: 'job' });
  assert.equal(JSON.stringify(read).includes('unique-c'), false);
  await f.runtime.dispose();
});

test('closing a session aborts job waits and rejects stale result delivery', async () => {
  let signal;
  let settle;
  const f = fixture({ jobs: { get: () => ({ id: 'job', owner: 'parent' }),
    wait(id, ms, caller, supplied) { signal = supplied; return new Promise((resolve) => { settle = resolve; }); } } });
  const result = f.rpc('session/jobs', { sessionId: 'parent', action: 'wait', jobId: 'job' });
  f.record.closing = true; f.runtime.closeSession('parent');
  assert.equal(signal.aborted, true); settle({ id: 'job', owner: 'parent', status: 'completed' });
  await assert.rejects(result, /closed during control/);
  await f.runtime.dispose();
});

test('terminal operations use exact Agent identity, typed native observations, and service cleanup signal', async () => {
  const calls = [];
  const result = { viewport: 'hello', waitReason: 'stdin_read', sessionStatus: { kind: 'running' }, truncated: false };
  const f = fixture({ terminals: {
    listBackends: () => ['shell'],
    list(owner) { assert.equal(owner, f.agent); return [{ sessionId: 'pty', type: 'shell', status: { kind: 'running' } }]; },
    async spawn(owner, request, signal) { assert.equal(owner, f.agent); assert.ok(signal instanceof AbortSignal); calls.push(request); return { sessionId: 'pty', type: 'shell', status: { kind: 'running' }, motd: 'ready' }; },
    read(owner, id, request) { assert.equal(owner, f.agent); assert.equal(id, 'pty'); calls.push(request); return { text: 'out', totalLines: 3, lineBegin: 0, lineEnd: 3, truncated: false }; },
    startSend(owner, id, request) { assert.equal(owner, f.agent); assert.equal(id, 'pty'); calls.push(request); return { done: Promise.resolve(result) }; },
    async signal(owner, id, value) { assert.equal(owner, f.agent); assert.equal(value, 'SIGINT'); return { delivered: true, targetPgid: 42 }; },
    async kill(owner, id, reason) { assert.equal(owner, f.agent); assert.equal(id, 'pty'); return true; },
  } });
  assert.equal((await f.rpc('session/terminal', { sessionId: 'parent', action: 'spawn', type: 'shell', owner: 'foreign' })).sessionId, 'pty');
  assert.deepEqual(calls[0], { type: 'shell' });
  assert.equal((await f.rpc('session/terminal', { sessionId: 'parent', action: 'read', terminalId: 'pty' })).text, 'out');
  assert.deepEqual(await f.rpc('session/terminal', { sessionId: 'parent', action: 'send', terminalId: 'pty', text: '', submit: true }), result);
  assert.deepEqual(await f.rpc('session/terminal', { sessionId: 'parent', action: 'signal', terminalId: 'pty', signal: 'SIGINT' }), { delivered: true, targetPgid: 42 });
  assert.deepEqual(await f.rpc('session/terminal', { sessionId: 'parent', action: 'kill', terminalId: 'pty' }), { closed: true });
  await assert.rejects(f.rpc('session/terminal', { sessionId: 'foreign', action: 'read', terminalId: 'pty' }));
  await assert.rejects(f.rpc('session/terminal', { sessionId: 'parent', action: 'signal', terminalId: 'pty', signal: 'INVALID' }));
  await f.runtime.dispose();
});

test('isolated terminal resolution requires the official active loader group and class, and fences remounts', { skip: posixProofSkip }, async () => {
  const p = profile();
  class NativeTerminals {
    listBackends() { return ['fixture']; }
    list(owner) { assert.equal(owner, f.agent); return []; }
    hasOwnerActivity(owner) { assert.equal(owner, f.agent); return false; }
    spawn(owner) { assert.equal(owner, f.agent); return new Promise((resolve) => { settle = resolve; }); }
  }
  const agents = {};
  let terminal = new NativeTerminals(); let settle;
  const group = { options: { id: 'optional-persistent-terminals', group: true, isolate: { terminals: true } }, fiber: { state: 2 } };
  const parent = { ctx: { fiber: { entry: group } } }; group.subgroup = parent;
  const entry = { options: { id: 'optional-terminal-registry', name: '@deepseek-ai/dsh-terminal' },
    moduleNamespace: { default: NativeTerminals }, fiber: { state: 2, runtime: { callback: NativeTerminals } }, parent,
    context: { get: (name) => name === 'terminals' ? terminal : name === 'agents' ? agents : name === 'profileContext' ? p.profileContext : undefined } };
  let entries = [group, entry];
  const f = fixture({ profileContext: p.profileContext, agents, loader: { entries: () => entries } }, p.config, { terminalServiceClass: NativeTerminals });
  assert.equal(f.services.terminals, undefined);
  assert.equal((await f.rpc('control/capabilities', {})).controlCapabilities.terminal.present, true);
  assert.equal((await f.rpc('control/capabilities', {})).controlCapabilities.terminal.activity, true);
  assert.deepEqual(await f.rpc('session/terminal', { sessionId: 'parent', action: 'availability' }), { available: true, backends: ['fixture'] });
  assert.deepEqual(await f.rpc('session/terminal', { sessionId: 'parent', action: 'list' }), { terminals: [], active: false });
  const pending = f.rpc('session/terminal', { sessionId: 'parent', action: 'spawn', type: 'fixture' });
  terminal = new NativeTerminals(); settle({ sessionId: 'old-pty', type: 'fixture', status: { kind: 'running' } });
  await assert.rejects(pending, /changed/);
  entries = [group, entry, { ...entry }];
  const ambiguous = (await f.rpc('control/capabilities', {})).controlCapabilities.terminal;
  assert.equal(ambiguous.present, true); assert.equal(ambiguous.list, false);
  await assert.rejects(f.rpc('session/terminal', { sessionId: 'parent', action: 'list' }));
  entries = [group, entry]; entry.fiber.runtime.callback = class Untrusted {};
  assert.equal((await f.rpc('control/capabilities', {})).controlCapabilities.terminal.list, false);
  entry.fiber.runtime.callback = NativeTerminals;
  group.fiber.state = 0;
  assert.equal((await f.rpc('control/capabilities', {})).controlCapabilities.terminal.present, false);
  await f.runtime.dispose();
});

test('subagent controls admit catalog-owned children only and acknowledge interruption without claiming completion', async () => {
  const children = [{ id: 'child', mode: 'continuable', label: 'task' }];
  let interrupted = 0;
  const f = fixture({ subagents: {
    async listChildren(parent, signal) { assert.equal(parent, 'parent'); assert.ok(signal instanceof AbortSignal); return children; },
    interrupt(id, authority) { assert.equal(id, 'child'); assert.deepEqual(authority, { kind: 'ancestor', agent: f.agent }); interrupted++; },
  } });
  const observed = { ...children[0], status: 'unknown', activity: 'unknown' };
  assert.deepEqual(await f.rpc('session/subagents', { sessionId: 'parent', action: 'get', childSessionId: 'child' }), { child: observed });
  await assert.rejects(f.rpc('session/subagents', { sessionId: 'parent', action: 'cancel', childSessionId: 'foreign' }), /not owned/);
  assert.equal(interrupted, 0);
  assert.deepEqual(await f.rpc('session/subagents', { sessionId: 'parent', action: 'cancel', childSessionId: 'child' }), { accepted: true, child: observed });
  assert.equal(interrupted, 1);
  await f.runtime.dispose();
});

test('subagent inactive activity requires a matched native released epoch and is replaced on resume', async () => {
  const f = fixture({ subagents: { listChildren: async () => [{ id: 'child', mode: 'continuable' }] }, agents: { get: () => ({ status: 'idle' }) } });
  const read = async () => (await f.rpc('session/subagents', { sessionId: 'parent', action: 'list' })).children[0];
  assert.equal((await read()).activity, 'unknown');
  f.emit('subagent/end', { id: 'child', runId: 'unseen', stopReason: 'completed' });
  assert.equal((await read()).activity, 'unknown');
  f.emit('subagent/start', { id: 'child', runId: 'one' });
  assert.equal((await read()).activity, 'active');
  f.emit('subagent/end', { id: 'child', runId: 'one', stopReason: 'completed' });
  assert.equal((await read()).activity, 'inactive'); assert.equal((await read()).status, 'completed');
  f.emit('subagent/start', { id: 'child', runId: 'two' });
  f.emit('subagent/end', { id: 'child', runId: 'one', stopReason: 'completed' });
  assert.equal((await read()).activity, 'active');
  await f.runtime.dispose();
});

test('managed profile proof rejects missing configuration and a missing marker', () => {
  const p = profile();
  const ctx = { get: () => p.profileContext };
  assert.equal(managedProfileProof(ctx, p.config), process.platform !== 'win32');
  assert.equal(managedProfileProof(ctx, {}), false);
  const missing = mkdtempSync(path.join(fixtureRoot, 'missing-'));
  mkdirSync(path.join(missing, 'node_modules'), { mode: 0o700 });
  assert.equal(managedProfileProof({ get: () => ({ dir: missing, patchPath: path.join(missing, 'cordis.patch.yml') }) }, { managedProfileRoot: missing }), false);
});

test('managed profile proof rejects symlink dependency directories and mutable files', { skip: posixProofSkip }, () => {
  const p = profile();
  const ctx = { get: () => p.profileContext };
  assert.equal(managedProfileProof(ctx, p.config), true);
  const link = mkdtempSync(path.join(fixtureRoot, 'linked-'));
  writeFileSync(path.join(link, '.opencodian-dsh-profile.json'), readFileSync(path.join(p.profileContext.dir, '.opencodian-dsh-profile.json')), { mode: 0o600 });
  symlinkSync(path.join(p.profileContext.dir, 'node_modules'), path.join(link, 'node_modules'), 'dir');
  assert.equal(managedProfileProof({ get: () => ({ dir: link, patchPath: path.join(link, 'cordis.patch.yml') }) }, { managedProfileRoot: link }), false);
  symlinkSync(path.join(p.profileContext.dir, '.opencodian-dsh-profile.json'), path.join(p.profileContext.dir, 'package.json'));
  assert.equal(managedProfileProof(ctx, p.config), false);
});

test('Windows synthetic mode bits keep managed extension writes and isolated terminal binding unavailable',
  { skip: process.platform !== 'win32' && 'Windows synthetic mode contract requires Windows' }, async (t) => {
    const p = profile();
    const dir = realpathSync(p.profileContext.dir);
    p.profileContext.dir = dir;
    p.profileContext.patchPath = path.join(dir, 'cordis.patch.yml');
    p.config.managedProfileRoot = dir;
    const markerPath = path.join(dir, '.opencodian-dsh-profile.json');
    const marker = readFileSync(markerPath);
    assert.deepEqual(JSON.parse(marker), { version: 1, owner: 'opencodian.dsh', vaultHash: 'a'.repeat(64), profile: 'sdk' });
    assert.equal(path.resolve(dir), dir);
    for (const [target, kind] of [[dir, 'isDirectory'], [path.join(dir, 'node_modules'), 'isDirectory'], [markerPath, 'isFile']]) {
      const stat = lstatSync(target);
      assert.equal(stat.isSymbolicLink(), false); assert.equal(stat[kind](), true);
    }
    assert.notEqual(lstatSync(dir).mode & 0o022, 0);
    assert.equal(managedProfileProof({ get: () => p.profileContext }, p.config), false);
    const originalEntries = readdirSync(dir).sort();

    const writes = []; const terminalCalls = [];
    const entry = { id: 'include:sample-extension', options: { id: 'sample-extension', name: 'sample-extension' },
      fiber: { state: 2, runtime: { Config: { type: 'object', meta: {}, dict: {
        label: { type: 'string', meta: { volatile: true } },
      }, toJSON: () => ({}) } } } };
    const settings = { writable: true, documentPath: p.profileContext.patchPath,
      describe: () => [{ ns: 'sample-extension', schema: {}, revision: 1, value: { label: 'before' }, base: {}, user: {}, secrets: [] }],
      mutate: () => { writes.push('settings.mutate'); } };
    const pluginManager = { listPlugins: async () => [{ entryId: entry.id }], listBundles: async () => [],
      inspect: async () => ({}), listVersions: async () => [],
      ...Object.fromEntries(['setPluginEnabled', 'setBundleEnabled', 'installBundle', 'updateBundle', 'removeBundle', 'cancelInstall', 'setVersionExemption']
        .map((method) => [method, () => { writes.push(method); }])) };
    class WindowsTerminalFixture {
      listBackends() { terminalCalls.push('listBackends'); return ['fixture']; }
      list() { terminalCalls.push('list'); return []; }
      hasOwnerActivity() { terminalCalls.push('hasOwnerActivity'); return false; }
      spawn() { terminalCalls.push('spawn'); }
    }
    const terminal = new WindowsTerminalFixture(); const agents = {};
    const group = { options: { id: 'optional-persistent-terminals', group: true, isolate: { terminals: true } }, fiber: { state: 2 } };
    const parent = { ctx: { fiber: { entry: group } } }; group.subgroup = parent;
    const terminalEntry = { options: { id: 'optional-terminal-registry', name: '@deepseek-ai/dsh-terminal' },
      moduleNamespace: { default: WindowsTerminalFixture }, fiber: { state: 2, runtime: { callback: WindowsTerminalFixture } }, parent,
      context: { get: (name) => name === 'terminals' ? terminal : name === 'agents' ? agents : name === 'profileContext' ? p.profileContext : undefined } };
    const f = fixture({ profileContext: p.profileContext, settings, pluginManager, agents,
      configEditor: { documentPath: p.profileContext.patchPath, entries: () => [entry] },
      loader: { entries: () => [group, terminalEntry] } }, p.config, { terminalServiceClass: WindowsTerminalFixture });
    t.after(() => f.runtime.dispose());

    const caps = f.runtime.capabilities();
    assert.equal(caps.configurationCapabilities.describe, true);
    assert.deepEqual(caps.configurationCapabilities.extensionSettings, { mutate: false });
    const extensions = caps.configurationCapabilities.extensions;
    assert.equal(extensions.list, true); assert.equal(extensions.inspect, true); assert.equal(extensions.versions, true);
    for (const key of ['managedProfile', 'enablePlugin', 'enableBundle', 'install', 'update', 'remove', 'cancel', 'exempt', 'progress'])
      assert.equal(extensions[key], false, key);
    const described = await f.rpc('config/describe', { namespaces: ['sample-extension'] });
    assert.deepEqual(described.profile, { managed: false, writable: true, hasDocument: true });
    assert.equal(described.forms[0].writable, false);
    settings.writable = false;
    const readOnly = await f.rpc('config/describe', { namespaces: ['sample-extension'] });
    assert.deepEqual(readOnly.profile, { managed: false, writable: false, hasDocument: true });
    assert.equal(readOnly.forms[0].writable, false);
    settings.writable = true;
    assert.equal((await f.rpc('config/extensions', { action: 'list' })).managed, false);
    await assert.rejects(f.rpc('config/extension-settings', { action: 'mutate', ns: 'sample-extension', expectedRevision: 1,
      ops: [{ op: 'set', path: ['label'], value: 'after' }] }), /unavailable or protected/);
    for (const params of [
      { action: 'enable-plugin', id: 'custom', enabled: true },
      { action: 'enable-plugin', id: 'builtin', enabled: false },
      { action: 'enable-bundle', name: 'custom', enabled: true },
      { action: 'install', spec: 'custom-package', operationId: 'owned-op' },
      { action: 'update', name: 'custom', version: '1.0.0' },
      { action: 'remove', name: 'custom' },
      { action: 'remove', name: '@opencodian/dsh-inherited-profile' },
      { action: 'cancel', operationId: 'owned-op' },
      { action: 'exempt', packageVersion: 'custom@1.0.0', runtimeVersion: '0.2.2', enabled: true },
      { action: 'exempt', packageVersion: 'custom@1.0.0', runtimeVersion: '0.2.2', enabled: true, acceptRisk: true },
    ]) await assert.rejects(f.rpc('config/extensions', params), /owned managed profile/);

    const isolated = (await f.rpc('control/capabilities', {})).controlCapabilities.terminal;
    assert.equal(isolated.present, true);
    for (const key of ['availability', 'list', 'activity', 'spawn', 'read', 'send', 'signal', 'kill']) assert.equal(isolated[key], false, key);
    assert.deepEqual(await f.rpc('session/terminal', { sessionId: 'parent', action: 'availability' }), { available: false, backends: [] });
    await assert.rejects(f.rpc('session/terminal', { sessionId: 'parent', action: 'list' }), /unavailable/);
    await assert.rejects(f.rpc('session/terminal', { sessionId: 'parent', action: 'spawn', type: 'fixture' }), /backend is unavailable/);
    assert.deepEqual(writes, []); assert.deepEqual(terminalCalls, []); assert.deepEqual(f.notifications, []);
    assert.deepEqual(readdirSync(dir).sort(), originalEntries);
    assert.deepEqual(readdirSync(path.join(dir, 'node_modules')), []);
    assert.deepEqual(readFileSync(markerPath), marker);
  });

test('extension writes reject an unproven profile before invoking the native manager', async () => {
  let calls = 0;
  const f = fixture({ pluginManager: { setPluginEnabled: async () => { calls++; } } });
  await assert.rejects(f.rpc('config/extensions', { action: 'enable-plugin', id: 'custom', enabled: false }), /owned managed profile/);
  assert.equal(calls, 0); await f.runtime.dispose();
});

test('proven extension writes preserve protected dependencies and demand explicit exemption acceptance', { skip: posixProofSkip }, async () => {
  let calls = 0;
  const manager = { async listPlugins() { return [{ entryId: 'builtin', readOnlyReason: 'management-required' },
    { entryId: 'tools-alias', moduleName: '@deepseek-ai/dsh-tools' }, { entryId: 'hmr-alias', moduleName: '@deepseek-ai/dsh-hmr' }]; },
    async listBundles() { return [{ name: 'builtin', removable: false, updatable: false }]; },
    async setPluginEnabled() { calls++; }, async removeBundle() { calls++; }, async setVersionExemption() { calls++; return { changed: true, application: 'applied' }; } };
  const p = profile();
  const g = fixture({ pluginManager: manager, profileContext: p.profileContext }, p.config);
  await assert.rejects(g.rpc('config/extensions', { action: 'enable-plugin', id: 'builtin', enabled: false }), /protected/);
  await assert.rejects(g.rpc('config/extensions', { action: 'enable-plugin', id: 'tools-alias', enabled: false }), /protected/);
  await assert.rejects(g.rpc('config/extensions', { action: 'enable-plugin', id: 'hmr-alias', enabled: false }), /protected/);
  await assert.rejects(g.rpc('config/extensions', { action: 'remove', name: 'builtin' }), /protected/);
  await assert.rejects(g.rpc('config/extensions', { action: 'remove', name: '@opencodian/dsh-inherited-profile' }), /protected/);
  await assert.rejects(g.rpc('config/extensions', { action: 'exempt', packageVersion: 'custom@1.0.0', runtimeVersion: '0.2.2', enabled: true }), /acceptRisk/);
  assert.equal(calls, 0);
  const value = await g.rpc('config/extensions', { action: 'exempt', packageVersion: 'custom@1.0.0', runtimeVersion: '0.2.2', enabled: true, acceptRisk: true });
  assert.equal(value.result.changed, true); assert.equal(calls, 1);
  await g.runtime.dispose();
});

test('extension progress belongs to admitted operations, redacts split logs, tracks cancellation and bounds output', { skip: posixProofSkip }, async () => {
  const p = profile();
  let finish;
  const f = fixture({ profileContext: p.profileContext, pluginManager: {
    async installBundle(spec, options) { assert.equal(spec, 'custom-package'); assert.equal(options.requestId, 'owned-op'); return new Promise((resolve) => { finish = resolve; }); },
    async cancelInstall(id) { assert.equal(id, 'owned-op'); finish({ changed: false, application: 'cancelled', stage: 'install', target: 'custom-package', packageResult: { output: 'Authorization: secret', logPath: '/private/secret' } }); return { status: 'cancelled' }; },
  } }, p.config);
  const install = f.rpc('config/extensions', { action: 'install', spec: 'custom-package', operationId: 'owned-op' });
  await Promise.resolve();
  f.emit('plugin-manager/install-log', { requestId: 'unowned-op', text: 'private', jobId: 'other', stream: 'stdout' });
  f.emit('plugin-manager/install-log', { requestId: 'owned-op', text: 'Authorization: Bear', jobId: 'one', stream: 'stdout' });
  assert.equal(f.notifications.length, 1);
  f.emit('plugin-manager/install-log', { requestId: 'owned-op', text: 'er secret\nInstalling package\n', jobId: 'one', stream: 'stdout' });
  assert.equal(f.notifications[1].value.text.includes('secret'), false);
  assert.equal(f.notifications[1].value.text.includes('Installing package'), true);
  f.emit('plugin-manager/install-log', { requestId: 'owned-op', text: 'x'.repeat(100000) + '\n', jobId: 'one', stream: 'stderr' });
  assert.ok(Buffer.byteLength(f.notifications.at(-1).value.text) <= 32768);
  assert.equal(f.notifications.at(-1).value.truncated, true);
  const cancellation = await f.rpc('config/extensions', { action: 'cancel', operationId: 'owned-op' });
  assert.equal(cancellation.status, 'cancelled');
  const value = await install;
  assert.equal(value.result.application, 'cancelled');
  assert.equal(JSON.stringify(value).includes('/private'), false);
  assert.equal(JSON.stringify(value).includes('secret'), false);
  assert.deepEqual(await f.rpc('config/extensions', { action: 'cancel', operationId: 'foreign' }), { operationId: 'foreign', status: 'not-running' });
  const count = f.notifications.length;
  await f.runtime.dispose();
  f.emit('plugin-manager/install-state', { requestId: 'owned-op', phase: 'installing' });
  assert.equal(f.notifications.length, count);
});

test('MCP config forwards advanced native fields without weakening command admission or credential indirection', async () => {
  const ctx = { get: () => ({ async resolve(ref) { assert.equal(ref, 'MCP_KEY'); return { value: 'native-only-secret', source: 'file' }; } }) };
  const common = { toolCallTimeoutMs: 2000, failOnStartupError: false, maxInstructionBytes: 1024, reconnect: { maxAttempts: 2 } };
  const stdio = await mcpClientConfig(ctx, { type: 'stdio', name: 'server', command: '/usr/bin/node', cwd: '/tmp/owned', ...common }, '/tmp/default');
  assert.deepEqual(stdio, { transport: 'stdio', serverName: 'server', command: '/usr/bin/node', cwd: '/tmp/owned', args: [], env: {}, ...common });
  assert.equal((await mcpClientConfig(ctx, { name: 'legacy', command: '/usr/bin/node' }, '/tmp')).transport, 'stdio');
  await assert.rejects(mcpClientConfig(ctx, { type: 'stdio', name: 'server', command: 'node' }, '/tmp/default'), /absolute/);
  const http = await mcpClientConfig(ctx, { type: 'http', name: 'server', url: 'https://example.test', headerCredentialRefs: { Authorization: 'MCP_KEY' }, ...common });
  assert.equal(http.headers.Authorization, 'native-only-secret'); assert.equal(http.maxInstructionBytes, 1024);
  const f = fixture();
  f.record.mcp.set('server', { declaration: { name: 'server' }, fiber: { state: 2 } });
  const status = f.runtime.mcpStatus(f.record);
  assert.equal(status.servers[0].connected, null); assert.equal(status.servers[0].state, 'unknown');
  await f.runtime.dispose();
});
