import { createHash } from 'node:crypto';

import type {
  DshCompactionPolicy,
  DshDeepSeekConfiguration,
  DshJsonObject,
  DshJsonValue,
  DshNativeConfiguration,
  DshNativeConfigurationFieldDescriptor,
  DshNativeConfigurationGroupDescriptor,
  DshNativeConfigurationNamespace,
  DshPiCompat,
  DshPiModelOverride,
  DshPiProvider,
  DshRetryPolicy,
} from '../../../types/dshConfiguration';

export type * from '../../../types/dshConfiguration';

/** Reviewed against installed public package schemas, never user profiles or credentials. */
export const DSH_NATIVE_CONFIGURATION_SCHEMA_VERSION = '0.2.2-rc.1';
const MAX_TIMER = 2_147_483_647;
const THINKING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;
const PROTOTYPE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const CREDENTIAL_REF = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SECRET_KEY = /^(?:api[-_]?key|api[-_]?secret|authorization|proxy[-_]?authorization|auth|password|passwd|secret|token|access[-_]?token|refresh[-_]?token|id[-_]?token|cookie|set[-_]?cookie|private[-_]?key|credentials)$/i;
const SECRET_HEADER = /(?:authorization|cookie|credential|(?:^|[-_])(?:api[-_]?key|token|secret|password|auth)(?:$|[-_]))/i;
const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

type FieldMetadata = Omit<DshNativeConfigurationFieldDescriptor, 'namespace' | 'path' | 'source' | 'persistence' | 'alternatives'> & {
  source?: 'upstream' | 'plugin';
  persistence?: 'vault' | 'credential-reference';
};
type Rule = FieldMetadata & {
  fields?: Record<string, Rule>;
  items?: Rule;
  alternatives?: Rule[];
  nonempty?: boolean;
  format?: 'url' | 'credential' | 'header' | 'header-reference' | 'template';
  unique?: boolean;
  rootUrlOnly?: boolean;
};
const text = (extra: Partial<Rule> = {}): Rule => ({ type: 'string', ...extra });
const bool = (extra: Partial<Rule> = {}): Rule => ({ type: 'boolean', ...extra });
const enumeration = (enumValues: readonly string[], extra: Partial<Rule> = {}): Rule => ({ type: 'enum', enumValues, ...extra });
const number = (extra: Partial<Rule> = {}): Rule => ({ type: 'number', ...extra });
const integer = (minimum = 1, unit?: FieldMetadata['unit'], extra: Partial<Rule> = {}): Rule => number({ integer: true, minimum, maximum: Number.MAX_SAFE_INTEGER, unit, ...extra });
const timer = (): Rule => number({ exclusiveMinimum: 0, maximum: MAX_TIMER, unit: 'ms', advanced: true });
const object = (fields: Record<string, Rule>, extra: Partial<Rule> = {}): Rule => ({ type: 'object', fields, ...extra });
const array = (items: Rule, extra: Partial<Rule> = {}): Rule => ({ type: 'array', items, ...extra });
const record = (items: Rule, extra: Partial<Rule> = {}): Rule => ({ type: 'record', items, ...extra });
const union = (...alternatives: Rule[]): Rule => ({ type: 'union', alternatives });
const credential = (): Rule => text({ format: 'credential', sensitive: 'credential-reference', semantics: 'credential-reference', persistence: 'credential-reference' });
const path = (): Rule => text({ semantics: 'filesystem-path' });
const capacity = (): Rule => integer(1, 'tokens', { semantics: 'capacity-fallback' });
const modalities = (minimumItems = 0): Rule => array(enumeration(['text', 'image']), { minimumItems });

