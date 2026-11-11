import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { createControlRuntime } from '../../../../../assets/dsh/control.mjs';
import { INHERITED_PACKAGE, openManagedProfile, readInheritedProfile, writeInheritedBundle } from '../../../../../assets/dsh/launcher.mjs';

// Only public installation code and this fresh, credential-free fixture are read.
const install = process.argv[2];
const directory = await realpath(process.argv[3]);
const phase = process.argv[4] ?? 'complete';
const contextOnly = phase === 'context-only';
const requireNative = createRequire(path.join(install, 'lib', 'bin.js'));
const load = (name) => import(pathToFileURL(requireNative.resolve(name)).href);
const boot = await load('@deepseek-ai/dsh-app-boot');
const { runProfile, INSTALL_ANCHOR } = await import(pathToFileURL(path.join(install, 'lib', 'profile-boot.js')).href);
const { TerminalSessionService } = await load('@deepseek-ai/dsh-terminal');
const { symbols } = await load('@deepseek-ai/cordis');
const { isVolatile } = await load('@deepseek-ai/cosmokit');
const { redactSecrets } = await load('@deepseek-ai/dsh-settings');
const serviceIdentity = (service) => service?.[symbols.original] ?? service;
const plainConfig = (value) => isVolatile(value) ? plainConfig(value.get()) : Array.isArray(value) ? value.map(plainConfig)
  : value !== null && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, plainConfig(entry)])) : value;
const bundle = '@deepseek-ai/dsh-experimental-terminal-bundle';
const source = path.join(directory, 'fixture-source');
await mkdir(source, { recursive: true, mode: 0o700 });
const dispatched = path.join(directory, 'forbidden-model-dispatch');
const providerFile = path.join(source, 'offline-provider.mjs');
await writeFile(providerFile, `import { LlmAdapter } from ${JSON.stringify(pathToFileURL(requireNative.resolve('@deepseek-ai/dsh-llm')).href)};
  import { writeFileSync } from 'node:fs';
  class Offline extends LlmAdapter {
    async listModels(provider) { return [{provider,id:'offline',name:'Offline metadata',inputModalities:['text']}]; }
    async resolveModel(provider, model) { return {provider,id:model,name:model,inputModalities:['text'],context:{contextWindow:32000}}; }
    async *stream() { writeFileSync(${JSON.stringify(dispatched)}, 'attempted'); throw new Error('Terminal fixture forbids model calls'); }
  }
  export const inject=['llm']; export async function apply(ctx) { ctx.llm.registerAdapter(['offline-fixture'], new Offline()); }
`, { mode: 0o600 });
await writeFile(path.join(source, 'package.json'), JSON.stringify({ name: 'owned-terminal-fixture', private: true,
  dsh: { profile: { bundles: ['@deepseek-ai/dsh-base'] } } }), { mode: 0o600 });
const patch = JSON.stringify([
  ...['llm-deepseek', 'llm-deepseek-account', 'llm-pi-ai', 'session-title-llm', 'session-telemetry-otel'].map((id) => ({ id, disabled: true })),
  { insert: [{ id: 'offline-provider', name: providerFile, inject: ['llm'] }] },
  { id: 'agent-default-model', config: { provider: 'offline-fixture', model: 'offline' } },
  { id: 'sandbox-policy', config: { mode: 'workspace-write', workspaceRoot: directory } },
]);
await writeFile(path.join(source, 'cordis.patch.yml'), patch, { mode: 0o600 });
const location = { allowedRoot: path.join(directory, 'profiles'), vaultHash: 'c'.repeat(64), profile: 'sdk',
  root: path.join(directory, 'profiles', 'c'.repeat(64), 'sdk') };
const root = await openManagedProfile(location);
await writeInheritedBundle(root, readInheritedProfile(boot, source, INSTALL_ANCHOR, {}), source);
const sourceBefore = await readFile(path.join(source, 'cordis.patch.yml'), 'utf8');

async function start() {
  const profile = boot.loadProfileDirectory('dsh', root, INSTALL_ANCHOR);
  assert.deepEqual(profile.skippedBundles, []);
  const application = await runProfile({ environment: new Map(), profile: 'sdk', patchFiles: [], args: [],
    resolvedProfile: { profile, installAnchor: INSTALL_ANCHOR } });
  const sessions = new Map();
  const controls = createControlRuntime(application.ctx, { managedProfileRoot: root, nativeConfigRevision: 'terminal-fixture' }, {
    sessions, requireSession(id) { const record = sessions.get(id); if (!record || record.closing) throw new Error('Unknown owned fixture session'); return record; },
    update() {}, notify() {}, serviceIdentity, terminalServiceClass: TerminalSessionService, plainConfig, redactSecrets,
  });
  return { application, sessions, controls, rpc: (method, params) => controls.methods[method](params),
    stop: async () => {
      await controls.dispose();
      for (const record of sessions.values()) { record.closing = true; await record.handle.dispose(); }
      sessions.clear();
      await application.ctx.fiber.dispose();
    } };
}

