import { describe, expect, it } from '@jest/globals';

import {
  buildDshNativeConfigurationEntries,
  buildDshNativeConfigurationPatch,
  DSH_NATIVE_CONFIGURATION_FIELDS,
  DSH_NATIVE_CONFIGURATION_GROUPS,
  DSH_NATIVE_CONFIGURATION_SCHEMA_VERSION,
  type DshNativeConfiguration,
  type DshNativeConfigurationNamespace,
  dshNativeConfigurationRevision,
  normalizeDshNativeConfiguration,
  validateDshNativeConfiguration,
} from '../../../../../../src/core/agents/backend/configuration/DshNativeConfiguration';

const config = (namespace: string, values: unknown): unknown => ({ version: 1, overrides: { [namespace]: values } });
const pi = (values: unknown): unknown => config('llm-pi-ai', { providers: { 'org/gateway.v2': values } });
const full: DshNativeConfiguration = {
  version: 1,
  overrides: {
    'agent-default-model': { provider: 'deepseek-official', model: 'deepseek-flash', reasoningEffort: 'custom-effort' },
    'llm-deepseek': {
      apiKeyEnv: 'DEEPSEEK_API_KEY', baseURL: 'https://example.test/anthropic', thinking: 'enabled', reasoningEffort: 'max',
      maxTokens: 8000, defaultContextWindow: 128000,
      models: [{ id: 'custom/model', name: 'A model', description: 'Description', contextWindow: 128000, maxTokens: 8000, inputModalities: ['text', 'image'], imagePixelBudget: 'low', imageMaxBytes: 1024, systemPromptUpdate: 'in-history', toolUpdate: 'addition-only' }],
      streamIdleTimeoutMs: 100.5, modelsTimeoutMs: 5000, modelsMaxAgeMs: 0,
      maxRequestFilesBytes: 128000, maxInlineRequestImageBytes: 12000, maxImagesPerRequest: 10,
      imageOffloadByteQuantum: 128, inlineImageOffloadByteQuantum: 100, imageOffloadCountQuantum: 1,
      filesApiTimeoutMs: 1000, fileExpiresAfterSeconds: 3600, fileRefreshMarginSeconds: 0, fileQuotaCleanupBatch: 1000,
      retryPolicy: { mode: 'normal', maxRetries: 0, retryableCodes: ['SERVER'], backoff: { initialDelayMs: 10.5, maxDelayMs: 30, jitterRatio: 0 } },
    },
    'llm-pi-ai': { providers: {
      'org/gateway.v2': {
        apiKeyEnv: 'GATEWAY_API_KEY', displayName: 'Gateway', api: 'openai-completions', baseURL: 'http://localhost:3000/v1?api-version=2026',
        models: [{ id: 'provider/model', name: 'Vision', input: ['text', 'image'], contextWindow: 128000, maxTokens: 4000, reasoningEfforts: { off: null, high: 'thinking' }, compat: { supportsStore: false, vllmPriority: -2 } }],
        compat: { thinkingFormat: 'chat-template', chatTemplateKwargs: { enable_thinking: { $var: 'thinking.enabled', omitWhenOff: true }, temperature: 0.7, optional: null }, chatTemplateArgs: { mode: 'thinking' }, thinkingTokenBudgetField: 'thinking_budget', cacheControlFormat: 'anthropic' },
        defaultContextWindow: 128000, defaultMaxTokens: 4000, defaultInput: ['text'], headers: { 'X-Tenant': 'public-team', 'Anthropic-Beta': 'feature-a' },
        headerCredentialRefs: { Authorization: 'GATEWAY_AUTHORIZATION' }, reasoning: 'xhigh', thinkingBudgets: { minimal: 128, low: 256, medium: 512, high: 1024 },
        cacheRetention: 'long', transport: 'websocket-cached', timeoutMs: 0, websocketConnectTimeoutMs: 0, streamIdleTimeoutMs: 100.5,
        maxRequestImageBytes: 100000, maxRequestImages: 20, imageOffloadCountQuantum: 20, requestImagePixelBudget: 100000, requestImageMaxBytes: 1000,
        retryPolicy: { mode: 'always', backoff: { initialDelayMs: 1, maxDelayMs: 10, jitterRatio: 1 } },
      },
      catalog: { modelOverrides: { 'catalog/model': { name: 'Updated', maxTokens: 1024, input: [], reasoningEfforts: false } } },
    } },
    permission: { presets: { careful: { sandbox: 'read-only', approval: 'ask', name: 'Careful', description: 'Review changes' } }, defaultPreset: 'careful' },
    'sandbox-policy': { mode: 'workspace-write', workspaceRoot: '/workspace', additionalWritableRoots: ['/tmp/work'] },
    approval: { policy: 'ask' },
    'compaction-basic': { auto: true, thresholdRatio: 0.8, headroomTokens: 0, retainTokens: 0, maxTokens: 10, compactionRetries: 0, maxOverflowRetries: 2, summarizationProvider: '', summarizationModel: '', modelPolicies: [{ provider: 'org/gateway.v2', model: 'provider/model', retainRatio: 0.1, thresholdRatio: 0.5, summarizationProvider: 'deepseek-official', summarizationModel: 'deepseek-flash' }] },
    'skill-filesystem': { providerName: 'filesystem', includeDefaultRoots: true, dshHome: '/dsh', agentsHome: '/agents', customSkillDirs: ['skills/custom'], watch: true, watchUsePolling: false, watchStabilityThresholdMs: 1, watchPollIntervalMs: 1, watchMaxProjects: 1, watchFollowSymlinks: true, bundledSkillDir: '/bundled' },
    'tool-web': { search: true, fetch: false, searchMaxResults: 1, searchMaxQueries: 2, searchSummaryMaxChars: 80, fetchTimeoutMs: 1, searchTimeoutMs: 2, fetchMaxOutputChars: 100 },
    web: { searchProvider: 'deepseek-official', fetchProvider: 'http' },
    'tool-fs': { read: true, readImage: true, write: false, edit: false, applyPatch: false, readLimit: 1, readMaxLineLength: 1, readMaxBytes: 1, readStreamMinSize: 1 },
    'fs-observation-policy': {}, subagent: { maxDepth: 0, maxActiveSubagents: 1 }, 'tool-todo': { allowParallelInProgress: false },
    'tool-jobs': { waitTimeoutMs: 1.5, maxWaitTimeoutMs: 2.5, completionDelivery: 'quiet', maxConsecutiveWakes: 1.5, inlineOutputBytes: 0 },
    jobs: { maxConcurrentJobsPerOwner: 1, retainBytes: 1, settledRetainBytes: 1, pumpPollMs: 1 },
    'shell-env': { dshHome: '/dsh' }, 'timeout-policy': {}, 'llm-retry': {}, 'image-offload': {},
  },
};

