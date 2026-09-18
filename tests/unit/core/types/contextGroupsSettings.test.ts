/**
 * Context-groups + auto-internal-link settings (R-B1 / R-B2): normalization
 * rules, defaults, and the loaded-settings bootstrap merge (persistence
 * round trip).
 */

import {
  CONTEXT_GROUP_MAX_COUNT,
  DEFAULT_SETTINGS,
  normalizeAutoInternalLinkExcludedTerms,
  normalizeContextGroups,
} from '../../../../src/core/types/settings';
import { prepareLoadedSettingsBootstrapState } from '../../../../src/core/types/settingsLoadNormalization';

describe('normalizeContextGroups', () => {
  it('returns an empty list for non-array input', () => {
    expect(normalizeContextGroups(undefined)).toEqual([]);
    expect(normalizeContextGroups(null)).toEqual([]);
    expect(normalizeContextGroups({})).toEqual([]);
  });

  it('keeps well-formed groups with trimmed fields and entry order', () => {
    expect(normalizeContextGroups([
      {
        id: ' g1 ',
        name: ' 注意力 ',
        entries: [
          { path: ' a.md ', kind: 'file' },
          { path: 'folder', kind: 'folder' },
        ],
      },
    ])).toEqual([{
      id: 'g1',
      name: '注意力',
      entries: [
        { path: 'a.md', kind: 'file' },
        { path: 'folder', kind: 'folder' },
      ],
    }]);
  });

  it('drops malformed groups: wrong types, empty id/name, duplicate ids', () => {
    expect(normalizeContextGroups([
      null,
      'group',
      { id: 1, name: 'N' },
      { id: 'no-name', name: '  ' },
      { id: 'dup', name: 'First' },
      { id: 'dup', name: 'Second' },
      { id: 'ok', name: 'OK' },
    ])).toEqual([{ id: 'dup', name: 'First', entries: [] }, { id: 'ok', name: 'OK', entries: [] }]);
  });

  it('cleans entries: non-strings, oversize, angle brackets, duplicates; defaults kind to file', () => {
    expect(normalizeContextGroups([
      {
        id: 'g1',
        name: 'G',
        entries: [
          null,
          { path: 42 },
          { path: '' },
          { path: `x${'y'.repeat(500)}` },
          { path: 'bad<path>.md' },
          { path: 'a.md' },
          { path: 'a.md', kind: 'folder' },
          { path: 'b.md', kind: 'strange' },
        ],
      },
    ])).toEqual([{
      id: 'g1',
      name: 'G',
      entries: [
        { path: 'a.md', kind: 'file' },
        { path: 'b.md', kind: 'file' },
      ],
    }]);
  });

  it('caps the group count', () => {
    const many = Array.from({ length: CONTEXT_GROUP_MAX_COUNT + 5 }, (_v, index) => ({
      id: `g${index}`,
      name: `G${index}`,
      entries: [],
    }));
    expect(normalizeContextGroups(many)).toHaveLength(CONTEXT_GROUP_MAX_COUNT);
  });
});

describe('normalizeAutoInternalLinkExcludedTerms', () => {
  it('trims, drops empties and duplicates, and caps the list', () => {
    expect(normalizeAutoInternalLinkExcludedTerms([' 总结 ', '', '  ', '总结', '注意'])).toEqual(['总结', '注意']);
    expect(normalizeAutoInternalLinkExcludedTerms('nope')).toEqual([]);
    const many = Array.from({ length: 120 }, (_v, index) => `term-${index}`);
    expect(normalizeAutoInternalLinkExcludedTerms(many)).toHaveLength(100);
    expect(normalizeAutoInternalLinkExcludedTerms([`x${'y'.repeat(101)}`, 'ok'])).toEqual(['ok']);
  });
});

describe('settings defaults + load merge (R-B1 / R-B2)', () => {
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

  it('defaults: auto-link off, no excluded terms, no groups', () => {
    expect(DEFAULT_SETTINGS.autoInternalLinkEnabled).toBe(false);
    expect(DEFAULT_SETTINGS.autoInternalLinkExcludedTerms).toEqual([]);
    expect(DEFAULT_SETTINGS.contextGroups).toEqual([]);
  });

  it('round-trips valid persisted values through the bootstrap merge', () => {
    const state = build({
      autoInternalLinkEnabled: true,
      autoInternalLinkExcludedTerms: ['总结', '注意'],
      contextGroups: [
        { id: 'g1', name: '主题', entries: [{ path: 'a.md', kind: 'file' }] },
      ],
    });
    expect(state.settings.autoInternalLinkEnabled).toBe(true);
    expect(state.settings.autoInternalLinkExcludedTerms).toEqual(['总结', '注意']);
    expect(state.settings.contextGroups).toEqual([
      { id: 'g1', name: '主题', entries: [{ path: 'a.md', kind: 'file' }] },
    ]);
  });

  it('normalizes junk persisted values at the merge boundary', () => {
    const state = build({
      autoInternalLinkEnabled: 'yes',
      autoInternalLinkExcludedTerms: ['ok', 42, ''],
      contextGroups: [{ id: '', name: '', entries: 'nope' }],
    });
    expect(state.settings.autoInternalLinkEnabled).toBe(false);
    expect(state.settings.autoInternalLinkExcludedTerms).toEqual(['ok']);
    expect(state.settings.contextGroups).toEqual([]);
  });

  it('materializes defaults when the persisted snapshot omits the fields', () => {
    const state = build({});
    expect(state.settings.autoInternalLinkEnabled).toBe(false);
    expect(state.settings.autoInternalLinkExcludedTerms).toEqual([]);
    expect(state.settings.contextGroups).toEqual([]);
  });
});
