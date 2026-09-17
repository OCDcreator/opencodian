/**
 * Inline-edit settings normalization (R-A1 + R-A2): the `inlineEditTriggerAt`
 * default and the `inlineEditPresetPrompts` merge/prune rules, at the pure
 * normalizer and at the loaded-settings bootstrap boundary.
 */

import {
  INLINE_EDIT_PRESET_PROMPT_MAX_COUNT,
  normalizeInlineEditPresetPrompts,
} from '../../../../src/core/types/settings';
import { prepareLoadedSettingsBootstrapState } from '../../../../src/core/types/settingsLoadNormalization';

describe('normalizeInlineEditPresetPrompts', () => {
  it('returns an empty list for non-array input', () => {
    expect(normalizeInlineEditPresetPrompts(undefined)).toEqual([]);
    expect(normalizeInlineEditPresetPrompts(null)).toEqual([]);
    expect(normalizeInlineEditPresetPrompts({})).toEqual([]);
    expect(normalizeInlineEditPresetPrompts('preset')).toEqual([]);
  });

  it('keeps well-formed entries and trims the fields', () => {
    expect(normalizeInlineEditPresetPrompts([
      { id: ' mine ', label: '  Mine  ', prompt: '  Body.  ' },
    ])).toEqual([{ id: 'mine', label: 'Mine', prompt: 'Body.' }]);
  });

  it('drops malformed entries: wrong types, empty fields, oversized fields', () => {
    const oversizedPrompt = 'x'.repeat(2001);
    expect(normalizeInlineEditPresetPrompts([
      null,
      'preset',
      { id: 1, label: 'L', prompt: 'P' },
      { id: 'no-label', label: '', prompt: 'P' },
      { id: 'no-prompt', label: 'L', prompt: '   ' },
      { id: '', label: 'L', prompt: 'P' },
      { id: 'too-long-prompt', label: 'L', prompt: oversizedPrompt },
      { id: 'ok', label: 'L', prompt: 'P' },
    ])).toEqual([{ id: 'ok', label: 'L', prompt: 'P' }]);
  });

  it('dedupes by id keeping the first occurrence and preserves order', () => {
    expect(normalizeInlineEditPresetPrompts([
      { id: 'a', label: 'First', prompt: 'P' },
      { id: 'b', label: 'B', prompt: 'P' },
      { id: 'a', label: 'Second', prompt: 'P' },
    ])).toEqual([
      { id: 'a', label: 'First', prompt: 'P' },
      { id: 'b', label: 'B', prompt: 'P' },
    ]);
  });

  it('caps the list at the configured maximum', () => {
    const many = Array.from({ length: INLINE_EDIT_PRESET_PROMPT_MAX_COUNT + 10 }, (_v, index) => ({
      id: `p${index}`,
      label: `L${index}`,
      prompt: 'P',
    }));
    expect(normalizeInlineEditPresetPrompts(many)).toHaveLength(INLINE_EDIT_PRESET_PROMPT_MAX_COUNT);
  });
});

describe('prepareLoadedSettingsBootstrapState inline-edit settings', () => {
  function build(persisted: Record<string, unknown>) {
    return prepareLoadedSettingsBootstrapState({
      core: {
        data: persisted,
        filePath: '.opencodian/settings.core.json',
        source: 'primary',
        shouldPersist: false,
      },
      ui: {
        data: null,
        filePath: '.opencodian/settings.ui.json',
        source: 'missing',
        shouldPersist: false,
      },
      writable: true,
      shouldPersist: false,
    });
  }

  it('defaults inlineEditTriggerAt to false and presets to empty', () => {
    const state = build({});
    expect(state.settings.inlineEditTriggerAt).toBe(false);
    expect(state.settings.inlineEditPresetPrompts).toEqual([]);
  });

  it('keeps an enabled inlineEditTriggerAt', () => {
    const state = build({ inlineEditTriggerAt: true });
    expect(state.settings.inlineEditTriggerAt).toBe(true);
  });

  it('normalizes a malformed inlineEditPresetPrompts payload', () => {
    const state = build({
      inlineEditPresetPrompts: [
        { id: 'ok', label: 'Mine', prompt: 'Body.' },
        { id: 'broken', label: '', prompt: 'Body.' },
        'garbage',
      ],
    });
    expect(state.settings.inlineEditPresetPrompts).toEqual([
      { id: 'ok', label: 'Mine', prompt: 'Body.' },
    ]);
  });
});
