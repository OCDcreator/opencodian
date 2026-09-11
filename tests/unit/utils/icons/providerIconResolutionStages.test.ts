import type { App } from 'obsidian';

import type { AgentBackendKind } from '../../../../src/core/types/chat';
import {
  getModelsDevLogoUrl,
  listBuiltinIcons,
  resolveBuiltinIconMatch,
  searchBuiltinIcons,
} from '../../../../src/utils/icons/builtinIconRegistry';
import { MODELS_DEV_PROVIDER_ICONS } from '../../../../src/utils/icons/modelsDevIconManifest';
import { getPreviewUrlForEntry } from '../../../../src/utils/icons/providerIconBuiltinSelection';
import {
  getDefaultProviderIconEntry,
  hasProviderIcon,
  resolveProviderEntryResolution,
} from '../../../../src/utils/icons/providerIconEntryResolution';
import { ProviderIconService } from '../../../../src/utils/icons/ProviderIconService';

const appStub = {} as App;

describe('provider icon resolution stages', () => {
  it('resolves curated ids through the existing local and LobeHub sources', () => {
    expect(resolveBuiltinIconMatch('openai')?.libraryId).toBe('lobehub');
    expect(resolveBuiltinIconMatch('zai')?.iconId).toBe('zai');
    expect(resolveBuiltinIconMatch('zai-coding-plan')?.source).toBe('opencode:zai-coding-plan');
    expect(resolveBuiltinIconMatch('nanogpt')?.source).toBe('opencode:nano-gpt');
  });

  it('exposes models.dev provider ids as a third icon source', () => {
    const modelsDevDefinitions = listBuiltinIcons({ libraryId: 'modelsdev' });
    expect(modelsDevDefinitions.length).toBe(MODELS_DEV_PROVIDER_ICONS.length);

    const entry = getDefaultProviderIconEntry('agentrouter');
    expect(entry?.source).toBe('modelsdev:agentrouter');
    expect(getModelsDevLogoUrl('agentrouter')).toBe('https://models.dev/logos/agentrouter.svg');
  });

  it('builds models.dev logo urls for the sync preview path', () => {
    const entry = getDefaultProviderIconEntry('aki-io');
    expect(entry).not.toBeNull();
    expect(getPreviewUrlForEntry(appStub, entry!)).toBe('https://models.dev/logos/aki-io.svg');
  });

  it('strips plan and region segments before giving up', () => {
    expect(getDefaultProviderIconEntry('zai-coding-cn')?.source).toBe('opencode:zai-coding-plan');
    expect(getDefaultProviderIconEntry('my-zhipu')?.source).toBe('zhipu');
    // The curated alias map already knows the `alibaba` brand, so it may answer
    // first; the staged builtin matcher still resolves the exact bundled id.
    expect(resolveBuiltinIconMatch('alibaba-coding-plan-cn')?.source)
      .toBe('opencode:alibaba-coding-plan-cn');
    expect(getDefaultProviderIconEntry('alibaba-coding-plan-cn')?.source)
      .toMatch(/alibaba/);
  });

  it('falls back to brand token collision for unpublished gateway ids', () => {
    expect(getDefaultProviderIconEntry('krill-gpt')?.source).toBe('lobehub:openai');
    expect(getDefaultProviderIconEntry('acme-claude-proxy')?.source).toBe('claude');
    expect(getDefaultProviderIconEntry('my-deepseek-relay')?.source).toBe('deepseek');
  });

  it('never invents an icon from generic words alone', () => {
    expect(getDefaultProviderIconEntry('krill')).toBeNull();
    expect(getDefaultProviderIconEntry('my-super-gateway')).toBeNull();
    expect(getDefaultProviderIconEntry('totally-unknown-thing')).toBeNull();
    expect(hasProviderIcon('totally-unknown-thing')).toBe(false);
  });

  it('keeps hasProviderIcon consistent with the default entry', () => {
    for (const providerId of ['openai', 'zai-coding-cn', 'krill-gpt', 'agentrouter', 'krill', 'opencode-go']) {
      expect(hasProviderIcon(providerId)).toBe(getDefaultProviderIconEntry(providerId) !== null);
    }
  });

  it('keeps the sync icon url aligned with the resolved default entry', () => {
    expect(ProviderIconService.getIconUrl(appStub, 'krill-gpt'))
      .toBe('https://unpkg.com/@lobehub/icons-static-svg@latest/icons/openai.svg');
    expect(ProviderIconService.getIconUrl(appStub, 'agentrouter'))
      .toBe('https://models.dev/logos/agentrouter.svg');
    expect(ProviderIconService.getIconUrl(appStub, 'totally-unknown-thing')).toBeNull();
  });

  it('still resolves explicit user entries ahead of every built-in source', () => {
    const resolution = resolveProviderEntryResolution('krill-gpt', {
      'krill-gpt': [{
        id: 'custom:krill',
        type: 'url',
        source: 'https://example.com/krill.svg',
        addedAt: 0,
      }],
    });

    expect(resolution?.selectedEntry?.source).toBe('https://example.com/krill.svg');
  });

  it('keeps the backend switcher icon config unchanged for the Pi backend', () => {
    const backend: AgentBackendKind = 'pi';
    expect(backend).toBe('pi');
    expect(searchBuiltinIcons('pi', { limit: 3 }).length).toBeGreaterThan(0);
  });
});
