/**
 * ZCodeModelCatalog.test.ts — live catalog parsing and pre-send validation
 * (ticket 06).
 *
 * The catalog comes only from runtime payloads; unsupported model/reasoning/
 * thinking/mode values are rejected locally and never reach the wire.
 */
import { describe, expect, it } from '@jest/globals';

import {
  classifyZCodeModeReadback,
  parseZCodeCatalogSnapshot,
  patchZCodeCatalogSettings,
  validateZCodeMode,
  validateZCodeModelSelection,
  validateZCodeThoughtLevel,
} from '../../../../../src/core/agents/backend/zcode/ZCodeModelCatalog';

const settings = {
  model: {
    available: [
      {
        ref: { providerId: 'opencode-go', modelId: 'grok-4.5' },
        label: 'grok-4.5',
        providerLabel: 'opencode-go',
        contextWindow: 200000,
        maxOutputTokens: 500000,
        reasoning: { levels: [{ value: 'low', label: 'low' }, { value: 'medium', label: 'medium' }, { value: 'high', label: 'high' }], defaultLevel: 'medium' },
        properties: { inputFormat: { supportsText: true, supportsImage: true } },
      },
      {
        ref: { providerId: 'opencode-go', modelId: 'mimo-v2.6-pro' },
        label: 'mimo-v2.6-pro',
        providerLabel: 'opencode-go',
        contextWindow: 1048576,
        maxOutputTokens: 131072,
        reasoning: { levels: [{ value: 'disabled', label: 'disabled' }, { value: 'enabled', label: 'enabled' }], defaultLevel: 'enabled' },
        properties: { inputFormat: { supportsText: true, supportsImage: true } },
      },
    ],
    current: { providerId: 'opencode-go', modelId: 'grok-4.5', options: { reasoningLevel: 'high' } },
    lastUsed: { providerId: 'opencode-go', modelId: 'grok-4.5' },
  },
  thoughtLevel: { available: [{ label: 'disabled', value: 'disabled' }, { label: 'enabled', value: 'enabled' }], current: 'enabled', enabled: true },
  mode: { current: 'build' },
  slashCommands: [
    { name: 'goal', description: 'Show or set the current session goal.', inputHint: '/goal [pause|resume|clear]', source: 'builtin' },
    { name: 'hello', description: 'Say hello', inputHint: '/hello', source: 'custom' },
  ],
};

describe('parseZCodeCatalogSnapshot', () => {
  it('parses the live catalog with reasoning variants, thought levels, modes and slash commands', () => {
    const catalog = parseZCodeCatalogSnapshot(settings);
    expect(catalog).not.toBeNull();
    expect(catalog?.models).toHaveLength(2);
    expect(catalog?.models[1]).toMatchObject({
      providerId: 'opencode-go',
      modelId: 'mimo-v2.6-pro',
      label: 'mimo-v2.6-pro',
      contextWindow: 1048576,
      maxOutputTokens: 131072,
      defaultReasoningLevel: 'enabled',
      supportsImageInput: true,
    });
    expect(catalog?.models[1].reasoningLevels.map((level) => level.value)).toEqual(['disabled', 'enabled']);
    expect(catalog?.currentModel).toEqual({ providerId: 'opencode-go', modelId: 'grok-4.5', reasoningLevel: 'high' });
    expect(catalog?.currentThoughtLevel).toBe('enabled');
    expect(catalog?.currentMode).toBe('build');
    expect(catalog?.slashCommands).toHaveLength(2);
    expect(catalog?.slashCommands[0]).toMatchObject({ name: 'goal', source: 'builtin' });
  });

  it('returns null when the payload carries no catalog (unavailable, never fabricated)', () => {
    expect(parseZCodeCatalogSnapshot({})).toBeNull();
    expect(parseZCodeCatalogSnapshot(null)).toBeNull();
    expect(parseZCodeCatalogSnapshot({ model: { available: [] } })).toBeNull();
    expect(parseZCodeCatalogSnapshot({ model: { available: [{ label: 'no-ref' }] } })).toBeNull();
  });

  it('merges a state.updated patch over the base settings without losing models', () => {
    const merged = patchZCodeCatalogSettings(settings, { mode: { current: 'edit' } });
    const catalog = parseZCodeCatalogSnapshot(merged);
    expect(catalog?.models).toHaveLength(2);
    expect(catalog?.currentMode).toBe('edit');
  });
});

