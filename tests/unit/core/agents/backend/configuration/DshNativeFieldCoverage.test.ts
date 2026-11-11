import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  buildDshNativeConfigurationEntries,
  DSH_NATIVE_CONFIGURATION_FIELDS,
  DSH_NATIVE_CONFIGURATION_GROUPS,
  type DshNativeConfigurationFieldDescriptor as Field,
  validateDshNativeConfiguration,
} from '../../../../../../src/core/agents/backend/configuration/DshNativeConfiguration';

// Opt-in public-package check; deterministic unit tests never require a globally installed CLI.
const install = process.env.DSH_PUBLIC_INSTALL;
const installed = install && existsSync(path.join(install, 'lib', 'profile-boot.js')) ? describe : describe.skip;
const ROOT = path.resolve(__dirname, '../../../../../..');
const fields = DSH_NATIVE_CONFIGURATION_FIELDS;
type Value = null | string | number | boolean | Value[] | { [key: string]: Value };
type ObjectValue = { [key: string]: Value };

function sampleField(field: Field, directory: string): Value {
  const children = (prefix: string) => fields.filter((child) => child.namespace === field.namespace && child.path.startsWith(prefix)
    && !child.path.slice(prefix.length).includes('.') && !child.path.slice(prefix.length).includes('[]'));
  if (field.type === 'union') {
    const alternative = field.alternatives?.find((entry) => ['object', 'record'].includes(entry.type)) ?? field.alternatives?.[0];
    if (!alternative) throw new Error(`Missing union alternatives: ${field.path}`);
    return sampleField(alternative, directory);
  }
  if (field.literalValue !== undefined) return field.literalValue;
  if (field.type === 'null') return null;
  if (field.type === 'boolean') return false;
  if (field.type === 'enum') return field.enumValues![0];
  if (field.type === 'number') return field.minimum ?? (field.exclusiveMinimum !== undefined ? field.exclusiveMinimum + 0.5 : 1);
  if (field.type === 'string') {
    if (field.sensitive === 'credential-reference') return 'OFFLINE_FIELD_REF';
    if (field.semantics === 'filesystem-path') return directory;
    if (field.path.endsWith('baseURL')) return 'http://127.0.0.1:1/offline';
    return 'fixture-value';
  }
  if (field.type === 'object') return Object.fromEntries(children(`${field.path}.`).map((child) => [child.path.slice(field.path.length + 1), sampleField(child, directory)]));
  const itemPath = `${field.path}${field.type === 'array' ? '[]' : '.*'}`;
  const item = fields.find((child) => child.namespace === field.namespace && child.path === itemPath);
  if (!item) throw new Error(`Missing item descriptor: ${itemPath}`);
  if (field.type === 'array') return [sampleField(item, directory)];
  const key = field.path.endsWith('reasoningEfforts') ? 'high' : 'fixture';
  return { [key]: sampleField(item, directory) };
}