const retry = object({
  mode: enumeration(['normal', 'always'], { required: true }),
  maxRetries: integer(0, 'count'),
  retryableCodes: array(text({ nonempty: true }), { minimumItems: 1, unique: true }),
  backoff: object({ initialDelayMs: timer(), maxDelayMs: timer(), jitterRatio: number({ minimum: 0, maximum: 1, unit: 'ratio' }) }),
}, { advanced: true });
const templateValue = union(text(), number(), bool(), { type: 'null' }, object({
  $var: enumeration(['thinking.enabled', 'thinking.effort', 'thinking.budget'], { required: true }),
  omitWhenOff: bool(),
}));
const compat = object({
  supportsStore: bool(), supportsDeveloperRole: bool(), supportsReasoningEffort: bool(), supportsUsageInStreaming: bool(),
  supportsFinishReason: bool(), maxTokensField: enumeration(['max_completion_tokens', 'max_tokens']),
  requiresToolResultName: bool(), requiresAssistantAfterToolResult: bool(), requiresThinkingAsText: bool(),
  requiresReasoningContentOnAssistantMessages: bool(),
  thinkingFormat: enumeration(['openai', 'deepseek', 'openrouter', 'together', 'baseten', 'zai', 'qwen', 'chat-template', 'qwen-chat-template', 'string-thinking', 'ant-ling']),
  chatTemplateKwargs: record(templateValue, { format: 'template' }),
  chatTemplateArgs: record(templateValue, { format: 'template' }),
  supportsThinkingTokenBudget: bool(),
  thinkingTokenBudgetField: enumeration(['thinking_token_budget', 'thinking_budget', 'thinking_budget_tokens']),
  vllmPriority: number({ integer: true }), supportsMaxOutputTokens: bool(), supportsStrictMode: bool(),
  cacheControlFormat: enumeration(['anthropic']), supportsLongCacheRetention: bool(), supportsEagerToolInputStreaming: bool(),
  supportsCacheControlOnTools: bool(), supportsTemperature: bool(), forceAdaptiveThinking: bool(), allowEmptySignature: bool(), supportsStrictTools: bool(),
}, { advanced: true });
const modelFields = {
  name: text(), contextWindow: integer(1, 'tokens'), maxTokens: integer(1, 'tokens', { semantics: 'request-limit' }),
  input: modalities(), reasoningEfforts: union(bool({ literalValue: false }), record(union(text(), { type: 'null' }))), compat,
};
const provider = object({
  apiKeyEnv: credential(), displayName: text({ nonempty: true }),
  api: enumeration(['openai-completions', 'openai-responses', 'anthropic-messages']), baseURL: text({ format: 'url' }),
  models: array(object({ id: text({ required: true, nonempty: true }), ...modelFields })), modelOverrides: record(object(modelFields)), compat,
  defaultContextWindow: capacity(), defaultMaxTokens: capacity(), defaultInput: modalities(1),
  headers: record(text(), { format: 'header', advanced: true }),
  headerCredentialRefs: record(credential(), { format: 'header-reference', source: 'plugin', sensitive: 'credential-reference', persistence: 'credential-reference', semantics: 'credential-reference', advanced: true }),
  reasoning: enumeration(THINKING_LEVELS),
  thinkingBudgets: object({ minimal: number({ unit: 'tokens' }), low: number({ unit: 'tokens' }), medium: number({ unit: 'tokens' }), high: number({ unit: 'tokens' }) }),
  cacheRetention: enumeration(['none', 'short', 'long']), transport: enumeration(['sse', 'websocket', 'websocket-cached', 'auto']),
  timeoutMs: integer(0, 'ms'), websocketConnectTimeoutMs: integer(0, 'ms'), streamIdleTimeoutMs: timer(),
  maxRequestImageBytes: integer(1, 'bytes'), maxRequestImages: integer(1, 'count'), imageOffloadCountQuantum: integer(1, 'count'),
  requestImagePixelBudget: integer(1, 'pixels'), requestImageMaxBytes: integer(1, 'bytes'), retryPolicy: retry,
});
const compactionFields = {
  thresholdRatio: number({ exclusiveMinimum: 0, maximum: 1, unit: 'ratio' }), headroomTokens: integer(0, 'tokens'),
  retainRatio: number({ exclusiveMinimum: 0, maximum: 1, unit: 'ratio' }), retainTokens: integer(0, 'tokens'),
  summarizationProvider: text(), summarizationModel: text(), maxTokens: integer(1, 'tokens'),
  compactionRetries: integer(0, 'count'), maxOverflowRetries: integer(0, 'count'),
};

