import { ModelConfigService } from '../../../../src/core/config/ModelConfigService';

function createOpenCodeServiceMock() {
  return {
    getAvailableModels: jest.fn().mockResolvedValue({ defaults: {}, providers: [] }),
    getProviderDirectory: jest.fn().mockResolvedValue({ defaults: {}, providers: [], connected: [] }),
    getResolvedModelConfig: jest.fn().mockResolvedValue({}),
    getSettingsSnapshot: jest.fn().mockReturnValue({ server: { mode: 'remote' } }),
    probeProviderResponse: jest.fn().mockResolvedValue({
      providerId: 'deepseek',
      modelId: 'deepseek-chat',
      success: true,
      responsePreview: 'OK',
    }),
  };
}

describe('ModelConfigService G9 source-bound model subsets', () => {
  it('treats an empty selected JSONC source as an empty editable model subset', async () => {
    const source = {
      scope: 'project',
      source: 'project-default',
      path: '/vault/.opencode/opencode.jsonc',
      exists: false,
      editable: true,
      revision: null,
      evidence: { persistence: 'not-applicable', application: 'pending', runtime: 'unavailable' },
    };
    const configManager = {
      readConfigurationSource: jest.fn().mockResolvedValue({
        status: 'success',
        source,
        content: '',
      }),
    };
    const service = new ModelConfigService(configManager as never, createOpenCodeServiceMock() as never);

    await expect(service.readModelConfigurationSource(source.path)).resolves.toMatchObject({
      source,
      content: '',
      subset: {},
    });
  });

  it('uses the selected source and limits JSONC mutations to the model-owned keys', async () => {
    const revision = { canonicalPath: '/vault/.opencode/opencode.jsonc', size: 42, mtimeMs: 1, hash: 'a' };
    const configManager = {
      inventoryConfigurationSources: jest.fn().mockResolvedValue([
        { scope: 'project', source: 'project-default', path: '/vault/.opencode/opencode.jsonc', exists: true, editable: true, revision, evidence: {} },
        { scope: 'global', source: 'global-home-default', path: '/home/.config/opencode/opencode.jsonc', exists: true, editable: true, revision, evidence: {} },
        { scope: 'managed', source: 'managed-system', path: '/etc/opencode/opencode.jsonc', exists: true, editable: false, revision, evidence: {} },
      ]),
      readConfigurationSource: jest.fn().mockResolvedValue({
        status: 'success',
        source: { scope: 'global', source: 'global-home-default', path: '/home/.config/opencode/opencode.jsonc', exists: true, editable: true, revision, evidence: {} },
        content: '{ // keep\n "model": "old", "unknown": true }',
      }),
      applyConfigurationPathEdits: jest.fn().mockResolvedValue({
        targetPath: '/home/.config/opencode/opencode.jsonc',
        result: { status: 'success', revision },
        evidence: {},
        draft: '{ // keep\n "unknown": true }',
      }),
    };
    const service = new ModelConfigService(configManager as never, createOpenCodeServiceMock() as never);

    const inventory = await service.inventoryConfigurationSources();
    expect(inventory.map((source) => source.scope)).toEqual(['project', 'global', 'managed']);
    await expect(service.readModelConfigurationSource('/home/.config/opencode/opencode.jsonc'))
      .resolves.toMatchObject({ subset: { model: 'old' } });
    await service.applyModelConfigurationSource('/home/.config/opencode/opencode.jsonc', { model: 'new' }, revision);

    expect(configManager.applyConfigurationPathEdits).toHaveBeenCalledWith(expect.objectContaining({
      targetPath: '/home/.config/opencode/opencode.jsonc',
      expectedRevision: revision,
      edits: [
        { path: ['model'], value: 'new' },
        { path: ['small_model'], value: undefined },
        { path: ['provider'], value: undefined },
        { path: ['enabled_providers'], value: undefined },
        { path: ['disabled_providers'], value: undefined },
      ],
    }));
  });
});
