import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { test } from 'node:test';
import { fileURLToPath,pathToFileURL } from 'node:url';

import { createControlRuntime, mcpClientConfig } from '../../../../../assets/dsh/control.mjs';

// Public installed source plus owned isolated profiles. No user credential/profile
// bytes, provider requests, package installs or user terminal processes are used.
// DSH_PUBLIC_INSTALL (the installed `@deepseek-ai/dsh` package directory) wins.
// Default candidates derive from the Node install prefix of `process.execPath`:
// Unix global modules live under `<prefix>/lib/node_modules`, Windows under
// `<prefix>/node_modules`, with npm's dirname(execPath) layout as fallback.
const explicitInstall = process.env.DSH_PUBLIC_INSTALL;
const execDir = path.dirname(process.execPath);
const nodePrefix = path.basename(execDir) === 'bin' ? path.dirname(execDir) : execDir;
const installRoot = explicitInstall ?? [
  path.join(nodePrefix, process.platform === 'win32' ? 'node_modules' : 'lib/node_modules', '@deepseek-ai', 'dsh'),
  path.join(execDir, 'node_modules', '@deepseek-ai', 'dsh'),
].find((candidate) => existsSync(path.join(candidate, 'package.json')));
const publicRoot = installRoot ? path.join(installRoot, 'node_modules', '@deepseek-ai') : undefined;
const available = !!publicRoot && existsSync(`${publicRoot}/dsh-mcp-client/lib/index.js`);
// A configured-but-unusable DSH_PUBLIC_INSTALL is a configuration error: the
// whole file must fail, never hide behind the no-install skips below.
if (explicitInstall && !available) {
  throw new Error(`DSH_PUBLIC_INSTALL is set but unusable: missing ${publicRoot}/dsh-mcp-client/lib/index.js under ${explicitInstall}`);
}
const load = (name) => import(pathToFileURL(`${publicRoot}/${name}/lib/index.js`).href);

test('installed 0.2.2-rc.1 credential reference validator matches bridge grammar', { skip: !explicitInstall && !available }, async () => {
  const native = await load('dsh-credentials');
  assert.equal(native.credentialRef('DSH_TEST_KEY'), 'DSH_TEST_KEY');
  assert.equal(native.credentialRef('_custom_2'), '_custom_2');
  for (const value of ['a/b', 'DSH-KEY', '../key', '1KEY', '']) assert.throws(() => native.credentialRef(value));
});

test('installed MCP Config accepts bridge advanced options with its real reconnect schema', { skip: !explicitInstall && !available }, async () => {
  const native = await load('dsh-mcp-client');
  const config = await mcpClientConfig({ get: () => undefined }, { type: 'stdio', name: 'probe', command: '/usr/bin/true', cwd: '/tmp',
    toolCallTimeoutMs: 1500, failOnStartupError: false, maxInstructionBytes: 8192,
    reconnect: { maxAttempts: 4, initialDelayMs: 100, maxDelayMs: 2000 } }, '/tmp');
  const resolved = native.Config(config);
  assert.equal(resolved.cwd, '/tmp'); assert.equal(resolved.toolCallTimeoutMs, 1500);
  assert.equal(resolved.failOnStartupError, false); assert.equal(resolved.maxInstructionBytes, 8192);
  assert.equal(resolved.reconnect.maxAttempts, 4);
});

