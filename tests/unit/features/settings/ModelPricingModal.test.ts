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
  const catalogListeners = new Set<() => void>();
  const disposeCatalogListener = jest.fn((listener: () => void) => catalogListeners.delete(listener));
  const service = {
    onCatalogUpdated: jest.fn((listener: () => void) => {
      catalogListeners.add(listener);
      return { dispose: () => { disposeCatalogListener(listener); } };
    }),
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
  return {
    plugin,
    service,
    disposeCatalogListener,
    emitCatalogUpdate: () => { for (const listener of catalogListeners) listener(); },
  };
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

  it('updates a background catalog and source hint without replacing an active draft or focus', () => {
    const { plugin, service, emitCatalogUpdate } = createPlugin();
    const entry = service.getCatalogEntry('openai', 'gpt-test');
    service.getCatalogEntry.mockReturnValue(null);
    service.getStatus.mockReturnValue({ fetchedAt: 1710000000000, entryCount: 0 });
    const modal = new ModelPricingModal({} as App, plugin);
    modal.modalEl.appendChild(modal.contentEl);
    document.body.appendChild(modal.modalEl);
    modal.onOpen();
    const textInputs = Array.from(modal.contentEl.querySelectorAll<HTMLInputElement>('input[type="text"]'));
    const priceInput = modal.contentEl.querySelector<HTMLInputElement>('input[type="number"]')!;
    textInputs[0]!.value = 'openai';
    textInputs[1]!.value = 'https://gateway.example/v1';
    textInputs[2]!.value = 'gpt-test';
    textInputs[2]!.dispatchEvent(new window.Event('input'));
    priceInput.value = '4.25';
    textInputs[2]!.focus();
    textInputs[2]!.setSelectionRange(1, 3);

    service.getStatus.mockReturnValue({ fetchedAt: 1710000000001, entryCount: 3 });
    service.getCatalogEntry.mockReturnValue(entry);
    emitCatalogUpdate();

    expect(modal.contentEl.textContent).toContain(t('settings.cost.catalog.entryCount', { count: '3' }));
    expect(modal.contentEl.querySelector('.opencodian-model-pricing-source-hint')?.textContent)
      .toBe(t('settings.cost.override.catalogMatch', { provider: 'OpenAI', model: 'GPT Test' }));
    expect(Array.from(modal.contentEl.querySelectorAll<HTMLInputElement>('input[type="text"]'))).toEqual(textInputs);
    expect(textInputs.map((input) => input.value)).toEqual(['openai', 'https://gateway.example/v1', 'gpt-test']);
    expect(priceInput.value).toBe('4.25');
    expect(document.activeElement).toBe(textInputs[2]);
    expect(textInputs[2]!.selectionStart).toBe(1);
    expect(textInputs[2]!.selectionEnd).toBe(3);
    modal.onClose();
  });

  it('preserves the override being edited across an awaited manual refresh', async () => {
    const override: ModelPricingOverride = {
      providerId: 'openai', endpoint: null, modelId: 'gpt-test',
      inputPerMillion: 2, outputPerMillion: 8, cacheReadPerMillion: null, cacheWritePerMillion: null,
      updatedAt: 1,
    };
    const { plugin, service } = createPlugin([override]);
    let finishRefresh!: () => void;
    service.refresh.mockImplementation(() => new Promise((resolve) => {
      finishRefresh = () => resolve({ fetchedAt: 1710000000001, entryCount: 3 });
    }));
    const modal = new ModelPricingModal({} as App, plugin);
    modal.onOpen();
    getButtonByText(modal.contentEl, t('settings.cost.override.edit')).click();
    const priceInput = modal.contentEl.querySelector<HTMLInputElement>('input[type="number"]')!;
    priceInput.value = '7';
    const refreshButton = getButtonByText(modal.contentEl, t('settings.cost.catalog.refresh'));
    refreshButton.click();
    expect(refreshButton.disabled).toBe(true);

    finishRefresh();
    await Promise.resolve();
    await Promise.resolve();

    expect(modal.contentEl.querySelector('input[type="number"]')).toBe(priceInput);
    expect(priceInput.value).toBe('7');
    expect(modal.contentEl.textContent).toContain(t('settings.cost.override.editTitle'));
    expect(refreshButton.disabled).toBe(false);
    expect(refreshButton.textContent).toBe(t('settings.cost.catalog.refresh'));
    modal.onClose();
  });

  it('disposes catalog listeners and ignores a manual refresh that completes after closing', async () => {
    const { plugin, service, disposeCatalogListener, emitCatalogUpdate } = createPlugin();
    let finishRefresh!: () => void;
    service.refresh.mockImplementation(() => new Promise((resolve) => {
      finishRefresh = () => resolve({ fetchedAt: 1710000000001, entryCount: 3 });
    }));
    const modal = new ModelPricingModal({} as App, plugin);
    modal.onOpen();
    getButtonByText(modal.contentEl, t('settings.cost.catalog.refresh')).click();
    modal.onClose();
    service.getStatus.mockClear();
    emitCatalogUpdate();
    finishRefresh();
    await Promise.resolve();
    await Promise.resolve();

    expect(disposeCatalogListener).toHaveBeenCalledTimes(1);
    expect(service.getStatus).not.toHaveBeenCalled();
    expect(modal.contentEl.childElementCount).toBe(0);
  });

  it('ignores a refresh from an earlier opening when the same modal is reopened', async () => {
    const { plugin, service } = createPlugin();
    let finishRefresh!: () => void;
    service.refresh.mockImplementation(() => new Promise((resolve) => {
      finishRefresh = () => resolve({ fetchedAt: 1710000000001, entryCount: 3 });
    }));
    const modal = new ModelPricingModal({} as App, plugin);
    modal.onOpen();
    getButtonByText(modal.contentEl, t('settings.cost.catalog.refresh')).click();
    modal.onClose();
    modal.onOpen();
    const providerInput = modal.contentEl.querySelector<HTMLInputElement>('input[type="text"]')!;
    providerInput.value = 'new draft';
    service.getStatus.mockClear();

    finishRefresh();
    await Promise.resolve();
    await Promise.resolve();

    expect(service.getStatus).not.toHaveBeenCalled();
    expect(modal.contentEl.querySelector('input[type="text"]')).toBe(providerInput);
    expect(providerInput.value).toBe('new draft');
    modal.onClose();
  });
});
