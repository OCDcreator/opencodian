import { requestUrl } from 'obsidian';

import type { StorageService } from '../storage';
import type { BackendSettings, ContextUsageSnapshot } from '../types';
import type { AgentBackendKind } from '../types/chat';
import type {
  ContextCostDetails,
  ContextCostTokenKind,
  ModelPricingCatalog,
  ModelPricingCatalogEntry,
  ModelPricingOverride,
  ModelPricingRates,
} from '../types/pricing';

const MODELS_DEV_CATALOG_URL = 'https://models.dev/api.json';
const AUTO_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;

type JsonRecord = Record<string, unknown>;

interface CostAccumulator {
  knownSubtotal: number;
  hasPricedTokens: boolean;
  unavailableTokenKinds: ContextCostTokenKind[];
}

interface PricingIdentity {
  providerId: string | null;
  endpoint: string | null;
  modelId: string | null;
}

interface EffectivePricing {
  catalogEntry: ModelPricingCatalogEntry | null;
  endpointOverride: ModelPricingOverride | null;
  providerOverride: ModelPricingOverride | null;
  rates: ModelPricingRates | null;
}

/** Backend-specific billing routing hint. It never changes the backend request endpoint. */
export interface ModelPricingIdentityHint {
  providerId?: string | null;
  endpoint?: string | null;
  modelId?: string | null;
}

export interface ModelPricingServiceOptions {
  storage: Pick<StorageService, 'loadModelPricingCatalog' | 'saveModelPricingCatalog'>;
  getOverrides: () => readonly ModelPricingOverride[];
  fetchCatalog?: () => Promise<unknown>;
}

export interface ModelPricingStatus {
  fetchedAt: number | null;
  entryCount: number;
}

export interface ModelPricingOverrideDraft extends ModelPricingRates {
  providerId: string;
  endpoint?: string | null;
  modelId: string;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readNonNegativeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function normalizeId(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase() ?? '';
  return normalized.length > 0 ? normalized : null;
}

function normalizeEndpoint(value: string | null | undefined): string | null {
  const normalized = value?.trim().replace(/\/+$/, '') ?? '';
  return normalized.length > 0 ? normalized : null;
}

function normalizeRates(value: unknown): ModelPricingRates {
  const record = isRecord(value) ? value : {};
  return {
    inputPerMillion: readNonNegativeNumber(record.input),
    outputPerMillion: readNonNegativeNumber(record.output),
    cacheReadPerMillion: readNonNegativeNumber(record.cache_read),
    cacheWritePerMillion: readNonNegativeNumber(record.cache_write),
  };
}

function mergeRates(
  catalogRates: ModelPricingRates | null,
  ...overrides: Array<ModelPricingOverride | null>
): ModelPricingRates | null {
  if (!catalogRates && !overrides.some((override) => override !== null)) {
    return null;
  }

  const resolveRate = (key: keyof ModelPricingRates): number | null =>
    overrides.find((override) => override !== null && override[key] !== null)?.[key]
      ?? catalogRates?.[key]
      ?? null;

  const rates: ModelPricingRates = {
    inputPerMillion: resolveRate('inputPerMillion'),
    outputPerMillion: resolveRate('outputPerMillion'),
    cacheReadPerMillion: resolveRate('cacheReadPerMillion'),
    cacheWritePerMillion: resolveRate('cacheWritePerMillion'),
  };
  return Object.values(rates).some((rate) => rate !== null) ? rates : null;
}

function hasConfiguredRate(override: ModelPricingOverride | null): boolean {
  return override !== null && Object.values({
    input: override.inputPerMillion,
    output: override.outputPerMillion,
    cacheRead: override.cacheReadPerMillion,
    cacheWrite: override.cacheWritePerMillion,
  }).some((rate) => rate !== null);
}

function inferProviderId(modelId: string | null): string | null {
  if (!modelId) {
    return null;
  }

  if (modelId.startsWith('claude')) {
    return 'anthropic';
  }
  if (modelId.startsWith('gpt') || modelId.startsWith('o1') || modelId.startsWith('o3') || modelId.startsWith('o4')) {
    return 'openai';
  }
  return null;
}

function buildUnavailableCostDetails(
  providerId: string | null,
  endpoint: string | null,
  modelId: string | null,
): ContextCostDetails {
  return {
    source: 'unavailable',
    completeness: 'unavailable',
    providerId,
    endpoint,
    modelId,
    rates: null,
    catalogFetchedAt: null,
    usesBaseTier: false,
    unavailableTokenKinds: [],
  };
}

function buildBackendReportedCostDetails(
  providerId: string | null,
  endpoint: string | null,
  modelId: string | null,
): ContextCostDetails {
  return {
    source: 'backend-reported',
    completeness: 'complete',
    providerId,
    endpoint,
    modelId,
    rates: null,
    catalogFetchedAt: null,
    usesBaseTier: false,
    unavailableTokenKinds: [],
  };
}

function addPricedTokens(
  accumulator: CostAccumulator,
  tokenKind: ContextCostTokenKind,
  tokenCount: number | null,
  rate: number | null,
): void {
  if (tokenCount === null) {
    if (rate !== null) {
      accumulator.unavailableTokenKinds.push(tokenKind);
    }
    return;
  }
  if (tokenCount <= 0) {
    return;
  }
  if (rate === null) {
    accumulator.unavailableTokenKinds.push(tokenKind);
    return;
  }
  accumulator.knownSubtotal += (tokenCount * rate) / 1_000_000;
  accumulator.hasPricedTokens = true;
}

/**
 * Holds a locally cached models.dev catalogue and turns authoritative token
 * snapshots into clearly-labelled local API-equivalent estimates.
 */
export class ModelPricingService {
  private catalog: ModelPricingCatalog | null = null;