describe('DSH native configuration boundary', () => {
  it('inherits for missing and empty config without injecting native defaults', () => {
    expect(normalizeDshNativeConfiguration(undefined)).toEqual({ version: 1, overrides: {} });
    expect(buildDshNativeConfigurationPatch(undefined)).toBe('[]\n');
    expect(dshNativeConfigurationRevision(undefined)).toBe(dshNativeConfigurationRevision({ version: 1, overrides: {} }));
    expect(normalizeDshNativeConfiguration(config('llm-deepseek', { maxTokens: 42 }))).toEqual(config('llm-deepseek', { maxTokens: 42 }));
  });

  it('roundtrips the audited namespaces as a detached validated copy', () => {
    const normalized = normalizeDshNativeConfiguration(full);
    expect(normalized).toEqual(full);
    expect(normalized).not.toBe(full);
    expect(normalized.overrides['llm-pi-ai']?.providers).not.toBe(full.overrides['llm-pi-ai']?.providers);
    expect(normalizeDshNativeConfiguration(JSON.parse(JSON.stringify(normalized)))).toEqual(full);
    normalized.overrides['llm-deepseek']!.maxTokens = 123;
    expect(full.overrides['llm-deepseek']!.maxTokens).toBe(8000);
  });

  it('emits only actual canonical config row IDs and never plugin credential-reference keys', () => {
    const entries = buildDshNativeConfigurationEntries(full);
    const patch = buildDshNativeConfigurationPatch(full);
    expect(JSON.parse(patch)).toEqual(entries); // JSON is a declarative YAML subset.
    expect(entries.map((entry) => entry.id)).toEqual(Object.keys(full.overrides).filter((key) => Object.keys(full.overrides[key as DshNativeConfigurationNamespace]!).length).sort());
    for (const entry of entries) expect(Object.keys(entry)).toEqual(['id', 'config']);
    expect(patch).not.toContain('headerCredentialRefs');
    expect(patch).not.toContain('GATEWAY_AUTHORIZATION');
    expect(patch).toContain('GATEWAY_API_KEY');
    expect(full.overrides['llm-pi-ai']!.providers!['org/gateway.v2'].headerCredentialRefs).toEqual({ Authorization: 'GATEWAY_AUTHORIZATION' });
  });

  it('quotes YAML-sensitive ordinary values instead of allowing them to become structure', () => {
    const value = config('agent-default-model', { model: 'a: b\n- id: native-bridge\n  disabled: true\n# comment', provider: 'yes' });
    expect(JSON.parse(buildDshNativeConfigurationPatch(value))).toEqual([{ id: 'agent-default-model', config: { model: 'a: b\n- id: native-bridge\n  disabled: true\n# comment', provider: 'yes' } }]);
  });

  it('escapes Unicode separators that older YAML parsers could fold inside quoted strings', () => {
    const value = config('agent-default-model', { model: 'a\u0085b\u2028c\u2029d' });
    const patch = buildDshNativeConfigurationPatch(value);
    expect(patch).toContain('a\\u0085b\\u2028c\\u2029d');
    expect(JSON.parse(patch)[0].config.model).toBe('a\u0085b\u2028c\u2029d');
  });

  it('hashes equivalent object order identically and tracks nested changes and reference names', () => {
    const first = pi({ headers: { b: 'two', a: 'one' }, thinkingBudgets: { high: 100, low: 10 } });
    const second = pi({ thinkingBudgets: { low: 10, high: 100 }, headers: { a: 'one', b: 'two' } });
    expect(dshNativeConfigurationRevision(first)).toMatch(/^[a-f0-9]{64}$/);
    expect(dshNativeConfigurationRevision(first)).toBe(dshNativeConfigurationRevision(second));
    expect(dshNativeConfigurationRevision(first)).not.toBe(dshNativeConfigurationRevision(pi({ thinkingBudgets: { high: 101, low: 10 }, headers: { a: 'one', b: 'two' } })));
    expect(dshNativeConfigurationRevision(pi({ headerCredentialRefs: { Authorization: 'REF_A' } }))).not.toBe(dshNativeConfigurationRevision(pi({ headerCredentialRefs: { Authorization: 'REF_B' } })));
  });

  it.each([null, [], {}, { version: 2, overrides: {} }, { version: 1 }, { version: 1, overrides: [], extra: true }, { version: 1, overrides: {}, entries: [] }])('rejects malformed envelope %p', (value) => {
    expect(() => validateDshNativeConfiguration(value)).toThrow('DSH configuration');
  });

  it.each(['native-bridge', 'sdk-jsonrpc-server', 'opencodian-native', 'llm-deepseek-account', 'authorization', 'credentials', 'fs-sandbox', 'tool-executor-native', 'aux-security', '__proto__'])('rejects non-allowlisted row %s', (namespace) => {
    expect(() => buildDshNativeConfigurationPatch(config(namespace, {}))).toThrow();
  });

  it.each([
    config('llm-deepseek', { maxToken: 10 }), config('approval', { policy: 'auto' }), config('tool-fs', { disabled: false }),
    config('llm-retry', { maxRetries: 5 }), config('image-offload', { enabled: true }), config('timeout-policy', { timeoutMs: 10 }), config('fs-observation-policy', { enabled: true }),
    pi({ unknown: true }), pi({ models: [{ id: 'x', customField: 'x' }] }), pi({ compat: { openRouterRouting: {} } }),
    pi({ providers: {} }), pi({ thinkingBudgets: { max: 100 } }), pi({ api: 'azure-openai-responses' }),
  ])('rejects unknown fields and unsupported upstream variants %#', (value) => expect(() => validateDshNativeConfiguration(value)).toThrow());

  it.each([
    ['llm-deepseek', 'maxTokens', 0], ['llm-deepseek', 'maxTokens', 1.5], ['llm-deepseek', 'streamIdleTimeoutMs', 0],
    ['llm-deepseek', 'streamIdleTimeoutMs', 2147483648], ['llm-deepseek', 'fileExpiresAfterSeconds', 3599],
    ['llm-deepseek', 'fileExpiresAfterSeconds', 2592001], ['llm-deepseek', 'fileQuotaCleanupBatch', 1001],
    ['llm-deepseek', 'modelsMaxAgeMs', -1], ['tool-fs', 'readLimit', 0], ['tool-web', 'fetchTimeoutMs', 0],
    ['subagent', 'maxDepth', -1], ['subagent', 'maxActiveSubagents', 0], ['jobs', 'retainBytes', Number.MAX_SAFE_INTEGER + 1],
    ['tool-jobs', 'inlineOutputBytes', -1], ['compaction-basic', 'thresholdRatio', 0], ['compaction-basic', 'thresholdRatio', 1.1],
    ['compaction-basic', 'retainTokens', -1], ['skill-filesystem', 'watchMaxProjects', 0],
  ])('validates %s.%s numeric boundary', (namespace, key, value) => expect(() => validateDshNativeConfiguration(config(String(namespace), { [String(key)]: value }))).toThrow());

  it.each([
    { timeoutMs: -1 }, { websocketConnectTimeoutMs: 1.5 }, { defaultInput: [] }, { maxRequestImages: 0 },
    { imageOffloadCountQuantum: 11, maxRequestImages: 10 }, { requestImagePixelBudget: 0 },
    { retryPolicy: { mode: 'always', maxRetries: 1 } }, { retryPolicy: { mode: 'normal', maxRetries: -1 } },
    { retryPolicy: { mode: 'normal', retryableCodes: [] } }, { retryPolicy: { mode: 'normal', retryableCodes: ['SERVER', 'SERVER'] } },
    { retryPolicy: { mode: 'normal', backoff: { initialDelayMs: 11, maxDelayMs: 10 } } },
    { retryPolicy: { mode: 'always', backoff: { jitterRatio: 2 } } },
    { models: [{ id: 'x' }, { id: 'x' }] }, { models: [{ name: 'No ID' }] },
    { models: [{ id: 'x' }], modelOverrides: { x: {} } }, { modelOverrides: { x: { id: 'x' } } },
    { models: [{ id: 'x', reasoningEfforts: {} }] }, { models: [{ id: 'x', reasoningEfforts: { off: null } }] },
    { models: [{ id: 'x', reasoningEfforts: { high: null } }] }, { models: [{ id: 'x', reasoningEfforts: { high: '' } }] },
    { models: [{ id: 'x', reasoningEfforts: { unknown: 'value' } }] },
    { api: 'anthropic-messages', compat: { supportsStore: true } },
    { api: 'openai-responses', models: [{ id: 'x', compat: { thinkingFormat: 'deepseek' } }] },
  ])('rejects invalid provider relationships %#', (value) => expect(() => validateDshNativeConfiguration(pi(value))).toThrow());

  it('accepts inherited catalogs, empty model inputs, supported zero values, and provider-specific compat', () => {
    expect(() => validateDshNativeConfiguration(pi({ models: [], modelOverrides: { 'catalog/model': { input: [] } }, timeoutMs: 0, websocketConnectTimeoutMs: 0 }))).not.toThrow();
    expect(() => validateDshNativeConfiguration(pi({ api: 'anthropic-messages', compat: { forceAdaptiveThinking: false, allowEmptySignature: true } }))).not.toThrow();
    expect(() => validateDshNativeConfiguration(pi({ thinkingBudgets: { high: -1 } }))).not.toThrow(); // The public schema accepts a number, not a guessed budget range.
    expect(() => validateDshNativeConfiguration(config('agent-default-model', { reasoningEffort: 'provider-specific-value' }))).not.toThrow();
  });

  it.each([
    { retainRatio: 0.1, retainTokens: 5 }, { thresholdRatio: 0.5, retainRatio: 0.5 },
    { summarizationProvider: 'p' }, { summarizationModel: 'm' }, { summarizationProvider: '', summarizationModel: 'm' },
    { modelPolicies: [{ provider: 'p' }] }, { modelPolicies: [{ provider: 'p', model: 'm' }, { provider: 'p', model: 'm' }] },
    { thresholdRatio: 0.5, modelPolicies: [{ provider: 'p', model: 'm', retainRatio: 0.8 }] },
    { modelPolicies: [{ provider: 'p', model: 'm', retainRatio: 0.1, retainTokens: 1 }] },
  ])('rejects compaction conflicts %#', (value) => expect(() => validateDshNativeConfiguration(config('compaction-basic', value))).toThrow());

  it.each([
    { thinking: 'disabled', reasoningEffort: 'high' }, { maxImagesPerRequest: 10, imageOffloadCountQuantum: 11 },
    { maxRequestFilesBytes: 100, imageOffloadByteQuantum: 101 }, { maxInlineRequestImageBytes: 100, inlineImageOffloadByteQuantum: 101 },
    { fileExpiresAfterSeconds: 3600, fileRefreshMarginSeconds: 3600 }, { models: [{ id: 'x', inputModalities: [] }] },
    { models: [{ id: 'x', inputModalities: ['text', 'text'] }] }, { models: [{ id: 'x', imageMaxBytes: 100 }] },
    { models: [{ id: 'x', inputModalities: ['text'], imagePixelBudget: 'low' }] }, { models: [{ id: 'x', name: '' }] },
  ])('rejects DeepSeek protocol conflicts %#', (value) => expect(() => validateDshNativeConfiguration(config('llm-deepseek', value))).toThrow());

  it.each([
    { presets: { custom: { sandbox: 'read-only', approval: 'ask' } } }, { defaultPreset: 'custom' },
    { presets: { auto: { sandbox: 'read-only', approval: 'ask' } } }, { defaultPreset: 'auto' },
    { presets: { readonly: { sandbox: 'read-only' } } }, { presets: { readonly: { sandbox: 'full', approval: 'ask' } } },
  ])('validates permission preset structure %#', (value) => expect(() => validateDshNativeConfiguration(config('permission', value))).toThrow());

  it.each([
    { apiKey: 'hidden-value' }, { apiKeyEnv: 'not a ref' }, { headers: { Authorization: 'opaque-value' } },
    { headers: { 'X-Api-Key': 'opaque-value' } }, { headers: { Cookie: 'opaque-value' } }, { headers: { 'X-Credential': 'opaque-value' } },
    { headers: { 'X-Tenant': 'line1\nline2' } }, { headers: { bad_name: 'allowed-name-but-test-will-use-control\0' } },
    { headers: { 'Bad Header': 'value' } }, { headers: { 'X-Tenant': 'a', 'x-tenant': 'b' } },
    { headers: { 'X-Tenant': 'a' }, headerCredentialRefs: { 'x-tenant': 'TENANT_REF' } },
    { headerCredentialRefs: { Authorization: 'sk-this-is-not-a-ref' } },
    { headerCredentialRefs: { Authorization: 'A', authorization: 'B' } },
    { compat: { chatTemplateKwargs: { apiKey: 'opaque-value' } } },
    { baseURL: 'https://user:pass@example.test' }, { baseURL: 'https://example.test?api_key=opaque-value' },
    { baseURL: 'file:///tmp/path' }, { baseURL: 'javascript:alert(1)' },
  ])('excludes raw secret paths and unsafe headers %#', (value) => expect(() => validateDshNativeConfiguration(pi(value))).toThrow());

  it('keeps error messages free of rejected values and arbitrary map keys', () => {
    const secret = 'sk-abcdefghijklmnop123456';
    const route = 'DO_NOT_ECHO_THIS_ROUTE';
    let message = '';
    try { validateDshNativeConfiguration(config('llm-pi-ai', { providers: { [route]: { headers: { Authorization: secret } } } })); }
    catch (error) { message = (error as Error).message; }
    expect(message).toContain('credential');
    expect(message).not.toContain(secret);
    expect(message).not.toContain(route);
  });

  it.each(['!!js process.exit()', 'prefix !!js/function x', '!<tag:yaml.org,2002:js> x'])('rejects executable YAML tag text %s', (value) => {
    expect(() => buildDshNativeConfigurationPatch(config('agent-default-model', { model: value }))).toThrow();
  });

  it.each([undefined, NaN, Infinity, -Infinity, BigInt(1), () => 1, Symbol('x'), new Date(), new Map()])('rejects non-JSON field values %#', (value) => {
    expect(() => validateDshNativeConfiguration(config('agent-default-model', { model: value }))).toThrow();
  });

  it('rejects prototypes, cycles, sparse arrays, symbols, and getters without invoking them', () => {
    const getter = jest.fn(() => 'do not run');
    const withGetter = Object.defineProperty({}, 'model', { enumerable: true, get: getter });
    const cycle: Record<string, unknown> = {}; cycle.self = cycle;
    for (const value of [
      withGetter, cycle, Object.create({ inherited: true }), { [Symbol('hidden')]: 'x' },
      JSON.parse('{"__proto__":{"polluted":true}}'), JSON.parse('{"constructor":{}}'), JSON.parse('{"prototype":{}}'),
      { models: new Array(1) }, Object.defineProperty({}, 'model', { value: 'x', enumerable: false }),
    ]) expect(() => validateDshNativeConfiguration(config('llm-deepseek', value))).toThrow();
    expect(getter).not.toHaveBeenCalled();
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });
});