test('installed todo projection drives bridge readback and turn-start clear notifications', { skip: !explicitInstall && !available }, async () => {
  const native = await load('dsh-tool-todo');
  let definition;
  await native.apply({ sessionProjections: { async register(value) { definition = value; } }, tools: { register() {} } }, { allowParallelInProgress: true });
  assert.equal(definition.key, 'todos');
  const session = { id: 'owned' };
  const record = { closing: false, handle: { agent: { session } } };
  let state = definition.init();
  let onChanged;
  const messages = [];
  const services = { sessionProjections: {
    snapshot(target) { assert.equal(target, session); return { values: { todos: definition.wire.view(state) } }; },
    onChanged(listener) { onChanged = listener; return () => { onChanged = undefined; }; },
  } };
  const runtime = createControlRuntime({ get: (name) => services[name], on: () => () => {} }, {}, {
    sessions: new Map([['owned', record]]), requireSession: () => record,
    update: (id, value) => messages.push({ id, value }), notify() {},
  });
  runtime.capabilities();
  const write = { type: 'todo/write', data: { todos: [{ content: 'real native projection', status: 'in_progress' }] } };
  state = definition.apply(state, write); onChanged(session, 'todos', definition.wire.view(state));
  assert.equal((await runtime.methods['session/todos']({ sessionId: 'owned' })).todos[0].content, 'real native projection');
  state = definition.apply(state, { type: 'turn/start', data: {} });
  onChanged(session, 'todos', definition.wire.view(state));
  assert.deepEqual(messages.at(-1), { id: 'owned', value: { sessionUpdate: 'todo_update', todos: [] } });
  await runtime.dispose();
});

test('real Cordis tracing proxies keep one subscription across capability reads and fence replaced services', { skip: !explicitInstall && !available }, async () => {
  const { Context, Service, symbols } = await load('cordis');
  const ctx = new Context();
  const generations = [];
  class Observers extends Service {
    constructor(scope) {
      super(scope, 'jobs');
      this.state = { jobs: 0, projections: 0, stoppedJobs: 0, stoppedProjections: 0 };
      this.events = { subscribe: (filter, listener) => { this.state.jobs++; this.state.jobListener = listener; return () => { this.state.stoppedJobs++; }; } };
      this.onChanged = (listener) => { this.state.projections++; this.state.projectionListener = listener; return () => { this.state.stoppedProjections++; }; };
      this.snapshot = () => ({ values: { todos: [] } });
      scope.provide('sessionProjections', this);
      generations.push(this.state);
    }
  }
  let fiber = ctx.plugin(Observers); await fiber;
  const session = { id: 'owned' };
  const record = { closing: false, handle: { agent: { session } } };
  const updates = [];
  const runtime = createControlRuntime(ctx, {}, { sessions: new Map([['owned', record]]), requireSession: () => record,
    update: (id, value) => updates.push({ id, value }), notify() {}, serviceIdentity: (service) => service?.[symbols.original] ?? service });
  try {
    assert.notEqual(ctx.get('jobs'), ctx.get('jobs'), 'real Cordis reads produce distinct proxies');
    let revision;
    for (let index = 0; index < 3; index++) {
      const result = await runtime.methods['control/capabilities']({});
      assert.equal(result.controlCapabilities.jobs.present, true); assert.equal(result.controlCapabilities.readback, true);
      assert.ok(Number.isSafeInteger(result.controlCapabilities.revision));
      revision ??= result.controlCapabilities.revision;
      assert.equal(result.controlCapabilities.revision, revision, 'fresh proxies do not change composition');
    }
    assert.equal(generations[0].jobs, 1); assert.equal(generations[0].projections, 1);
    generations[0].jobListener({ type: 'output', owner: 'owned', id: 'job', total: 3 });
    generations[0].projectionListener(session, 'todos', []);
    assert.equal(updates.length, 2);
    await fiber.dispose();
    fiber = ctx.plugin(Observers); await fiber;
    const fresh = await runtime.methods['control/capabilities']({});
    assert.equal(fresh.controlCapabilities.jobs.present, true);
    assert.ok(fresh.controlCapabilities.revision > revision, 'same-method replacement changes composition proof');
    assert.equal(generations[0].stoppedJobs, 1); assert.equal(generations[0].stoppedProjections, 1);
    assert.equal(generations[1].jobs, 1); assert.equal(generations[1].projections, 1);
    generations[0].jobListener({ type: 'output', owner: 'owned', id: 'old-job', total: 9 });
    generations[0].projectionListener(session, 'todos', [{ content: 'stale', status: 'pending' }]);
    assert.equal(updates.length, 2);
    generations[1].jobListener({ type: 'output', owner: 'owned', id: 'new-job', total: 9 });
    generations[1].projectionListener(session, 'todos', []);
    assert.equal(updates.length, 4);
    await fiber.dispose();
    const absent = await runtime.methods['control/capabilities']({});
    assert.equal(absent.controlCapabilities.jobs.present, false);
  } finally { await runtime.dispose(); await ctx.fiber.dispose(); }
});