/** Keys and row IDs both come from dsh-base/cordis.patch.yml. No arbitrary loader rows. */
const NAMESPACE_RULES: Record<DshNativeConfigurationNamespace, Rule> = {
  'agent-default-model': object({ provider: text({ nonempty: true }), model: text({ nonempty: true }), reasoningEffort: text() }),
  'llm-deepseek': object({
    apiKeyEnv: credential(), baseURL: text({ format: 'url', rootUrlOnly: true }), thinking: enumeration(['enabled', 'disabled']),
    reasoningEffort: enumeration(['off', 'low', 'high', 'max']), maxTokens: integer(1, 'tokens', { semantics: 'request-limit' }),
    defaultContextWindow: capacity(),
    models: array(object({
      id: text({ nonempty: true, required: true }), name: text({ nonempty: true }), description: text(), contextWindow: integer(1, 'tokens'), maxTokens: integer(1, 'tokens'),
      inputModalities: { ...modalities(1), unique: true }, imagePixelBudget: union(integer(1, 'pixels'), enumeration(['low'])), imageMaxBytes: integer(1, 'bytes'),
      systemPromptUpdate: enumeration(['in-history']), toolUpdate: enumeration(['in-history', 'addition-only']),
    })),
    streamIdleTimeoutMs: timer(), modelsTimeoutMs: timer(), modelsMaxAgeMs: integer(0, 'ms'),
    maxRequestFilesBytes: integer(1, 'bytes'), maxInlineRequestImageBytes: integer(1, 'bytes'), maxImagesPerRequest: integer(1, 'count'),
    imageOffloadByteQuantum: integer(1, 'bytes'), inlineImageOffloadByteQuantum: integer(1, 'bytes'), imageOffloadCountQuantum: integer(1, 'count'),
    filesApiTimeoutMs: timer(), fileExpiresAfterSeconds: integer(3600, 'seconds', { maximum: 2_592_000 }),
    fileRefreshMarginSeconds: integer(0, 'seconds'), fileQuotaCleanupBatch: integer(1, 'count', { maximum: 1000 }), retryPolicy: retry,
  }),
  'llm-pi-ai': object({ providers: record(provider) }),
  permission: object({
    presets: record(object({ sandbox: enumeration(['read-only', 'workspace-write', 'danger-full-access'], { required: true }), approval: enumeration(['ask', 'never'], { required: true }), name: text(), description: text() })),
    defaultPreset: text({ nonempty: true }),
  }),
  'sandbox-policy': object({ mode: enumeration(['read-only', 'workspace-write', 'danger-full-access']), workspaceRoot: path(), additionalWritableRoots: array(path()) }),
  approval: object({ policy: enumeration(['ask', 'never']) }),
  'compaction-basic': object({ ...compactionFields, auto: bool(), modelPolicies: array(object({ provider: text({ required: true, nonempty: true }), model: text({ required: true, nonempty: true }), ...compactionFields })) }),
  'skill-filesystem': object({
    providerName: text({ nonempty: true }), includeDefaultRoots: bool(), dshHome: path(), agentsHome: path(), customSkillDirs: array(path()),
    watch: bool(), watchUsePolling: bool(), watchStabilityThresholdMs: integer(1, 'ms'), watchPollIntervalMs: integer(1, 'ms'),
    watchMaxProjects: integer(1, 'count'), watchFollowSymlinks: bool(), bundledSkillDir: path(),
  }),
  'tool-web': object({ search: bool(), fetch: bool(), searchMaxResults: integer(1, 'count'), searchMaxQueries: integer(1, 'count'), searchSummaryMaxChars: integer(1, 'characters'), fetchTimeoutMs: integer(1, 'ms'), searchTimeoutMs: integer(1, 'ms'), fetchMaxOutputChars: integer(1, 'characters') }),
  web: object({ searchProvider: text(), fetchProvider: text() }),
  'tool-fs': object({ read: bool(), readImage: bool(), write: bool(), edit: bool(), applyPatch: bool(), readLimit: integer(1, 'lines'), readMaxLineLength: integer(1, 'characters'), readMaxBytes: integer(1, 'bytes'), readStreamMinSize: integer(1, 'bytes') }),
  'fs-observation-policy': object({}),
  subagent: object({ maxDepth: integer(0, 'count'), maxActiveSubagents: integer(1, 'count') }),
  'tool-todo': object({ allowParallelInProgress: bool() }),
  'tool-jobs': object({ waitTimeoutMs: number({ minimum: 1, unit: 'ms' }), maxWaitTimeoutMs: number({ minimum: 1, unit: 'ms' }), completionDelivery: enumeration(['quiet', 'wakeup']), maxConsecutiveWakes: number({ minimum: 1, unit: 'count' }), inlineOutputBytes: integer(0, 'bytes') }),
  jobs: object({ maxConcurrentJobsPerOwner: integer(1, 'count'), retainBytes: integer(1, 'bytes'), settledRetainBytes: integer(1, 'bytes'), pumpPollMs: integer(1, 'ms') }),
  'shell-env': object({ dshHome: path() }),
  'timeout-policy': object({}),
  'llm-retry': object({}),
  'image-offload': object({}),
};

