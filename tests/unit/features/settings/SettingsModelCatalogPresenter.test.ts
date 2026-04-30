import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { getProviderPrimaryDisabledReason } from '../../../../src/features/settings/SettingsModelCatalogAvailability';
import { SettingsModelCatalogPresenter } from '../../../../src/features/settings/SettingsModelCatalogPresenter';
import * as i18n from '../../../../src/i18n';

function createCatalogState() {
  const provider = {
    id: 'openai',
    name: 'OpenAI',
    models: [{
      id: 'gpt-4.1',
      name: 'GPT-4.1',
      source: 'server' as const,
      existsInLocal: false,
      existsInServer: true,
    }],
    source: 'server' as const,
    existsInLocal: false,
    existsInServer: true,
  };
  const disabledProvider = {
    id: 'alibaba',
    name: 'Alibaba',
    models: [{
      id: 'qwen-max',
      name: 'Qwen Max',
      source: 'server' as const,
      existsInLocal: false,
      existsInServer: true,
      disabledScopes: ['project'] as Array<'project'>,
    }],
    source: 'server' as const,
    existsInLocal: false,
    existsInServer: true,
    disabledScopes: ['project'] as Array<'project'>,
  };

  return {
    localModelConfig: { disabled_providers: ['alibaba'] },
    disabledModelRefs: [],
    catalogs: {
      local: { providers: [], defaults: {} },
      server: { providers: [provider, disabledProvider], defaults: {} },
      baseEffective: { providers: [provider, disabledProvider], defaults: {} },
      effective: { providers: [provider], defaults: {} },
      currentEnabledProviderIds: ['openai'],
      serverConfig: {},
      effectiveProviderConfig: { disabled_providers: ['alibaba'] },
    },
    displayCatalogs: {
      local: { providers: [], defaults: {} },
      server: { providers: [provider, disabledProvider], defaults: {} },
      effective: { providers: [provider], defaults: {} },
      disabled: { providers: [disabledProvider], defaults: {} },
    },
    providerStatusCatalogs: {
      local: { providers: [], defaults: {} },
      server: { providers: [provider, disabledProvider], defaults: {} },
      effective: { providers: [provider, disabledProvider], defaults: {} },
      disabled: { providers: [disabledProvider], defaults: {} },
    },
  };
}

