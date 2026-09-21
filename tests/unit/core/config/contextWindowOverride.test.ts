/**
 * R-F8 tests: catalog decoration (fills only missing metadata, never masks)
 * and settings normalization (ref shape + positive integer window).
 */

import {
  applyContextWindowOverrides,
  type ModelCatalog,
} from '../../../../src/core/config/modelConfig';
import { normalizeModelContextWindowOverrides } from '../../../../src/core/types/settings';

function catalogWith(models: Array<{ provider: string; model: string; contextWindow?: number }>): ModelCatalog {
  const byProvider = new Map<string, Array<{ id: string; contextWindow?: number }>>();
  for (const entry of models) {
    const list = byProvider.get(entry.provider) ?? [];
    list.push({ id: entry.model, contextWindow: entry.contextWindow });
    byProvider.set(entry.provider, list);
  }
  return {
    providers: [...byProvider.entries()].map(([id, providerModels]) => ({
      id,
      name: id,
      models: providerModels.map((model) => ({
        id: model.id,
        name: model.id,
        contextWindow: model.contextWindow,
        source: 'merge' as const,
        existsInLocal: true,
        existsInServer: true,
      })),
      source: 'merge' as const,
      existsInLocal: true,
      existsInServer: true,
    })),
    defaults: {},
  };
}

describe('applyContextWindowOverrides (R-F8)', () => {
  it('fills ONLY entries lacking contextWindow metadata and never masks real values', () => {
    const catalog = catalogWith([
      { provider: 'custom', model: 'unknown-meta', contextWindow: undefined },
      { provider: 'custom', model: 'known-meta', contextWindow: 32000 },
    ]);
    const decorated = applyContextWindowOverrides(catalog, { 'custom/unknown-meta': 128000, 'custom/known-meta': 999999 });
    const models = decorated.providers[0].models;
    expect(models.find((m) => m.id === 'unknown-meta')?.contextWindow).toBe(128000);
    expect(models.find((m) => m.id === 'known-meta')?.contextWindow).toBe(32000);
  });

  it('returns the catalog untouched for empty/absent overrides', () => {
    const catalog = catalogWith([{ provider: 'p', model: 'm' }]);
    expect(applyContextWindowOverrides(catalog, {})).toBe(catalog);
    expect(applyContextWindowOverrides(catalog, null)).toBe(catalog);
    expect(applyContextWindowOverrides(catalog, undefined)).toBe(catalog);
  });

  it('ignores overrides whose ref has no matching catalog entry', () => {
    const catalog = catalogWith([{ provider: 'p', model: 'm' }]);
    const decorated = applyContextWindowOverrides(catalog, { 'other/nope': 64000 });
    expect(decorated.providers[0].models[0].contextWindow).toBeUndefined();
  });

  it('does not mutate the input catalog (pure decoration)', () => {
    const catalog = catalogWith([{ provider: 'p', model: 'm' }]);
    applyContextWindowOverrides(catalog, { 'p/m': 64000 });
    expect(catalog.providers[0].models[0].contextWindow).toBeUndefined();
  });
});

describe('normalizeModelContextWindowOverrides (R-F8)', () => {
  it('keeps valid refs and drops junk', () => {
    expect(normalizeModelContextWindowOverrides({
      'openai-compatible/my-model': 128000,
      'no-slash': 1000,
      'x/': 1000,
      '/y': 1000,
      'a/negative': -5,
      'a/float': 1.5,
      'a/zero': 0,
    })).toEqual({ 'openai-compatible/my-model': 128000 });
  });

  it('returns a fresh empty object for non-record input', () => {
    expect(normalizeModelContextWindowOverrides(undefined)).toEqual({});
    expect(normalizeModelContextWindowOverrides(null)).toEqual({});
    expect(normalizeModelContextWindowOverrides([['a/b', 1]])).toEqual({});
    expect(normalizeModelContextWindowOverrides('x')).toEqual({});
  });
});