function contextProof(application) {
  const ctx = application.ctx;
  const entries = [...ctx.get('loader').entries()];
  const registry = entries.find((entry) => entry.options.id === 'optional-terminal-registry');
  const group = entries.find((entry) => entry.options.id === 'optional-persistent-terminals');
  assert.ok(registry && group);
  assert.equal(registry.fiber?.state, 2);
  assert.equal(group.fiber?.state, 2);
  assert.equal(group.options.isolate.terminals, true);
  const service = registry.context.get('terminals');
  assert.equal(ctx.get('terminals'), undefined, 'official isolation must remain intact');
  assert.ok(serviceIdentity(service) instanceof TerminalSessionService);
  assert.ok(service.listBackends().includes('shell'));
  const proof = {
    rootTerminalsAbsent: ctx.get('terminals') === undefined,
    registryName: registry.options.name, registryState: registry.fiber.state,
    groupName: group.options.name, groupState: group.fiber.state, isolated: group.options.isolate.terminals,
    parentEntryId: registry.parent.ctx.fiber.entry?.options?.id,
    parentFiberIsGroup: registry.parent.ctx.fiber === group.fiber,
    runtimeClass: registry.fiber.runtime === TerminalSessionService,
    runtimePlugin: registry.fiber.runtime?.plugin === TerminalSessionService,
    runtimeCallback: registry.fiber.runtime?.callback === TerminalSessionService,
    subgroupMatchesParent: group.subgroup === registry.parent,
    registrySameAgents: serviceIdentity(registry.context.get('agents')) === serviceIdentity(ctx.get('agents')),
    registryProfileMatches: registry.context.get('profileContext')?.dir === root,
    namespaceDefault: registry.moduleNamespace?.default === TerminalSessionService,
    backends: service.listBackends(),
  };
  console.log(JSON.stringify({ stage: 'terminal-context', proof }));
  return service;
}

async function stableCapabilities(instance) {
  const first = (await instance.rpc('control/capabilities', {})).controlCapabilities;
  assert.equal(Number.isSafeInteger(first.revision), true);
  for (let index = 0; index < 3; index++) {
    const again = (await instance.rpc('control/capabilities', {})).controlCapabilities;
    assert.equal(again.revision, first.revision, 'new Cordis proxy reads must not change the underlying composition revision');
    assert.deepEqual(again, first);
  }
  return first;
}

async function newOwner(instance) {
  const id = randomUUID();
  const handle = await instance.application.ctx.get('agents').create({ sessionId: id, meta: { cwd: directory },
    agentOptions: { provider: 'offline-fixture', model: 'offline' } });
  const record = { handle, closing: false, busy: false, cwd: directory };
  instance.sessions.set(id, record);
  return { id, record };
}

async function exerciseTerminal(instance, label) {
  const owner = await newOwner(instance);
  const other = await newOwner(instance);
  const terminal = (action, extra = {}, sessionId = owner.id) => instance.rpc('session/terminal', { sessionId, action, ...extra });
  const available = await terminal('availability');
  assert.equal(available.available, true);
  assert.ok(available.backends.includes('shell'));
  assert.equal(instance.controls.capabilities().controlCapabilities.terminal.spawn, true);
  const created = await terminal('spawn', { type: 'shell', name: `owned-${label}`, cwd: directory });
  const id = created.sessionId;
  assert.equal(typeof id, 'string');
  assert.ok(created.pid > 0);
  try {
    const sent = await terminal('send', { terminalId: id, text: `printf 'OWNED_TERMINAL_${label}\\n'`, submit: true });
    assert.match(sent.viewport, new RegExp(`OWNED_TERMINAL_${label}`));
    const read = await terminal('read', { terminalId: id, count: 100 });
    assert.match(JSON.stringify(read), new RegExp(`OWNED_TERMINAL_${label}`));
    const visible = await terminal('list');
    assert.equal(visible.terminals.some((row) => row.sessionId === id), true);
    assert.deepEqual((await terminal('list', {}, other.id)).terminals, []);
    await assert.rejects(terminal('read', { terminalId: id }, other.id));
    const signalled = await terminal('signal', { terminalId: id, signal: 'SIGINT' });
    assert.equal(signalled.delivered, true);
    assert.ok(signalled.targetPgid > 0);
    const afterSignal = await terminal('send', { terminalId: id, text: `printf 'AFTER_OWNED_SIGNAL_${label}\\n'`, submit: true });
    assert.match(afterSignal.viewport, new RegExp(`AFTER_OWNED_SIGNAL_${label}`));
  } finally {
    assert.equal((await terminal('kill', { terminalId: id, reason: 'owned integration complete' })).closed, true);
  }
  assert.deepEqual((await terminal('list')).terminals, []);
  assert.throws(() => process.kill(created.pid, 0));
  console.log(JSON.stringify({ stage: 'terminal-pty', label, spawn: true, read: true, send: true, signal: true, kill: true, foreignOwnerDenied: true }));
}

