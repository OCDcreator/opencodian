import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { App } from 'obsidian';
import * as obsidian from 'obsidian';

import type { ModelCatalogBundle } from '../../../../src/core/config';
import type { OpencodeConfigSourceCandidate } from '../../../../src/core/config/OpencodeConfigSourceService';
import { ModelConfigModal } from '../../../../src/features/settings/ModelConfigModal';
import { OpencodeConfigModal } from '../../../../src/features/settings/OpencodeConfigModal';
import { t } from '../../../../src/i18n';
import { ProviderIconService } from '../../../../src/utils/icons/ProviderIconService';

const PROJECT_SOURCE_PATH = '/vault/.opencode/opencode.jsonc';
const GLOBAL_SOURCE_PATH = '/home/test/.config/opencode/opencode.jsonc';
const MANAGED_SOURCE_PATH = '/etc/opencode/opencode.jsonc';

function createSourceCandidate(
  overrides: Partial<OpencodeConfigSourceCandidate> = {},
): OpencodeConfigSourceCandidate {
  return {
    scope: 'project',
    source: 'project-default',
    path: PROJECT_SOURCE_PATH,
    exists: true,
    editable: true,
    revision: {
      canonicalPath: PROJECT_SOURCE_PATH,
      mtimeMs: 1,
      size: 1,
      sha256: 'revision-1',
    },
    evidence: {
      persistence: 'verified',
      application: 'pending',
      runtime: 'unavailable',
    },
    ...overrides,
  };
}

async function flushAsyncWork(): Promise<void> {
  for (let index = 0; index < 8; index += 1) {
    await Promise.resolve();
  }
}

function createEmptyCatalogBundle(): ModelCatalogBundle {
  return {
    local: { providers: [], defaults: {} },
    server: { providers: [], defaults: {} },
    baseEffective: { providers: [], defaults: {} },
    effective: { providers: [], defaults: {} },
    currentEnabledProviderIds: [],
    serverConfig: {},
    effectiveProviderConfig: {},
    providerDirectory: {
      catalog: { providers: [], defaults: {} },
      connectedProviderIds: [],
      defaults: {},
    },
  };
}

function createPlugin(overrides: Record<string, unknown> = {}) {
  return {
    app: { vault: { adapter: { basePath: '/vault' } } },
    modelConfigService: {
      readLocalModelConfig: jest.fn().mockResolvedValue({}),
      getCatalogs: jest.fn().mockResolvedValue(createEmptyCatalogBundle()),
      getConfigPath: jest.fn().mockReturnValue('.opencode/opencode.json'),
      writeLocalModelConfig: jest.fn().mockResolvedValue(undefined),
    },
    settings: {
      modelSourceMode: 'local',
      disabledModelRefs: [],
      providerIconLibrary: 'lobehub',
      server: { mode: 'local' },
    },
    saveSettings: jest.fn().mockResolvedValue(undefined),
    openCodeService: {
      checkHealth: jest.fn().mockResolvedValue(false),
      stop: jest.fn().mockResolvedValue(undefined),
      start: jest.fn().mockResolvedValue(undefined),
    },
    ...overrides,
  };
}

function getSourceSelect(modal: ModelConfigModal): HTMLSelectElement {
  const select = modal.contentEl.querySelector<HTMLSelectElement>('.opencodian-model-config-source-selector select');
  expect(select).not.toBeNull();
  return select!;
}

function getButtonByText(containerEl: HTMLElement, text: string): HTMLButtonElement {
  const button = Array.from(containerEl.querySelectorAll('button'))
    .find((entry) => entry.textContent?.trim() === text);
  expect(button).toBeDefined();
  return button as HTMLButtonElement;
}

