import {
  compareModelCatalogs,
  createUnavailableModelCatalogComparison,
} from '../../../../src/core/config/modelCatalogComparison';
import type { ModelCatalog } from '../../../../src/core/config/modelConfig';

function catalog(entries: Record<string, string[]>): ModelCatalog {
  return {
    providers: Object.entries(entries).map(([providerId, modelIds]) => ({
      id: providerId,
      name: providerId,
      source: 'server' as const,
      existsInLocal: false,
      existsInServer: true,
      models: modelIds.map((modelId) => ({
        id: modelId,
        name: modelId,
        source: 'server' as const,
        existsInLocal: false,
        existsInServer: true,
      })),
    })),
    defaults: {},
  };
}

describe('model catalog shadow comparison', () => {
  it('reports matching normalized provider and model sets', () => {
    expect(compareModelCatalogs(
      catalog({ openai: ['gpt-4.1'], anthropic: ['claude-sonnet-4'] }),
      {
        status: 'available',
        providerIds: ['openai', 'anthropic'],
        modelRefs: ['openai/gpt-4.1', 'anthropic/claude-sonnet-4'],
      },
    )).toEqual({
      status: 'match',
      legacyProviderCount: 2,
      legacyModelCount: 2,
      v2ProviderCount: 2,
      v2ModelCount: 2,
      legacyOnlyProviderIds: [],
      v2OnlyProviderIds: [],
      legacyOnlyModelRefs: [],
      v2OnlyModelRefs: [],
    });
  });

  it('reports provider and model drift in sorted reference lists', () => {
    expect(compareModelCatalogs(
      catalog({ openai: ['gpt-4.1', 'gpt-5'], local: ['custom'] }),
      {
        status: 'available',
        providerIds: ['openai', 'anthropic'],
        modelRefs: ['openai/gpt-4.1', 'anthropic/claude-sonnet-4'],
      },
    )).toMatchObject({
      status: 'drift',
      legacyOnlyProviderIds: ['local'],
      v2OnlyProviderIds: ['anthropic'],
      legacyOnlyModelRefs: ['local/custom', 'openai/gpt-5'],
      v2OnlyModelRefs: ['anthropic/claude-sonnet-4'],
    });
  });

  it('preserves an unavailable reason without fabricating counts', () => {
    expect(createUnavailableModelCatalogComparison('V2 catalog unsupported')).toEqual({
      status: 'unavailable',
      reason: 'V2 catalog unsupported',
    });
  });
});