const INTERNAL_RULE_KEYS = new Set(['fields', 'items', 'alternatives', 'nonempty', 'format', 'unique', 'rootUrlOnly']);
function descriptors(namespace: DshNativeConfigurationNamespace, rule: Rule, fieldPath = '', inheritedSource: 'upstream' | 'plugin' = 'upstream'): DshNativeConfigurationFieldDescriptor[] {
  const { fields, items, alternatives } = rule;
  const metadata = Object.fromEntries(Object.entries(rule).filter(([key]) => !INTERNAL_RULE_KEYS.has(key))) as FieldMetadata;
  const source = rule.source ?? inheritedSource;
  const current: DshNativeConfigurationFieldDescriptor[] = fieldPath ? [Object.freeze({
    ...metadata, namespace, path: fieldPath, source, persistence: rule.persistence ?? 'vault',
    ...(metadata.enumValues ? { enumValues: Object.freeze([...metadata.enumValues]) } : {}),
    ...(alternatives ? { alternatives: Object.freeze(alternatives.map((alternative) => descriptors(namespace, alternative, fieldPath, source)[0])) } : {}),
  })] : [];
  if (fields) for (const [key, child] of Object.entries(fields)) current.push(...descriptors(namespace, child, fieldPath ? `${fieldPath}.${key}` : key, source));
  if (items) current.push(...descriptors(namespace, items, `${fieldPath}${rule.type === 'array' ? '[]' : '.*'}`, source));
  if (alternatives) for (const alternative of alternatives) {
    // The union's own descriptor supplies the editor type; expose nested members without duplicate paths.
    const nested = descriptors(namespace, alternative, fieldPath, source).slice(1);
    for (const entry of nested) if (!current.some((existing) => existing.path === entry.path)) current.push(entry);
  }
  return current;
}

export const DSH_NATIVE_CONFIGURATION_GROUPS: readonly DshNativeConfigurationGroupDescriptor[] = Object.freeze(
  (Object.keys(NAMESPACE_RULES) as DshNativeConfigurationNamespace[]).map((namespace) => Object.freeze({
    namespace, entryId: namespace,
    configuration: Object.keys(NAMESPACE_RULES[namespace].fields ?? {}).length ? 'fields' as const : 'none' as const,
    fields: Object.freeze(descriptors(namespace, NAMESPACE_RULES[namespace])),
  })),
);
export const DSH_NATIVE_CONFIGURATION_FIELDS: readonly DshNativeConfigurationFieldDescriptor[] = Object.freeze(DSH_NATIVE_CONFIGURATION_GROUPS.flatMap((group) => group.fields));

function invalid(fieldPath: string, instruction: string): never {
  // Paths contain only schema-owned names and [entry]/[item], never raw map keys, URLs, or rejected values.
  throw new Error(`DSH configuration ${fieldPath}: ${instruction}`);
}
function jsonObject(value: DshJsonValue): value is DshJsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function secretText(value: string): boolean {
  return /(?:\b(?:sk|sk-ant|ghp|github_pat)[-_][A-Za-z0-9_-]{12,}|\bBearer\s+\S+|-----BEGIN [A-Z ]*PRIVATE KEY-----|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/i.test(value);
}

/** Inspect descriptors without invoking getters, including array-owned non-index properties. */
function jsonDataProperties(value: object, fieldPath: string): Record<string, PropertyDescriptor> {
  const isArray = Array.isArray(value);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== (isArray ? Array.prototype : Object.prototype) && !(prototype === null && !isArray)) invalid(fieldPath, 'use plain JSON objects and arrays');
  const properties = Object.getOwnPropertyDescriptors(value);
  if (Object.getOwnPropertySymbols(value).length) invalid(fieldPath, 'symbol properties are not JSON configuration');
  for (const [key, property] of Object.entries(properties)) {
    if (isArray && key === 'length') continue;
    if (PROTOTYPE_KEYS.has(key)) invalid(fieldPath, 'prototype-related keys are forbidden');
    if (!property.enumerable || !('value' in property)) invalid(fieldPath, 'use enumerable data properties, not accessors');
    if (isArray && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length)) invalid(fieldPath, 'array properties must be indexed JSON values');
  }
  return properties;
}
/** Clone only own JSON data properties. Never run a user getter, toJSON, or executable YAML tag. */
function cloneJson(value: unknown, fieldPath: string, ancestors = new Set<object>(), depth = 0): DshJsonValue {
  if (depth > 64) invalid(fieldPath, 'nesting exceeds the supported configuration depth');
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) invalid(fieldPath, 'use a finite JSON number');
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value === 'string') {
    if (value.includes('\0') || /!!js|!<tag:yaml\.org,2002:js/i.test(value)) invalid(fieldPath, 'executable YAML tags and NUL characters are not allowed');
    if (secretText(value)) invalid(fieldPath, 'store credentials outside vault settings and use a credential reference');
    return value;
  }
  if (typeof value !== 'object') invalid(fieldPath, 'use JSON data only (no undefined, functions, symbols, or bigint)');
  if (ancestors.has(value)) invalid(fieldPath, 'cyclic values are not JSON configuration');
  const properties = jsonDataProperties(value, fieldPath);
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const result: DshJsonValue[] = [];
      for (let index = 0; index < value.length; index++) {
        const property = properties[String(index)];
        if (!property) invalid(fieldPath, 'sparse arrays are not JSON configuration');
        result.push(cloneJson(property.value, `${fieldPath}[item]`, ancestors, depth + 1));
      }
      return result;
    }
    const result: DshJsonObject = {};
    for (const key of Object.keys(properties).sort()) result[key] = cloneJson(properties[key].value, `${fieldPath}[entry]`, ancestors, depth + 1);
    return result;
  } finally {
    ancestors.delete(value);
  }
}

