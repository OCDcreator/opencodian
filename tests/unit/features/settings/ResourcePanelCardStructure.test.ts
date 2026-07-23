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

  it('lets only the standalone Claude Agents list consume the measured remaining settings height', async () => {
    const css = readFileSync(
      join(process.cwd(), 'src/style/components/settings-claude-resources.css'),
      'utf8',
    );
    expect(css).toContain('max-height: min(38vh, 360px);');
    expect(css).toMatch(
      /\[data-claude-code-section='agents'\][\s\S]*?\.opencodian-settings-scrollarea-viewport\s*\{[\s\S]*?flex:\s*1 1 auto;[\s\S]*?height:\s*var\(--opencodian-settings-scrollarea-available-height, auto\);[\s\S]*?max-height:\s*var\(--opencodian-settings-scrollarea-available-height, min\(58vh, 640px\)\);/u,
    );

    const originalRequestAnimationFrame = window.requestAnimationFrame;
    const originalInnerHeight = window.innerHeight;
    const animationFrames: FrameRequestCallback[] = [];
    window.requestAnimationFrame = ((callback: FrameRequestCallback): number => {
      animationFrames.push(callback);
      return animationFrames.length;
    }) as typeof window.requestAnimationFrame;
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 960 });
    const containerEl = document.createElement('div');
    containerEl.dataset.claudeCodeSection = 'agents';
    document.body.appendChild(containerEl);

    try {
      const section = new SettingsClaudeResourcesSection({
        plugin: {
          app: makeApp(),
          settings: { backendSettings: { claudeCode: { settingSources: ['project'] } } },
        } as any,
        kinds: ['agent'],
      });
      section.render(containerEl);

      const scrollEl = containerEl.querySelector<HTMLElement>('.opencodian-claude-resource-scroll');
      const viewportEl = scrollEl?.querySelector<HTMLElement>(':scope > .opencodian-settings-scrollarea-viewport');
      expect(scrollEl).not.toBeNull();
      expect(viewportEl).not.toBeNull();
      if (!scrollEl || !viewportEl) {
        throw new Error('Expected Claude Agents scrollarea');
      }
      let viewportTop = 800;
      viewportEl.getBoundingClientRect = jest.fn(() => ({
        bottom: 420,
        height: 360,
        left: 0,
        right: 100,
        top: viewportTop,
        width: 100,
        x: 0,
        y: viewportTop,
        toJSON: () => ({}),
      }));

      animationFrames.shift()?.(Date.now());
      expect(scrollEl.style.getPropertyValue('--opencodian-settings-scrollarea-available-height')).toBe('280px');
      await new Promise((resolve) => window.setTimeout(resolve, 0));
      viewportTop = 420;
      expect(animationFrames).toHaveLength(1);
      animationFrames.shift()?.(Date.now());
      expect(scrollEl.style.getPropertyValue('--opencodian-settings-scrollarea-available-height')).toBe('516px');
    } finally {
      window.requestAnimationFrame = originalRequestAnimationFrame;
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalInnerHeight });
      containerEl.remove();
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
    });

    section.render(containerEl);

    const cards = containerEl.querySelectorAll('.opencodian-resource-group-card');
    expect(cards.length).toBe(3);
    const kinds = Array.from(cards).map((c) => (c as HTMLElement).dataset.claudeResourceGroup);
    expect(kinds).toEqual(expect.arrayContaining(['command', 'skill', 'agent']));
    expect(containerEl.querySelector('h3')).toBeNull();
  });
});