test('real installed NDJSON transport serves controls without console contamination', { skip: !explicitInstall && !available, timeout: 10000 }, async (context) => {
  const fixture = fileURLToPath(new URL('./DshNativeService.fixture.mjs', import.meta.url));
  const anchor = path.join(installRoot, 'package.json');
  const child = spawn(process.execPath, [fixture, anchor], { stdio: ['pipe', 'pipe', 'pipe'] });
  context.after(() => { if (child.exitCode === null) child.kill(); });
  let stderr = '';
  child.stderr.setEncoding('utf8'); child.stderr.on('data', (chunk) => { stderr += chunk; });
  const frames = [];
  const pending = new Map();
  let invalid;
  const lines = createInterface({ input: child.stdout });
  lines.on('line', (line) => {
    try { const value = JSON.parse(line); frames.push(value); pending.get(value.id)?.(value); pending.delete(value.id); }
    catch { invalid = line; }
  });
  const request = (id, method, params = {}) => new Promise((resolve) => {
    pending.set(id, resolve); child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });
  const ready = await request(1, 'initialize');
  assert.equal(ready.result.nativeProtocol, 'opencodian.dsh-native/1');
  assert.equal(ready.result.configurationCapabilities.describe, true);
  assert.equal(ready.result.controlCapabilities.terminal.spawn, false);
  assert.equal(ready.result.controlCapabilities.terminal.present, false);
  assert.equal(ready.result.controlCapabilities.goal.present, false);
  assert.equal(ready.result.controlCapabilities.readback, true);
  const form = await request(2, 'config/describe', { namespaces: ['sample'] });
  assert.equal(form.result.appliedRevision, 'fixture-applied');
  assert.equal(form.result.forms[0].value.thresholdRatio, 0.8);
  const refs = await request(3, 'config/credentials', { action: 'describe', refs: ['TEST_KEY'] });
  assert.deepEqual(refs.result.credentials, [{ ref: 'TEST_KEY', configured: false, writable: false }]);
  const live = await request(4, 'control/capabilities');
  assert.equal(live.result.controlCapabilities.readback, true);
  assert.equal(live.result.controlCapabilities.terminal.present, false);
  assert.equal(invalid, undefined); assert.equal(frames.length, 4);
  const exit = new Promise((resolve) => child.once('exit', resolve));
  child.stdin.end(); await exit;
  assert.equal(child.exitCode, 0);
  assert.ok(stderr.includes('fixture-native-console-noise'));
});

test('installed SettingsForms and ConfigEditor persist extension edits across a full native reboot', { skip: !explicitInstall && !available, timeout: 20000 }, async (context) => {
  const fixture = fileURLToPath(new URL('./DshNativeSettings.fixture.mjs', import.meta.url));
  const root = fileURLToPath(new URL('../../../../../', import.meta.url));
  const retained = path.join(root, '.impeccable', 'dsh-control-test-fixtures');
  mkdirSync(retained, { recursive: true, mode: 0o700 });
  const directory = mkdtempSync(path.join(retained, 'native-settings-'));
  const home = path.join(directory, 'isolated-home'); mkdirSync(home, { mode: 0o700 });
  const install = installRoot;
  const child = spawn(process.execPath, [fixture, install, directory], { cwd: directory, stdio: ['ignore', 'pipe', 'pipe'],
    env: { HOME: home, DSH_HOME: path.join(home, 'dsh'), XDG_CONFIG_HOME: path.join(home, 'config'), XDG_DATA_HOME: path.join(home, 'data'),
      PATH: path.dirname(process.execPath), DSH_TELEMETRY_DISABLED: '1' } });
  context.after(() => { if (child.exitCode === null) child.kill(); });
  let output = ''; let errors = '';
  child.stdout.on('data', (chunk) => { output += chunk; }); child.stderr.on('data', (chunk) => { errors += chunk; });
  await new Promise((resolve) => child.once('exit', resolve));
  assert.equal(child.exitCode, 0, errors + output);
  assert.ok(output.includes('native SettingsForms + ConfigEditor persist/apply/reboot/CAS/secret/core-boundary'));
});

