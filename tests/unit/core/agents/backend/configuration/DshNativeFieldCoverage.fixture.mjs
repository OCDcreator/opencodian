import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createControlRuntime } from '../../../../../../assets/dsh/control.mjs';
import { applyHeaderCredentialBridge, composeConfigurationPatches, openManagedProfile, readInheritedProfile, writeInheritedBundle } from '../../../../../../assets/dsh/launcher.mjs';

// Isolated child only. All input is synthetic; no parent environment, private profile,
// credential document, session, provider prompt, or live UI enters this fixture.
const install = await realpath(process.argv[2]);
const directory = await realpath(process.argv[3]);
const requireNative = createRequire(path.join(install, 'lib', 'bin.js'));
const load = (name) => import(pathToFileURL(requireNative.resolve(name)).href);
const safety = { inheritedEnvironment: false, privateProfileReadAttempts: 0, credentialFileReadAttempts: 0,
  networkAttempts: 0, processAttempts: 0, syntheticCredentialResolutions: 0, sessionsCreated: 0, promptsSubmitted: 0 };
const blocked = (kind) => () => { safety[kind]++; throw new Error(`Offline field evidence forbids ${kind}`); };
global.fetch = blocked('networkAttempts');
for (const [name, methods] of [['node:http', ['request', 'get']], ['node:https', ['request', 'get']], ['node:tls', ['connect']], ['node:child_process', ['spawn', 'exec', 'execFile', 'fork', 'spawnSync', 'execSync', 'execFileSync']]]) {
  const module = requireNative(name);
  for (const method of methods) module[method] = blocked(name === 'node:child_process' ? 'processAttempts' : 'networkAttempts');
}
requireNative('node:net').Socket.prototype.connect = blocked('networkAttempts');
function assertOwnedRead(filename) {
  if (typeof filename !== 'string' && !(filename instanceof URL)) return;
  const text = filename instanceof URL ? filename.pathname : filename;
  if (/[/\\]\.credentials\.(?:ya?ml|json)$/.test(text)) { safety.credentialFileReadAttempts++; throw new Error('Credential files are not evidence inputs'); }
  if (text.includes(`${path.sep}profiles${path.sep}`) && !path.resolve(text).startsWith(`${directory}${path.sep}`)) {
    safety.privateProfileReadAttempts++; throw new Error('Only owned fixture profiles are permitted');
  }
}
for (const method of ['readFileSync', 'readFile']) {
  const original = fs[method]; fs[method] = function (filename, ...args) { assertOwnedRead(filename); return original.call(this, filename, ...args); };
}
const originalRead = fs.promises.readFile;
fs.promises.readFile = function (filename, ...args) { assertOwnedRead(filename); return originalRead.call(this, filename, ...args); };
syncBuiltinESMExports();

const input = JSON.parse(await readFile(path.join(directory, 'input.json'), 'utf8'));
const manifest = JSON.parse(await readFile(path.join(install, 'package.json'), 'utf8'));
assert.equal(manifest.version, '0.2.2-rc.1', 'This evidence gate is pinned to the audited public version');
const boot = await load('@deepseek-ai/dsh-app-boot');
const { PROFILE_TEMPLATES } = await load('@deepseek-ai/dsh-official-bundles');
const { runProfile, INSTALL_ANCHOR } = await import(pathToFileURL(path.join(install, 'lib', 'profile-boot.js')).href);
const { redactSecrets } = await load('@deepseek-ai/dsh-settings');
const { isVolatile } = await load('@deepseek-ai/cosmokit');
const { symbols } = await load('@deepseek-ai/cordis');
const plain = (value) => isVolatile(value) ? plain(value.get()) : Array.isArray(value) ? value.map(plain)
  : value !== null && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, plain(item)])) : value;
const sha = (text) => createHash('sha256').update(text).digest('hex');
const absent = path.join(directory, 'absent-public-sdk-source');
const inherited = readInheritedProfile(boot, absent, INSTALL_ANCHOR, PROFILE_TEMPLATES.sdk);
assert.equal(inherited.skippedBundles.length, 0);
const publicRows = boot.composeEntries([inherited.patches]);
const sourceByNamespace = new Map();
const schemaByNamespace = new Map();
const schemas = new Map();

