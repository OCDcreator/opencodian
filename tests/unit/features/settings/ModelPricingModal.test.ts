import type { App } from 'obsidian';

import type { ModelPricingOverride } from '../../../../src/core/types';
import { ModelPricingModal } from '../../../../src/features/settings/ModelPricingModal';
import { setLocale, t } from '../../../../src/i18n';
import type OpenCodianPlugin from '../../../../src/main';

function getButtonByText(containerEl: HTMLElement, text: string): HTMLButtonElement {
  const button = Array.from(containerEl.querySelectorAll('button'))
    .find((entry) => entry.textContent?.trim() === text);
  expect(button).toBeDefined();
  return button as HTMLButtonElement;
}

function createPlugin(overrides: ModelPricingOverride[] = []) {
  const service = {
    getStatus: jest.fn().mockReturnValue({ fetchedAt: 1710000000000, entryCount: 42 }),
    getCatalogEntry: jest.fn((providerId: string, modelId: string) =>
      providerId === 'openai' && modelId === 'gpt-test'
        ? {
            providerId: 'openai',
            providerName: 'OpenAI',
            modelId: 'gpt-test',
            modelName: 'GPT Test',
            rates: {
              inputPerMillion: 2,
              outputPerMillion: 8,
              cacheReadPerMillion: 0.5,
              cacheWritePerMillion: 3,
            },
            hasTieredPricing: false,
          }
        : null),
    refresh: jest.fn().mockResolvedValue({ fetchedAt: 1710000000000, entryCount: 42 }),
    upsertOverride: jest.fn().mockReturnValue([{
      providerId: 'openai',
      endpoint: null,
      modelId: 'gpt-test',
      inputPerMillion: 4,
      outputPerMillion: 10,
      cacheReadPerMillion: null,
      cacheWritePerMillion: null,
      updatedAt: 1710000000000,
    }]),
    removeOverride: jest.fn().mockReturnValue([]),
  };
  const plugin = {
    modelPricingService: service,
    settings: {
      modelPricingOverrides: overrides,
    },
    saveSettings: jest.fn().mockResolvedValue(undefined),
  } as unknown as OpenCodianPlugin;
  return { plugin, service };
}

describe('ModelPricingModal', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    setLocale('zh');
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders the local-estimate caveat, cached catalogue status, and all four billable rate categories', () => {
    const { plugin } = createPlugin();
    const modal = new ModelPricingModal({} as App, plugin);

    modal.onOpen();

    expect(modal.modalEl.classList.contains('opencodian-model-pricing-modal')).toBe(true);
    expect(modal.contentEl.textContent).toContain(t('settings.cost.modal.desc'));
    expect(modal.contentEl.textContent).toContain(t('settings.cost.catalog.title'));
    expect(modal.contentEl.textContent).toContain(t('settings.cost.catalog.entryCount', { count: '42' }));
    const rateInputs = Array.from(modal.contentEl.querySelectorAll<HTMLInputElement>('input[type="number"]'));
    expect(rateInputs).toHaveLength(4);
    expect(rateInputs.every((inputEl) => inputEl.placeholder === t('settings.cost.override.useCatalog'))).toBe(true);
  });

  it('saves partial category overrides while preserving empty fields as catalogue fallbacks', async () => {
    const { plugin, service } = createPlugin();
    const modal = new ModelPricingModal({} as App, plugin);
    modal.onOpen();

    const textInputs = Array.from(modal.contentEl.querySelectorAll<HTMLInputElement>('input[type="text"]'));
    const rateInputs = Array.from(modal.contentEl.querySelectorAll<HTMLInputElement>('input[type="number"]'));
    textInputs[0]!.value = ' OpenAI ';
    textInputs[0]!.dispatchEvent(new window.Event('input'));
    textInputs[2]!.value = ' GPT-Test ';
    textInputs[2]!.dispatchEvent(new window.Event('input'));
    rateInputs[0]!.value = '4';
    rateInputs[1]!.value = '10';

    getButtonByText(modal.contentEl, t('settings.cost.override.save')).click();
    await Promise.resolve();
    await Promise.resolve();

    expect(service.upsertOverride).toHaveBeenCalledWith([], {
      providerId: ' OpenAI ',
      endpoint: '',
      modelId: ' GPT-Test ',
      inputPerMillion: 4,
      outputPerMillion: 10,
      cacheReadPerMillion: null,
      cacheWritePerMillion: null,
    });
    expect(plugin.settings.modelPricingOverrides).toEqual(expect.arrayContaining([
      expect.objectContaining({ providerId: 'openai', modelId: 'gpt-test' }),
    ]));
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
  });
});
