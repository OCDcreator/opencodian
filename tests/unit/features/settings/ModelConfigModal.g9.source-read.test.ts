import type { App } from 'obsidian';

import type { ModelCatalogBundle } from '../../../../src/core/config';
import type { OpencodeConfigSourceCandidate } from '../../../../src/core/config/OpencodeConfigSourceService';
import { ModelConfigModal } from '../../../../src/features/settings/ModelConfigModal';
import { t } from '../../../../src/i18n';
import { ProviderIconService } from '../../../../src/utils/icons/ProviderIconService';

const PROJECT_SOURCE_PATH = '/vault/.opencode/opencode.jsonc';
const GLOBAL_SOURCE_PATH = '/home/test/.config/opencode/opencode.jsonc';

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

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
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

beforeEach(() => {
  jest.spyOn(ProviderIconService, 'resolveIconUrl').mockResolvedValue(null);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('ModelConfigModal G9 source reads and secret boundaries', () => {
  it('does not render a stored provider secret into editable controls or the readonly preview', async () => {
    const revision = { canonicalPath: PROJECT_SOURCE_PATH };
    const secret = 'sk-g9-visible-secret';
    const accessToken = 'g9-access-token-secret';
    const clientSecret = 'g9-client-secret';
    const password = 'g9-password';
    const credential = 'g9-credential';
    const authorization = 'Bearer g9-authorization';
    const nestedAuthorization = 'Bearer g9-nested-authorization';
    const malformedAuthorization = 'Bearer g9-malformed-authorization';
    const basicAuth = 'Basic Zzk6dW5rbm93bi1hdXRoLXNlY3JldA==';
    const cookie = 'session=g9-cookie-secret';
    const privateKey = '-----BEGIN PRIVATE KEY-----g9-private-key-----END PRIVATE KEY-----';
    const plugin = createPlugin({
      modelConfigService: {
        inventoryConfigurationSources: jest.fn().mockResolvedValue([
          { scope: 'project', source: 'project-default', path: PROJECT_SOURCE_PATH, exists: true, editable: true, revision, evidence: {} },
        ]),
        readModelConfigurationSource: jest.fn().mockResolvedValue({
          source: { scope: 'project', source: 'project-default', path: PROJECT_SOURCE_PATH, exists: true, editable: true, revision, evidence: {} },
          content: '{}',
          subset: {
            provider: {
              openai: {
                name: 'OpenAI',
                options: {
                  apiKey: secret,
                  baseURL: 'https://api.example.test',
                  accessToken,
                  clientSecret,
                  password,
                  credential,
                  authorization,
                  auth: basicAuth,
                  headers: { Authorization: nestedAuthorization, Cookie: cookie },
                  malformedHeaders: `{ "authorization": "${malformedAuthorization}`,
                  privateKey,
                  setCacheKey: true,
                },
              },
            },
          },
        }),
        getCatalogs: jest.fn().mockResolvedValue(createEmptyCatalogBundle()),
        getConfigPath: jest.fn().mockReturnValue('.opencode/opencode.json'),
        applyModelConfigurationSource: jest.fn().mockResolvedValue({ result: { status: 'success' }, evidence: {} }),
      },
    });
    const modal = new ModelConfigModal({} as App, plugin as never);

    await modal.onOpen();

    const secretValues = [
      secret,
      accessToken,
      clientSecret,
      password,
      credential,
      authorization,
      nestedAuthorization,
      malformedAuthorization,
      basicAuth,
      cookie,
      privateKey,
    ];
    for (const secretValue of secretValues) {
      expect(modal.contentEl.outerHTML).not.toContain(secretValue);
    }
    const editableControlValues = Array.from(modal.contentEl.querySelectorAll('input, textarea')).map((element) => (
      element as HTMLInputElement
    ).value);
    for (const secretValue of secretValues) {
      expect(editableControlValues).not.toContain(secretValue);
    }
    const hiddenExtraOptionValues = modal.contentEl.querySelectorAll<HTMLTextAreaElement>(
      '[data-model-config-hidden-secret="true"]',
    );
    expect(hiddenExtraOptionValues).toHaveLength(9);
    for (const valueInput of hiddenExtraOptionValues) {
      expect(valueInput.value).toBe('');
      expect(valueInput.disabled).toBe(true);
      expect(valueInput.placeholder).toBe(t('settings.model.config.configuredHidden'));
    }
    const visibleExtraOptionValues = Array.from(modal.contentEl.querySelectorAll<HTMLTextAreaElement>(
      '.opencodian-model-workspace-keyvalue-textarea:not([data-model-config-hidden-secret])',
    )).map((input) => input.value);
    expect(visibleExtraOptionValues).toContain('true');
    await (modal as unknown as { save(): Promise<void> }).save();
    expect(plugin.modelConfigService.applyModelConfigurationSource).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ provider: expect.objectContaining({
        openai: expect.objectContaining({ options: expect.objectContaining({
          apiKey: secret,
          accessToken,
          clientSecret,
          password,
          credential,
          authorization,
          auth: basicAuth,
          headers: { Authorization: nestedAuthorization, Cookie: cookie },
          malformedHeaders: `{ "authorization": "${malformedAuthorization}`,
          privateKey,
          setCacheKey: true,
        }) }),
      }) }),
      revision,
    );

    const apiKeyInput = modal.contentEl.querySelector<HTMLInputElement>('input[type="password"]')!;
    apiKeyInput.value = 'sk-g9-replacement';
    apiKeyInput.dispatchEvent(new Event('input'));
    await (modal as unknown as { save(): Promise<void> }).save();
    expect(plugin.modelConfigService.applyModelConfigurationSource).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({ provider: expect.objectContaining({
        openai: expect.objectContaining({ options: expect.objectContaining({ apiKey: 'sk-g9-replacement' }) }),
      }) }),
      revision,
    );
  });

  it('hides a secret from malformed preview text without changing the canonical draft', async () => {
    const modal = new ModelConfigModal({} as App, createPlugin() as never);
    await modal.onOpen();

    const invalidDraft = '{ "provider": { "openai": { "options": { "apiKey": "sk-g9-malformed-secret" } } }';
    const previewEl = modal.contentEl.createEl('textarea');
    const state = modal as unknown as {
      previewEl: HTMLTextAreaElement | null;
      jsonDraftValue: string;
      maskSecretPreview(value: string): string;
    };
    state.previewEl = previewEl;
    state.jsonDraftValue = invalidDraft;
    previewEl.value = state.maskSecretPreview(invalidDraft);

    expect(previewEl.value).not.toContain('sk-g9-malformed-secret');
    expect(previewEl.value).toContain(t('settings.model.config.configuredHidden'));
    expect(state.jsonDraftValue).toBe(invalidDraft);
  });

  it('hydrates the explicitly selected source and leaves restart unchecked by default', async () => {
    const revision = { canonicalPath: PROJECT_SOURCE_PATH };
    const plugin = createPlugin({
      modelConfigService: {
        inventoryConfigurationSources: jest.fn().mockResolvedValue([
          { scope: 'project', source: 'project-default', path: PROJECT_SOURCE_PATH, exists: true, editable: true, revision, evidence: {} },
          { scope: 'global', source: 'global-home-default', path: GLOBAL_SOURCE_PATH, exists: true, editable: true, revision, evidence: {} },
        ]),
        readModelConfigurationSource: jest.fn().mockResolvedValue({
          source: { scope: 'project', source: 'project-default', path: PROJECT_SOURCE_PATH, exists: true, editable: true, revision, evidence: {} },
          content: '{ "model": "openai/gpt-5" }',
          subset: { model: 'openai/gpt-5' },
        }),
        getCatalogs: jest.fn().mockResolvedValue(createEmptyCatalogBundle()),
        getConfigPath: jest.fn().mockReturnValue('.opencode/opencode.json'),
        applyModelConfigurationSource: jest.fn(),
      },
    });
    const modal = new ModelConfigModal({} as App, plugin as never);

    await modal.onOpen();

    expect(modal.contentEl.textContent).toContain(PROJECT_SOURCE_PATH);
    expect((modal.contentEl.querySelector('.opencodian-model-workspace-restart-toggle input') as HTMLInputElement).checked).toBe(false);
  });
});

