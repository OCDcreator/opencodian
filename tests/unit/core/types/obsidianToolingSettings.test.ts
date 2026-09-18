import {
  DEFAULT_SETTINGS,
  normalizeObsidianToolingMode,
  OBSIDIAN_TOOLING_MODES,
} from '../../../../src/core/types';
import { prepareLoadedSettingsBootstrapState } from '../../../../src/core/types/settingsLoadNormalization';

describe('obsidianToolingMode settings normalization (R-B4)', () => {
  it('defaults to off (zero cost: no probing, no injection, no watchers)', () => {
    expect(DEFAULT_SETTINGS.obsidianToolingMode).toBe('off');
    expect(OBSIDIAN_TOOLING_MODES).toEqual(['off', 'cli', 'mcp']);
  });

  it('keeps valid values and falls back to off for stale or hand-edited ones', () => {
    expect(normalizeObsidianToolingMode('off')).toBe('off');
    expect(normalizeObsidianToolingMode('cli')).toBe('cli');
    expect(normalizeObsidianToolingMode('mcp')).toBe('mcp');
    expect(normalizeObsidianToolingMode('server')).toBe('off');
    expect(normalizeObsidianToolingMode('')).toBe('off');
    expect(normalizeObsidianToolingMode(42)).toBe('off');
    expect(normalizeObsidianToolingMode(null)).toBe('off');
    expect(normalizeObsidianToolingMode(undefined)).toBe('off');
  });

  it('survives the load-merge boundary', () => {
    const bootstrap = (coreData: unknown) => prepareLoadedSettingsBootstrapState({
      core: { data: coreData },
      ui: { data: null },
    } as unknown as Parameters<typeof prepareLoadedSettingsBootstrapState>[0]);

    expect(bootstrap({ obsidianToolingMode: 'cli' }).settings.obsidianToolingMode).toBe('cli');
    expect(bootstrap({ obsidianToolingMode: 'agent' }).settings.obsidianToolingMode).toBe('off');
    expect(bootstrap(null).settings.obsidianToolingMode).toBe('off');
  });
});
