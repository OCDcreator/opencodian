import type { AgentBackendKind } from '../../../../src/core/types/chat';
import {
  renderAgentSwitcherFloatingIcons,
  renderAgentSwitcherHeaderIcons,
} from '../../../../src/features/settings/AgentSwitcherFloatingIcons';

describe('renderAgentSwitcherFloatingIcons', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders settings left agent switcher buttons with LobeHub light and dark icons', () => {
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);
    const onSelect = jest.fn();

    renderAgentSwitcherFloatingIcons(containerEl, {
      selectedAgent: 'claude-code',
      enabledAgents: ['opencode', 'claude-code'],
      onSelect,
    });

    const floatingEl = document.body.querySelector<HTMLElement>('.opencodian-agent-switcher-floating');
    const buttons = floatingEl?.querySelectorAll<HTMLButtonElement>('.opencodian-agent-switcher-icon') ?? [];
    const opencodeIconEl = buttons[0]?.querySelector<HTMLElement>('.opencodian-agent-switcher-lobehub-icon');
    const claudeCodeIconEl = buttons[1]?.querySelector<HTMLElement>('.opencodian-agent-switcher-lobehub-icon');
    const claudeLightIconEl = claudeCodeIconEl?.querySelector<HTMLImageElement>(
      '.opencodian-agent-switcher-lobehub-img--light',
    );
    const claudeDarkIconEl = claudeCodeIconEl?.querySelector<HTMLImageElement>(
      '.opencodian-agent-switcher-lobehub-img--dark',
    );

    expect(buttons).toHaveLength(2);
    expect(
      containerEl.querySelector<HTMLElement>('.opencodian-agent-switcher-hover-zone'),
    ).not.toBeNull();
    expect(
      floatingEl?.style.getPropertyValue(
        '--opencodian-agent-switcher-fixed-left',
      ),
    ).toBe('0px');
    expect(opencodeIconEl?.dataset.lobehubIcon).toBe('opencode');
    expect(claudeCodeIconEl?.dataset.lobehubIcon).toBe('claudecode');
    expect(claudeLightIconEl?.getAttribute('src')).toBe(
      'https://unpkg.com/@lobehub/icons-static-webp@latest/light/claudecode-color.webp',
    );
    expect(claudeDarkIconEl?.getAttribute('src')).toBe(
      'https://unpkg.com/@lobehub/icons-static-webp@latest/dark/claudecode-color.webp',
    );
    expect(buttons[1]?.getAttribute('aria-pressed')).toBe('true');

    buttons[0]?.click();
    expect(onSelect).toHaveBeenCalledWith('opencode' satisfies AgentBackendKind);

    containerEl.remove();
    floatingEl?.remove();
  });

  it('hides the editor-area switcher while an unrelated Obsidian settings modal is in front', async () => {
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);

    renderAgentSwitcherFloatingIcons(containerEl, {
      selectedAgent: 'claude-code',
      enabledAgents: ['opencode', 'claude-code'],
      onSelect: jest.fn(),
    });

    const floatingEl = document.body.querySelector<HTMLElement>('.opencodian-agent-switcher-floating');
    expect(floatingEl?.getAttribute('aria-hidden')).toBe('false');

    const modalEl = document.body.createDiv({ cls: 'modal mod-settings' });
    modalEl.createDiv({ text: 'Obsidian settings' });
    await Promise.resolve();

    expect(floatingEl?.getAttribute('aria-hidden')).toBe('true');

    modalEl.remove();
    await Promise.resolve();

    expect(floatingEl?.getAttribute('aria-hidden')).toBe('false');
  });

  it('does not render the floating rail inside the Obsidian settings modal', () => {
    const modalEl = document.body.createDiv({ cls: 'modal mod-settings' });
    const containerEl = modalEl.createDiv();

    renderAgentSwitcherFloatingIcons(containerEl, {
      selectedAgent: 'claude-code',
      enabledAgents: ['opencode', 'claude-code'],
      onSelect: jest.fn(),
    });

    expect(document.body.querySelector('.opencodian-agent-switcher-floating')).toBeNull();
    expect(modalEl.querySelector('.opencodian-agent-switcher-hover-zone')).toBeNull();
  });
});

describe('renderAgentSwitcherHeaderIcons', () => {
  it('renders compact title-row backend buttons with LobeHub light and dark icons', () => {
    const containerEl = document.createElement('div');
    const onSelect = jest.fn();

    renderAgentSwitcherHeaderIcons(containerEl, {
      selectedAgent: 'claude-code',
      enabledAgents: ['opencode', 'claude-code'],
      onSelect,
    });

    const groupEl = containerEl.querySelector<HTMLElement>('.opencodian-agent-switcher-header-icons');
    const buttons = groupEl?.querySelectorAll<HTMLButtonElement>('.opencodian-agent-switcher-header-icon') ?? [];
    const opencodeIconEl = buttons[0]?.querySelector<HTMLElement>('.opencodian-agent-switcher-lobehub-icon');
    const claudeCodeIconEl = buttons[1]?.querySelector<HTMLElement>('.opencodian-agent-switcher-lobehub-icon');
    const claudeLightIconEl = claudeCodeIconEl?.querySelector<HTMLImageElement>(
      '.opencodian-agent-switcher-lobehub-img--light',
    );
    const claudeDarkIconEl = claudeCodeIconEl?.querySelector<HTMLImageElement>(
      '.opencodian-agent-switcher-lobehub-img--dark',
    );

    expect(groupEl).not.toBeNull();
    expect(buttons).toHaveLength(2);
    expect(buttons[0]?.getAttribute('aria-label')).toBe('OpenCode');
    expect(buttons[1]?.getAttribute('aria-label')).toBe('Claude Code');
    expect(buttons[1]?.getAttribute('aria-pressed')).toBe('true');
    expect(opencodeIconEl?.dataset.lobehubIcon).toBe('opencode');
    expect(claudeCodeIconEl?.dataset.lobehubIcon).toBe('claudecode');
    expect(claudeLightIconEl?.getAttribute('src')).toBe(
      'https://unpkg.com/@lobehub/icons-static-webp@latest/light/claudecode-color.webp',
    );
    expect(claudeDarkIconEl?.getAttribute('src')).toBe(
      'https://unpkg.com/@lobehub/icons-static-webp@latest/dark/claudecode-color.webp',
    );

    buttons[0]?.click();
    expect(onSelect).toHaveBeenCalledWith('opencode' satisfies AgentBackendKind);
  });
});