test('installed plan projection keeps committed state independent of permission values', { skip: !explicitInstall && !available }, async () => {
  const native = await load('dsh-plan-mode');
  const projection = native.planProjectionDefinition;
  let state = projection.init();
  state = projection.apply(state, { type: 'plan/mode', data: { active: true } });
  assert.equal(projection.wire.view(state).active, true);
  state = projection.apply(state, { type: 'permission/preset', data: { preset: 'read-only' } });
  assert.equal(projection.wire.view(state).active, true);
  state = projection.apply(state, { type: 'plan/mode', data: { active: false } });
  assert.equal(projection.wire.view(state).active, false);
});

// The 2358 acceptance round recorded readSessionJobAt(0) as "Harness returned invalid
// control state". This test pins the truth against the public installed registry, the
// real bridge route, and the real TypeScript controls class: the receipt is
// {chunks, next: <byte offset number>, lossy}, readAt is non-consuming, and ONLY a
// malformed options argument (the once-documented positional 0, or a string offset)
// raises that exact deterministic error. The controller-facing call is
// readSessionJobAt(sessionId, jobId, { from: 0 }).
test('installed Jobs readAt receipts keep the source-cursor contract and reject malformed cursor calls', { skip: !explicitInstall && !available, timeout: 30000 }, async () => {
  const esbuild = await import('esbuild');
  const repoRoot = fileURLToPath(new URL('../../../../../', import.meta.url));
  const retained = path.join(repoRoot, '.impeccable', 'dsh-control-test-fixtures');
  mkdirSync(retained, { recursive: true, mode: 0o700 });
  const bundleDir = mkdtempSync(path.join(retained, 'readat-controls-'), { mode: 0o700 });
  const bundle = path.join(bundleDir, 'DshNativeControls.bundle.mjs');
  await esbuild.build({
    entryPoints: [path.join(repoRoot, 'src', 'core', 'agents', 'backend', 'dsh', 'DshNativeControls.ts')],
    outfile: bundle, bundle: true, format: 'esm', platform: 'node', target: 'node24', logLevel: 'silent',
  });
  const { DshNativeControls, DshNativeControlError, dshNativeControlCapabilities } = await import(pathToFileURL(bundle).href);

  const { Context } = await load('cordis');
  const { default: LocalJobRegistry } = await load('dsh-jobs-local');
  const ctx = new Context();
  const ownerScope = new Context();
  const sessionId = 'owned-readat-session';
  const session = { id: sessionId };
  const record = { closing: false, handle: { agent: { session } }, mcp: new Map() };
  const sessions = new Map([[sessionId, record]]);
  const runtime = createControlRuntime(ctx, {}, {
    sessions,
    requireSession: (id) => { const entry = sessions.get(id); if (!entry || entry.closing) throw new Error('unknown session'); return entry; },
    update() {}, notify() {},
  });
  try {
    const agent = { id: sessionId, ctx: ownerScope };
    ctx.provide('agents', { get: (id) => (id === sessionId ? agent : undefined) });
    const registry = new LocalJobRegistry(ctx, { maxConcurrentJobsPerOwner: 10, retainBytes: 262144, settledRetainBytes: 16384, pumpPollMs: 150 });
    const detachController = registry.attachController('opencodian-readat-contract');

    // Mirror the 2358 job: a failed out-of-vault bash write, 169-byte stderr output,
    // multibyte content so the byte-offset math is real, exit code 1, no result value.
    const denialText = 'sandbox denied: 写入超出工作区边界\nescalation guidance: request approval before retry\n';
    const outputText = denialText + '.'.repeat(169 - Buffer.byteLength(denialText));
    assert.equal(Buffer.byteLength(outputText), 169);
    const jobId = registry.start({
      kind: 'bash', label: 'printf DSH-JOBS-MARKER > /outside/workspace (sandbox denied)', owner: sessionId,
      run(job) {
        job.append(outputText, { channel: 'stderr' });
        return { cancel() {}, done: Promise.resolve({ status: 'failed', detail: 'exit code: 1' }) };
      },
    });
    await registry.wait(jobId, 5000, sessionId);
    // The model's in-turn inline read consumed the ring cursor, exactly as tool-jobs
    // does at settlement; every later consuming read returns empty chunks.
    registry.read(jobId, sessionId);

    const capabilities = dshNativeControlCapabilities(
      { nativeProtocol: 'opencodian.dsh-native/1', controlCapabilities: runtime.capabilities().controlCapabilities }, true);
    assert.equal(capabilities.controls.jobs.readAt, true);
    const controls = new DshNativeControls({
      acquire: async () => ({
        request: async (method, params) => runtime.methods[method](params),
        assertCurrent() {}, capabilities, capabilitiesCurrent: true, refreshCapabilities: async () => capabilities,
      }),
    });

    // The acceptance sequence: list/get/wait/read all succeed; the consuming read is
    // empty because the model cursor already holds every byte.
    const listed = await controls.listSessionJobs(sessionId);
    assert.deepEqual(listed.map((job) => ({ id: job.id, status: job.status, owner: job.owner })),
      [{ id: jobId, status: 'failed', owner: sessionId }]);
    const view = await controls.getSessionJob(sessionId, jobId);
    assert.equal(view.status, 'failed');
    assert.deepEqual(view.output, { total: 169, earliest: 0 });
    assert.equal((await controls.waitForSessionJob(sessionId, jobId, { timeoutMs: 1000 })).status, 'failed');
    const consumed = await controls.readSessionJob(sessionId, jobId);
    assert.deepEqual(consumed.chunks, []);

    // The correct cursor call: options object with a numeric byte offset.
    const receipt = await controls.readSessionJobAt(sessionId, jobId, { from: 0 });
    assert.equal(typeof receipt.next, 'number');
    assert.equal(receipt.lossy, false);
    assert.equal(receipt.next, 169);
    assert.equal(receipt.chunks.length, 1);
    assert.equal(receipt.chunks[0].at, 0);
    assert.equal(receipt.chunks[0].channel, 'stderr');
    assert.equal(receipt.chunks[0].text, outputText);
    // The JSON-RPC wire must keep the cursor numeric.
    assert.deepEqual(JSON.parse(JSON.stringify(receipt)), receipt);
    // Non-consuming: the bytes stay reachable after any number of cursor reads.
    const again = await controls.readSessionJobAt(sessionId, jobId, { from: receipt.next });
    assert.deepEqual(again.chunks, []);
    assert.equal(again.next, 169);
    // Byte-exact pagination: bounded pages reassemble without omissions or repeats.
    // The first page may end before byte 64 when that byte lands mid-character.
    const bytes = Buffer.from(outputText, 'utf8');
    let boundary = 64;
    while (boundary > 0 && (bytes[boundary] & 0xc0) === 0x80) boundary--;
    const firstPage = await controls.readSessionJobAt(sessionId, jobId, { from: 0, maxBytes: 64 });
    assert.equal(firstPage.next, boundary);
    assert.equal(Buffer.byteLength(firstPage.chunks[0].text), boundary);
    const secondPage = await controls.readSessionJobAt(sessionId, jobId, { from: firstPage.next });
    assert.equal(secondPage.next, 169);
    assert.equal(secondPage.chunks.length, 1);
    assert.equal(Buffer.concat([Buffer.from(firstPage.chunks[0].text), Buffer.from(secondPage.chunks[0].text)]).toString('utf8'), outputText);

    // The 2358 red: malformed options raise exactly the recorded deterministic error,
    // synchronously before any request, regardless of job state — wrapped in an async
    // arrow because readSessionJobAt itself is not async.
    const misuse = (error) => error instanceof DshNativeControlError && error.code === 'invalid-response'
      && error.message === 'Harness returned invalid control state';
    await assert.rejects(async () => controls.readSessionJobAt(sessionId, jobId, /** @type {any} */ (0)), misuse);
    await assert.rejects(async () => controls.readSessionJobAt(sessionId, jobId, { from: /** @type {any} */ ('0') }), misuse);

    detachController?.();
  } finally {
    await runtime.dispose();
    await ctx.fiber.dispose();
    await ownerScope.fiber.dispose();
  }
});
