import { buildCatalogFromConfig } from '../../../../src/core/config/modelConfig';
import type { OpencodeModelConfigSubset } from '../../../../src/core/types';
import {
  buildModelPickerGroups,
  filterModelPickerGroups,
  findModelPickerOption,
  findModelPickerOptionByRef,
} from '../../../../src/features/settings/modelPicker';

describe('modelPicker helpers', () => {
  const config: OpencodeModelConfigSubset = {
    provider: {
      openai: {
        name: 'OpenAI',
        models: {
          'gpt-4.1': { name: 'GPT-4.1' },
          'gpt-4o-mini': { name: 'GPT-4o mini' },
        },
      },
      anthropic: {
        name: 'Anthropic',
        models: {
          'claude-sonnet-4-5': { name: 'Claude Sonnet 4.5' },
        },
      },
    },
  };

  it('builds grouped picker options from a catalog', () => {
    const groups = buildModelPickerGroups(buildCatalogFromConfig(config, 'local'));

    expect(groups).toHaveLength(2);
    expect(groups.find((group) => group.providerId === 'anthropic')).toMatchObject({
      providerId: 'anthropic',
      providerName: 'Anthropic',
    });
    expect(groups.find((group) => group.providerId === 'openai')?.options[0]).toMatchObject({
      ref: 'openai/gpt-4.1',
      providerName: 'OpenAI',
      modelName: 'GPT-4.1',
    });
  });

  it('filters by provider or model text while preserving group structure', () => {
    const groups = buildModelPickerGroups(buildCatalogFromConfig(config, 'local'));

    expect(filterModelPickerGroups(groups, 'anthropic')).toHaveLength(1);
    expect(filterModelPickerGroups(groups, 'mini')[0]?.options.map((option) => option.ref)).toEqual([
      'openai/gpt-4o-mini',
    ]);
  });

  it('finds selected options by provider/model pair or full ref', () => {
    const groups = buildModelPickerGroups(buildCatalogFromConfig(config, 'local'));

    expect(findModelPickerOption(groups, 'openai', 'gpt-4.1')?.ref).toBe('openai/gpt-4.1');
    expect(findModelPickerOptionByRef(groups, 'anthropic/claude-sonnet-4-5')?.modelName).toBe('Claude Sonnet 4.5');
    expect(findModelPickerOptionByRef(groups, 'missing/model')).toBeNull();
  });
});