function validateUrl(value: string, fieldPath: string, rootOnly = false): void {
  let url: URL;
  try { url = new URL(value); } catch { invalid(fieldPath, 'use an absolute HTTP(S) endpoint'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) invalid(fieldPath, 'use an HTTP(S) endpoint without inline credentials');
  if (rootOnly && (url.search || url.hash)) invalid(fieldPath, 'this provider requires an endpoint without query or fragment');
  for (const key of url.searchParams.keys()) if (SECRET_KEY.test(key) || SECRET_HEADER.test(key)) invalid(fieldPath, 'move URL credentials to a credential reference');
}
function validateMapKey(key: string, rule: Rule, fieldPath: string): void {
  const hasControl = [...key].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
  if (!key.length || hasControl || /!!js/i.test(key)) invalid(fieldPath, 'map keys must be non-empty plain names');
  if (rule.format === 'template' && SECRET_KEY.test(key)) invalid(fieldPath, 'secret-shaped template fields are not permitted; use a credential reference');
  if (rule.format === 'header' || rule.format === 'header-reference') {
    if (!HEADER_NAME.test(key)) invalid(fieldPath, 'use a valid HTTP header name');
    if (rule.format === 'header' && SECRET_HEADER.test(key)) invalid(fieldPath, 'authentication headers must use headerCredentialRefs, never raw values');
  }
}
function validateNumberRule(value: DshJsonValue, rule: Rule, fieldPath: string): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) invalid(fieldPath, 'use a finite number');
  if (rule.integer && !Number.isInteger(value)) invalid(fieldPath, 'use an integer');
  if (rule.minimum !== undefined && value < rule.minimum) invalid(fieldPath, `use a value at least ${rule.minimum}`);
  if (rule.maximum !== undefined && value > rule.maximum) invalid(fieldPath, `use a value no greater than ${rule.maximum}`);
  if (rule.exclusiveMinimum !== undefined && value <= rule.exclusiveMinimum) invalid(fieldPath, `use a value greater than ${rule.exclusiveMinimum}`);
  if (rule.exclusiveMaximum !== undefined && value >= rule.exclusiveMaximum) invalid(fieldPath, `use a value below ${rule.exclusiveMaximum}`);
}
function validateStringRule(value: DshJsonValue, rule: Rule, fieldPath: string): void {
  if (typeof value !== 'string' || (rule.nonempty && !value.length)) invalid(fieldPath, rule.nonempty ? 'use a non-empty string' : 'use a string');
  if (rule.format === 'url') validateUrl(value, fieldPath, rule.rootUrlOnly);
  if (rule.format === 'credential' && !CREDENTIAL_REF.test(value)) invalid(fieldPath, 'use an environment-style credential reference name, not the secret');
}
function validateArrayRule(value: DshJsonValue, rule: Rule, fieldPath: string): void {
  if (!Array.isArray(value)) invalid(fieldPath, 'use an array');
  if (value.length < (rule.minimumItems ?? 0)) invalid(fieldPath, `include at least ${rule.minimumItems} item(s)`);
  if (rule.unique && new Set(value.map((item) => JSON.stringify(item))).size !== value.length) invalid(fieldPath, 'remove duplicate items');
  for (const item of value) validateRule(item, rule.items!, `${fieldPath}[]`);
}
function validateObjectRule(value: DshJsonValue, rule: Rule, fieldPath: string): void {
  if (!jsonObject(value)) invalid(fieldPath, 'use an object');
  const fields = rule.fields ?? {};
  for (const [key, child] of Object.entries(fields)) if (child.required && !Object.prototype.hasOwnProperty.call(value, key)) invalid(`${fieldPath}.${key}`, 'this field is required');
  for (const [key, childValue] of Object.entries(value)) {
    if (!Object.prototype.hasOwnProperty.call(fields, key)) invalid(fieldPath, 'contains an unknown or forbidden field; use the published field registry');
    validateRule(childValue, fields[key], `${fieldPath}.${key}`);
  }
}
function validateRecordRule(value: DshJsonValue, rule: Rule, fieldPath: string): void {
  if (!jsonObject(value)) invalid(fieldPath, 'use an object keyed by names');
  for (const [key, childValue] of Object.entries(value)) {
    validateMapKey(key, rule, fieldPath);
    validateRule(childValue, rule.items!, `${fieldPath}[entry]`);
    if (rule.format === 'header' && typeof childValue === 'string' && /[^\t\x20-\x7e\x80-\xff]/.test(childValue)) invalid(fieldPath, 'header values must be single-line HTTP bytes');
  }
}
function validateUnionRule(value: DshJsonValue, rule: Rule, fieldPath: string): void {
  for (const alternative of rule.alternatives ?? []) {
    try { validateRule(value, alternative, fieldPath); return; } catch { /* Try the next declared alternative. */ }
  }
  invalid(fieldPath, 'value does not match a supported schema alternative');
}
function validateRule(value: DshJsonValue, rule: Rule, fieldPath: string): void {
  if ('literalValue' in rule && value !== rule.literalValue) invalid(fieldPath, 'use the supported literal value');
  switch (rule.type) {
    case 'union': return validateUnionRule(value, rule, fieldPath);
    case 'null': if (value !== null) invalid(fieldPath, 'use null'); return;
    case 'boolean': if (typeof value !== 'boolean') invalid(fieldPath, 'use true or false'); return;
    case 'number': return validateNumberRule(value, rule, fieldPath);
    case 'enum':
      if (typeof value !== 'string' || !rule.enumValues?.includes(value)) invalid(fieldPath, `choose one of ${rule.enumValues?.join(', ')}`);
      return;
    case 'string': return validateStringRule(value, rule, fieldPath);
    case 'array': return validateArrayRule(value, rule, fieldPath);
    case 'object': return validateObjectRule(value, rule, fieldPath);
    case 'record': return validateRecordRule(value, rule, fieldPath);
  }
}

