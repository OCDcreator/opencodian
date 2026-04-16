import type {
  OpencodeConfig,
  OpencodeModelConfigSubset,
  OpencodeProviderConfig,
} from '../types';

export const OPENCODE_SCHEMA_URL = 'https://opencode.ai/config.json';

const MODEL_KEYS: Array<keyof OpencodeModelConfigSubset> = [
  'model',
  'small_model',
  'provider',
  'enabled_providers',
  'disabled_providers',
];

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function stripJsonComments(text: string): string {
  let result = '';
  let inString = false;
  let escape = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let index = 0; index < text.length; index += 1) {
    const current = text[index];
    const next = text[index + 1];

    if (inLineComment) {
      if (current === '\n') {
        inLineComment = false;
        result += current;
      }
      continue;
    }

    if (inBlockComment) {
      if (current === '*' && next === '/') {
        inBlockComment = false;
        index += 1;
      }
      continue;
    }

    if (inString) {
      result += current;
      if (escape) {
        escape = false;
        continue;
      }
      if (current === '\\') {
        escape = true;
        continue;
      }
      if (current === '"') {
        inString = false;
      }
      continue;
    }

    if (current === '"') {
      inString = true;
      result += current;
      continue;
    }

    if (current === '/' && next === '/') {
      inLineComment = true;
      index += 1;
      continue;
    }

    if (current === '/' && next === '*') {
      inBlockComment = true;
      index += 1;
      continue;
    }

    result += current;
  }

  return result;
}

export function parseOpencodeConfigText(text: string): OpencodeConfig {
  return JSON.parse(stripJsonComments(text)) as OpencodeConfig;
}

export function extractModelConfig(config: OpencodeConfig): OpencodeModelConfigSubset {
  const next: OpencodeModelConfigSubset = {};

  for (const key of MODEL_KEYS) {
    const value = config[key];
    if (value === undefined) {
      continue;
    }

    if (key === 'provider' && isRecord(value)) {
      next.provider = JSON.parse(JSON.stringify(value)) as Record<string, OpencodeProviderConfig>;
      continue;
    }

    if ((key === 'enabled_providers' || key === 'disabled_providers') && Array.isArray(value)) {
      next[key] = [...value].filter((item): item is string => typeof item === 'string');
      continue;
    }

    if ((key === 'model' || key === 'small_model') && typeof value === 'string') {
      next[key] = value;
    }
  }

  return next;
}

export function applyModelConfig(
  config: OpencodeConfig,
  subset: OpencodeModelConfigSubset,
): OpencodeConfig {
  const next: OpencodeConfig = { ...config };

  for (const key of MODEL_KEYS) {
    delete next[key];
  }

  const cleaned = cleanupModelConfig(subset);
  return {
    ...next,
    ...cleaned,
  };
}

export function cleanupModelConfig(subset: OpencodeModelConfigSubset): OpencodeModelConfigSubset {
  const next: OpencodeModelConfigSubset = {};

  if (typeof subset.model === 'string' && subset.model.trim()) {
    next.model = subset.model.trim();
  }

  if (typeof subset.small_model === 'string' && subset.small_model.trim()) {
    next.small_model = subset.small_model.trim();
  }

  if (isRecord(subset.provider) && Object.keys(subset.provider).length > 0) {
    next.provider = JSON.parse(JSON.stringify(subset.provider)) as Record<string, OpencodeProviderConfig>;
  }

  if (Array.isArray(subset.enabled_providers)) {
    const values = uniqueStrings(subset.enabled_providers);
    next.enabled_providers = values;
  }

  if (Array.isArray(subset.disabled_providers)) {
    const values = uniqueStrings(subset.disabled_providers);
    next.disabled_providers = values;
  }

  return next;
}

export function mergeModelConfigSubsets(
  base: OpencodeModelConfigSubset | null | undefined,
  override: OpencodeModelConfigSubset | null | undefined,
): OpencodeModelConfigSubset {
  const next: OpencodeModelConfigSubset = {};

  if (typeof base?.model === 'string') {
    next.model = base.model;
  }
  if (typeof base?.small_model === 'string') {
    next.small_model = base.small_model;
  }
  if (isRecord(base?.provider)) {
    next.provider = cloneProviderRecord(base.provider);
  }
  if (Array.isArray(base?.enabled_providers)) {
    next.enabled_providers = uniqueStrings(base.enabled_providers);
  }
  if (Array.isArray(base?.disabled_providers)) {
    next.disabled_providers = uniqueStrings(base.disabled_providers);
  }

  if (typeof override?.model === 'string') {
    next.model = override.model;
  }
  if (typeof override?.small_model === 'string') {
    next.small_model = override.small_model;
  }
  if (isRecord(override?.provider)) {
    next.provider = mergeProviderRecords(next.provider, override.provider);
  }
  if (Array.isArray(override?.enabled_providers)) {
    next.enabled_providers = uniqueStrings(override.enabled_providers);
  }
  if (Array.isArray(override?.disabled_providers)) {
    next.disabled_providers = uniqueStrings(override.disabled_providers);
  }

  return cleanupModelConfig(next);
}