function shape(doc, uid) {
  const node = doc.refs[uid];
  if (node.type === 'const') return typeof node.value === 'string' ? { type: 'enum', enumValues: [node.value] }
    : { type: node.value === null ? 'null' : typeof node.value, literalValue: node.value };
  if (node.type === 'union') {
    const alternatives = node.list.map((id) => shape(doc, id));
    if (alternatives.every((value) => value.type === 'enum')) return { type: 'enum', enumValues: [...new Set(alternatives.flatMap((value) => value.enumValues))] };
    if (alternatives.every((value) => value.type === 'object')) return { type: 'object', alternativeObjects: true };
    return { type: 'union', alternatives };
  }
  const constraints = Object.fromEntries(Object.entries(node.meta ?? {}).filter(([key]) => ['min', 'max', 'step', 'required', 'role'].includes(key)));
  return { type: node.type === 'dict' ? 'record' : node.type, ...(Object.keys(constraints).length ? { constraints } : {}) };
}
function flattenSchema(doc) {
  const result = new Map();
  function visit(uid, fieldPath, include = true) {
    const node = doc.refs[uid];
    if (include && fieldPath) {
      const entries = result.get(fieldPath) ?? [];
      entries.push({ uid, ...shape(doc, uid) }); result.set(fieldPath, entries);
    }
    if (node.dict) for (const [key, child] of Object.entries(node.dict)) visit(child, fieldPath ? `${fieldPath}.${key}` : key);
    if (node.inner) visit(node.inner, `${fieldPath}${node.type === 'array' ? '[]' : '.*'}`);
    if (node.type === 'union') for (const child of node.list) visit(child, fieldPath, false);
  }
  visit(doc.uid, ''); return result;
}
for (const group of input.groups) {
  const row = publicRows.find((entry) => entry.id === group.namespace);
  assert.ok(row, `No canonical public SDK row: ${group.namespace}`);
  const modulePath = requireNative.resolve(row.name);
  const loaded = await import(pathToFileURL(modulePath).href);
  const schema = loaded.Config ?? loaded.default?.Config;
  const packagePath = path.resolve(modulePath, '../../package.json');
  const packageManifest = JSON.parse(await readFile(packagePath, 'utf8'));
  sourceByNamespace.set(group.namespace, { package: row.name, packageVersion: packageManifest.version, modulePath,
    moduleSha256: sha(await readFile(modulePath)), schemaExport: loaded.Config ? 'Config' : loaded.default?.Config ? 'default.Config' : null,
    canonicalRowSource: path.join(install, 'node_modules/@deepseek-ai/dsh-base/cordis.patch.yml') });
  if (schema?.toJSON) { schemas.set(group.namespace, schema); schemaByNamespace.set(group.namespace, flattenSchema(schema.toJSON())); }
}