const RESPONSE_KEYS = new Set(['supportsDeveloperRole', 'supportsMaxOutputTokens', 'supportsStrictMode', 'supportsLongCacheRetention']);
const ANTHROPIC_KEYS = new Set(['supportsLongCacheRetention', 'supportsEagerToolInputStreaming', 'supportsCacheControlOnTools', 'supportsTemperature', 'forceAdaptiveThinking', 'allowEmptySignature', 'supportsStrictTools']);
function compatFor(all: ObjectValue, api: string): ObjectValue {
  return Object.fromEntries(Object.entries(all).filter(([key]) => api === 'openai-responses' ? RESPONSE_KEYS.has(key)
    : api === 'anthropic-messages' ? ANTHROPIC_KEYS.has(key) : key !== 'supportsMaxOutputTokens' && (!ANTHROPIC_KEYS.has(key) || key === 'supportsLongCacheRetention')));
}
function providerCase(directory: string, api: string, installedRoute?: string): ObjectValue {
  const profile = sampleField(fields.find((field) => field.namespace === 'llm-pi-ai' && field.path === 'providers.*')!, directory) as ObjectValue;
  const { models, modelOverrides, ...scalar } = profile;
  const model = { ...(models as ObjectValue[])[0], id: 'fixture-model' };
  const override = (modelOverrides as ObjectValue).fixture as ObjectValue;
  const compat = compatFor(profile.compat as ObjectValue, api);
  const base = { ...scalar, api, compat, headers: { 'X-Evidence': 'public-fixture' }, headerCredentialRefs: { Authorization: 'OFFLINE_FIELD_REF' },
    defaultContextWindow: 128000, defaultMaxTokens: 4096, defaultInput: ['text', 'image'], maxRequestImages: 20,
    maxRequestImageBytes: 20971520, imageOffloadCountQuantum: 2, requestImagePixelBudget: 4194304, requestImageMaxBytes: 1048576 };
  if (!installedRoute) return { ...base, models: [{ ...model, contextWindow: 128000, maxTokens: 4096, compat }] };
  const id = installedRoute === 'anthropic' ? 'claude-opus-4-6' : 'gpt-4o';
  return { ...base, modelOverrides: { [id]: { ...override, contextWindow: 128000, maxTokens: 4096, compat } } };
}
function coverageCases(directory: string) {
  const overrides: ObjectValue = {};
  for (const group of DSH_NATIVE_CONFIGURATION_GROUPS) overrides[group.namespace] = Object.fromEntries(
    group.fields.filter((field) => !field.path.includes('.') && !field.path.includes('[]'))
      .map((field) => [field.path, sampleField(field, directory)]));
  overrides['agent-default-model'] = { provider: 'fixture-completions', model: 'fixture-model', reasoningEffort: 'high' };
  overrides['llm-pi-ai'] = { providers: {
    'fixture-completions': providerCase(directory, 'openai-completions'),
    'fixture-responses': providerCase(directory, 'openai-responses'),
    'fixture-anthropic': providerCase(directory, 'anthropic-messages'),
    openai: providerCase(directory, 'openai-completions', 'openai'),
    anthropic: providerCase(directory, 'anthropic-messages', 'anthropic'),
  } };
  const deepseek = overrides['llm-deepseek'] as ObjectValue;
  const model = (deepseek.models as ObjectValue[])[0];
  model.inputModalities = ['text', 'image']; model.contextWindow = 128000; model.maxTokens = 4096;
  deepseek.maxTokens = 4096; deepseek.defaultContextWindow = 128000; deepseek.reasoningEffort = 'high';
  const compaction = overrides['compaction-basic'] as ObjectValue;
  const { retainTokens: topTokens, ...ratioPolicy } = compaction;
  const { retainTokens: policyTokens, ...ratioModel } = (compaction.modelPolicies as ObjectValue[])[0];
  expect(topTokens).toBe(0); expect(policyTokens).toBe(0);
  overrides['compaction-basic'] = { ...ratioPolicy, thresholdRatio: 0.8, retainRatio: 0.16, headroomTokens: 1024, maxTokens: 512,
    modelPolicies: [{ ...ratioModel, provider: 'fixture-completions', model: 'fixture-model', thresholdRatio: 0.75, retainRatio: 0.1, maxTokens: 512, headroomTokens: 1024 }] };
  overrides.permission = { presets: { fixture: { sandbox: 'read-only', approval: 'ask', name: 'Fixture', description: 'Public-schema evidence' } }, defaultPreset: 'fixture' };
  const primary = validateDshNativeConfiguration({ version: 1, overrides });
  const alternate = JSON.parse(JSON.stringify(primary));
  alternate.overrides['compaction-basic'].retainTokens = 256;
  Reflect.deleteProperty(alternate.overrides['compaction-basic'], 'retainRatio');
  alternate.overrides['compaction-basic'].modelPolicies[0].retainTokens = 128;
  Reflect.deleteProperty(alternate.overrides['compaction-basic'].modelPolicies[0], 'retainRatio');
  alternate.overrides['llm-deepseek'].models[0].imagePixelBudget = 'low';
  alternate.overrides['llm-deepseek'].retryPolicy = { mode: 'always', backoff: { initialDelayMs: 50, maxDelayMs: 500, jitterRatio: 0.2 } };
  alternate.overrides['llm-pi-ai'].providers.openai = providerCase(directory, 'openai-responses', 'openai');
  return [{ id: 'primary', value: primary }, { id: 'exclusive-alternatives', value: validateDshNativeConfiguration(alternate) }]
    .map((entry) => ({ ...entry, entries: buildDshNativeConfigurationEntries(entry.value) }));
}

installed('installed public DSH field coverage', () => {
it('crosschecks every registered field against schemas and offline effective configuration', () => {
  const parent = path.join(ROOT, '.impeccable', 'dsh-control-test-fixtures');
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  const directory = realpathSync(mkdtempSync(path.join(parent, 'field-coverage-')));
  const home = path.join(directory, 'isolated-home'); mkdirSync(home, { mode: 0o700 });
  const input = path.join(directory, 'input.json');
  writeFileSync(input, JSON.stringify({ groups: DSH_NATIVE_CONFIGURATION_GROUPS, fields, cases: coverageCases(directory) }), { mode: 0o600 });
  execFileSync(process.execPath, [path.join(__dirname, 'DshNativeFieldCoverage.fixture.mjs'), install!, directory], {
    cwd: directory, timeout: 60000, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024, windowsHide: true,
    env: { HOME: home, DSH_HOME: path.join(home, 'dsh'), XDG_CONFIG_HOME: path.join(home, 'config'), XDG_DATA_HOME: path.join(home, 'data'),
      PATH: path.dirname(process.execPath), DSH_TELEMETRY_DISABLED: '1', NODE_OPTIONS: '' },
  });
  const evidence = JSON.parse(readFileSync(path.join(directory, 'evidence.json'), 'utf8'));
  const destination = path.join(ROOT, '.impeccable', 'review', 'dsh-complete-integration-20261109');
  mkdirSync(destination, { recursive: true, mode: 0o700 });
  writeFileSync(path.join(destination, 'field-coverage-evidence.json'), JSON.stringify(evidence, null, 2) + '\n', { mode: 0o600 });
  expect(evidence.schemaVersion).toBe('0.2.2-rc.1');
  expect(evidence.fields).toHaveLength(fields.length);
  expect(evidence.summary.schemaMissing).toBe(0);
  expect(evidence.summary.typeMismatches).toBe(0);
  expect(evidence.safety.networkAttempts).toBe(0);
  expect(evidence.safety.processAttempts).toBe(0);
  expect(evidence.safety.credentialFileReadAttempts).toBe(0);
  expect(evidence.safety.privateProfileReadAttempts).toBe(0);
  expect(evidence.summary.materializationMissing).toBe(0);
  expect(evidence.summary.effectiveMatched).toBe(fields.length);
  expect(evidence.summary.effectiveMismatches).toBe(0);
  expect(evidence.summary.publicObservationMismatches).toBe(0);
  expect(evidence.summary.nativeSchemaRejections).toBe(0);
  expect(evidence.summary.missingRegistryFields).toBe(0);
  expect(evidence.cases.every((entry: { status: string }) => entry.status === 'booted-and-read-back')).toBe(true);
}, 70000);
});