  constructor(private readonly options: ModelPricingServiceOptions) {}

  async load(): Promise<void> {
    this.catalog = await this.options.storage.loadModelPricingCatalog();
    if (!this.shouldAutoRefresh()) {
      return;
    }

    try {
      await this.refresh();
    } catch {
      // Cost estimates stay optional: an offline startup retains a stale cache
      // or shows unavailable pricing instead of failing plugin initialization.
    }
  }

  getStatus(): ModelPricingStatus {
    return {
      fetchedAt: this.catalog?.fetchedAt ?? null,
      entryCount: this.catalog?.entries.length ?? 0,
    };
  }

  getCatalogEntries(): readonly ModelPricingCatalogEntry[] {
    return this.catalog?.entries ?? [];
  }

  getCatalogEntry(providerId: string, modelId: string): ModelPricingCatalogEntry | null {
    const normalizedProviderId = normalizeId(providerId);
    const normalizedModelId = normalizeId(modelId);
    if (!normalizedProviderId || !normalizedModelId) {
      return null;
    }

    return this.catalog?.entries.find((entry) =>
      entry.providerId === normalizedProviderId && entry.modelId === normalizedModelId,
    ) ?? null;
  }

  getOverride(providerId: string, modelId: string, endpoint?: string | null): ModelPricingOverride | null {
    const normalizedProviderId = normalizeId(providerId);
    const normalizedModelId = normalizeId(modelId);
    const normalizedEndpoint = normalizeEndpoint(endpoint);
    if (!normalizedProviderId || !normalizedModelId) {
      return null;
    }

    const matchesIdentity = (override: ModelPricingOverride): boolean =>
      normalizeId(override.providerId) === normalizedProviderId
      && normalizeId(override.modelId) === normalizedModelId;
    const matches = this.options.getOverrides().filter(matchesIdentity);
    if (normalizedEndpoint) {
      return matches.find((override) => normalizeEndpoint(override.endpoint) === normalizedEndpoint)
        ?? matches.find((override) => normalizeEndpoint(override.endpoint) === null)
        ?? null;
    }
    return matches.find((override) => normalizeEndpoint(override.endpoint) === null) ?? null;
  }

  upsertOverride(
    overrides: readonly ModelPricingOverride[],
    draft: ModelPricingOverrideDraft,
    now = Date.now(),
  ): ModelPricingOverride[] {
    const providerId = normalizeId(draft.providerId);
    const endpoint = normalizeEndpoint(draft.endpoint);
    const modelId = normalizeId(draft.modelId);
    if (!providerId || !modelId) {
      throw new Error('A provider id and model id are required for a price override.');
    }

    const nextOverride: ModelPricingOverride = {
      providerId,
      endpoint,
      modelId,
      inputPerMillion: readNonNegativeNumber(draft.inputPerMillion),
      outputPerMillion: readNonNegativeNumber(draft.outputPerMillion),
      cacheReadPerMillion: readNonNegativeNumber(draft.cacheReadPerMillion),
      cacheWritePerMillion: readNonNegativeNumber(draft.cacheWritePerMillion),
      updatedAt: now,
    };

    const next = overrides.filter((override) =>
      normalizeId(override.providerId) !== providerId
      || normalizeEndpoint(override.endpoint) !== endpoint
      || normalizeId(override.modelId) !== modelId,
    );
    next.push(nextOverride);
    return next.sort((left, right) =>
      `${left.providerId}/${left.endpoint ?? ''}/${left.modelId}`
        .localeCompare(`${right.providerId}/${right.endpoint ?? ''}/${right.modelId}`),
    );
  }

