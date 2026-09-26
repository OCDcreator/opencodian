/**
 * zcodeBackendSettings.test.ts — settings persistence normalization.
 *
 * Missing or invalid values must normalize to safe defaults instead of
 * leaking unvalidated shapes into runtime resolution.
 */
import { describe, expect, it } from '@jest/globals';

import {
  getDefaultBackendSettings,
  normalizeBackendSettings,
  normalizeZCodeBackendSettings,
} from '../../../../src/core/types/settings';

describe('normalizeZCodeBackendSettings', () => {
  it('normalizes missing input to empty override (auto-discovery)', () => {
    expect(normalizeZCodeBackendSettings(undefined)).toEqual({ executablePath: '', model: '', thinkingLevel: '', mode: '' });
    expect(normalizeZCodeBackendSettings(null)).toEqual({ executablePath: '', model: '', thinkingLevel: '', mode: '' });
    expect(normalizeZCodeBackendSettings('junk')).toEqual({ executablePath: '', model: '', thinkingLevel: '', mode: '' });
    expect(normalizeZCodeBackendSettings([])).toEqual({ executablePath: '', model: '', thinkingLevel: '', mode: '' });
  });

  it('normalizes model/thinking/mode fields and rejects invalid modes', () => {
    expect(normalizeZCodeBackendSettings({
      model: '  opencode-go/mimo-v2.6-pro  ',
      thinkingLevel: ' enabled ',
      mode: 'edit',
    })).toEqual({ executablePath: '', model: 'opencode-go/mimo-v2.6-pro', thinkingLevel: 'enabled', mode: 'edit' });
    expect(normalizeZCodeBackendSettings({ mode: 'turbo' }).mode).toBe('');
    expect(normalizeZCodeBackendSettings({ mode: 42 }).mode).toBe('');
    expect(normalizeZCodeBackendSettings(undefined)).toEqual({ executablePath: '', model: '', thinkingLevel: '', mode: '' });
    expect(getDefaultBackendSettings().zcode).toEqual({ executablePath: '', model: '', thinkingLevel: '', mode: '' });
  });

  it('trims the executable override and drops invalid types', () => {
    expect(normalizeZCodeBackendSettings({ executablePath: '  /opt/zcode-agent  ' }))
      .toEqual({ executablePath: '/opt/zcode-agent', model: '', thinkingLevel: '', mode: '' });
    expect(normalizeZCodeBackendSettings({ executablePath: 42 }))
      .toEqual({ executablePath: '', model: '', thinkingLevel: '', mode: '' });
  });

  it('round-trips through normalizeBackendSettings and defaults', () => {
    const normalized = normalizeBackendSettings({ zcode: { executablePath: '/x/zcode.cjs' } });
    expect(normalized.zcode).toEqual({ executablePath: '/x/zcode.cjs', model: '', thinkingLevel: '', mode: '' });
    expect(getDefaultBackendSettings().zcode).toEqual({ executablePath: '', model: '', thinkingLevel: '', mode: '' });
    // Other backends keep their own defaults untouched.
    expect(normalizeBackendSettings({}).pi).toEqual({
      executablePath: '',
      provider: '',
      model: '',
      thinkingLevel: '',
    });
  });
});