let instance = await start();
try {
  assert.equal(instance.application.ctx.get('terminals'), undefined);
  const before = await instance.rpc('config/extensions', { action: 'list' });
  assert.ok(before.bundles.some((entry) => entry.name === bundle), 'the shipped optional bundle is visible through the ordinary extension catalog');
  if (phase === 'verify-disabled') {
    const disabledManifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
    assert.equal(disabledManifest.dsh.profile.bundles.includes(bundle), false);
    assert.equal(instance.controls.capabilities().controlCapabilities.terminal.spawn, false);
  } else {
    if (phase !== 'reboot-disable') {
      assert.equal(instance.controls.capabilities().controlCapabilities.terminal.spawn, false);
      const enabled = await instance.rpc('config/extensions', { action: 'enable-bundle', name: bundle, enabled: true });
      assert.equal(enabled.result.changed, true);
      assert.equal(enabled.result.application, 'applied');
      console.log(JSON.stringify({ stage: 'terminal-enabled', result: enabled }));
    }
    const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
    assert.equal(manifest.dsh.profile.bundles[0], INHERITED_PACKAGE);
    assert.ok(manifest.dsh.profile.bundles.includes(bundle));
    assert.deepEqual(Object.keys(manifest.dependencies), [INHERITED_PACKAGE], 'installed bundle resolution does not duplicate or symlink packages');
    const originalTerminalService = serviceIdentity(contextProof(instance.application));
    const originalCapabilities = await stableCapabilities(instance);
    if (!contextOnly) await exerciseTerminal(instance, phase === 'reboot-disable' ? 'PROCESS_REBOOT' : 'FIRST');
    if (phase === 'reboot-disable') {
      await instance.rpc('config/extensions', { action: 'enable-bundle', name: bundle, enabled: false });
      await instance.rpc('config/extensions', { action: 'enable-bundle', name: bundle, enabled: true });
      const remountedTerminalService = serviceIdentity(contextProof(instance.application));
      assert.notEqual(remountedTerminalService, originalTerminalService, 'ordinary disable/re-enable must replace the underlying official registry');
      const remounted = await stableCapabilities(instance);
      const { revision: previousRevision, ...previousFlags } = originalCapabilities;
      const { revision: remountedRevision, ...remountedFlags } = remounted;
      assert.deepEqual(remountedFlags, previousFlags, 'method flags remain identical after official scope replacement');
      assert.ok(remountedRevision > previousRevision, 'identity replacement changes the revision even without observing disabled flags');
      console.log(JSON.stringify({ stage: 'terminal-revision', stableProxyReads: true, underlyingServiceChanged: true,
        flagsIdentical: true, previousRevision, remountedRevision }));
    }
    if (phase !== 'enable') {
      if (phase !== 'reboot-disable') {
        await instance.stop();
        instance = await start();
        contextProof(instance.application);
        if (!contextOnly) await exerciseTerminal(instance, 'RUNTIME_REBOOT');
      }
      if (!contextOnly) {
        const disabled = await instance.rpc('config/extensions', { action: 'enable-bundle', name: bundle, enabled: false });
        assert.equal(disabled.result.changed, true);
        assert.equal(disabled.result.application, 'applied');
        assert.equal(instance.controls.capabilities().controlCapabilities.terminal.spawn, false);
        assert.equal(instance.application.ctx.get('terminals'), undefined);
      }
    }
  }
  assert.equal(await readFile(path.join(source, 'cordis.patch.yml'), 'utf8'), sourceBefore);
  assert.equal(existsSync(dispatched), false);
  console.log(JSON.stringify({ ok: true, phase, proof: contextOnly ? 'official-isolated-terminal-context-persist-reboot' : 'official-terminal-enable-pty-persist-reboot-disable', directory, managedProfileRoot: root }));
} finally { await instance.stop(); }