  removeOverride(
    overrides: readonly ModelPricingOverride[],
    providerId: string,
    modelId: string,
    endpoint?: string | null,
  ): ModelPricingOverride[] {
    const normalizedProviderId = normalizeId(providerId);
    const normalizedModelId = normalizeId(modelId);
    const normalizedEndpoint = normalizeEndpoint(endpoint);
    return overrides.filter((override) =>
      normalizeId(override.providerId) !== normalizedProviderId
      || normalizeId(override.modelId) !== normalizedModelId
      || normalizeEndpoint(override.endpoint) !== normalizedEndpoint,
    );
  }

  async refresh(): Promise<ModelPricingStatus> {
    const payload = await (this.options.fetchCatalog ?? this.fetchCatalog)();
    const catalog: ModelPricingCatalog = {
      schemaVersion: 1,
      fetchedAt: Date.now(),
      entries: this.parseCatalog(payload),
    };
    this.catalog = catalog;
    await this.options.storage.saveModelPricingCatalog(catalog);
    return this.getStatus();
  }

  enrichContextUsageSnapshot(
    snapshot: ContextUsageSnapshot,
    identityHint?: ModelPricingIdentityHint,
  ): ContextUsageSnapshot {
    const identity = this.resolvePricingIdentity(snapshot, identityHint);
    if (this.hasBackendReportedCost(snapshot)) {
      return {
        ...snapshot,
        costDetails: snapshot.costDetails ?? buildBackendReportedCostDetails(
          identity.providerId,
          identity.endpoint,
          identity.modelId,
        ),
      };
    }

    return this.estimateWithLocalPricing(snapshot, identity);
  }

  /**
   * Returns the user-declared billing identity for third-party Claude Code or
   * Codex routes. It intentionally does not expose or mutate connection data.
   */
  getBackendPricingIdentityHint(
    backend: AgentBackendKind | undefined,
    settings: BackendSettings,
  ): ModelPricingIdentityHint | undefined {
    const backendSettings = backend === 'claude-code'
      ? settings.claudeCode
      : backend === 'codex'
        ? settings.codex
        : null;
    if (!backendSettings) {
      return undefined;
    }

    const providerId = normalizeId(backendSettings.pricingProviderId);
    const endpoint = normalizeEndpoint(backendSettings.pricingEndpoint);
    return providerId || endpoint ? { providerId, endpoint } : undefined;
  }

  private resolvePricingIdentity(
    snapshot: ContextUsageSnapshot,
    identityHint?: ModelPricingIdentityHint,
  ): PricingIdentity {
    const billingUsage = snapshot.billingUsage;
    const modelId = normalizeId(billingUsage?.modelId ?? snapshot.modelId ?? identityHint?.modelId);
    const reportedProviderId = normalizeId(billingUsage?.providerId ?? snapshot.providerId);
    const providerId = normalizeId(identityHint?.providerId)
      ?? reportedProviderId
      ?? inferProviderId(modelId)
      ?? this.findUniqueCatalogProviderId(modelId);
    return {
      providerId,
      endpoint: normalizeEndpoint(identityHint?.endpoint),
      modelId,
    };
  }

  /**
   * Uses models.dev only when the backend has not identified a provider. A
   * model ID shared by multiple providers stays unresolved because a gateway
   * can price the same model differently from its native provider.
   */
  private findUniqueCatalogProviderId(modelId: string | null): string | null {
    if (!modelId) {
      return null;
    }

    const providers = new Set(
      (this.catalog?.entries ?? [])
        .filter((entry) => entry.modelId === modelId)
        .map((entry) => entry.providerId),
    );
    return providers.size === 1 ? [...providers][0] ?? null : null;
  }

  private shouldAutoRefresh(now = Date.now()): boolean {
    const fetchedAt = this.catalog?.fetchedAt;
    return fetchedAt === undefined || now - fetchedAt >= AUTO_REFRESH_INTERVAL_MS;
  }

  private hasBackendReportedCost(snapshot: ContextUsageSnapshot): boolean {
    return typeof snapshot.totalCost === 'number'
      && Number.isFinite(snapshot.totalCost)
      && snapshot.totalCost >= 0;
  }

  private estimateWithLocalPricing(
    snapshot: ContextUsageSnapshot,
    identity: PricingIdentity,
  ): ContextUsageSnapshot {
    const pricing = this.resolveEffectivePricing(identity);
    if (!pricing.rates) {
      return {
        ...snapshot,
        totalCost: null,
        costDetails: buildUnavailableCostDetails(identity.providerId, identity.endpoint, identity.modelId),
      };
    }

    const accumulator = this.accumulateTokenCosts(snapshot, pricing.rates);
    const completeness = accumulator.unavailableTokenKinds.length > 0
      ? (accumulator.hasPricedTokens ? 'partial' : 'unavailable')
      : 'complete';
    const costDetails: ContextCostDetails = {
      source: hasConfiguredRate(pricing.endpointOverride) || hasConfiguredRate(pricing.providerOverride)
        ? 'user-override'
        : 'models-dev',
      completeness,
      providerId: identity.providerId,
      endpoint: identity.endpoint,
      modelId: identity.modelId,
      rates: pricing.rates,
      catalogFetchedAt: this.catalog?.fetchedAt ?? null,
      usesBaseTier: pricing.catalogEntry?.hasTieredPricing === true,
      unavailableTokenKinds: accumulator.unavailableTokenKinds,
    };

    return {
      ...snapshot,
      totalCost: accumulator.hasPricedTokens || completeness === 'complete' ? accumulator.knownSubtotal : null,
      costDetails,
    };
  }