const tokens = (fieldPath) => fieldPath.replaceAll('[]', '.[]').split('.');
function select(value, fieldPath) {
  let entries = [{ address: [], value }];
  for (const token of tokens(fieldPath)) entries = entries.flatMap((entry) => {
    if (entry.value === null || typeof entry.value !== 'object') return [];
    if (token === '*' || token === '[]') return Object.entries(entry.value).map(([key, child]) => ({ address: [...entry.address, key], value: child }));
    return Object.hasOwn(entry.value, token) ? [{ address: [...entry.address, token], value: entry.value[token] }] : [];
  });
  return entries;
}
const at = (value, address) => address.reduce((current, key) => current?.[key], value);
function contains(expected, actual) {
  if (Array.isArray(expected)) return Array.isArray(actual) && expected.length === actual.length && expected.every((item, index) => contains(item, actual[index]));
  if (expected && typeof expected === 'object') return actual && typeof actual === 'object' && Object.entries(expected).every(([key, value]) => contains(value, actual[key]));
  return Object.is(expected, actual);
}
function nativeIntent(value) {
  if (Array.isArray(value)) return value.map(nativeIntent);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'headerCredentialRefs').map(([key, child]) => [key, nativeIntent(child)]));
}
function typeSignature(value) {
  if (value.type === 'null') return 'null'; // A null schema and a literal-null schema admit the same singleton.
  if (value.enumValues) return `enum:${[...value.enumValues].sort().join('|')}`;
  if (Object.hasOwn(value, 'literalValue')) return `${value.type}:${JSON.stringify(value.literalValue)}`;
  if (value.alternatives) return `union:${value.alternatives.map(typeSignature).sort().join(';')}`;
  return value.type;
}
function typeAgreement(field, actual) {
  if (field.source === 'plugin') return true;
  if (!actual.length) return false;
  if (field.enumValues) {
    const values = [...new Set(actual.flatMap((entry) => entry.enumValues ?? []))].sort();
    return JSON.stringify([...field.enumValues].sort()) === JSON.stringify(values);
  }
  return actual.some((entry) => typeSignature(entry) === typeSignature(field));
}
const fields = input.fields.map((field) => {
  const upstream = schemaByNamespace.get(field.namespace)?.get(field.path) ?? [];
  return { namespace: field.namespace, path: field.path, source: field.source,
    expectedType: field.type, expectedTypeSignature: typeSignature(field), expectedEnum: field.enumValues ?? null,
    schema: { supported: field.source === 'plugin' || upstream.length > 0, typeAgreement: typeAgreement(field, upstream),
      status: field.source === 'plugin' ? 'plugin-owned-extension-not-upstream' : upstream.length ? 'public-schema-matched' : 'missing-public-field',
      publicTypes: upstream, source: sourceByNamespace.get(field.namespace),
      descriptorConstraints: Object.fromEntries(Object.entries(field).filter(([key]) => ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'integer', 'minimumItems', 'required'].includes(key))) },
    materialization: [], effectiveReadback: [], publicObservation: [] };
});
const repository = fileURLToPath(new URL('../../../../../../', import.meta.url));
const repositorySources = await Promise.all([
  'src/core/agents/backend/configuration/DshNativeConfiguration.ts', 'src/core/types/dshConfiguration.ts',
  'assets/dsh/launcher.mjs', 'assets/dsh/control.mjs',
  'tests/unit/core/agents/backend/configuration/DshNativeFieldCoverage.test.ts',
  'tests/unit/core/agents/backend/configuration/DshNativeFieldCoverage.fixture.mjs',
].map(async (relativePath) => ({ path: path.join(repository, relativePath), sha256: sha(await readFile(path.join(repository, relativePath))) })));
const evidence = { schemaVersion: manifest.version, generatedAt: new Date().toISOString(), fixtureDirectory: directory, repositorySources,
  scope: { profile: 'public shipped SDK template', bundles: PROFILE_TEMPLATES.sdk.bundles, privateProfiles: false,
    coverageUnit: 'Each descriptor path with concrete map/array addresses; sampled values, not every valid value or enum branch',
    unionComparison: 'Recursive type/literal/enum alternative signatures, including number|low image budgets and false|record reasoning maps',
    claim: 'Offline configuration composition and readback; no inference, tool execution, external credential resolution, or live UI proof.' },
  safety, namespaces: [], fields, cases: [], missingRegistryFields: [] };
for (const [namespace, publicFields] of schemaByNamespace) for (const fieldPath of publicFields.keys()) {
  if (!input.fields.some((field) => field.namespace === namespace && field.path === fieldPath)) evidence.missingRegistryFields.push({ namespace, path: fieldPath, source: sourceByNamespace.get(namespace) });
}
const fixturePlugin = path.join(directory, 'synthetic-credentials.mjs');
await writeFile(fixturePlugin, `export function apply(ctx) { ctx.provide('credentials', { async resolve(ref) { if (ref !== 'OFFLINE_FIELD_REF') throw new Error('Unexpected synthetic reference'); global.__fieldCoverageCredentialCount++; return { value: 'offline-fixture-header', source: 'synthetic-offline-fixture' }; } }); }\n`, { mode: 0o600 });
global.__fieldCoverageCredentialCount = 0;
const disabled = ['sdk-jsonrpc-server', 'sdk-app-startup', 'session-telemetry-otel', 'deepseek-account', 'llm-deepseek-account', 'session-title-llm', 'hmr', 'workspace-dependencies', 'skill-office', 'credentials', 'connection', 'file-upload'];
const isolationPatches = [
  ...disabled.filter((id) => publicRows.some((entry) => entry.id === id)).map((id) => ({ id, disabled: true })),
  { insert: [{ id: 'offline-synthetic-credentials', name: fixturePlugin }] },
];
function recordEffectiveField(field, testCase, expected, { fibers, observation }) {
  const fiber = fibers.get(field.namespace);
  const observed = observation.find((entry) => entry.ns === field.namespace);
  if (field.source === 'plugin') {
    const matched = fiber?.state === 2 && expected.every((entry) => {
      const referenceIndex = entry.address.indexOf('headerCredentialRefs');
      const route = entry.address[1];
      if (referenceIndex === entry.address.length - 1) return Object.keys(entry.value).every((name) => fiber.value.providers?.[route]?.headers?.[name] === 'offline-fixture-header');
      return fiber.value.providers?.[route]?.headers?.[entry.address.at(-1)] === 'offline-fixture-header';
    });
    field.effectiveReadback.push({ case: testCase.id, status: matched ? 'transformed-header-matched-with-synthetic-resolver' : 'unavailable', evidenceSource: 'active fiber.effectiveConfig; original metadata intentionally absent' });
    field.publicObservation.push({ case: testCase.id, status: observed?.status === 'verified' ? 'intentionally-redacted' : 'unavailable', reason: 'Credential references become headers; public control observation excludes headers' });
    return;
  }
  const matched = fiber?.state === 2 && expected.every((entry) => contains(nativeIntent(entry.value), at(fiber.value, entry.address)));
  field.effectiveReadback.push({ case: testCase.id, status: matched ? 'matched' : fiber?.state === 2 ? 'mismatch' : 'unavailable', fiberState: fiber?.state ?? null, evidenceSource: 'actual active native plugin fiber.effectiveConfig' });
  const visible = observed?.status === 'verified' && expected.every((entry) => contains(nativeIntent(entry.value), at(observed.value, entry.address)));
  const headerSubtree = field.path.includes('.headers') || field.path === 'providers' || field.path === 'providers.*';
  field.publicObservation.push({ case: testCase.id, status: visible ? 'matched' : observed?.status !== 'verified' ? 'unavailable' : headerSubtree ? 'intentionally-redacted' : 'mismatch',
    ...(headerSubtree ? { reason: 'Public observation strips raw header subtrees' } : {}) });
}
function recordFields(testCase, materialized, composed, readback) {
  for (const field of fields) {
    const expected = select(testCase.value.overrides[field.namespace], field.path);
    if (!expected.length) continue;
    const metadata = field.source === 'plugin';
    const built = materialized.get(field.namespace);
    const composedConfig = composed.find((entry) => entry.id === field.namespace)?.config;
    const materializedMatch = metadata ? select(built, field.path).length === 0 : expected.every((entry) => contains(nativeIntent(entry.value), at(built, entry.address)));
    const mergedMatch = metadata || expected.every((entry) => contains(nativeIntent(entry.value), at(composedConfig, entry.address)));
    field.materialization.push({ case: testCase.id, occurrences: expected.length, sampleAddresses: expected.map((entry) => entry.address),
      requestedValueSha256: expected.map((entry) => sha(JSON.stringify(entry.value))),
      status: materializedMatch && mergedMatch ? metadata ? 'reference-omitted-from-native-config' : 'matched' : 'mismatch' });
    recordEffectiveField(field, testCase, expected, readback);
  }
}