describe('public field/group registry', () => {
  it('covers every audited namespace and identifies rows with no configurable fields', () => {
    expect(DSH_NATIVE_CONFIGURATION_SCHEMA_VERSION).toBe('0.2.2-rc.1');
    expect(new Set(DSH_NATIVE_CONFIGURATION_GROUPS.map((group) => group.namespace))).toEqual(new Set(Object.keys(full.overrides)));
    expect(DSH_NATIVE_CONFIGURATION_GROUPS.filter((group) => group.configuration === 'none').map((group) => group.namespace).sort()).toEqual(['fs-observation-policy', 'image-offload', 'llm-retry', 'timeout-policy']);
    for (const group of DSH_NATIVE_CONFIGURATION_GROUPS) {
      expect(group.entryId).toBe(group.namespace);
      expect(new Set(group.fields.map((field) => field.path)).size).toBe(group.fields.length);
    }
  });

  it('exposes nested provider model/compat fields, units, ranges, and secret-reference semantics', () => {
    const get = (namespace: string, path: string) => DSH_NATIVE_CONFIGURATION_FIELDS.find((field) => field.namespace === namespace && field.path === path);
    expect(get('llm-pi-ai', 'providers')).toMatchObject({ type: 'record', source: 'upstream' });
    expect(get('llm-pi-ai', 'providers.*.defaultMaxTokens')).toMatchObject({ type: 'number', unit: 'tokens', semantics: 'capacity-fallback', minimum: 1 });
    expect(get('llm-pi-ai', 'providers.*.models[].maxTokens')).toMatchObject({ semantics: 'request-limit' });
    expect(get('llm-pi-ai', 'providers.*.modelOverrides.*.compat.vllmPriority')).toMatchObject({ type: 'number', integer: true });
    expect(get('llm-pi-ai', 'providers.*.compat.chatTemplateKwargs.*.$var')).toMatchObject({ enumValues: ['thinking.enabled', 'thinking.effort', 'thinking.budget'] });
    expect(get('llm-pi-ai', 'providers.*.headerCredentialRefs')).toMatchObject({ source: 'plugin', sensitive: 'credential-reference', persistence: 'credential-reference' });
    expect(get('llm-pi-ai', 'providers.*.headerCredentialRefs.*')).toMatchObject({ source: 'plugin', sensitive: 'credential-reference' });
    expect(get('llm-deepseek', 'apiKeyEnv')).toMatchObject({ source: 'upstream', sensitive: 'credential-reference' });
    expect(get('llm-deepseek', 'fileExpiresAfterSeconds')).toMatchObject({ minimum: 3600, maximum: 2592000, unit: 'seconds' });
    expect(get('llm-deepseek', 'models[].imagePixelBudget')).toMatchObject({ alternatives: [{ type: 'number', minimum: 1, unit: 'pixels' }, { type: 'enum', enumValues: ['low'] }] });
    expect(get('llm-pi-ai', 'providers.*.models[].reasoningEfforts')?.alternatives?.[0]).toMatchObject({ type: 'boolean', literalValue: false });
    expect(get('compaction-basic', 'thresholdRatio')).toMatchObject({ exclusiveMinimum: 0, maximum: 1 });
    expect(DSH_NATIVE_CONFIGURATION_FIELDS.every((field) => field.labelKey === undefined)).toBe(true);
  });

  it('cannot mutate enum metadata into accepting an unrecognized value', () => {
    const policy = DSH_NATIVE_CONFIGURATION_FIELDS.find((field) => field.namespace === 'approval' && field.path === 'policy')!;
    expect(Object.isFrozen(policy.enumValues)).toBe(true);
    expect(() => (policy.enumValues as string[]).push('unsafe')).toThrow();
    expect(() => validateDshNativeConfiguration(config('approval', { policy: 'unsafe' }))).toThrow();
  });
});
