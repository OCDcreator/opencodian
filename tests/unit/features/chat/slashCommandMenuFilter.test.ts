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
  },
  {
    id: 'annotate',
    description: 'Annotate with a command',
    hasProjectOverride: false,
    runtimeAvailable: true,
    source: 'command',
    subtask: false,
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
});