function validateRetry(value: DshRetryPolicy | undefined, fieldPath: string): void {
  if (!value) return;
  if (value.mode === 'always' && ('maxRetries' in value || 'retryableCodes' in value)) invalid(fieldPath, 'always mode cannot specify maxRetries or retryableCodes');
  const backoff = value.backoff;
  if (backoff?.initialDelayMs !== undefined && backoff.maxDelayMs !== undefined && backoff.initialDelayMs > backoff.maxDelayMs) invalid(`${fieldPath}.backoff`, 'initialDelayMs must not exceed maxDelayMs');
}
function validateCompaction(value: DshCompactionPolicy, fieldPath: string, inherited?: DshCompactionPolicy): void {
  if (value.retainRatio !== undefined && value.retainTokens !== undefined) invalid(fieldPath, 'retainRatio and retainTokens are mutually exclusive');
  const hasProvider = value.summarizationProvider !== undefined;
  const hasModel = value.summarizationModel !== undefined;
  if (hasProvider !== hasModel || (hasProvider && Boolean(value.summarizationProvider) !== Boolean(value.summarizationModel))) invalid(fieldPath, 'summarizationProvider and summarizationModel must be set together as an empty or non-empty pair');
  const threshold = value.thresholdRatio ?? inherited?.thresholdRatio;
  const retained = value.retainTokens === undefined ? value.retainRatio ?? (inherited?.retainTokens === undefined ? inherited?.retainRatio : undefined) : undefined;
  if (threshold !== undefined && retained !== undefined && retained >= threshold) invalid(fieldPath, 'retainRatio must be less than thresholdRatio');
}
const RESPONSES_COMPAT = new Set(['supportsDeveloperRole', 'supportsMaxOutputTokens', 'supportsStrictMode', 'supportsLongCacheRetention']);
const ANTHROPIC_COMPAT = new Set(['supportsLongCacheRetention', 'supportsEagerToolInputStreaming', 'supportsCacheControlOnTools', 'supportsTemperature', 'forceAdaptiveThinking', 'allowEmptySignature', 'supportsStrictTools']);
function validateCompat(value: DshPiCompat | undefined, api: DshPiProvider['api'], fieldPath: string): void {
  if (!value || !api) return; // An inherited catalog protocol must be checked after native composition.
  for (const key of Object.keys(value)) {
    const supported = api === 'openai-responses' ? RESPONSES_COMPAT.has(key)
      : api === 'anthropic-messages' ? ANTHROPIC_COMPAT.has(key)
        : key !== 'supportsMaxOutputTokens' && (!ANTHROPIC_COMPAT.has(key) || key === 'supportsLongCacheRetention');
    if (!supported) invalid(fieldPath, 'a compatibility switch is not supported by the explicit route api');
  }
}
function validateModel(value: DshPiModelOverride, api: DshPiProvider['api'], fieldPath: string): void {
  const efforts = value.reasoningEfforts;
  if (efforts && typeof efforts === 'object') {
    const keys = Object.keys(efforts);
    if (!keys.some((key) => key !== 'off')) invalid(`${fieldPath}.reasoningEfforts`, 'declare a thinking level beyond off, or use false');
    for (const [key, wire] of Object.entries(efforts)) {
      if (!THINKING_LEVELS.includes(key as typeof THINKING_LEVELS[number])) invalid(`${fieldPath}.reasoningEfforts`, 'contains an unknown thinking level');
      if (wire === '' || (wire === null && key !== 'off')) invalid(`${fieldPath}.reasoningEfforts`, 'thinking levels need a non-empty wire value; only off may use null');
    }
  }
  validateCompat(value.compat, api, `${fieldPath}.compat`);
}
function uniqueModels(models: Array<{ id: string }> | undefined, fieldPath: string): void {
  if (models && new Set(models.map((model) => model.id)).size !== models.length) invalid(fieldPath, 'model IDs must be unique');
}
function validateProvider(value: DshPiProvider, fieldPath: string): void {
  if (value.models?.length && Object.keys(value.modelOverrides ?? {}).length) invalid(fieldPath, 'models and modelOverrides cannot both customize the catalog');
  if (value.imageOffloadCountQuantum !== undefined && value.maxRequestImages !== undefined && value.imageOffloadCountQuantum > value.maxRequestImages) invalid(fieldPath, 'imageOffloadCountQuantum must not exceed maxRequestImages');
  uniqueModels(value.models, `${fieldPath}.models`);
  validateCompat(value.compat, value.api, `${fieldPath}.compat`);
  for (const model of value.models ?? []) validateModel(model, value.api, `${fieldPath}.models[]`);
  for (const model of Object.values(value.modelOverrides ?? {})) validateModel(model, value.api, `${fieldPath}.modelOverrides[entry]`);
  const headers = new Set(Object.keys(value.headers ?? {}).map((key) => key.toLowerCase()));
  const references = new Set<string>();
  for (const key of Object.keys(value.headerCredentialRefs ?? {})) {
    const folded = key.toLowerCase();
    if (headers.has(folded) || references.has(folded)) invalid(`${fieldPath}.headerCredentialRefs`, 'header names must be unique and cannot also occur in headers');
    references.add(folded);
  }
  if (headers.size !== Object.keys(value.headers ?? {}).length) invalid(`${fieldPath}.headers`, 'header names must be unique ignoring case');
  validateRetry(value.retryPolicy, `${fieldPath}.retryPolicy`);
}
function validateDeepSeekRelationships(deepseek: DshDeepSeekConfiguration): void {
  if (deepseek.thinking === 'disabled' && deepseek.reasoningEffort !== undefined && deepseek.reasoningEffort !== 'off') invalid('overrides.llm-deepseek', 'disabled thinking permits only reasoningEffort off');
  for (const [quantum, maximum] of [['imageOffloadByteQuantum', 'maxRequestFilesBytes'], ['inlineImageOffloadByteQuantum', 'maxInlineRequestImageBytes'], ['imageOffloadCountQuantum', 'maxImagesPerRequest']] as const) {
    if (deepseek[quantum] !== undefined && deepseek[maximum] !== undefined && deepseek[quantum]! > deepseek[maximum]!) invalid('overrides.llm-deepseek', `${quantum} must not exceed ${maximum}`);
  }
  if (deepseek.fileRefreshMarginSeconds !== undefined && deepseek.fileExpiresAfterSeconds !== undefined && deepseek.fileRefreshMarginSeconds >= deepseek.fileExpiresAfterSeconds) invalid('overrides.llm-deepseek', 'fileRefreshMarginSeconds must be below fileExpiresAfterSeconds');
  uniqueModels(deepseek.models, 'overrides.llm-deepseek.models');
  for (const model of deepseek.models ?? []) {
    if (!(model.inputModalities ?? ['text']).includes('image') && (model.imagePixelBudget !== undefined || model.imageMaxBytes !== undefined)) invalid('overrides.llm-deepseek.models[]', 'image request limits require an image input modality');
  }
  validateRetry(deepseek.retryPolicy, 'overrides.llm-deepseek.retryPolicy');
}
function validateRelationships(value: DshNativeConfiguration): void {
  const overrides = value.overrides;
  if (overrides['llm-deepseek']) validateDeepSeekRelationships(overrides['llm-deepseek']);
  for (const provider of Object.values(overrides['llm-pi-ai']?.providers ?? {})) validateProvider(provider, 'overrides.llm-pi-ai.providers[entry]');
  const compaction = overrides['compaction-basic'];
  if (compaction) {
    validateCompaction(compaction, 'overrides.compaction-basic');
    const targets = new Set<string>();
    for (const policy of compaction.modelPolicies ?? []) {
      validateCompaction(policy, 'overrides.compaction-basic.modelPolicies[]', compaction);
      const target = JSON.stringify([policy.provider, policy.model]);
      if (targets.has(target)) invalid('overrides.compaction-basic.modelPolicies', 'each provider/model target must be unique');
      targets.add(target);
    }
  }
  const permission = overrides.permission;
  for (const reserved of ['custom', 'auto']) {
    if (permission?.defaultPreset === reserved || Object.prototype.hasOwnProperty.call(permission?.presets ?? {}, reserved)) invalid('overrides.permission', 'custom and auto are reserved session states; choose a configured preset');
  }
}