export function parseModelReference(value: string | undefined): { provider: string; model: string } | null {
  if (typeof value !== 'string') {
    return null;
  }

  const slash = value.indexOf('/');
  if (slash <= 0 || slash >= value.length - 1) {
    return null;
  }

  const provider = value.slice(0, slash).trim();
  const model = value.slice(slash + 1).trim();
  if (!provider || !model) {
    return null;
  }

  return { provider, model };
}

export function formatModelReference(
  provider: string | null | undefined,
  model: string | null | undefined,
): string {
  const trimmedProvider = provider?.trim() ?? '';
  const trimmedModel = model?.trim() ?? '';
  return trimmedProvider && trimmedModel ? `${trimmedProvider}/${trimmedModel}` : '';
}

export function collectConfiguredProviderIds(
  subset: Pick<OpencodeModelConfigSubset, 'model' | 'small_model' | 'provider' | 'enabled_providers' | 'disabled_providers'>,
): string[] {
  const providerIds = new Set<string>();

  if (isRecord(subset.provider)) {
    for (const providerId of Object.keys(subset.provider)) {
      const trimmed = providerId.trim();
      if (trimmed) {
        providerIds.add(trimmed);
      }
    }
  }

  for (const modelRef of [parseModelReference(subset.model), parseModelReference(subset.small_model)]) {
    if (modelRef) {
      providerIds.add(modelRef.provider);
    }
  }

  for (const providerId of uniqueStrings(subset.enabled_providers ?? [])) {
    providerIds.add(providerId);
  }

  for (const providerId of uniqueStrings(subset.disabled_providers ?? [])) {
    providerIds.add(providerId);
  }

  return [...providerIds];
}

export function uniqueStrings(values: string[]): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    ),
  );
}

export function cloneUnknown<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => cloneUnknown(item)) as T;
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, cloneUnknown(item)]),
    ) as T;
  }

  return value;
}

export function mergeUnknown(base: unknown, override: unknown): unknown {
  if (Array.isArray(override)) {
    return cloneUnknown(override);
  }

  if (isRecord(base) && isRecord(override)) {
    const next: Record<string, unknown> = Object.fromEntries(
      Object.entries(base).map(([key, value]) => [key, cloneUnknown(value)]),
    );

    for (const [key, value] of Object.entries(override)) {
      next[key] = key in next ? mergeUnknown(next[key], value) : cloneUnknown(value);
    }

    return next;
  }

  return cloneUnknown(override);
}

export function cloneProviderRecord(
  provider: Record<string, OpencodeProviderConfig>,
): Record<string, OpencodeProviderConfig> {
  return cloneUnknown(provider);
}

export function mergeProviderRecords(
  base: Record<string, OpencodeProviderConfig> | undefined,
  override: Record<string, OpencodeProviderConfig>,
): Record<string, OpencodeProviderConfig> {
  const next = base ? cloneProviderRecord(base) : {};

  for (const [providerId, providerConfig] of Object.entries(override)) {
    const existing = next[providerId];
    next[providerId] = (
      existing
        ? mergeUnknown(existing, providerConfig)
        : cloneUnknown(providerConfig)
    ) as OpencodeProviderConfig;
  }

  return next;
}

export function setAvailabilityOverride(
  subset: OpencodeModelConfigSubset,
  key: 'enabled_providers' | 'disabled_providers',
  nextValues: string[] | undefined,
  inheritedValues: string[] | undefined,
): void {
  const normalizedNext = Array.isArray(nextValues) ? uniqueStrings(nextValues) : undefined;
  const normalizedInherited = Array.isArray(inheritedValues) ? uniqueStrings(inheritedValues) : undefined;

  if (
    sameStringArrays(normalizedNext, normalizedInherited)
    || (!normalizedInherited && (!normalizedNext || normalizedNext.length === 0))
  ) {
    delete subset[key];
    return;
  }

  subset[key] = normalizedNext ?? [];
}

export function sameStringArrays(left: string[] | undefined, right: string[] | undefined): boolean {
  if (left === right) {
    return true;
  }

  if (!left || !right) {
    return !left && !right;
  }

  if (left.length !== right.length) {
    return false;
  }

  const rightValues = new Set(right);
  return left.every((value) => rightValues.has(value));
}