describe('ModelConfigModal G9 source switching', () => {
  it('does not let a stale source response re-render over the newly selected source', async () => {
    const projectSource = createSourceCandidate();
    const globalSource = createSourceCandidate({
      scope: 'global',
      source: 'global-home-default',
      path: GLOBAL_SOURCE_PATH,
      revision: { canonicalPath: GLOBAL_SOURCE_PATH, mtimeMs: 2, size: 2, sha256: 'global-revision' },
    });
    const staleGlobal = createDeferred<unknown>();
    const currentProject = createDeferred<unknown>();
    const readModelConfigurationSource = jest.fn()
      .mockResolvedValueOnce({ source: projectSource, content: '{"model":"project-initial"}', subset: { model: 'project-initial' } })
      .mockReturnValueOnce(staleGlobal.promise)
      .mockReturnValueOnce(currentProject.promise);
    const plugin = createPlugin({
      modelConfigService: {
        inventoryConfigurationSources: jest.fn().mockResolvedValue([projectSource, globalSource]),
        readModelConfigurationSource,
        getCatalogs: jest.fn().mockResolvedValue(createEmptyCatalogBundle()),
        getConfigPath: jest.fn().mockReturnValue(PROJECT_SOURCE_PATH),
        applyModelConfigurationSource: jest.fn(),
      },
    });
    const modal = new ModelConfigModal({} as App, plugin as never);
    await modal.onOpen();
    const renderSpy = jest.spyOn(modal as unknown as { render(): void }, 'render');
    const select = getSourceSelect(modal);

    select.value = globalSource.path;
    select.dispatchEvent(new Event('change'));
    select.value = projectSource.path;
    select.dispatchEvent(new Event('change'));
    renderSpy.mockClear();

    staleGlobal.resolve({ source: globalSource, content: '{"model":"global-stale"}', subset: { model: 'global-stale' } });
    await flushAsyncWork();
    expect(renderSpy).not.toHaveBeenCalled();

    currentProject.resolve({ source: projectSource, content: '{"model":"project-fresh"}', subset: { model: 'project-fresh' } });
    await flushAsyncWork();
    expect((modal as unknown as { modelValue: string }).modelValue).toBe('project-fresh');
  });

  it('blocks a dirty draft from silently switching sources', async () => {
    const projectSource = createSourceCandidate();
    const globalSource = createSourceCandidate({
      scope: 'global',
      source: 'global-home-default',
      path: GLOBAL_SOURCE_PATH,
      revision: { canonicalPath: GLOBAL_SOURCE_PATH, mtimeMs: 2, size: 2, sha256: 'global-revision' },
    });
    const readModelConfigurationSource = jest.fn().mockResolvedValue({
      source: projectSource,
      content: '{"model":"project"}',
      subset: { model: 'project' },
    });
    const plugin = createPlugin({
      modelConfigService: {
        inventoryConfigurationSources: jest.fn().mockResolvedValue([projectSource, globalSource]),
        readModelConfigurationSource,
        getCatalogs: jest.fn().mockResolvedValue(createEmptyCatalogBundle()),
        getConfigPath: jest.fn().mockReturnValue(PROJECT_SOURCE_PATH),
        applyModelConfigurationSource: jest.fn(),
      },
    });
    const modal = new ModelConfigModal({} as App, plugin as never);
    await modal.onOpen();
    (modal as unknown as { modelValue: string }).modelValue = 'unsaved-model';

    const select = getSourceSelect(modal);
    select.value = globalSource.path;
    select.dispatchEvent(new Event('change'));
    await flushAsyncWork();

    expect(readModelConfigurationSource).toHaveBeenCalledTimes(1);
    expect(getSourceSelect(modal).value).toBe(projectSource.path);
    expect((modal as unknown as { selectedSource: OpencodeConfigSourceCandidate }).selectedSource.path).toBe(projectSource.path);
  });

  it('keeps the current source, draft, revision, and selector when the replacement source read fails', async () => {
    const projectSource = createSourceCandidate();
    const globalSource = createSourceCandidate({
      scope: 'global',
      source: 'global-home-default',
      path: GLOBAL_SOURCE_PATH,
      revision: { canonicalPath: GLOBAL_SOURCE_PATH, mtimeMs: 2, size: 2, sha256: 'global-revision' },
    });
    const rejectedGlobalRead = createDeferred<unknown>();
    const readModelConfigurationSource = jest.fn()
      .mockResolvedValueOnce({ source: projectSource, content: '{"model":"project-draft"}', subset: { model: 'project-draft' } })
      .mockReturnValueOnce(rejectedGlobalRead.promise);
    const plugin = createPlugin({
      modelConfigService: {
        inventoryConfigurationSources: jest.fn().mockResolvedValue([projectSource, globalSource]),
        readModelConfigurationSource,
        getCatalogs: jest.fn().mockResolvedValue(createEmptyCatalogBundle()),
        getConfigPath: jest.fn().mockReturnValue(PROJECT_SOURCE_PATH),
        applyModelConfigurationSource: jest.fn(),
      },
    });
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const modal = new ModelConfigModal({} as App, plugin as never);
    await modal.onOpen();

    const select = getSourceSelect(modal);
    select.value = globalSource.path;
    select.dispatchEvent(new Event('change'));

    const saveButtonWhileLoading = Array.from(modal.contentEl.querySelectorAll('button'))
      .find((entry) => entry.textContent?.trim() === t('settings.model.visualEditor.save'));
    expect(saveButtonWhileLoading?.disabled).toBe(true);

    rejectedGlobalRead.reject(new Error('untrusted read failure: g9-secret'));
    await flushAsyncWork();

    const state = modal as unknown as {
      modelValue: string;
      selectedSource: OpencodeConfigSourceCandidate;
    };
    expect(state.modelValue).toBe('project-draft');
    expect(state.selectedSource.path).toBe(projectSource.path);
    expect(state.selectedSource.revision).toEqual(projectSource.revision);
    expect(getSourceSelect(modal).value).toBe(projectSource.path);
    expect(modal.contentEl.textContent).toContain(t('settings.model.config.source.readFailed'));
    expect(modal.contentEl.textContent).not.toContain('g9-secret');
  });
});