for (const [index, testCase] of input.cases.entries()) {
  const caseDirectory = path.join(directory, testCase.id); await mkdir(caseDirectory, { mode: 0o700 });
  const location = { allowedRoot: path.join(caseDirectory, 'profiles'), vaultHash: String(index + 1).repeat(64), profile: 'sdk',
    root: path.join(caseDirectory, 'profiles', String(index + 1).repeat(64), 'sdk') };
  const root = await openManagedProfile(location); await writeInheritedBundle(root, inherited, absent);
  const profile = boot.loadProfileDirectory('dsh', root, INSTALL_ANCHOR);
  const layers = [...profile.layers.map((layer) => layer.patches), profile.patches];
  const controlled = composeConfigurationPatches(boot, layers, testCase.entries);
  const materialized = new Map(testCase.entries.map((entry) => [entry.id, entry.config]));
  const composed = boot.composeEntries([...layers, controlled]);
  const refs = testCase.value.overrides['llm-pi-ai'].providers;
  await applyHeaderCredentialBridge(boot, layers, controlled, Object.fromEntries(Object.entries(refs).map(([route, value]) => [route, value.headerCredentialRefs])), caseDirectory);
  const patchFile = path.join(caseDirectory, 'offline.patch.yml');
  await writeFile(patchFile, JSON.stringify([...controlled, ...isolationPatches]), { mode: 0o600 });
  let application; let controls;
  const caseResult = { id: testCase.id, actualNativeRuntime: true, source: 'runProfile public SDK + actual composeConfigurationPatches/applyHeaderCredentialBridge', isolationDisabledRows: disabled,
    credentialProvider: 'fixture-owned in-memory synthetic resolver; no credential files or ambient environment', schemaValidation: [], namespaces: [] };
  evidence.cases.push(caseResult);
  for (const entry of testCase.entries) {
    const schema = schemas.get(entry.id);
    try { if (schema) schema(composed.find((row) => row.id === entry.id).config); caseResult.schemaValidation.push({ namespace: entry.id, status: schema ? 'accepted-public-Config' : 'no-public-Config' }); }
    catch (error) { caseResult.schemaValidation.push({ namespace: entry.id, status: 'rejected-public-Config', diagnostic: String(error.message).slice(0, 1000) }); }
  }
  if (caseResult.schemaValidation.some((entry) => entry.status === 'rejected-public-Config') || fields.some((field) => !field.schema.supported || !field.schema.typeAgreement)) {
    caseResult.status = 'schema-rejected-before-native-boot';
    recordFields(testCase, materialized, composed, { fibers: new Map(), observation: [] });
    continue;
  }
  try {
    application = await runProfile({ environment: new Map(), profile: 'sdk', patchFiles: [patchFile], args: [], resolvedProfile: { profile, installAnchor: INSTALL_ANCHOR } });
    controls = createControlRuntime(application.ctx, { managedProfileRoot: root, nativeConfigRevision: sha(JSON.stringify(testCase.value)) }, {
      sessions: new Map(), requireSession() { throw new Error('No sessions in field evidence'); }, update() {}, notify() {}, redactSecrets, plainConfig: plain,
      serviceIdentity: (service) => service?.[symbols.original] ?? service,
    });
    const observed = await controls.methods['config/describe']({ namespaces: input.groups.map((group) => group.namespace) });
    const rows = await application.ctx.get('configEditor').configuration();
    const fibers = new Map();
    for (const group of input.groups) {
      const row = rows.find((entry) => entry.entry?.options?.id === group.namespace);
      const fiber = row?.entry?.fiber;
      fibers.set(group.namespace, { state: fiber?.state, value: fiber ? plain(fiber.effectiveConfig) : undefined });
      caseResult.namespaces.push({ namespace: group.namespace, fiberState: fiber?.state ?? null,
        observation: observed.observations.find((entry) => entry.ns === group.namespace)?.status ?? 'unavailable',
        settingsFormPresent: observed.forms.some((entry) => entry.ns === group.namespace) });
    }
    recordFields(testCase, materialized, composed, { fibers, observation: observed.observations });
    caseResult.status = 'booted-and-read-back';
  } catch (error) {
    caseResult.status = 'native-runtime-failed'; caseResult.diagnostic = String(error.message).slice(0, 2000);
    recordFields(testCase, materialized, composed, { fibers: new Map(), observation: [] });
  } finally {
    await controls?.dispose(); await application?.ctx.fiber.dispose();
  }
}
safety.syntheticCredentialResolutions = global.__fieldCoverageCredentialCount;
for (const group of input.groups) {
  const groupFields = fields.filter((field) => field.namespace === group.namespace);
  evidence.namespaces.push({ namespace: group.namespace, canonicalEntryId: group.entryId, source: sourceByNamespace.get(group.namespace),
    descriptorCount: groupFields.length, publicConfig: schemas.has(group.namespace),
    status: group.configuration === 'none' ? 'no-public-config-fields; no-mutable-control-claim' : 'per-field-evidence',
    effectiveMatched: groupFields.filter((field) => field.effectiveReadback.some((entry) => entry.status === 'matched' || entry.status.startsWith('transformed-header-matched'))).length });
}
evidence.summary = { descriptorCount: fields.length,
  upstreamDescriptorCount: fields.filter((field) => field.source === 'upstream').length,
  pluginDescriptorCount: fields.filter((field) => field.source === 'plugin').length,
  schemaMissing: fields.filter((field) => !field.schema.supported).length,
  typeMismatches: fields.filter((field) => !field.schema.typeAgreement).length,
  materializationMissing: fields.filter((field) => !field.materialization.some((entry) => ['matched', 'reference-omitted-from-native-config'].includes(entry.status))).length,
  effectiveMatched: fields.filter((field) => field.effectiveReadback.some((entry) => entry.status === 'matched' || entry.status.startsWith('transformed-header-matched'))).length,
  publicObservationMatched: fields.filter((field) => field.publicObservation.some((entry) => entry.status === 'matched')).length,
  publicObservationRedacted: fields.filter((field) => field.publicObservation.some((entry) => entry.status === 'intentionally-redacted')).length,
  publicObservationMismatches: fields.filter((field) => field.publicObservation.some((entry) => entry.status === 'mismatch')).length,
  effectiveMismatches: fields.filter((field) => field.effectiveReadback.some((entry) => entry.status === 'mismatch')).length,
  nativeSchemaRejections: evidence.cases.flatMap((entry) => entry.schemaValidation).filter((entry) => entry.status === 'rejected-public-Config').length,
  missingRegistryFields: evidence.missingRegistryFields.length };
await writeFile(path.join(directory, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n', { mode: 0o600 });
process.stdout.write(JSON.stringify({ summary: evidence.summary, safety, cases: evidence.cases.map(({ id, status, diagnostic }) => ({ id, status, diagnostic })) }) + '\n');
