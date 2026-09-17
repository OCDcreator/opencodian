import { describe, expect, it } from '@jest/globals';

import { AgentCapability } from '../../../../src/core/agents/AgentCapability';
import type { AgentServiceRegistry } from '../../../../src/core/agents/backend/AgentServiceRegistry';
import { normalizeInlineEditEffortOverrides } from '../../../../src/core/types/settings';
import {
  createInlineEditPluginHost,
  describeModelSelection,
  type InlineEditPluginBridge,
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