  private resolveEffectivePricing({ providerId, endpoint, modelId }: PricingIdentity): EffectivePricing {
    if (!providerId || !modelId) {
      return {
        catalogEntry: null,
        endpointOverride: null,
        providerOverride: null,
        rates: null,
      };
    }

    const catalogEntry = this.getCatalogEntry(providerId, modelId);
    const providerOverride = this.getOverride(providerId, modelId);
    const preferredOverride = this.getOverride(providerId, modelId, endpoint);
    const endpointOverride = endpoint && normalizeEndpoint(preferredOverride?.endpoint) === endpoint
      ? preferredOverride
      : null;
    return {
      catalogEntry,
      endpointOverride,
      providerOverride,
      rates: mergeRates(catalogEntry?.rates ?? null, endpointOverride, providerOverride),
    };
  }

  private accumulateTokenCosts(
    snapshot: ContextUsageSnapshot,
    rates: ModelPricingRates,
  ): CostAccumulator {
    const billingUsage = snapshot.billingUsage;
    const accumulator: CostAccumulator = {
      knownSubtotal: 0,
      hasPricedTokens: false,
      unavailableTokenKinds: [],
    };
    addPricedTokens(
      accumulator,
      'input',
      Math.max(0, billingUsage?.inputTokens ?? snapshot.inputTokens),
      rates.inputPerMillion,
    );
    addPricedTokens(
      accumulator,
      'output',
      Math.max(0, billingUsage?.outputTokens ?? snapshot.outputTokens)
        + Math.max(0, billingUsage?.reasoningTokens ?? snapshot.reasoningTokens),
      rates.outputPerMillion,
    );
    addPricedTokens(
      accumulator,
      'cache-read',
      this.normalizeOptionalTokenCount(billingUsage?.cacheReadTokens ?? snapshot.cacheReadTokens),
      rates.cacheReadPerMillion,
    );
    addPricedTokens(
      accumulator,
      'cache-write',
      this.normalizeOptionalTokenCount(billingUsage?.cacheWriteTokens ?? snapshot.cacheWriteTokens),
      rates.cacheWritePerMillion,
    );
    return accumulator;
  }

  private normalizeOptionalTokenCount(value: number | null): number | null {
    return typeof value === 'number' ? Math.max(0, value) : null;
  }

  private async fetchCatalog(): Promise<unknown> {
    const response = await requestUrl({
      url: MODELS_DEV_CATALOG_URL,
      method: 'GET',
      throw: true,
    });
    if (response.json !== undefined) {
      return response.json;
    }
    return JSON.parse(response.text);
  }

  private parseCatalog(value: unknown): ModelPricingCatalogEntry[] {
    const root = isRecord(value) ? value : null;
    if (!root) {
      throw new Error('models.dev returned an invalid pricing catalogue.');
    }

    const entries: ModelPricingCatalogEntry[] = [];
    for (const [rawProviderId, rawProvider] of Object.entries(root)) {
      const provider = isRecord(rawProvider) ? rawProvider : null;
      const providerId = normalizeId(rawProviderId);
      const models = provider && isRecord(provider.models) ? provider.models : null;
      if (!provider || !providerId || !models) {
        continue;
      }

      const providerName = readString(provider.name) ?? rawProviderId;
      for (const [rawModelId, rawModel] of Object.entries(models)) {
        const model = isRecord(rawModel) ? rawModel : null;
        const modelId = normalizeId(rawModelId);
        const cost = model?.cost;
        if (!model || !modelId || !isRecord(cost)) {
          continue;
        }

        const rates = normalizeRates(cost);
        if (Object.values(rates).every((rate) => rate === null)) {
          continue;
        }

        entries.push({
          providerId,
          providerName,
          modelId,
          modelName: readString(model.name) ?? rawModelId,
          rates,
          hasTieredPricing: Array.isArray(cost.tiers) && cost.tiers.length > 0,
        });
      }
    }

    return entries.sort((left, right) =>
      `${left.providerId}/${left.modelId}`.localeCompare(`${right.providerId}/${right.modelId}`),
    );
  }
}