describe('SettingsModelCatalogPresenter', () => {
  function createPresenter() {
    const onProviderAvailabilityChange = jest.fn().mockResolvedValue(undefined);
    const presenter = new SettingsModelCatalogPresenter({
      catalogStateService: {
        probeProvider: jest.fn().mockResolvedValue({
          providerId: 'openai',
          status: 'available',
          effectiveEnabled: true,
          projectDisabled: false,
          serverDisabled: false,
          overridesServerDisabled: false,
          runtimeModelCount: 1,
          catalogModelCount: 1,
          testedModelId: 'gpt-4.1',
          sendTestAttempted: true,
          sendTestSucceeded: true,
        }),
      } as never,
      applyInlineCodeText: (targetEl, text) => {
        targetEl.textContent = text;
      },
      applyProviderIcon: async () => {},
      onProviderAvailabilityChange,
      onModelAvailabilityChange: async () => {},
    });

    return {
      presenter,
      onProviderAvailabilityChange,
    };
  }

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('prefers project-disabled over server-disabled when provider scopes include both', () => {
    const reason = getProviderPrimaryDisabledReason(
      {
        id: 'alibaba',
        name: 'Alibaba',
        models: [],
        source: 'server',
        existsInLocal: false,
        existsInServer: true,
        disabledScopes: ['global', 'project'],
      },
      false,
    );

    expect(reason).toBe('project');
  });

  it('filters the rendered provider list from the presenter search state', () => {
    const { presenter } = createPresenter();
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);
    presenter.setPreferredCatalogTab('merge');

    presenter.render({
      containerEl,
      catalogState: createCatalogState() as never,
    });

    const initialProviders = Array.from(
      containerEl.querySelectorAll<HTMLElement>('.opencodian-model-toggle-provider-name'),
    ).map((element) => element.textContent);
    expect(initialProviders).toEqual(['OpenAI']);

    const searchInput = containerEl.querySelector<HTMLInputElement>('.opencodian-model-availability-search-input');
    expect(searchInput).not.toBeNull();
    searchInput!.value = 'openai';
    searchInput!.dispatchEvent(new Event('input'));

    const filteredProviders = Array.from(
      containerEl.querySelectorAll<HTMLElement>('.opencodian-model-toggle-provider-name'),
    ).map((element) => element.textContent);
    expect(filteredProviders).toEqual(['OpenAI']);
  });

  it('keeps catalog bulk provider actions wired through presenter callbacks', async () => {
    const { presenter, onProviderAvailabilityChange } = createPresenter();
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);
    presenter.setPreferredCatalogTab('merge');

    presenter.render({
      containerEl,
      catalogState: createCatalogState() as never,
    });

    const actionButtons = Array.from(
      containerEl.querySelectorAll<HTMLButtonElement>('.opencodian-model-catalog-actions-buttons button'),
    );
    expect(actionButtons).toHaveLength(2);

    actionButtons[1].click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onProviderAvailabilityChange).toHaveBeenCalledWith(['openai'], false);
  });

  it('renders model availability content directly into the provided host without an extra inner shell', () => {
    const { presenter } = createPresenter();
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);
    presenter.setPreferredCatalogTab('merge');

    presenter.render({
      containerEl,
      catalogState: createCatalogState() as never,
    });

    expect(containerEl.querySelector('.opencodian-model-toggle-block')).toBeNull();
    expect(containerEl.querySelector('.opencodian-model-toggle-desc')).toBeNull();
    expect(containerEl.querySelector('.opencodian-model-availability-controls')).not.toBeNull();
    expect(containerEl.querySelector('.opencodian-model-catalog-summary-grid')).not.toBeNull();
    expect(containerEl.querySelector('.opencodian-model-toggle-provider-list')).not.toBeNull();
    expect(containerEl.querySelector('.opencodian-model-toggle-provider-scrollbar-proxy')).toBeNull();
  });

  it('skips the secondary availability description when the copy is empty', () => {
    const { presenter } = createPresenter();
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);
    presenter.setPreferredCatalogTab('merge');
    const originalT = i18n.t;
    const tSpy = jest.spyOn(i18n, 't');
    tSpy.mockImplementation(((key: string, vars?: Record<string, string>) => {
      if (key === 'settings.model.toggle.desc') {
        return '';
      }

      return originalT(key as never, vars as never);
    }) as typeof i18n.t);

    presenter.render({
      containerEl,
      catalogState: createCatalogState() as never,
    });

    expect(containerEl.querySelector('.opencodian-model-toggle-desc')).toBeNull();
  });

  it('hides the provider list scrollbar while keeping the list scrollable', () => {
    const css = readFileSync(
      join(process.cwd(), 'src/style/modals/config-editor-modal.css'),
      'utf8',
    );

    expect(css).toMatch(
      /\.opencodian-model-toggle-provider-list\s*\{[\s\S]*padding-right:\s*0;/,
    );
    expect(css).toMatch(
      /\.opencodian-model-toggle-provider-list\s*\{[\s\S]*scrollbar-width:\s*none;[\s\S]*-ms-overflow-style:\s*none;/,
    );
    expect(css).toMatch(
      /\.opencodian-model-toggle-provider-list::-webkit-scrollbar\s*\{[\s\S]*display:\s*none;/,
    );
  });

  it('preserves the outer settings scroll position when expanding a provider', () => {
    const rafSpy = jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    const { presenter } = createPresenter();
    const scrollHost = document.createElement('div');
    scrollHost.style.overflowY = 'auto';
    let outerScrollTop = 240;
    Object.defineProperty(scrollHost, 'clientHeight', {
      configurable: true,
      get: () => 300,
    });
    Object.defineProperty(scrollHost, 'scrollHeight', {
      configurable: true,
      get: () => 1200,
    });
    Object.defineProperty(scrollHost, 'scrollTop', {
      configurable: true,
      get: () => outerScrollTop,
      set: (value: number) => {
        outerScrollTop = value;
      },
    });

    const containerEl = document.createElement('div');
    scrollHost.appendChild(containerEl);
    document.body.appendChild(scrollHost);

    presenter.setPreferredCatalogTab('merge');
    presenter.render({
      containerEl,
      catalogState: createCatalogState() as never,
    });

    const originalEmpty = containerEl.empty.bind(containerEl);
    Object.defineProperty(containerEl, 'empty', {
      configurable: true,
      value: () => {
        scrollHost.scrollTop = 0;
        originalEmpty();
      },
    });

    (presenter as unknown as {
      toggleProviderExpanded: (providerId: string) => void;
    }).toggleProviderExpanded('openai');

    expect(scrollHost.scrollTop).toBe(240);
    rafSpy.mockRestore();
  });
});
