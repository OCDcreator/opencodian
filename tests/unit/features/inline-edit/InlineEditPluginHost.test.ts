import { describe, expect, it } from '@jest/globals';

import { AgentCapability } from '../../../../src/core/agents/AgentCapability';
import type { AgentServiceRegistry } from '../../../../src/core/agents/backend/AgentServiceRegistry';
import { normalizeInlineEditEffortOverrides } from '../../../../src/core/types/settings';
import {
  createInlineEditPluginHost,
  describeModelSelection,
  type InlineEditPluginBridge,
  resolveCompletionOverride,
} from '../../../../src/features/inline-edit/InlineEditPluginHost';

function makeBridge(overrides: Partial<InlineEditPluginBridge> = {}): InlineEditPluginBridge {
  return {
    getVaultPath: () => '/vault',
    getLocale: () => 'en',
    getRegistry: () => null,
    getActiveChatBackend: () => null,
    getActiveChatModel: () => null,
    getSettings: () => ({ enabled: true, modelOverrides: {}, effortOverrides: {}, presetPrompts: [] }),
    ...overrides,
  };
}

describe('describeModelSelection', () => {
  it('shows the override ref when one is configured', () => {
    const bridge = makeBridge({
      getSettings: () => ({
        enabled: true,
        modelOverrides: { 'claude-code': 'opusplan' },
        effortOverrides: {},
        presetPrompts: [],
      }),
    });
    expect(describeModelSelection(bridge, 'claude-code')).toEqual({
      label: 'opusplan',
      source: 'override',
    });
  });

  it('falls back to the chat tab model in backend format', () => {
    const bridge = makeBridge({
      getActiveChatBackend: () => 'opencode',
      getActiveChatModel: () => ({ provider: 'deepseek', model: 'deepseek-flash' }),
    });
    expect(describeModelSelection(bridge, 'opencode')).toEqual({
      label: 'deepseek/deepseek-flash',
      source: 'chat',
    });
    expect(describeModelSelection(bridge, 'codex').label).toBe('deepseek-flash');
  });

  it('reports the default source when nothing is set', () => {
    expect(describeModelSelection(makeBridge(), 'pi')).toEqual({ label: '', source: 'default' });
  });
});

describe('adapter picker surface', () => {
  const adapter = {
    displayName: 'Test',
    capabilities: new Set([AgentCapability.AuxQuery]),
  };

  function makeRegistry(): AgentServiceRegistry {
    return {
      get: (kind: string) => (kind === 'claude-code' ? adapter : undefined),
      getActiveKind: () => 'claude-code',
    } as unknown as AgentServiceRegistry;
  }

  it('maps bridge effort/model hooks onto the resolved adapter', () => {
    const calls: string[] = [];
    const resolved = createInlineEditPluginHost(makeBridge({
      getRegistry: () => makeRegistry(),
      getSettings: () => ({
        enabled: true,
        modelOverrides: {},
        effortOverrides: { 'claude-code': 'high' },
        presetPrompts: [],
      }),
      listModels: async (kind) => [{ id: `${kind}/m1`, label: 'M1' }],
      listEfforts: (kind) => (kind === 'claude-code' ? [{ id: 'low', label: 'low' }] : null),
      setModelOverride: async (kind, ref) => { calls.push(`model:${kind}:${String(ref)}`); },
      setEffortOverride: async (kind, id) => { calls.push(`effort:${kind}:${String(id)}`); },
    })).resolveAdapter();
    expect(resolved?.kind).toBe('claude-code');
    expect(resolved?.getEffort()).toBe('high');
    expect(resolved?.listEfforts?.()).toEqual([{ id: 'low', label: 'low' }]);
    void resolved?.setModelOverride?.(null);
    void resolved?.setEffortOverride?.('max');
    expect(calls).toEqual(['model:claude-code:null', 'effort:claude-code:max']);
    void resolved?.listModels?.();
  });
});

describe('normalizeInlineEditEffortOverrides', () => {
  it('keeps native effort values and drops everything else', () => {
    const normalized = normalizeInlineEditEffortOverrides({
      'claude-code': ' high ',
      codex: 'minimal',
      opencode: 'high',
      pi: 'low',
      'claude-code-stale': 'ultra',
    });
    expect(normalized).toEqual({
      'claude-code': 'high',
      codex: 'minimal',
    });
  });

  it('returns an empty map for non-object input', () => {
    expect(normalizeInlineEditEffortOverrides(null)).toEqual({});
    expect(normalizeInlineEditEffortOverrides('high')).toEqual({});
    expect(normalizeInlineEditEffortOverrides(['high'])).toEqual({});
  });
});

// R-C3: the dedicated completion override resolves BEFORE the inline-edit
// chain. `null` means "unset — fall back unchanged", which is what keeps the
// default behaviour byte-identical.
describe('resolveCompletionOverride (R-C3 dedicated completion model)', () => {
  it('resolves a configured backend-shaped ref for opencode/pi', () => {
    expect(resolveCompletionOverride('opencode', 'deepseek/deepseek-flash')).toEqual({
      ok: true,
      model: { kind: 'opencode', provider: 'deepseek', model: 'deepseek-flash' },
    });
    expect(resolveCompletionOverride('pi', ' provider/model-x ')).toEqual({
      ok: true,
      model: { kind: 'pi', provider: 'provider', model: 'model-x' },
    });
  });

  it('resolves a bare model id for claude-code and codex', () => {
    expect(resolveCompletionOverride('claude-code', 'claude-haiku-4-5')).toEqual({
      ok: true,
      model: { kind: 'claude-code', model: 'claude-haiku-4-5' },
    });
    expect(resolveCompletionOverride('codex', 'gpt-5-mini')).toEqual({
      ok: true,
      model: { kind: 'codex', model: 'gpt-5-mini' },
    });
  });

  it('returns null when unset so the caller falls back to the existing chain', () => {
    expect(resolveCompletionOverride('opencode', undefined)).toBeNull();
    expect(resolveCompletionOverride('opencode', '')).toBeNull();
    expect(resolveCompletionOverride('opencode', '   ')).toBeNull();
    expect(resolveCompletionOverride('opencode', 42)).toBeNull();
    expect(resolveCompletionOverride('opencode', null)).toBeNull();
  });

  it('rejects a malformed ref instead of silently falling back', () => {
    const refused = resolveCompletionOverride('opencode', 'no-slash');
    expect(refused).toEqual({
      ok: false,
      error: '"no-slash" is not a valid opencode model reference.',
    });
    expect(resolveCompletionOverride('claude-code', 'has space')).toEqual({
      ok: false,
      error: '"has space" is not a valid claude-code model reference.',
    });
  });

  it('honours the optional availability check like the inline-edit chain', () => {
    const unavailable = resolveCompletionOverride('opencode', 'ghost/nope', () => false);
    expect(unavailable).toEqual({
      ok: false,
      error: '"ghost/nope" is not available in the opencode model catalog.',
    });
    const available = resolveCompletionOverride('opencode', 'p/m', () => true);
    expect(available).toEqual({ ok: true, model: { kind: 'opencode', provider: 'p', model: 'm' } });
  });
});
