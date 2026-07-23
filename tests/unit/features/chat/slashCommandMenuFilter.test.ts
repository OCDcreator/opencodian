import type { SlashCommandMenuItem } from '../../../../src/core/config/slashCommandCatalog';
import { filterSlashCommandMenuItems } from '../../../../src/features/chat/services/slashCommandMenuFilter';

const items: SlashCommandMenuItem[] = [
  {
    id: 'analyze',
    description: 'Analyze with a skill',
    hasProjectOverride: false,
    runtimeAvailable: true,
    source: 'skill',
    subtask: false,
    isBuiltin: false,
  },
  {
    id: 'annotate',
    description: 'Annotate with a command',
    hasProjectOverride: false,
    runtimeAvailable: true,
    source: 'command',
    subtask: false,
    isBuiltin: false,
  },
];

describe('slashCommandMenuFilter', () => {
  it('shows only skills for mid-text slash queries in direct skill mode', () => {
    const filtered = filterSlashCommandMenuItems(items, 'an', {
      skillMode: 'direct',
      skillsCommandDescription: 'Browse skills',
      isMidText: true,
    });

    expect(filtered.map((item) => item.id)).toEqual(['analyze']);
  });

  it('shows only prefixed skill entries for mid-text slash queries in skills-command mode', () => {
    const filtered = filterSlashCommandMenuItems(items, 'an', {
      skillMode: 'skills-command',
      skillsCommandDescription: 'Browse skills',
      isMidText: true,
    });

    expect(filtered).toEqual([
      expect.objectContaining({
        id: 'analyze',
        displayId: 'skills analyze',
        insertText: '/skills analyze ',
        source: 'skill',
      }),
    ]);
  });

  it('still exposes normal commands and the skills browser for start-position slash queries', () => {
    const filtered = filterSlashCommandMenuItems(items, 'an', {
      skillMode: 'skills-command',
      skillsCommandDescription: 'Browse skills',
    });

    expect(filtered.map((item) => item.id)).toEqual(['annotate']);

    const emptyQuery = filterSlashCommandMenuItems(items, '', {
      skillMode: 'skills-command',
      skillsCommandDescription: 'Browse skills',
    });
    expect(emptyQuery.map((item) => item.id)).toEqual(['annotate', 'skills']);
  });

  describe('Codex skill mode (codexSkillMode)', () => {
    const codexItems: SlashCommandMenuItem[] = [
      {
        id: 'code-review',
        description: 'Review code',
        hasProjectOverride: false,
        insertText: '$code-review ',
        runtimeAvailable: true,
        source: 'codex-skill',
        subtask: false,
        isBuiltin: false,
      },
      {
        id: 'git-flow',
        description: 'Git workflow',
        hasProjectOverride: false,
        insertText: '$git-flow ',
        runtimeAvailable: true,
        source: 'codex-skill',
        subtask: false,
        isBuiltin: false,
      },
    ];

    it('exposes the /skills browser entry at start position (plus available skills) and hides open-code commands', () => {
      const filtered = filterSlashCommandMenuItems(codexItems, '', {
        skillMode: 'skills-command',
        skillsCommandDescription: 'Browse Codex skills',
        codexSkillMode: true,
      });

      const ids = filtered.map((item) => item.id);
      // Available codex skills appear first, then the always-present /skills entry.
      expect(ids).toContain('code-review');
      expect(ids).toContain('skills');
      expect(filtered.find((item) => item.source !== 'codex-skill' && item.source !== 'skills-command')).toBeUndefined();
    });

    it('always includes the /skills entry even when the catalog has zero codex skills (no blank menu)', () => {
      const filtered = filterSlashCommandMenuItems([], '', {
        skillMode: 'skills-command',
        skillsCommandDescription: 'Browse Codex skills',
        codexSkillMode: true,
      });

      expect(filtered.map((item) => item.id)).toEqual(['skills']);
      expect(filtered[0].source).toBe('skills-command');
    });

    it('keeps the /skills entry under /skills <x> when no skill matches', () => {
      const filtered = filterSlashCommandMenuItems(codexItems, 'skills nomatch', {
        skillMode: 'skills-command',
        skillsCommandDescription: 'Browse Codex skills',
        codexSkillMode: true,
      });

      expect(filtered.map((item) => item.id)).toEqual(['skills']);
    });

    it('keeps the /skills entry for the $ trigger when no skill matches (no blank menu)', () => {
      const filtered = filterSlashCommandMenuItems([], 'nomatch', {
        skillMode: 'skills-command',
        skillsCommandDescription: 'Browse Codex skills',
        codexSkillMode: true,
        isMidText: true,
      });

      expect(filtered.map((item) => item.id)).toEqual(['skills']);
    });

    it('expands codex-skill entries under /skills prefix with $skill-name insert text', () => {
      const filtered = filterSlashCommandMenuItems(codexItems, 'skills git', {
        skillMode: 'skills-command',
        skillsCommandDescription: 'Browse Codex skills',
        codexSkillMode: true,
      });

      expect(filtered).toEqual([
        expect.objectContaining({
          id: 'git-flow',
          displayId: 'skills git-flow',
          insertText: '$git-flow ',
          source: 'codex-skill',
        }),
      ]);
    });

    it('filters codex-skill entries directly in mid-text mode', () => {
      const filtered = filterSlashCommandMenuItems(codexItems, 'code', {
        skillMode: 'direct',
        skillsCommandDescription: 'Browse Codex skills',
        codexSkillMode: true,
        isMidText: true,
      });

      expect(filtered.map((item) => item.id)).toEqual(['code-review']);
    });

    it('does not affect the OpenCode/Claude paths when codexSkillMode is false', () => {
      const filtered = filterSlashCommandMenuItems([...items, ...codexItems], 'an', {
        skillMode: 'skills-command',
        skillsCommandDescription: 'Browse skills',
      });

      // codex-skill items must not leak into the non-codex menu
      expect(filtered.find((item) => item.source === 'codex-skill')).toBeUndefined();
    });
  });
});
