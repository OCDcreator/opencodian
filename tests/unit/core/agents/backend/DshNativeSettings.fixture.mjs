import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createControlRuntime } from '../../../../../assets/dsh/control.mjs';
import { openManagedProfile, writeInheritedBundle } from '../../../../../assets/dsh/launcher.mjs';

// The parent supplies a fresh local fixture and a credential-free environment.
const install = process.argv[2];
const directory = await realpath(process.argv[3]);
const requireNative = createRequire(path.join(install, 'lib', 'bin.js'));
const load = (name) => import(pathToFileURL(requireNative.resolve(name)).href);
const boot = await load('@deepseek-ai/dsh-app-boot');
const { runProfile, INSTALL_ANCHOR } = await import(pathToFileURL(path.join(install, 'lib', 'profile-boot.js')).href);
const { redactSecrets } = await load('@deepseek-ai/dsh-settings');
const { isVolatile } = await load('@deepseek-ai/cosmokit');
const { symbols: cordisSymbols } = await load('@deepseek-ai/cordis');
const serviceIdentity = (service) => service?.[cordisSymbols.original] ?? service;
const plainConfig = (value) => isVolatile(value) ? plainConfig(value.get()) : Array.isArray(value) ? value.map(plainConfig)
  : value !== null && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, plainConfig(entry)])) : value;
const location = { allowedRoot: path.join(directory, 'profiles'), vaultHash: 'b'.repeat(64), profile: 'sdk',
  root: path.join(directory, 'profiles', 'b'.repeat(64), 'sdk') };