/** Missing configuration inherits everything. Invalid persisted values throw without pruning or coercion. */
export function normalizeDshNativeConfiguration(value: unknown): DshNativeConfiguration {
  return validateDshNativeConfiguration(value);
}

/** Validate and return a detached, deterministically ordered JSON copy; diagnostics never echo values. */
export function validateDshNativeConfiguration(value: unknown): DshNativeConfiguration {
  if (value === undefined) return { version: 1, overrides: {} };
  const copy = cloneJson(value, 'input');
  if (!jsonObject(copy)) invalid('input', 'use a versioned configuration object');
  if (Object.keys(copy).some((key) => key !== 'version' && key !== 'overrides')) invalid('input', 'only version and overrides are allowed');
  if (copy.version !== 1) invalid('version', 'unsupported version; expected 1');
  if (!jsonObject(copy.overrides)) invalid('overrides', 'use an object of allowlisted namespaces');
  for (const [namespace, settings] of Object.entries(copy.overrides)) {
    if (!Object.prototype.hasOwnProperty.call(NAMESPACE_RULES, namespace)) invalid('overrides', 'unknown namespace; loader, bridge, and auxiliary security rows are not editable');
    validateRule(settings, NAMESPACE_RULES[namespace as DshNativeConfigurationNamespace], `overrides.${namespace}`);
  }
  const configuration = copy as unknown as DshNativeConfiguration;
  validateRelationships(configuration);
  return { version: 1, overrides: configuration.overrides };
}

