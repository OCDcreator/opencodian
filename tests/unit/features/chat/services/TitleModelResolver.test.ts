import type { AgentBackendKind } from '../../../../../src/core/types/chat';
import { DEFAULT_SETTINGS, normalizeTitleModelOverrides } from '../../../../../src/core/types/settings';
import { TitleModelResolver } from '../../../../../src/features/chat/services/title/TitleModelResolver';

const current = { provider: 'provider-a', model: 'large' };

function harness(adapter: object) {
  const settings = { ...DEFAULT_SETTINGS, aiTitleModel: '', aiTitleModelOverrides: {} as Partial<Record<AgentBackendKind, string>> };
  const getCatalogs = jest.fn();
  const resolver = new TitleModelResolver({ settings, agentServiceRegistry: { get: () => adapter }, modelConfigService: { getCatalogs } } as never);
  return { settings, resolver, getCatalogs };
}

describe('TitleModelResolver', () => {
  it.each([
    ['pi', { getAvailableModels: async () => [{ provider: 'provider-a', id: 'mini' }] }],
    ['zcode', { getAvailableModels: async () => [{ providerId: 'provider-a', modelId: 'mini' }] }],
    ['dsh', { getModelSelectorProviders: async () => [{ id: 'provider-a', models: [{ id: 'mini' }] }] }],
    ['codex', { getModelList: async () => [{ slug: 'mini' }] }],
    ['claude-code', { supportedModels: async () => [{ id: 'mini', provider: 'native-provider-label' }] }],
  ] as const)('normalizes %s native catalogs', async (backend, adapter) => {
    const h = harness(adapter);
    await expect(h.resolver.resolve(backend, current)).resolves.toEqual({ provider: 'provider-a', model: 'mini', source: 'lightweight' });
    expect(h.getCatalogs).not.toHaveBeenCalled();
  });

  it('keeps explicit model overrides isolated by backend and preserves legacy OpenCode configuration', async () => {
    const h = harness({ getAvailableModels: async () => [{ provider: 'provider-a', id: 'mini' }, { provider: 'provider-a', id: 'dedicated' }] });
    h.settings.aiTitleModel = 'unrelated/opencode-model';
    h.settings.aiTitleModelOverrides = { pi: 'provider-a/dedicated', zcode: 'other/model' };
    await expect(h.resolver.resolve('pi', current)).resolves.toEqual({ provider: 'provider-a', model: 'dedicated', source: 'configured' });
    h.settings.aiTitleModelOverrides = {};
    await expect(h.resolver.resolve('pi', current)).resolves.toEqual({ provider: 'provider-a', model: 'mini', source: 'lightweight' });
  });

  it('reuses an already-lightweight chat model before considering other candidates', async () => {
    const h = harness({ getAvailableModels: async () => [
      { provider: 'provider-a', id: 'flash-lite' }, { provider: 'provider-a', id: 'deepseek-flash' },
    ] });
    await expect(h.resolver.resolve('pi', { provider: 'provider-a', model: 'deepseek-flash' }))
      .resolves.toEqual({ provider: 'provider-a', model: 'deepseek-flash', source: 'current' });
  });

  it('reads ZCode workspace models before any foreground session has emitted a catalog snapshot', async () => {
    const getAvailableModels = jest.fn().mockRejectedValue(new Error('no session snapshot'));
    const h = harness({ getAvailableModels, getWorkspaceModelCatalog: async () => ({ models: [
      { providerId: 'provider-a', modelId: 'mini' },
    ] }) });
    h.settings.aiTitleModelOverrides.zcode = 'provider-a/mini';
    await expect(h.resolver.resolve('zcode', current)).resolves.toEqual({ provider: 'provider-a', model: 'mini', source: 'configured' });
    expect(getAvailableModels).not.toHaveBeenCalled();
  });

  it('accepts native slash-containing Codex model IDs without inventing a provider switch', async () => {
    const h = harness({ getModelList: async () => [{ slug: 'organization/model' }] });
    h.settings.aiTitleModelOverrides.codex = 'organization/model';
    await expect(h.resolver.resolve('codex', current)).resolves.toEqual({ ...current, model: 'organization/model', source: 'configured' });
  });

  it('excludes disabled and hidden models and never silently crosses providers', async () => {
    const h = harness({ getModelSelectorProviders: async () => [
      { id: 'provider-a', models: [{ id: 'mini', enabled: false }, { id: 'nano', hidden: true }, { id: 'haiku' }] },
      { id: 'provider-b', models: [{ id: 'flash-lite' }] },
    ] });
    h.settings.disabledModelRefs = ['provider-a/haiku'];
    await expect(h.resolver.resolve('opencode2', current)).resolves.toEqual({ ...current, source: 'current' });
    h.settings.aiTitleModel = 'provider-a/haiku';
    await expect(h.resolver.resolve('opencode2', current)).rejects.toThrow('unavailable');
  });

  it('normalizes persisted overrides without accepting unknown backends or invalid value types', () => {
    expect(normalizeTitleModelOverrides({ pi: ' a/mini ', codex: 'organization/model', zcode: 'b/fast', dsh: 3, unknown: 'x/y' }))
      .toEqual({ pi: 'a/mini', codex: 'organization/model', zcode: 'b/fast' });
    expect(normalizeTitleModelOverrides(null)).toEqual({});
  });
});