describe('validateZCodeModelSelection', () => {
  const catalog = parseZCodeCatalogSnapshot(settings)!;

  it('accepts in-catalog models and resolves the default reasoning level', () => {
    expect(validateZCodeModelSelection(catalog, { providerId: 'opencode-go', modelId: 'grok-4.5' }))
      .toEqual({ ok: true, reasoningLevel: 'medium' });
    expect(validateZCodeModelSelection(catalog, { providerId: 'opencode-go', modelId: 'mimo-v2.6-pro', reasoningLevel: 'enabled' }))
      .toEqual({ ok: true, reasoningLevel: 'enabled' });
  });

  it('rejects models not in the live catalog before the wire', () => {
    const result = validateZCodeModelSelection(catalog, { providerId: 'opencode-go', modelId: 'nope-9' });
    expect(result).toMatchObject({ ok: false, reason: 'model-not-in-catalog' });
  });

  it('rejects unsupported reasoning levels and levels on spec-less models', () => {
    expect(validateZCodeModelSelection(catalog, { providerId: 'opencode-go', modelId: 'grok-4.5', reasoningLevel: 'ultra' }))
      .toMatchObject({ ok: false, reason: 'reasoning-unsupported' });
    const noSpec = { ...catalog, models: [{ ...catalog.models[0], reasoningLevels: [], defaultReasoningLevel: null }] };
    expect(validateZCodeModelSelection(noSpec, { providerId: 'opencode-go', modelId: 'grok-4.5', reasoningLevel: 'low' }))
      .toMatchObject({ ok: false, reason: 'reasoning-unsupported' });
    expect(validateZCodeModelSelection(noSpec, { providerId: 'opencode-go', modelId: 'grok-4.5' }))
      .toEqual({ ok: true, reasoningLevel: null });
  });

  it('rejects when a reasoning level is required but absent', () => {
    const required = { ...catalog, models: [{ ...catalog.models[0], defaultReasoningLevel: null }] };
    expect(validateZCodeModelSelection(required, { providerId: 'opencode-go', modelId: 'grok-4.5' }))
      .toMatchObject({ ok: false, reason: 'reasoning-required' });
  });
});

describe('validateZCodeThoughtLevel / validateZCodeMode', () => {
  it('validates thought levels against the live catalog', () => {
    const catalog = parseZCodeCatalogSnapshot(settings)!;
    expect(validateZCodeThoughtLevel(catalog, 'enabled')).toEqual({ ok: true });
    expect(validateZCodeThoughtLevel(catalog, 'superthink').ok).toBe(false);
  });

  it('validates modes against the native enum (rejects before send)', () => {
    expect(validateZCodeMode('build')).toBe(true);
    expect(validateZCodeMode('plan')).toBe(true);
    expect(validateZCodeMode('auto')).toBe(true);
    expect(validateZCodeMode('turbo')).toBe(false);
    expect(validateZCodeMode('')).toBe(false);
  });

  it('keeps an accepted plan request distinct from any projected base mode', () => {
    expect(classifyZCodeModeReadback('plan', 'build')).toEqual({
      kind: 'plan-requested-readback-unavailable',
      reportedBaseMode: 'build',
    });
    expect(classifyZCodeModeReadback('plan', null)).toEqual({
      kind: 'mismatch',
      requestedMode: 'plan',
      reportedMode: null,
    });
    expect(classifyZCodeModeReadback('build', 'build')).toEqual({ kind: 'confirmed', mode: 'build' });
    expect(classifyZCodeModeReadback('edit', 'build')).toEqual({
      kind: 'mismatch',
      requestedMode: 'edit',
      reportedMode: 'build',
    });
    expect(classifyZCodeModeReadback('plan', 'yolo')).toEqual({
      kind: 'plan-requested-readback-unavailable',
      reportedBaseMode: 'yolo',
    });
    expect(classifyZCodeModeReadback('plan', 'edit')).toEqual({
      kind: 'plan-requested-readback-unavailable',
      reportedBaseMode: 'edit',
    });
    expect(classifyZCodeModeReadback('plan', 'unexpected')).toEqual({
      kind: 'mismatch', requestedMode: 'plan', reportedMode: 'unexpected',
    });
  });
});