beforeEach(() => {
  jest.spyOn(ProviderIconService, 'resolveIconUrl').mockResolvedValue(null);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('ModelConfigModal G9 source conflict surface', () => {
  it('retains a CAS-conflicted draft, disabled refs, and reload/inspect actions without overwriting', async () => {
    const source = createSourceCandidate();
    const applyModelConfigurationSource = jest.fn().mockResolvedValue({
      targetPath: source.path,
      result: {
        status: 'conflict',
        expected: source.revision,
        current: { canonicalPath: source.path, mtimeMs: 3, size: 3, sha256: 'external-revision' },
      },
      evidence: { persistence: 'failed', application: 'not-applicable', runtime: 'not-applicable' },
      draft: '{"model":"external"}',
    });
    const plugin = createPlugin({
      settings: {
        modelSourceMode: 'local',
        disabledModelRefs: ['retained/provider-model'],
        providerIconLibrary: 'lobehub',
        server: { mode: 'local' },
      },
      modelConfigService: {
        inventoryConfigurationSources: jest.fn().mockResolvedValue([source]),
        readModelConfigurationSource: jest.fn().mockResolvedValue({
          source,
          content: '{"model":"before"}',
          subset: { model: 'before' },
        }),
        getCatalogs: jest.fn().mockResolvedValue(createEmptyCatalogBundle()),
        getConfigPath: jest.fn().mockReturnValue(source.path),
        applyModelConfigurationSource,
      },
    });
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const modal = new ModelConfigModal({} as App, plugin as never);
    await modal.onOpen();
    document.body.append(modal.contentEl);
    (modal as unknown as { modelValue: string }).modelValue = 'draft-model';

    await (modal as unknown as { save(): Promise<void> }).save();

    expect(plugin.settings.disabledModelRefs).toEqual(['retained/provider-model']);
    expect((modal as unknown as { modelValue: string }).modelValue).toBe('draft-model');
    const conflictEl = modal.contentEl.querySelector<HTMLElement>('[data-model-config-conflict]');
    expect(conflictEl).not.toBeNull();
    expect(conflictEl?.getAttribute('role')).toBe('alert');
    expect(conflictEl?.getAttribute('aria-live')).toBe('assertive');
    const reloadButton = modal.contentEl.querySelector<HTMLButtonElement>('[data-model-config-reload]');
    expect(reloadButton).not.toBeNull();
    expect(modal.contentEl.querySelector('[data-model-config-inspect]')).not.toBeNull();
    expect(modal.contentEl.querySelector('[data-model-config-retry]')).not.toBeNull();
    expect(document.activeElement).toBe(reloadButton);
    modal.contentEl.remove();
  });

});

describe('ModelConfigModal G9 fresh retry write failure', () => {
  it('restores enabled recovery controls after a fresh-revision non-conflict write failure', async () => {
    const source = createSourceCandidate();
    const freshRevision = { canonicalPath: source.path, mtimeMs: 2, size: 2, sha256: 'fresh-revision' };
    const freshSource = createSourceCandidate({ revision: freshRevision });
    const applyModelConfigurationSource = jest.fn()
      .mockResolvedValueOnce({
        targetPath: source.path,
        result: { status: 'conflict', expected: source.revision, current: freshRevision },
        evidence: { persistence: 'failed', application: 'not-applicable', runtime: 'not-applicable' },
      })
      .mockResolvedValueOnce({
        targetPath: source.path,
        result: { status: 'invalid-content', diagnostics: ['invalid JSONC mutation'] },
        evidence: { persistence: 'failed', application: 'not-applicable', runtime: 'not-applicable' },
      });
    const plugin = createPlugin({
      settings: {
        modelSourceMode: 'local',
        disabledModelRefs: ['retained/provider-model'],
        providerIconLibrary: 'lobehub',
        server: { mode: 'local' },
      },
      modelConfigService: {
        inventoryConfigurationSources: jest.fn().mockResolvedValue([source]),
        readModelConfigurationSource: jest.fn()
          .mockResolvedValueOnce({ source, content: '{"model":"before"}', subset: { model: 'before' } })
          .mockResolvedValueOnce({ source: freshSource, content: '{"model":"external"}', subset: { model: 'external' } }),
        getCatalogs: jest.fn().mockResolvedValue(createEmptyCatalogBundle()),
        getConfigPath: jest.fn().mockReturnValue(source.path),
        applyModelConfigurationSource,
      },
    });
    const noticeSpy = jest.spyOn(obsidian, 'Notice').mockImplementation(() => undefined as never);
    const modal = new ModelConfigModal({} as App, plugin as never);
    await modal.onOpen();
    (modal as unknown as { modelValue: string }).modelValue = 'draft-model';

    await (modal as unknown as { save(): Promise<void> }).save();
    modal.contentEl.querySelector<HTMLButtonElement>('[data-model-config-retry]')!.click();
    await flushAsyncWork();

    expect(applyModelConfigurationSource).toHaveBeenCalledTimes(2);
    expect((modal as unknown as { modelValue: string }).modelValue).toBe('draft-model');
    expect((modal as unknown as { selectedSource: OpencodeConfigSourceCandidate }).selectedSource.revision).toEqual(freshRevision);
    expect(plugin.settings.disabledModelRefs).toEqual(['retained/provider-model']);
    expect(modal.contentEl.querySelector('[data-model-config-source-loading]')).toBeNull();
    expect(modal.contentEl.querySelector<HTMLButtonElement>('[data-model-config-retry]')?.disabled).toBe(false);
    expect(modal.contentEl.querySelector<HTMLButtonElement>('[data-model-config-reload]')?.disabled).toBe(false);
    expect(modal.contentEl.querySelector<HTMLButtonElement>('[data-model-config-inspect]')?.disabled).toBe(false);
    expect(noticeSpy).toHaveBeenCalledWith(t('settings.model.config.source.writeFailed', {
      status: 'invalid-content',
    }));
  });
});

describe('ModelConfigModal G9 repeated conflict retry', () => {
  it('remains blocked and retains the current draft when the fresh-revision retry conflicts again', async () => {
    const source = createSourceCandidate();
    const freshRevision = { canonicalPath: source.path, mtimeMs: 2, size: 2, sha256: 'fresh-revision' };
    const freshSource = createSourceCandidate({ revision: freshRevision });
    const applyModelConfigurationSource = jest.fn()
      .mockResolvedValueOnce({
        targetPath: source.path,
        result: { status: 'conflict', expected: source.revision, current: freshRevision },
        evidence: { persistence: 'failed', application: 'not-applicable', runtime: 'not-applicable' },
      })
      .mockResolvedValueOnce({
        targetPath: source.path,
        result: { status: 'conflict', expected: freshRevision, current: { canonicalPath: source.path, mtimeMs: 3, size: 3, sha256: 'newer-external' } },
        evidence: { persistence: 'failed', application: 'not-applicable', runtime: 'not-applicable' },
      });
    const plugin = createPlugin({
      settings: {
        modelSourceMode: 'local',
        disabledModelRefs: ['retained/provider-model'],
        providerIconLibrary: 'lobehub',
        server: { mode: 'local' },
      },
      modelConfigService: {
        inventoryConfigurationSources: jest.fn().mockResolvedValue([source]),
        readModelConfigurationSource: jest.fn()
          .mockResolvedValueOnce({ source, content: '{"model":"before"}', subset: { model: 'before' } })
          .mockResolvedValueOnce({ source: freshSource, content: '{"model":"external"}', subset: { model: 'external' } }),
        getCatalogs: jest.fn().mockResolvedValue(createEmptyCatalogBundle()),
        getConfigPath: jest.fn().mockReturnValue(source.path),
        applyModelConfigurationSource,
      },
    });
    const modal = new ModelConfigModal({} as App, plugin as never);
    await modal.onOpen();
    (modal as unknown as { modelValue: string }).modelValue = 'draft-model';

    await (modal as unknown as { save(): Promise<void> }).save();
    modal.contentEl.querySelector<HTMLButtonElement>('[data-model-config-retry]')!.click();
    await flushAsyncWork();

    expect(applyModelConfigurationSource).toHaveBeenCalledTimes(2);
    expect(applyModelConfigurationSource.mock.calls[1]?.[2]).toEqual(freshRevision);
    expect((modal as unknown as { modelValue: string }).modelValue).toBe('draft-model');
    expect(plugin.settings.disabledModelRefs).toEqual(['retained/provider-model']);
    expect(modal.contentEl.querySelector('[data-model-config-conflict]')).not.toBeNull();
    expect(modal.contentEl.querySelector('[data-model-config-retry]')).not.toBeNull();
  });

});

describe('ModelConfigModal G9 source inventory guard', () => {
  it('fails closed when the explicit source inventory rejects and never calls the legacy writer', async () => {
    const writeLocalModelConfig = jest.fn().mockResolvedValue(undefined);
    const plugin = createPlugin({
      modelConfigService: {
        inventoryConfigurationSources: jest.fn().mockRejectedValue(new Error('inventory unavailable: g9-secret')),
        readLocalModelConfig: jest.fn().mockResolvedValue({ model: 'legacy-must-not-load' }),
        getCatalogs: jest.fn().mockResolvedValue(createEmptyCatalogBundle()),
        getConfigPath: jest.fn().mockReturnValue(PROJECT_SOURCE_PATH),
        writeLocalModelConfig,
        applyModelConfigurationSource: jest.fn(),
      },
    });
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const modal = new ModelConfigModal({} as App, plugin as never);

    await modal.onOpen();
    const saveButton = getButtonByText(modal.contentEl, t('settings.model.visualEditor.save'));
    expect(saveButton.disabled).toBe(true);
    expect(modal.contentEl.textContent).toContain(t('settings.model.config.source.inventoryUnavailable'));
    expect(modal.contentEl.textContent).not.toContain('g9-secret');

    await (modal as unknown as { save(): Promise<void> }).save();
    expect(plugin.modelConfigService.readLocalModelConfig).not.toHaveBeenCalled();
    expect(writeLocalModelConfig).not.toHaveBeenCalled();
    expect(plugin.modelConfigService.applyModelConfigurationSource).not.toHaveBeenCalled();
  });

});

describe('ModelConfigModal G9 selected-source writer guards', () => {
  it('marks a managed source read-only and never sends it to the model-source writer', async () => {
    const projectSource = createSourceCandidate();
    const managedSource = createSourceCandidate({
      scope: 'managed',
      source: 'managed-system',
      path: MANAGED_SOURCE_PATH,
      editable: false,
      revision: { canonicalPath: MANAGED_SOURCE_PATH, mtimeMs: 3, size: 3, sha256: 'managed-revision' },
    });
    const applyModelConfigurationSource = jest.fn();
    const plugin = createPlugin({
      modelConfigService: {
        inventoryConfigurationSources: jest.fn().mockResolvedValue([projectSource, managedSource]),
        readModelConfigurationSource: jest.fn()
          .mockResolvedValueOnce({ source: projectSource, content: '{}', subset: {} })
          .mockResolvedValueOnce({ source: managedSource, content: '{"model":"managed"}', subset: { model: 'managed' } }),
        getCatalogs: jest.fn().mockResolvedValue(createEmptyCatalogBundle()),
        getConfigPath: jest.fn().mockReturnValue(PROJECT_SOURCE_PATH),
        applyModelConfigurationSource,
      },
    });
    const modal = new ModelConfigModal({} as App, plugin as never);
    await modal.onOpen();

    const select = getSourceSelect(modal);
    select.value = managedSource.path;
    select.dispatchEvent(new Event('change'));
    await flushAsyncWork();

    const saveButton = getButtonByText(modal.contentEl, t('settings.model.visualEditor.save'));
    expect(saveButton.disabled).toBe(true);
    saveButton.click();
    await flushAsyncWork();
    expect(applyModelConfigurationSource).not.toHaveBeenCalled();
  });

  it('opens the advanced editor against the exact selected source path', async () => {
    const projectSource = createSourceCandidate();
    const globalSource = createSourceCandidate({
      scope: 'global',
      source: 'global-home-default',
      path: GLOBAL_SOURCE_PATH,
      revision: { canonicalPath: GLOBAL_SOURCE_PATH, mtimeMs: 2, size: 2, sha256: 'global-revision' },
    });
    const plugin = createPlugin({
      modelConfigService: {
        inventoryConfigurationSources: jest.fn().mockResolvedValue([projectSource, globalSource]),
        readModelConfigurationSource: jest.fn()
          .mockResolvedValueOnce({ source: projectSource, content: '{}', subset: {} })
          .mockResolvedValueOnce({ source: globalSource, content: '{}', subset: {} }),
        getCatalogs: jest.fn().mockResolvedValue(createEmptyCatalogBundle()),
        getConfigPath: jest.fn().mockReturnValue(PROJECT_SOURCE_PATH),
        applyModelConfigurationSource: jest.fn(),
      },
    });
    const modal = new ModelConfigModal({} as App, plugin as never);
    await modal.onOpen();

    const select = getSourceSelect(modal);
    select.value = globalSource.path;
    select.dispatchEvent(new Event('change'));
    await flushAsyncWork();
    const openSpy = jest.spyOn(OpencodeConfigModal.prototype, 'open').mockImplementation(() => undefined);

    const advancedButton = modal.contentEl.querySelector<HTMLButtonElement>('[data-model-config-open-advanced]');
    expect(advancedButton).not.toBeNull();
    advancedButton!.click();

    const advancedModal = openSpy.mock.instances[0] as OpencodeConfigModal & { options: { targetPath?: string } };
    expect(advancedModal.options.targetPath).toBe(globalSource.path);
  });
});

describe('ModelConfigModal G9 runtime evidence readback', () => {
  it('renders effective and connected catalog evidence as read-only summaries, never selector targets', async () => {
    const source = createSourceCandidate();
    const catalogs = createEmptyCatalogBundle();
    catalogs.baseEffective = { providers: [{ id: 'base-effective', models: [] }], defaults: {} };
    catalogs.effective = { providers: [{ id: 'effective', models: [] }], defaults: {} };
    catalogs.providerDirectory = {
      catalog: { providers: [{ id: 'connected', models: [] }], defaults: {} },
      connectedProviderIds: ['connected'],
      defaults: {},
    };
    const plugin = createPlugin({
      modelConfigService: {
        inventoryConfigurationSources: jest.fn().mockResolvedValue([source]),
        readModelConfigurationSource: jest.fn().mockResolvedValue({ source, content: '{}', subset: {} }),
        getCatalogs: jest.fn().mockResolvedValue(catalogs),
        getConfigPath: jest.fn().mockReturnValue(PROJECT_SOURCE_PATH),
        applyModelConfigurationSource: jest.fn(),
      },
    });
    const modal = new ModelConfigModal({} as App, plugin as never);
    await modal.onOpen();

    const summary = modal.contentEl.querySelector<HTMLElement>('[data-model-config-readonly-summary]');
    expect(summary).not.toBeNull();
    expect(summary!.textContent).toContain('connected');
    expect(Array.from(getSourceSelect(modal).options).map((option) => option.value)).toEqual(['', source.path]);
  });

  it('keeps the selected source editable when the runtime catalog is unavailable', async () => {
    const source = createSourceCandidate({
      revision: { canonicalPath: PROJECT_SOURCE_PATH, mtimeMs: 7, size: 7, sha256: 'source-revision' },
    });
    const runtimeFailure = 'runtime token sk-g9-catalog-secret';
    const plugin = createPlugin({
      modelConfigService: {
        inventoryConfigurationSources: jest.fn().mockResolvedValue([source]),
        readModelConfigurationSource: jest.fn().mockResolvedValue({
          source,
          content: '{"model":"preserved/model"}',
          subset: { model: 'preserved/model' },
        }),
        getCatalogs: jest.fn().mockRejectedValue(new Error(runtimeFailure)),
        getConfigPath: jest.fn().mockReturnValue(source.path),
        applyModelConfigurationSource: jest.fn(),
      },
    });
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const modal = new ModelConfigModal({} as App, plugin as never);

    await modal.onOpen();

    expect((modal as unknown as { modelValue: string }).modelValue).toBe('preserved/model');
    expect(getSourceSelect(modal).value).toBe(source.path);
    expect(modal.contentEl.textContent).toContain(source.path);
    expect(modal.contentEl.textContent).toContain(t('settings.model.config.source.revisionCaptured'));
    const summary = modal.contentEl.querySelector<HTMLElement>('[data-model-config-readonly-summary]');
    expect(summary).not.toBeNull();
    expect(summary!.textContent).toContain(t('settings.model.config.source.readonlySummaryUnavailable' as never));
    expect(summary!.textContent).not.toContain(runtimeFailure);
  });
});

describe('ModelConfigModal G9 narrow source surface CSS', () => {
  it('keeps the source selector and conflict actions flat, shrinkable, and generated at a 346px-equivalent width', () => {
    const css = readFileSync(join(process.cwd(), 'src/style/modals/config-editor-modal.css'), 'utf8');
    const generatedCss = readFileSync(join(process.cwd(), 'styles.css'), 'utf8');
    const surfaceEl = document.createElement('div');
    surfaceEl.style.width = '346px';
    surfaceEl.innerHTML = `
      <div class="opencodian-model-config-source-selector">
        <select><option>project · ${'x'.repeat(220)}</option></select>
        <p class="setting-item-description">${'path/'.repeat(80)}</p>
        <div class="opencodian-model-config-source-conflict" role="alert">
          <p>${'conflict/'.repeat(80)}</p>
          <div class="opencodian-config-buttons"><button type="button">Reload</button><button type="button">Retry</button></div>
        </div>
      </div>`;
    document.body.appendChild(surfaceEl);

    expect(surfaceEl.style.width).toBe('346px');
    expect(surfaceEl.querySelector('.opencodian-model-config-source-selector')).not.toBeNull();
    expect(surfaceEl.querySelector('.opencodian-model-config-source-conflict')).not.toBeNull();
    expect(surfaceEl.querySelector('.opencodian-modal-card')).toBeNull();
    expect(css).toMatch(/\.opencodian-model-config-source-selector\s*\{[\s\S]*?min-width:\s*0;[\s\S]*?max-width:\s*100%;/);
    expect(css).toMatch(/\.opencodian-model-config-source-selector select\s*\{[\s\S]*?width:\s*100%;[\s\S]*?min-width:\s*0;/);
    expect(css).toMatch(/\.opencodian-model-config-source-conflict\s*\{[\s\S]*?min-width:\s*0;[\s\S]*?overflow-wrap:\s*anywhere;/);
    expect(css).toMatch(/\.opencodian-model-workspace-path[\s\S]*?overflow-wrap:\s*anywhere;/);
    expect(css).toMatch(/@media \(max-width: 480px\)[\s\S]*?\.opencodian-model-config-source-conflict \.opencodian-config-buttons[\s\S]*?flex-direction:\s*column;[\s\S]*?\.opencodian-model-config-source-conflict \.opencodian-config-buttons button[\s\S]*?width:\s*100%;/);
    expect(generatedCss).toContain('.opencodian-model-config-source-selector');
    expect(generatedCss).toContain('.opencodian-model-config-source-conflict');
  });
});
