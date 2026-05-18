/* eslint-disable max-lines-per-function */
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

  it('renders bulk actions in the availability controls after the catalog summary', () => {
    const { presenter } = createPresenter();
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);
    presenter.setPreferredCatalogTab('merge');

    presenter.render({
      containerEl,
      catalogState: createCatalogState() as never,
    });

    const summaryEl = containerEl.querySelector<HTMLElement>('.opencodian-model-catalog-summary-grid');
    const controlsEl = containerEl.querySelector<HTMLElement>('.opencodian-model-availability-controls');
    const actionButtonsEl = containerEl.querySelector<HTMLElement>('.opencodian-model-catalog-actions-buttons');

    expect(containerEl.querySelector('.opencodian-model-catalog-actions')).toBeNull();
    expect(summaryEl).not.toBeNull();
    expect(controlsEl).not.toBeNull();
    expect(actionButtonsEl).not.toBeNull();
    expect(summaryEl!.compareDocumentPosition(controlsEl!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(controlsEl!.contains(actionButtonsEl)).toBe(true);
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

describe('SettingsModelCatalogPresenter CSS contract', () => {
  it('keeps model availability rows aligned with the shared settings hierarchy contract', () => {
    const css = readFileSync(
      join(process.cwd(), 'src/style/modals/config-editor-modal.css'),
      'utf8',
    );

    const findRule = (selector: string, required: string): string => (
      Array.from(css.matchAll(new RegExp(`${selector}\\s*\\{[^}]*\\}`, 'g')))
        .map((match) => match[0])
        .find((rule) => rule.includes(required)) ?? ''
    );
    const providerRule = findRule('\\.opencodian-model-toggle-provider', 'background:');
    const providerHoverRule = findRule('\\.opencodian-model-toggle-provider:hover', 'background:');
    const modelRule = findRule('\\.opencodian-model-toggle-model', 'background:');
    const searchRule = findRule('\\.opencodian-model-availability-search-container', 'background:');
    const summaryCardRule = findRule('\\.opencodian-model-catalog-summary-card', 'background:');
    const classicBlockRule = findRule(
      '\\.opencodian-settings\\[data-settings-layout-mode="classic"\\] \\.opencodian-model-toggle-block',
      'background:',
    );
    const classicDescRule = findRule(
      '\\.opencodian-settings\\[data-settings-layout-mode="classic"\\] \\.opencodian-model-toggle-desc',
      'border-bottom:',
    );
    const classicProviderSiblingRule = findRule(
      '\\.opencodian-settings\\[data-settings-layout-mode="classic"\\] \\.opencodian-model-toggle-provider \\+ \\.opencodian-model-toggle-provider',
      'margin-top:',
    );

    expect(providerRule).toContain('var(--opencodian-settings-object-bg');
    expect(providerRule).toContain('box-shadow: none');
    expect(providerRule).not.toContain('linear-gradient');
    expect(providerRule).not.toContain('backdrop-filter');
    expect(providerHoverRule).not.toContain('transform: translateY');
    expect(modelRule).toContain('var(--opencodian-settings-row-bg');
    expect(modelRule).toContain('box-shadow: none');
    expect(modelRule).not.toContain('backdrop-filter');
    expect(searchRule).toContain('var(--opencodian-settings-inline-bg');
    expect(summaryCardRule).toContain('var(--opencodian-settings-object-bg');
    expect(classicBlockRule).toContain('var(--opencodian-settings-object-bg');
    expect(classicBlockRule).toContain('box-shadow: none');
    expect(classicBlockRule).not.toContain('linear-gradient');
    expect(classicBlockRule).toContain('backdrop-filter: none');
    expect(classicDescRule).toContain('var(--opencodian-settings-object-border');
    expect(classicProviderSiblingRule).toContain('var(--opencodian-settings-space-md');
  });

  it('keeps the catalog actions, summary cards, and availability controls on a consistent vertical rhythm', () => {
    const css = readFileSync(
      join(process.cwd(), 'src/style/modals/config-editor-modal.css'),
      'utf8',
    );

    const findRule = (selector: string, required?: string): string => (
      Array.from(css.matchAll(new RegExp(`${selector}\\s*\\{[^}]*\\}`, 'g')))
        .map((match) => match[0])
        .find((rule) => (required ? rule.includes(required) : true)) ?? ''
    );

    const managementRule = findRule(
      '\\.opencodian-settings \\.opencodian-settings-section \\.opencodian-model-toggle-management',
      'gap:',
    );
    const catalogsRule = findRule('\\.opencodian-model-toggle-catalogs', 'display: grid');
    const summaryCardGridRule = findRule('\\.opencodian-model-catalog-summary-grid', 'grid-template-columns:');
    const summaryCardRule = findRule('\\.opencodian-model-catalog-summary-card', 'min-height: 52px');
    const actionsRule = findRule('\\.opencodian-model-catalog-actions-buttons', 'flex-wrap: nowrap');
    const actionButtonRule = findRule('\\.opencodian-model-toggle-action-button', 'min-width: 110px');
    const footerDescRule = findRule('\\.opencodian-settings-block > \\.opencodian-settings-block-footer-desc', 'padding-bottom: 24px');
    const summaryGridRule = findRule('\\.opencodian-model-catalog-summary-grid', 'margin-bottom: 0');
    const controlsRule = findRule('\\.opencodian-model-availability-controls', 'margin-bottom: 0');

    expect(managementRule).toContain('gap: var(--opencodian-settings-space-lg');
    expect(managementRule).toContain('padding-bottom: 0');
    expect(catalogsRule).toContain('display: grid');
    expect(catalogsRule).toContain('gap: var(--opencodian-settings-space-lg');
    expect(catalogsRule).toContain('margin-bottom: 0');
    expect(summaryCardGridRule).toContain('repeat(auto-fit, minmax(150px, 1fr))');
    expect(summaryCardGridRule).toContain('gap: 6px');
    expect(summaryCardRule).toContain('flex-direction: column');
    expect(summaryCardRule).toContain('box-sizing: border-box');
    expect(summaryCardRule).toContain('min-height: 52px');
    expect(controlsRule).toContain('display: grid');
    expect(controlsRule).toContain('grid-template-columns: minmax(220px, 1fr) auto auto auto');
    expect(actionsRule).toContain('flex-wrap: nowrap');
    expect(actionsRule).toContain('margin-left: 0');
    expect(actionButtonRule).toContain('min-width: 110px');
    expect(actionButtonRule).toContain('padding-inline: 10px');
    expect(footerDescRule).toContain('padding-bottom: 24px');
    expect(controlsRule).toContain('align-items: center');
    expect(summaryGridRule).toContain('margin-bottom: 0');
    expect(controlsRule).toContain('margin-bottom: 0');
  });
});
