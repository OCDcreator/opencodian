/**
 * Settings layout registry tests
 *
 * Covers: primary/secondary tab resolution, fallback for stale values,
 * default secondary tab selection, and registry structure invariants.
 */

import {
  getActiveSecondaryTabId,
  getPrimaryTabDefinition,
  resolvePrimaryTabId,
  resolveSecondaryTabId,
  SETTINGS_PRIMARY_TABS,
} from '../../../../src/features/settings/settingsLayoutRegistry';

describe('SETTINGS_PRIMARY_TABS', () => {
  it('defines general as a single-page primary tab without extra secondary navigation', () => {
    const generalTab = getPrimaryTabDefinition('general');
    expect(generalTab).toBeDefined();
    expect(generalTab!.labelKey).toBe('settings.general.title');
    expect(generalTab!.defaultSecondaryTabId).toBe('basic');
    expect(generalTab!.secondaryTabs.map((secondaryTab) => secondaryTab.id)).toEqual(['basic']);
  });

  it('defines all expected primary tabs in order', () => {
    const ids = SETTINGS_PRIMARY_TABS.map((t) => t.id);
    expect(ids).toEqual([
      'general',
      'server',
      'model',
      'conversation',
      'agents',
      'commands',
      'mcp',
      'formatter',
      'plugins',
      'security',
      'ui',
      'style',
      'debug',
      'user',
      'skills',
      'tools',
      'acp',
    ]);
  });

  it('has valid i18n keys for every primary tab label', () => {
    for (const tab of SETTINGS_PRIMARY_TABS) {
      expect(tab.labelKey).toMatch(/^settings\.\w+\.title$/);
      expect(tab.secondaryTabs.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('has valid i18n keys for every secondary tab label', () => {
    for (const tab of SETTINGS_PRIMARY_TABS) {
      for (const secondary of tab.secondaryTabs) {
        expect(secondary.labelKey).toMatch(/^settings\.\w+\.tab\.\w+$/);
      }
    }
  });

  it('ensures every defaultSecondaryTabId exists in secondaryTabs', () => {
    for (const tab of SETTINGS_PRIMARY_TABS) {
      const ids = tab.secondaryTabs.map((s) => s.id);
      expect(ids).toContain(tab.defaultSecondaryTabId);
    }
  });

  it('splits Skills into project and external secondary tabs', () => {
    const skillsTab = getPrimaryTabDefinition('skills');

    expect(skillsTab!.defaultSecondaryTabId).toBe('project');
    expect(skillsTab!.secondaryTabs.map((secondaryTab) => secondaryTab.id)).toEqual([
      'project',
      'external',
    ]);
  });

  it('exposes conversation sharing as its own secondary tab', () => {
    const conversationTab = getPrimaryTabDefinition('conversation');

    expect(conversationTab!.secondaryTabs.map((secondaryTab) => secondaryTab.id)).toEqual([
      'title',
      'compaction',
      'sharing',
      'display',
      'questions',
    ]);
  });

  it('splits formatter settings into formatter and language server secondary tabs', () => {
    const formatterTab = getPrimaryTabDefinition('formatter');

    expect(formatterTab!.secondaryTabs.map((secondaryTab) => secondaryTab.id)).toEqual([
      'overview',
      'formatter',
      'lsp',
    ]);
  });
});

describe('resolvePrimaryTabId', () => {
  it('returns the candidate if it exists in the registry', () => {
    expect(resolvePrimaryTabId('general')).toBe('general');
    expect(resolvePrimaryTabId('server')).toBe('server');
    expect(resolvePrimaryTabId('model')).toBe('model');
    expect(resolvePrimaryTabId('user')).toBe('user');
  });

  it('migrates the removed language primary tab to general', () => {
    expect(resolvePrimaryTabId('language')).toBe('general');
  });

  it('falls back to the first tab for invalid/stale values', () => {
    expect(resolvePrimaryTabId('')).toBe(SETTINGS_PRIMARY_TABS[0].id);
    expect(resolvePrimaryTabId('not_a_real_tab')).toBe(SETTINGS_PRIMARY_TABS[0].id);
    expect(resolvePrimaryTabId('  ')).toBe(SETTINGS_PRIMARY_TABS[0].id);
  });
});

describe('resolveSecondaryTabId', () => {
  it('returns the candidate if it exists for the given primary', () => {
    expect(resolveSecondaryTabId('server', 'connection')).toBe('connection');
    expect(resolveSecondaryTabId('server', 'auth')).toBe('auth');
    expect(resolveSecondaryTabId('mcp', 'overview')).toBe('overview');
    expect(resolveSecondaryTabId('model', 'common')).toBe('common');
    expect(resolveSecondaryTabId('model', 'availability')).toBe('availability');
  });

  it('falls back to the primary default secondary for invalid candidates', () => {
    expect(resolveSecondaryTabId('server', 'not_a_real_subtab')).toBe('connection');
    expect(resolveSecondaryTabId('model', '')).toBe('common');
    expect(resolveSecondaryTabId('server', '  ')).toBe('connection');
    expect(resolveSecondaryTabId('general', 'general')).toBe('basic');
  });

  it('maps legacy secondary ids to their merged targets', () => {
    expect(resolveSecondaryTabId('general', 'language')).toBe('basic');
    expect(resolveSecondaryTabId('conversation', 'rendering')).toBe('display');
    expect(resolveSecondaryTabId('security', 'permissions')).toBe('config');
  });

  it('falls back to the first primary for unknown primary ids', () => {
    const firstDefault = SETTINGS_PRIMARY_TABS[0].defaultSecondaryTabId;
    expect(resolveSecondaryTabId('nonexistent', 'anything')).toBe(firstDefault);
  });
});

describe('getActiveSecondaryTabId', () => {
  it('uses the saved secondary tab for a primary when present', () => {
    const saved = { server: 'auth', model: 'tools' };
    expect(getActiveSecondaryTabId('server', saved)).toBe('auth');
    expect(getActiveSecondaryTabId('model', saved)).toBe('tools');
  });

  it('resolves stale saved values to valid secondary ids', () => {
    const saved = { server: 'stale-invalid-subtab' };
    const result = getActiveSecondaryTabId('server', saved);
    expect(['connection', 'auth', 'status']).toContain(result);
    const primaryDef = getPrimaryTabDefinition('server');
    expect(result).toBe(primaryDef!.defaultSecondaryTabId);
  });

  it('defaults to the primary default secondary when nothing is saved', () => {
    const result = getActiveSecondaryTabId('model', {});
    const primaryDef = getPrimaryTabDefinition('model');
    expect(result).toBe(primaryDef!.defaultSecondaryTabId);
  });

  it('falls back gracefully for unknown primary ids', () => {
    const result = getActiveSecondaryTabId('bogus', { bogus: 'anything' });
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('handles tab switching: stores correct ids per primary', () => {
    // Simulate switching from server/connection to model/common
    const saved = { server: 'auth' };
    const serverSecondary = getActiveSecondaryTabId('server', saved);
    expect(serverSecondary).toBe('auth');

    const modelSecondary = getActiveSecondaryTabId('model', saved);
    expect(modelSecondary).toBe('common');

    // After switching back to server, it should remember 'auth'
    expect(getActiveSecondaryTabId('server', { ...saved, model: 'tools' })).toBe('auth');
  });
});

describe('getPrimaryTabDefinition', () => {
  it('returns undefined for unknown tab ids', () => {
    expect(getPrimaryTabDefinition('nonexistent')).toBeUndefined();
    expect(getPrimaryTabDefinition('')).toBeUndefined();
  });

  it('returns the full definition for known tabs', () => {
    const def = getPrimaryTabDefinition('general');
    expect(def).toBeDefined();
    expect(def!.id).toBe('general');
    expect(def!.labelKey).toBe('settings.general.title');
    expect(def!.defaultSecondaryTabId).toBe('basic');
    expect(def!.secondaryTabs).toHaveLength(1);
  });
});