const root = await openManagedProfile(location);
const plugins = path.join(directory, 'plugins');
await mkdir(plugins, { mode: 0o700 });
const extensionFile = path.join(plugins, 'sample-extension.mjs');
const schemastery = pathToFileURL(requireNative.resolve('@deepseek-ai/schemastery')).href;
await writeFile(extensionFile, `import z from ${JSON.stringify(schemastery)};
export const name = 'fixture-extension';
export const Config = z.object({items:z.array(z.string()).default(['base-a','base-b']).volatile(),arrayGroup:z.object({items:z.array(z.string()).default(['nested-a','nested-b']),sibling:z.string().default('nested-inherited')}).volatile(),enabled:z.boolean().default(true).volatile(),timeoutMs:z.number().min(1).max(60000).default(1000).volatile(),label:z.string().volatile(), nested:z.object({public:z.number().default(1),password:z.string().role('secret')}).volatile(),restartOnly:z.number().default(3)});
export async function apply(ctx, config) { ctx.provide('fixtureExtension',config); }
`, { mode: 0o600 });
const coreFile = path.join(plugins, 'sample-core.mjs');
await writeFile(coreFile, `import z from ${JSON.stringify(schemastery)}; export const Config=z.object({auto:z.boolean().default(true),apiKey:z.string().role('secret')}); export async function apply(ctx,config){ctx.provide('fixtureCore',config);}`, { mode: 0o600 });
await writeInheritedBundle(root, { patches: [{ insert: [
  { id: 'config-editor', name: '@deepseek-ai/dsh-config-editor' },
  { id: 'settings', name: '@deepseek-ai/dsh-settings' },
  { id: 'plugin-manager', name: '@deepseek-ai/dsh-plugin-manager' },
  { id: 'sample-extension', name: extensionFile, config: { timeoutMs: 1000, nested: { public: 1, password: 'synthetic-only-secret' } } },
  { id: 'compaction-basic', name: coreFile, config: { auto: false, apiKey: 'synthetic-core-secret' } },
] }] }, path.join(directory, 'absent-inheritance'));
async function start(patchFiles = []) {
  const profile = boot.loadProfileDirectory('dsh', root, INSTALL_ANCHOR);
  const application = await runProfile({ environment: new Map(), profile: 'sdk', patchFiles, args: [],
    resolvedProfile: { profile, installAnchor: INSTALL_ANCHOR } });
  const controls = createControlRuntime(application.ctx, { managedProfileRoot: root, nativeConfigRevision: 'fixture' }, {
    sessions: new Map(), requireSession() { throw new Error('no chat session'); }, update() {}, notify() {}, redactSecrets, plainConfig, serviceIdentity,
  });
  return { application, controls, rpc: (method, params) => controls.methods[method](params),
    stop: async () => { await controls.dispose(); await application.ctx.fiber.dispose(); } };
}
let instance = await start();
try {
  assert.ok(instance.application.ctx.get('settings'));
  assert.ok(instance.application.ctx.get('configEditor'));
  assert.ok(instance.application.ctx.get('pluginManager'));
  assert.equal(instance.controls.capabilities().configurationCapabilities.extensionSettings.mutate, true);
  const described = await instance.rpc('config/describe', { namespaces: ['sample-extension', 'compaction-basic'] });
  const form = described.forms.find((entry) => entry.ns === 'sample-extension');
  assert.ok(form, 'actual native SettingsForms returns the loaded extension');
  assert.equal(form.writable, true);
  assert.equal(form.persistenceSource, 'managed-profile');
  assert.equal(JSON.stringify(described).includes('synthetic-only-secret'), false);
  const observation = described.observations.find((entry) => entry.ns === 'compaction-basic');
  assert.equal(observation.status, 'verified'); assert.equal(observation.value.auto, false);
  assert.equal(JSON.stringify(observation).includes('synthetic-core-secret'), false);
  const arrayChanged = await instance.rpc('config/extension-settings', { action: 'mutate', ns: 'sample-extension', expectedRevision: form.revision,
    ops: [{ op: 'set', path: ['items', '0'], value: 'edited' }, { op: 'set', path: ['arrayGroup', 'items', '1'], value: 'nested-edit' }] });
  assert.deepEqual(arrayChanged.form.value.items, ['edited', 'base-b']);
  assert.deepEqual(arrayChanged.form.user.items, ['edited', 'base-b']);
  assert.deepEqual(arrayChanged.form.value.arrayGroup, { items: ['nested-a', 'nested-edit'], sibling: 'nested-inherited' });
  assert.equal(arrayChanged.application.status, 'verified', 'native inherited array index set is verified');
  const arraySpliced = await instance.rpc('config/extension-settings', { action: 'mutate', ns: 'sample-extension', expectedRevision: arrayChanged.form.revision,
    ops: [{ op: 'unset', path: ['items', '0'] }, { op: 'unset', path: ['arrayGroup', 'items', '0'] }] });
  assert.deepEqual(arraySpliced.form.value.items, ['base-b']);
  assert.deepEqual(arraySpliced.form.value.arrayGroup, { items: ['nested-edit'], sibling: 'nested-inherited' });
  assert.equal(arraySpliced.application.status, 'verified');
  const arrayReset = await instance.rpc('config/extension-settings', { action: 'mutate', ns: 'sample-extension', expectedRevision: arraySpliced.form.revision,
    ops: [{ op: 'unset', path: ['items'] }, { op: 'unset', path: ['arrayGroup'] }] });
  assert.deepEqual(arrayReset.form.value.items, ['base-a', 'base-b']);
  assert.deepEqual(arrayReset.form.value.arrayGroup, { items: ['nested-a', 'nested-b'], sibling: 'nested-inherited' });
  assert.equal(arrayReset.application.status, 'verified');
  form.revision = arrayReset.form.revision;
  const file = path.join(root, 'cordis.patch.yml');
  const original = await readFile(file, 'utf8');
  for (const [target, ops] of [
    ['sample-extension', [{ op: 'set', path: ['nested'], value: { public: 2 } }]],
    ['sample-extension', [{ op: 'set', path: ['nested', 'password'], value: 'replacement-secret' }]],
    ['sample-extension', [{ op: 'set', path: ['restartOnly'], value: 8 }]],
    ['sample-extension', [{ op: 'set', path: ['label'], value: { __jsExpr: 'unsafe()' } }]],
    ['compaction-basic', [{ op: 'set', path: ['auto'], value: true }]],
    ['unknown-extension', [{ op: 'set', path: ['enabled'], value: false }]],
  ]) await assert.rejects(instance.rpc('config/extension-settings', { action: 'mutate', ns: target, ops, expectedRevision: form.revision }));
  assert.equal(await readFile(file, 'utf8'), original);
  const changed = await instance.rpc('config/extension-settings', { action: 'mutate', ns: 'sample-extension', expectedRevision: form.revision,
    ops: [{ op: 'set', path: ['timeoutMs'], value: 2500 }, { op: 'set', path: ['nested', 'public'], value: 4 }] });
  assert.equal(changed.form.value.timeoutMs, 2500); assert.equal(changed.form.value.nested.public, 4);
  assert.equal(changed.persistence.status, 'verified'); assert.equal(changed.application.status, 'verified', JSON.stringify({ before: form, after: changed }));
  assert.equal(instance.application.ctx.get('fixtureExtension').timeoutMs.get(), 2500);
  let persisted = await readFile(file, 'utf8');
  assert.match(persisted, /timeoutMs: 2500/);
  await assert.rejects(instance.rpc('config/extension-settings', { action: 'mutate', ns: 'sample-extension', expectedRevision: form.revision,
    ops: [{ op: 'set', path: ['timeoutMs'], value: 3000 }] }), /SETTINGS_CONFLICT/);
  assert.equal(await readFile(file, 'utf8'), persisted);
  const readExtension = () => instance.application.ctx.get('settings').describe({ redactSecrets: true }).find((entry) => entry.ns === 'sample-extension');
  const editExtension = (ops) => instance.rpc('config/extension-settings', { action: 'mutate', ns: 'sample-extension',
    expectedRevision: readExtension().revision, ops });
  await editExtension([{ op: 'set', path: ['label'], value: 'temporary' }, { op: 'set', path: ['enabled'], value: false }]);
  const unset = await editExtension([{ op: 'unset', path: ['label'] }, { op: 'unset', path: ['enabled'] }, { op: 'unset', path: ['timeoutMs'] }]);
  assert.equal(Object.hasOwn(unset.form.value, 'label'), false);
  assert.equal(Object.hasOwn(unset.form.user, 'label'), false);
  assert.equal(Object.hasOwn(unset.form.user, 'enabled'), false);
  assert.equal(unset.form.value.enabled, true, 'schema default becomes effective after user-layer deletion');
  assert.equal(unset.form.value.timeoutMs, 1000, 'explicit inherited value becomes effective');
  assert.equal(unset.form.user.timeoutMs, 1000, 'native whole-section persistence materializes inherited value while another sibling differs');
  assert.equal(unset.application.status, 'verified');
  await editExtension([{ op: 'set', path: ['label'], value: 'temporary' }]);
  const nativeSettings = instance.application.ctx.get('settings');
  const nativeMutate = nativeSettings.mutate.bind(nativeSettings);
  nativeSettings.mutate = async (ns, ops, expectedRevision) => {
    await nativeMutate(ns, ops, expectedRevision);
    await nativeMutate(ns, [{ op: 'set', path: ['label'], value: 'concurrent-rewrite' }], readExtension().revision);
  };
  try {
    const raced = await editExtension([{ op: 'unset', path: ['label'] }]);
    assert.equal(raced.form.value.label, 'concurrent-rewrite');
    assert.equal(raced.persistence.status, 'verified');
    assert.equal(raced.readback.status, 'verified');
    assert.equal(raced.application.status, 'unavailable', 'real native concurrent commit must not verify the unset');
  } finally { nativeSettings.mutate = nativeMutate; }
  nativeSettings.mutate = async (ns, ops, expectedRevision) => {
    await nativeMutate(ns, ops, expectedRevision);
    await nativeMutate(ns, [{ op: 'set', path: ['items', '0'], value: 'concurrent-array-rewrite' }], readExtension().revision);
  };
  try {
    const raced = await editExtension([{ op: 'set', path: ['items', '0'], value: 'intended-array-edit' }]);
    assert.deepEqual(raced.form.value.items, ['concurrent-array-rewrite', 'base-b']);
    assert.equal(raced.persistence.status, 'verified'); assert.equal(raced.readback.status, 'verified');
    assert.equal(raced.application.status, 'unavailable', 'real native second array commit remains unverified');
  } finally { nativeSettings.mutate = nativeMutate; }
  await editExtension([{ op: 'set', path: ['timeoutMs'], value: 2500 }, { op: 'unset', path: ['label'] }, { op: 'unset', path: ['items'] }]);
  persisted = await readFile(file, 'utf8');
  await instance.stop();
  instance = await start();
  const reopened = await instance.rpc('config/describe', { namespaces: ['sample-extension'] });
  assert.equal(reopened.forms[0].value.timeoutMs, 2500);
  assert.equal(reopened.forms[0].value.nested.public, 4);
  assert.equal(instance.application.ctx.get('fixtureExtension').nested.get().password, 'synthetic-only-secret');
  await instance.stop();
  const overlay = path.join(directory, 'immutable-overlay.yml');
  await writeFile(overlay, JSON.stringify([{ id: 'sample-extension', config: { timeoutMs: 9876 } }]), { mode: 0o600 });
  instance = await start([overlay]);
  const overlaid = (await instance.rpc('config/describe', { namespaces: ['sample-extension'] })).forms[0];
  assert.equal(overlaid.writable, false);
  await assert.rejects(instance.rpc('config/extension-settings', { action: 'mutate', ns: 'sample-extension', expectedRevision: overlaid.revision,
    ops: [{ op: 'set', path: ['timeoutMs'], value: 3333 }] }), /protected/);
  assert.equal(await readFile(file, 'utf8'), persisted);
  console.log(JSON.stringify({ ok: true, proof: 'native SettingsForms + ConfigEditor persist/apply/reboot/CAS/secret/core-boundary' }));
} finally { await instance.stop(); }