/** Content digest of validated intent; it is not evidence that the backend applied that intent. */
export function dshNativeConfigurationRevision(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(validateDshNativeConfiguration(value)), 'utf8').digest('hex');
}

export type DshNativeConfigurationEntry = { id: DshNativeConfigurationNamespace; config: DshJsonObject };

/** Declarative partial rows. The launcher must merge inherited configs before whole-row native patches. */
export function buildDshNativeConfigurationEntries(value: unknown): DshNativeConfigurationEntry[] {
  const configuration = validateDshNativeConfiguration(value);
  const entries: DshNativeConfigurationEntry[] = [];
  for (const namespace of Object.keys(configuration.overrides).sort() as DshNativeConfigurationNamespace[]) {
    const config = configuration.overrides[namespace] as DshJsonObject;
    if (!Object.keys(config).length) continue;
    if (namespace === 'llm-pi-ai' && jsonObject(config.providers)) {
      // References stay in the validated envelope for launcher/runtime resolution, not native Config.
      config.providers = Object.fromEntries(Object.entries(config.providers).map(([route, provider]) => {
        if (!jsonObject(provider)) return [route, provider];
        const native = Object.fromEntries(Object.entries(provider).filter(([key]) => key !== 'headerCredentialRefs'));
        return [route, native];
      }));
    }
    entries.push({ id: namespace, config });
  }
  return entries;
}

/** JSON is a declarative YAML subset: every string/key is quoted and no scalar can create !!js. */
export function buildDshNativeConfigurationPatch(value: unknown): string {
  const json = JSON.stringify(buildDshNativeConfigurationEntries(value), null, 2)
    .replace(/[\u0085\u2028\u2029]/g, (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`);
  return `${json}\n`;
}
