import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { chmod, lstat, mkdir, mkdtemp, readFile, realpath, symlink, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import { applyHeaderCredentialBridge, composeConfigurationPatches, INHERITED_PACKAGE, launchNativeRuntime, mergeConfiguration,
  openManagedProfile, originalPatches, readInheritedProfile, resolveHeaderCredentials, splitLaunchArguments,
  writeInheritedBundle } from '../../../../../assets/dsh/launcher.mjs';

// Fixtures are isolated outside the repository. No recursive cleanup or shared user profiles are used.
async function fixture() {
  const directory = await realpath(await mkdtemp(path.join(os.tmpdir(), 'opencodian-dsh-managed-test-')));
  const allowedRoot = path.join(directory, 'profiles');
  const vaultHash = createHash('sha256').update(path.join(directory, 'vault')).digest('hex');
  return { directory, location: { allowedRoot, vaultHash, profile: 'sdk', root: path.join(allowedRoot, vaultHash, 'sdk') } };
}
const minimalBoot = {
  composeEntries(layers) {
    const rows = [];
    for (const patch of layers.flat()) {
      if (patch.insert) rows.push(...structuredClone(patch.insert));
      else Object.assign(rows.find((row) => row.id === patch.id) ?? {}, structuredClone(patch));
    }
    return rows;
  },
};

test('guarded profiles persist package state and never link an inherited dependency tree', async () => {
  const { directory, location } = await fixture();
  const root = await openManagedProfile(location);
  const inherited = { patches: [{ insert: [{ id: 'model', name: '@fixture/model', config: { value: 1 } }] }] };
  await writeInheritedBundle(root, inherited, path.join(directory, 'absent-source'));
  assert.equal((await lstat(path.join(root, 'node_modules'))).isSymbolicLink(), false);
  const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  assert.deepEqual(manifest.dependencies, { [INHERITED_PACKAGE]: 'file:./.opencodian-inherited' });
  manifest.dependencies['fixture-extension'] = '1.2.3';
  manifest.dsh.profile.bundles.push('fixture-extension');
  await writeFile(path.join(root, 'package.json'), JSON.stringify(manifest));
  await writeFile(path.join(root, 'cordis.patch.yml'), '[{"id":"model","config":{"value":7}}]');
  await openManagedProfile(location);
  await writeInheritedBundle(root, inherited, path.join(directory, 'absent-source'));
  assert.equal(JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')).dependencies['fixture-extension'], '1.2.3');
  assert.equal(JSON.parse(await readFile(path.join(root, 'cordis.patch.yml'), 'utf8'))[0].config.value, 7);
  if (process.platform !== 'win32') {
    for (const file of ['package.json', '.opencodian-dsh-profile.json', 'cordis.patch.yml', '.opencodian-inherited/cordis.patch.yml'])
      assert.equal((await lstat(path.join(root, file))).mode & 0o777, 0o600);
  }
});

test('ownership rejects preexisting unmarked data, marker mismatch and symlink package roots', async () => {
  const first = await fixture();
  await mkdir(first.location.root, { recursive: true, mode: 0o700 });
  await writeFile(path.join(first.location.root, 'user.txt'), 'preserve');
  await assert.rejects(openManagedProfile(first.location), /not an empty owned/);
  const second = await fixture();
  const root = await openManagedProfile(second.location);
  await writeFile(path.join(root, '.opencodian-dsh-profile.json'), '{"owner":"other"}');
  await assert.rejects(openManagedProfile(second.location), /marker/);
  const third = await fixture();
  await mkdir(path.join(third.location.allowedRoot, third.location.vaultHash), { recursive: true, mode: 0o700 });
  const external = path.join(third.directory, 'external');
  await mkdir(external, { mode: 0o700 });
  await symlink(external, third.location.root, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(openManagedProfile(third.location), /unsafe/);
  assert.equal(existsSync(path.join(external, '.opencodian-dsh-profile.json')), false);
});

test('guard rejects source overlap, redirected patch files and writable ownership boundaries', async () => {
  const { directory, location } = await fixture();
  await assert.rejects(openManagedProfile(location, [directory]), /overlaps/);
  const root = await openManagedProfile(location);
  const target = path.join(directory, 'shared.yml');
  await writeFile(target, '[]');
  await symlink(target, path.join(root, 'cordis.patch.yml'));
  await assert.rejects(openManagedProfile(location), /unsafe/);
  assert.equal(await readFile(target, 'utf8'), '[]');
  if (process.platform !== 'win32') {
    const another = await fixture();
    await openManagedProfile(another.location);
    await chmod(another.location.root, 0o777);
    await assert.rejects(openManagedProfile(another.location), /unsafe/);
  }
});

test('sparse configuration preserves inherited maps and expressions, replacing arrays intentionally', () => {
  const base = { provider: 'inherited', nested: { keep: 1, items: [1, 2] }, expr: { __jsExpr: 'process.cwd()' } };
  assert.deepEqual(mergeConfiguration(base, { nested: { items: [3] } }), { ...base, nested: { keep: 1, items: [3] } });
  assert.deepEqual(base.nested.items, [1, 2]);
  assert.throws(() => mergeConfiguration(base, { expr: { x: 1 } }), /inherited expression/);
  assert.throws(() => mergeConfiguration({}, JSON.parse('{"__proto__":{"bad":1}}')), /protected/);
  assert.throws(() => mergeConfiguration({}, { models: [{ __jsExpr: 'untrusted()' }] }), /protected/);
});

test('configuration order includes inherited, managed, explicit patches then sparse defaults', () => {
  const layers = [[{ insert: [{ id: 'llm-pi-ai', config: { providers: { inherited: { baseURL: 'https://inherited.test' } } } }] }],
    [{ id: 'llm-pi-ai', config: { providers: { inherited: { baseURL: 'https://managed.test', models: [{ id: 'm' }] } } } }]];
  const patch = composeConfigurationPatches(minimalBoot, layers, [{ id: 'llm-pi-ai', config: { providers: { inherited: { timeoutMs: 99 } } } }]);
  assert.deepEqual(patch[0].config.providers.inherited, { baseURL: 'https://managed.test', models: [{ id: 'm' }], timeoutMs: 99 });
  assert.throws(() => composeConfigurationPatches(minimalBoot, layers, [{ id: 'absent', config: {} }]), /unavailable/);
  assert.throws(() => composeConfigurationPatches(minimalBoot, [...layers, [{ insert: [{ id: 'llm-pi-ai' }] }]], [{ id: 'llm-pi-ai', config: {} }]), /ambiguous/);
});

test('ACP maps only explicit saved provider/model defaults and resets to the inherited ACP row', () => {
  const acp = { provider: 'inherited-acp', model: 'acp-model', sessionListPageSize: 7, trusted: { __jsExpr: 'process.cwd()' } };
  const layers = [[{ insert: [
    { id: 'agent-default-model', config: { provider: 'base-agent', model: 'base-model', reasoningEffort: 'high' } },
    { id: 'acp', name: '@deepseek-ai/dsh-acp', inject: ['acpAppStartup'], config: acp },
  ] }]];
  const generate = (config, profile = 'acp') => composeConfigurationPatches(minimalBoot, layers,
    [{ id: 'agent-default-model', config }], profile);
  const requested = { provider: 'saved-provider', model: 'saved-model', reasoningEffort: 'low' };
  assert.deepEqual(generate(requested).find((row) => row.id === 'acp'), {
    id: 'acp', config: { ...acp, provider: 'saved-provider', model: 'saved-model' },
  });
  assert.deepEqual(generate({ provider: 'saved-provider' }).find((row) => row.id === 'acp').config,
    { ...acp, provider: 'saved-provider' });
  assert.deepEqual(generate({ model: 'saved-model' }).find((row) => row.id === 'acp').config,
    { ...acp, model: 'saved-model' });
  for (const config of [{}, { reasoningEffort: 'low' }]) assert.equal(generate(config).some((row) => row.id === 'acp'), false);
  assert.deepEqual(composeConfigurationPatches(minimalBoot, layers, [], 'acp'), []);
  assert.equal(generate(requested, 'sdk').some((row) => row.id === 'acp'), false);
  assert.deepEqual(layers[0][0].insert[1].config, acp);
  assert.throws(() => composeConfigurationPatches(minimalBoot, [[{ insert: [layers[0][0].insert[0]] }]],
    [{ id: 'agent-default-model', config: { model: 'saved-model' } }], 'acp'), /unavailable or ambiguous: acp/);
  assert.throws(() => composeConfigurationPatches(minimalBoot, [...layers, [{ insert: [layers[0][0].insert[1]] }]],
    [{ id: 'agent-default-model', config: { model: 'saved-model' } }], 'acp'), /unavailable or ambiguous: acp/);
});

test('controlled argument extraction preserves patch order and refuses profile mutation', () => {
  const result = splitLaunchArguments(['--patch', './a.yml', '--quiet', '--patch=./b.yml']);
  assert.deepEqual(result.patchFiles, [path.resolve('a.yml'), path.resolve('b.yml')]);
  assert.deepEqual(result.appArgs, ['--quiet']);
  for (const args of [['--patch'], ['--patch='], ['--patch', '--quiet'], ['--profile=sdk'], ['--from-default-profile', 'sdk']])
    assert.throws(() => splitLaunchArguments(args));
});

test('credential bridge persists only fixed expressions and resolves again on each mount', async () => {
  const { directory } = await fixture();
  const layers = [[{ insert: [{ id: 'llm-pi-ai', inject: ['llm'], config: { providers: { proxy: { headers: { 'X-Client': 'fixture' } } } } }] }]];
  const controlled = [];
  await applyHeaderCredentialBridge(minimalBoot, layers, controlled, { proxy: { Authorization: 'PROXY_AUTH' } }, directory);
  assert.equal(controlled[0].inject.opencodianHeaderCredentials, null);
  const expression = controlled[0].config.providers.proxy.headers.Authorization.__jsExpr;
  assert.equal(expression, `ctx.get('opencodianHeaderCredentials').headers["proxy"]["Authorization"]`);
  const script = await readFile(path.join(directory, 'header-credentials.mjs'), 'utf8');
  assert.match(script, /credentials\.resolve\(ref\)/);
  const values = [];
  let calls = 0;
  const ctx = { get: () => ({ resolve: async () => ({ value: `fixture-value-${++calls}`, source: 'fixture' }) }), provide: (_, result) => values.push(result.headers.proxy.Authorization) };
  await resolveHeaderCredentials(ctx, { proxy: { Authorization: 'PROXY_AUTH' } });
  await resolveHeaderCredentials(ctx, { proxy: { Authorization: 'PROXY_AUTH' } });
  assert.deepEqual(values, ['fixture-value-1', 'fixture-value-2']);
  assert.doesNotMatch(script, /fixture-value-/);
  assert.doesNotMatch(JSON.stringify(controlled), /fixture-value-/);
  await assert.rejects(resolveHeaderCredentials({ get: () => ({ resolve: async () => { throw new Error('PRIVATE'); } }) }, { proxy: { Authorization: 'PROXY_AUTH' } }),
    (error) => error.message === 'Harness provider header credential could not be resolved');
});

const publicInstall = process.env.DSH_PUBLIC_INSTALL;
const integration = { skip: !publicInstall && 'DSH_PUBLIC_INSTALL not set; public upstream integration is opt-in' };
async function upstream() {
  const anchor = path.join(publicInstall, 'lib', 'bin.js');
  const requireNative = createRequire(anchor);
  const boot = await import(pathToFileURL(requireNative.resolve('@deepseek-ai/dsh-app-boot')).href);
  const profileBoot = await import(pathToFileURL(path.join(publicInstall, 'lib', 'profile-boot.js')).href);
  return { boot, ...profileBoot };
}

test('public DSH parser preserves original relative paths and JS AST through durable reload', integration, async () => {
  const { boot, INSTALL_ANCHOR } = await upstream();
  const { directory, location } = await fixture();
  const source = path.join(directory, 'source');
  await mkdir(source, { mode: 0o700 });
  const manifest = '{"name":"fixture-sdk","dependencies":{"must-not-copy":"9"},"dsh":{"profile":{"bundles":[]}}}';
  await writeFile(path.join(source, 'package.json'), manifest);
  await writeFile(path.join(source, 'cordis.patch.yml'), '- insert:\n    - id: fixture\n      name: ./relative.mjs\n      config:\n        cwd: !!js process.cwd()\n        stable: 1\n');
  const parsed = originalPatches(boot, path.join(source, 'cordis.patch.yml'));
  assert.equal(parsed[0].insert[0].name, pathToFileURL(path.join(source, 'relative.mjs')).href);
  assert.deepEqual(parsed[0].insert[0].config.cwd, { __jsExpr: 'process.cwd()' });
  const root = await openManagedProfile(location);
  await writeInheritedBundle(root, readInheritedProfile(boot, source, INSTALL_ANCHOR, {}), source);
  const loaded = boot.loadProfileDirectory('dsh', root, INSTALL_ANCHOR);
  assert.deepEqual(loaded.skippedBundles, []);
  assert.equal(loaded.dir, root);
  const controlled = composeConfigurationPatches(boot, loaded.layers.map((layer) => layer.patches), [{ id: 'fixture', config: { changed: 2 } }]);
  const composed = boot.composeEntries([...loaded.layers.map((layer) => layer.patches), controlled]);
  assert.deepEqual(composed[0].config, { cwd: { __jsExpr: 'process.cwd()' }, stable: 1, changed: 2 });
  assert.equal(await readFile(path.join(source, 'package.json'), 'utf8'), manifest);
  assert.equal(existsSync(path.join(root, 'node_modules', '@deepseek-ai')), false);
  const resolution = await boot.createRuntimeResolution({ installAnchor: INSTALL_ANCHOR, profile: loaded, home: directory });
  assert.ok(resolution.entries.some((entry) => entry.name === '@deepseek-ai/cordis' && entry.scope === 'installation'));
});

test('installed package name assertions and nested include bases retain source semantics', integration, async () => {
  const { boot, INSTALL_ANCHOR } = await upstream();
  const { directory, location } = await fixture();
  const source = path.join(directory, 'source');
  await mkdir(source, { mode: 0o700 });
  await writeFile(path.join(source, 'package.json'), JSON.stringify({ dsh: { profile: { bundles: ['@deepseek-ai/dsh-base'] } } }));
  await writeFile(path.join(source, 'cordis.patch.yml'), '- id: tool-fs\n  name: "@deepseek-ai/dsh-tool-fs"\n  disabled: true\n- insert:\n    - id: nested\n      name: cordis:include\n      config:\n        path: ./initial.yml\n- id: nested\n  config:\n    path: ./extra.yml\n');
  await writeFile(path.join(source, 'extra.yml'), '[]\n');
  const inherited = readInheritedProfile(boot, source, INSTALL_ANCHOR, {});
  const rows = boot.composeEntries([inherited.patches]);
  assert.equal(rows.find((row) => row.id === 'tool-fs').name, '@deepseek-ai/dsh-tool-fs');
  assert.equal(rows.find((row) => row.id === 'tool-fs').disabled, true);
  assert.equal(rows.find((row) => row.id === 'nested').config.path, path.join(source, 'extra.yml'));
  const root = await openManagedProfile(location);
  await writeInheritedBundle(root, inherited, source);
  const reload = boot.loadProfileDirectory('dsh', root, INSTALL_ANCHOR);
  const effective = boot.composeEntries(reload.layers.map((layer) => layer.patches));
  assert.equal(effective.find((row) => row.id === 'tool-fs').disabled, true);
  assert.equal(effective.find((row) => row.id === 'nested').config.path, path.join(source, 'extra.yml'));
});

test('complete installed launcher orders library defaults before the protected bridge and rejects bridge collisions', integration, async () => {
  const { directory, location } = await fixture();
  const source = path.join(directory, 'home', 'profiles', 'sdk');
  const scope = path.join(directory, 'launch');
  await mkdir(source, { recursive: true, mode: 0o700 });
  await mkdir(scope, { mode: 0o700 });
  const plugin = path.join(source, 'fixture.mjs');
  await writeFile(plugin, 'export default async function (ctx, config) { ctx.provide(config.service, config); }');
  await writeFile(path.join(source, 'extra.yml'), JSON.stringify([{ id: 'nested-probe', name: plugin, config: { service: 'fixtureNested', source: true } }]));
  await writeFile(path.join(source, 'package.json'), JSON.stringify({ dsh: { profile: { bundles: [] } } }));
  await writeFile(path.join(source, 'compatibility.json'), '{"fixture-package@1.0.0":["0.2.2-rc.1"]}');
  await writeFile(path.join(source, 'cordis.patch.yml'), JSON.stringify([{ insert: [
    { id: 'agent-default-model', name: './fixture.mjs', config: { service: 'fixtureModel', provider: 'inherited', model: 'source' } },
    { id: 'sdk-jsonrpc-server', name: './fixture.mjs', config: { service: 'mustBeDisabled' } },
    { id: 'source-nested', name: 'cordis:include', config: { path: './initial.yml' } },
  ] }, { id: 'source-nested', config: { path: './extra.yml' } }]));
  const explicit = path.join(directory, 'explicit.yml');
  await writeFile(explicit, JSON.stringify([{ id: 'agent-default-model', config: { service: 'fixtureModel', provider: 'explicit', model: 'patched' } }]));
  await writeFile(path.join(scope, 'native.patch.yml'), JSON.stringify([
    { id: 'sdk-jsonrpc-server', disabled: true },
    { insert: [{ id: 'opencodian-native', name: plugin, config: { service: 'fixtureBridge', protected: true } }] },
  ]));
  const cwd = process.cwd();
  const home = process.env.DSH_HOME;
  process.env.DSH_HOME = path.join(directory, 'home');
  process.chdir(directory);
  try {
    const launch = { nativeAnchor: path.join(publicInstall, 'lib', 'bin.js'), scope, args: ['--patch', explicit], managedProfile: location,
      configuration: [{ id: 'agent-default-model', config: { reasoningEffort: 'high' } }] };
    const result = await launchNativeRuntime(launch);
    try {
      assert.deepEqual(result.ctx.get('fixtureModel'), { service: 'fixtureModel', provider: 'explicit', model: 'patched', reasoningEffort: 'high' });
      assert.equal(result.ctx.get('fixtureBridge').protected, true);
      assert.equal(result.ctx.get('fixtureNested').source, true);
      assert.equal(result.ctx.get('mustBeDisabled'), undefined);
      assert.equal(await readFile(path.join(location.root, 'compatibility.json'), 'utf8'), await readFile(path.join(source, 'compatibility.json'), 'utf8'));
      assert.equal(await readFile(path.join(location.root, 'cordis.patch.yml'), 'utf8'), '[]\n');
    } finally { await result.ctx.fiber.dispose(); }
    await writeFile(explicit, JSON.stringify([{ insert: [{ id: 'opencodian-native', name: plugin }] }]));
    await assert.rejects(launchNativeRuntime(launch), /protected bridge row/);
  } finally {
    process.chdir(cwd);
    if (home === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = home;
  }
});

async function withInstalledAcp(filename, directory, operation) {
  const child = spawn(process.execPath, [filename], { cwd: directory, stdio: ['pipe', 'pipe', 'pipe'], env: {
    PATH: process.env.PATH ?? '', HOME: directory, DSH_HOME: path.join(directory, 'home'), DSH_TELEMETRY_DISABLED: '1',
    XDG_CONFIG_HOME: path.join(directory, '.config'), XDG_DATA_HOME: path.join(directory, '.local', 'share'),
  } });
  let input = '';
  let stderr = '';
  let nextId = 0;
  const pending = new Map();
  const exited = new Promise((resolve) => child.once('exit', (code, signal) => {
    for (const request of pending.values()) request.reject(new Error(`Isolated ACP exited (${code}, ${signal}): ${stderr}`));
    resolve({ code, signal });
  }));
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-8192); });
  child.stdout.on('data', (chunk) => {
    input += chunk;
    for (;;) {
      const end = input.indexOf('\n');
      if (end < 0) break;
      const line = input.slice(0, end); input = input.slice(end + 1);
      if (!line.trim()) continue;
      let frame;
      try { frame = JSON.parse(line); }
      catch { for (const request of pending.values()) request.reject(new Error('Isolated ACP emitted a non-JSON frame')); continue; }
      const request = pending.get(frame.id);
      if (!request) continue;
      pending.delete(frame.id);
      if (frame.error) request.reject(new Error(`Isolated ACP request failed: ${frame.error.message}`));
      else request.resolve(frame.result);
    }
  });
  const request = (method, params) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`Isolated ACP ${method} timed out: ${stderr}`)); }, 15_000);
    pending.set(id, { resolve: (value) => { clearTimeout(timeout); resolve(value); }, reject: (error) => { clearTimeout(timeout); reject(error); } });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
  try { await operation(request); }
  finally {
    child.stdin.end();
    const timeout = setTimeout(() => child.kill('SIGKILL'), 6_000);
    const exit = await exited;
    clearTimeout(timeout);
    assert.equal(exit.code, 0, `Isolated ACP failed to stop cleanly (${exit.signal}): ${stderr}`);
  }
}

