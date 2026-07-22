/**
 * Local model-pricing catalog, user overrides, and cost-estimate provenance.
 *
 * Rates are stored in USD per one million tokens. A `null` rate intentionally
 * means that the source does not publish that category; it never means free.
 */

export interface ModelPricingRates {
  inputPerMillion: number | null;
  outputPerMillion: number | null;
  cacheReadPerMillion: number | null;
  cacheWritePerMillion: number | null;
}

export interface ModelPricingOverride extends ModelPricingRates {
  providerId: string;
  /**
   * Optional endpoint identity for a reseller, proxy, or self-hosted gateway.
   * `null` remains a provider-wide fallback and preserves legacy overrides.
   */
  endpoint: string | null;
  modelId: string;
  updatedAt: number;
}

export interface ModelPricingCatalogEntry {
  providerId: string;
  providerName: string;
  modelId: string;
  modelName: string;
  rates: ModelPricingRates;
  /** Pricing has threshold tiers that cannot be selected exactly from a cumulative session snapshot. */
  hasTieredPricing: boolean;
}

export interface ModelPricingCatalog {
  schemaVersion: 1;
  fetchedAt: number;
  entries: ModelPricingCatalogEntry[];
}

export type ContextCostSource = 'backend-reported' | 'models-dev' | 'user-override' | 'unavailable';
export type ContextCostCompleteness = 'complete' | 'partial' | 'unavailable';
export type ContextCostTokenKind = 'input' | 'output' | 'cache-read' | 'cache-write';

/**
 * Explains whether `totalCost` is an upstream-reported value or a local estimate.
 * It travels with the persisted context snapshot so later catalogue refreshes do
 * not rewrite a historical conversation total.
 */
export interface ContextCostDetails {
  source: ContextCostSource;
  completeness: ContextCostCompleteness;
  providerId: string | null;
  /** Effective API endpoint identity when a backend uses a third-party gateway. */
  endpoint: string | null;
  modelId: string | null;
  /** The effective rates used for a local estimate. `null` for backend-reported cost. */
  rates: ModelPricingRates | null;
  /** Time of the cached models.dev catalogue used by this estimate. */
  catalogFetchedAt: number | null;
  /** A tiered catalogue rate was evaluated at its base rate. */
  usesBaseTier: boolean;
  /** Token categories that could not be priced, never silently treated as zero. */
  unavailableTokenKinds: ContextCostTokenKind[];
}
