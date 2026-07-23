/**
 * Resource panel card-structure regression.
 *
 * Verifies the unified hierarchy for BOTH Claude and Codex resource tabs:
 * each resource type (commands / skills / agents) renders as an independent
 * `opencodian-resource-group-card`, with no single outer section card wrapping
 * them. The render() surface itself never created an outer card; this locks
 * the per-type independent-card contract.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { SettingsClaudeResourcesSection } from '../../../../src/features/settings/SettingsClaudeResourcesSection';
import { SettingsCodexResourcesSection } from '../../../../src/features/settings/SettingsCodexResourcesSection';

jest.mock('../../../../src/core/agents/backend', () => ({
  discoverClaudeProjectCommands: jest.fn().mockResolvedValue([]),
  discoverClaudeGlobalCommands: jest.fn().mockResolvedValue([]),
  discoverClaudeProjectSkills: jest.fn().mockResolvedValue([]),
  discoverClaudeGlobalSkills: jest.fn().mockResolvedValue([]),
  discoverClaudeProjectAgents: jest.fn().mockResolvedValue([]),
  discoverClaudeGlobalAgents: jest.fn().mockResolvedValue([]),
  discoverCodexProjectSkills: jest.fn().mockResolvedValue([]),
  discoverCodexGlobalSkills: jest.fn().mockResolvedValue([]),
  discoverCodexProjectAgents: jest.fn().mockResolvedValue([]),
  discoverCodexGlobalAgents: jest.fn().mockResolvedValue([]),
}));

function makeApp() {
  return { vault: { adapter: { basePath: '/vault' } } };
}

describe('resource panel card structure (unified Claude + Codex)', () => {
  it('keeps each resource group title left and create action right while vertically aligned', () => {
    for (const [fileName, selector] of [
      ['settings-claude-resources.css', '.opencodian-claude-resource-group-header'],
      ['settings-codex-resources.css', '.opencodian-codex-resource-group-header'],
    ] as const) {
      const css = readFileSync(
        join(process.cwd(), 'src/style/components', fileName),
        'utf8',
      );
      const rule = css.match(new RegExp(`${selector.replaceAll('.', '\\.')}\\s*\\{[\\s\\S]*?\\}`))?.[0] ?? '';

      expect(rule).toContain('display: flex;');
      expect(rule).toContain('align-items: center;');
      expect(rule).toContain('justify-content: space-between;');
      expect(rule).toContain('gap: 8px;');

      const titleSelector = selector.replace('-group-header', '-group-title');
      const titleRule = css.match(new RegExp(`\\.opencodian-settings\\s+${titleSelector.replaceAll('.', '\\.')}\\s*\\{[\\s\\S]*?\\}`))?.[0] ?? '';
      expect(titleRule).toContain('margin: 0;');
      expect(titleRule).toContain('padding: 0;');
    }
  });

  it('Codex renders independent per-type group cards (skills, agents)', () => {
    const containerEl = document.createElement('div');
    const section = new SettingsCodexResourcesSection({
      plugin: { app: makeApp() } as any,
      createSectionHeading: (hostEl: HTMLElement) => hostEl.createEl('h3'),
    });

    section.render(containerEl);

    const cards = containerEl.querySelectorAll('.opencodian-resource-group-card');
    expect(cards.length).toBe(2);
    const kinds = Array.from(cards).map((c) => (c as HTMLElement).dataset.codexResourceGroup);
    expect(kinds).toEqual(expect.arrayContaining(['skill', 'agent']));
  });

  it('Claude renders independent per-type group cards (commands, skills, agents)', () => {
    const containerEl = document.createElement('div');
    const section = new SettingsClaudeResourcesSection({
      plugin: {
        app: makeApp(),
        settings: { backendSettings: { claudeCode: { settingSources: ['project'] } } },
      } as any,
      createSectionHeading: (hostEl: HTMLElement) => hostEl.createEl('h3'),
    });

    section.render(containerEl);

    const cards = containerEl.querySelectorAll('.opencodian-resource-group-card');
    expect(cards.length).toBe(3);
    const kinds = Array.from(cards).map((c) => (c as HTMLElement).dataset.claudeResourceGroup);
    expect(kinds).toEqual(expect.arrayContaining(['command', 'skill', 'agent']));
  });
});