test('installed ACP creates sessions with saved defaults and restores explicit inherited ACP defaults after reset', integration, async () => {
  const { directory, location } = await fixture();
  const acpLocation = { ...location, profile: 'acp', root: path.join(location.allowedRoot, location.vaultHash, 'acp') };
  const source = path.join(directory, 'home', 'profiles', 'acp');
  await mkdir(source, { recursive: true, mode: 0o700 });
  const anchor = path.join(publicInstall, 'lib', 'bin.js');
  const llm = pathToFileURL(createRequire(anchor).resolve('@deepseek-ai/dsh-llm')).href;
  const provider = path.join(source, 'offline-provider.mjs');
  const attempts = path.join(directory, 'forbidden-model-dispatch');
  await writeFile(provider, `import { LlmAdapter } from ${JSON.stringify(llm)};
    import { writeFileSync } from 'node:fs';
    class OfflineProvider extends LlmAdapter {
      async listModels(provider) { return ['inherited-model','saved-model'].map(id => ({provider,id,name:id,inputModalities:['text']})); }
      async resolveModel(provider, model) { return {provider,id:model,name:model,inputModalities:['text'],context:{contextWindow:32000}}; }
      async *stream() { writeFileSync(${JSON.stringify(attempts)}, 'attempted'); throw new Error('Offline ACP fixture forbids model requests'); }
    }
    export const inject = ['llm'];
    export async function apply(ctx) { ctx.llm.registerAdapter(['inherited-acp','saved-provider','base-agent'], new OfflineProvider()); }
  `, { mode: 0o600 });
  await writeFile(path.join(source, 'package.json'), JSON.stringify({ name: 'owned-acp-profile', private: true,
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-acp-app'] } } }), { mode: 0o600 });
  const sourcePatch = JSON.stringify([
    { id: 'llm-deepseek', disabled: true }, { id: 'llm-pi-ai', disabled: true },
    { insert: [{ id: 'offline-provider', name: './offline-provider.mjs', inject: ['llm'] }] },
    { id: 'agent-default-model', config: { provider: 'base-agent', model: 'saved-model' } },
    { id: 'acp', name: '@deepseek-ai/dsh-acp', config: { provider: 'inherited-acp', model: 'inherited-model', sessionListPageSize: 7 } },
  ]);
  await writeFile(path.join(source, 'cordis.patch.yml'), sourcePatch, { mode: 0o600 });
  const settings = path.join(directory, 'saved-configuration.json');
  const cases = [
    { name: 'inherit', defaults: undefined, expected: ['inherited-acp', 'inherited-model'] },
    { name: 'saved', defaults: { provider: 'saved-provider', model: 'saved-model' }, expected: ['saved-provider', 'saved-model'] },
    { name: 'provider-only', defaults: { provider: 'saved-provider' }, expected: ['saved-provider', 'inherited-model'] },
    { name: 'model-only', defaults: { model: 'saved-model' }, expected: ['inherited-acp', 'saved-model'] },
    { name: 'reset', defaults: undefined, expected: ['inherited-acp', 'inherited-model'] },
  ];
  for (const scenario of cases) {
    await writeFile(settings, JSON.stringify({ version: 1, overrides: scenario.defaults ? { 'agent-default-model': scenario.defaults } : {} }), { mode: 0o600 });
    const scope = path.join(directory, `launch-${scenario.name}`);
    await mkdir(scope, { mode: 0o700 });
    const launcher = path.join(scope, 'launch.mjs');
    await writeFile(launcher, `import { launchNativeRuntime } from ${JSON.stringify(new URL('../../../../../assets/dsh/launcher.mjs', import.meta.url).href)};
      import { readFile } from 'node:fs/promises';
      const saved = JSON.parse(await readFile(${JSON.stringify(settings)}, 'utf8'));
      await launchNativeRuntime({nativeAnchor:${JSON.stringify(anchor)},scope:${JSON.stringify(scope)},args:[],
        managedProfile:${JSON.stringify(acpLocation)},configuration:Object.entries(saved.overrides).map(([id,config]) => ({id,config}))});
    `, { mode: 0o600 });
    await withInstalledAcp(launcher, directory, async (request) => {
      const handshake = await request('initialize', { protocolVersion: 1, clientCapabilities: {}, clientInfo: { name: 'offline-ACP-probe', version: '1' } });
      assert.equal(handshake.agentInfo.name, 'deepseek-harness-acp');
      assert.equal(handshake.nativeProtocol, undefined);
      const first = await request('session/new', { cwd: directory, mcpServers: [] });
      assert.deepEqual(JSON.parse(first.configOptions.find((option) => option.id === 'model').currentValue), scenario.expected, scenario.name);
      const changed = await request('session/set_config_option', { sessionId: first.sessionId, configId: 'model', value: JSON.stringify(['base-agent', 'saved-model']) });
      assert.deepEqual(JSON.parse(changed.configOptions.find((option) => option.id === 'model').currentValue), ['base-agent', 'saved-model']);
      const second = await request('session/new', { cwd: directory, mcpServers: [] });
      assert.deepEqual(JSON.parse(second.configOptions.find((option) => option.id === 'model').currentValue), scenario.expected, `${scenario.name}: new session`);
      await request('session/close', { sessionId: first.sessionId });
      await request('session/close', { sessionId: second.sessionId });
    });
    if (scenario.defaults) {
      const patches = JSON.parse(await readFile(path.join(scope, 'configuration.patch.yml'), 'utf8'));
      assert.deepEqual(patches.find((row) => row.id === 'acp').config,
        { provider: scenario.expected[0], model: scenario.expected[1], sessionListPageSize: 7 });
    } else assert.equal(existsSync(path.join(scope, 'configuration.patch.yml')), false);
    assert.equal(await readFile(path.join(acpLocation.root, 'cordis.patch.yml'), 'utf8'), '[]\n');
    assert.equal(await readFile(path.join(source, 'cordis.patch.yml'), 'utf8'), sourcePatch);
    assert.equal(existsSync(path.join(scope, 'native.patch.yml')), false);
  }
  assert.equal(existsSync(attempts), false);
});

test('public runProfile mounts credential dependency before provider and ConfigEditor persists only managed edits', integration, async () => {
  const { boot, runProfile, INSTALL_ANCHOR } = await upstream();
  const { directory, location } = await fixture();
  process.env.DSH_HOME = path.join(directory, 'isolated-home');
  const root = await openManagedProfile(location);
  const providerFile = path.join(directory, 'provider.mjs');
  const credentialsFile = path.join(directory, 'credentials.mjs');
  await writeFile(providerFile, 'export default async function (ctx, config) { ctx.provide(config.service ?? "fixtureProvider", config); }');
  await writeFile(credentialsFile, 'export default async function (ctx) { await new Promise(r => setTimeout(r, 10)); ctx.provide("credentials", {resolve: async () => ({value:"synthetic-header",source:"fixture"})}); }');
  const inherited = { patches: [{ insert: [
    { id: 'credentials', name: credentialsFile },
    { id: 'llm-pi-ai', name: providerFile, config: { providers: { proxy: { headers: {} } }, inherited: 1 } },
    { id: 'config-editor', name: '@deepseek-ai/dsh-config-editor' },
    { id: 'fixture-settings', name: providerFile, config: { service: 'fixtureEditable', count: 1 } },
  ] }] };
  await writeInheritedBundle(root, inherited, path.join(directory, 'absent-source'));
  const profile = boot.loadProfileDirectory('dsh', root, INSTALL_ANCHOR);
  const controlled = [];
  await applyHeaderCredentialBridge(boot, profile.layers.map((layer) => layer.patches), controlled, { proxy: { Authorization: 'PROXY_AUTH' } }, directory);
  const overlay = path.join(directory, 'controlled.yml');
  await writeFile(overlay, JSON.stringify(controlled));
  const result = await runProfile({ environment: new Map(), profile: 'sdk', patchFiles: [overlay], args: [], resolvedProfile: { profile, installAnchor: INSTALL_ANCHOR } });
  try {
    assert.equal(result.ctx.get('fixtureProvider')?.providers.proxy.headers.Authorization, 'synthetic-header');
    assert.equal(result.ctx.get('profileContext').dir, root);
    assert.equal(result.ctx.get('configEditor').documentPath, path.join(root, 'cordis.patch.yml'));
    assert.equal(await readFile(path.join(root, 'cordis.patch.yml'), 'utf8'), '[]\n');
    assert.doesNotMatch(await readFile(overlay, 'utf8'), /synthetic-header/);
    const editor = result.ctx.get('configEditor');
    const editable = editor.entries().find((entry) => entry.options.id === 'fixture-settings');
    assert.ok(editable);
    await editor.edit(editable, (current) => ({ ...current, count: 2 }));
    assert.equal(result.ctx.get('fixtureEditable').count, 2);
    const persisted = await readFile(path.join(root, 'cordis.patch.yml'), 'utf8');
    assert.match(persisted, /count: 2/);
    assert.doesNotMatch(persisted, /opencodian-header-credentials|synthetic-header|Authorization/);
  } finally { await result.ctx.fiber.dispose(); }
  // A fresh disk reload still owns the source layer, with no bridge rows baked into it.
  const reloaded = boot.loadProfileDirectory('dsh', root, INSTALL_ANCHOR);
  const rows = boot.composeEntries([...reloaded.layers.map((layer) => layer.patches), reloaded.patches]);
  assert.equal(rows.find((row) => row.id === 'fixture-settings').config.count, 2);
  assert.equal(rows.filter((row) => row.id === 'llm-pi-ai').length, 1);
  assert.equal(rows.some((row) => row.id === 'opencodian-header-credentials'), false);
});
