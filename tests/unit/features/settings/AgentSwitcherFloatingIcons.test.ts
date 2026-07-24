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

  it('keeps independent editor and native settings modal rails through modal lifecycle', async () => {
    const editorContainerEl = document.body.createDiv();
    const editorOnSelect = jest.fn();
    const modalOnSelect = jest.fn();
    const renderOptions = {
      selectedAgent: 'claude-code' as const,
      enabledAgents: ['opencode', 'claude-code'] as const,
      onSelect: editorOnSelect,
    };

    renderAgentSwitcherFloatingIcons(editorContainerEl, renderOptions);
    const editorFloatingEl = document.body.querySelector<HTMLElement>('.opencodian-agent-switcher-floating');

    expect(editorFloatingEl).not.toBeNull();

    const modalEl = document.body.createDiv({ cls: 'modal mod-settings' });
    const modalContainerEl = modalEl.createDiv();
    renderAgentSwitcherFloatingIcons(modalContainerEl, {
      ...renderOptions,
      onSelect: modalOnSelect,
    });

    await Promise.resolve();
    const floatingRails = Array.from(
      document.body.querySelectorAll<HTMLElement>('.opencodian-agent-switcher-floating'),
    );
    const modalFloatingEl = floatingRails[1];

    expect(floatingRails).toHaveLength(2);
    expect(floatingRails[0]).toBe(editorFloatingEl);
    expect(modalFloatingEl).not.toBe(editorFloatingEl);
    expect(editorFloatingEl?.getAttribute('aria-hidden')).toBe('true');
    expect(modalFloatingEl?.getAttribute('aria-hidden')).toBe('false');
    expect(modalContainerEl.querySelector('.opencodian-agent-switcher-hover-zone')).not.toBeNull();
    expect(modalFloatingEl?.querySelectorAll('.opencodian-agent-switcher-icon')).toHaveLength(2);

    modalFloatingEl?.querySelector<HTMLButtonElement>('.opencodian-agent-switcher-icon')?.click();
    expect(modalOnSelect).toHaveBeenCalledWith('opencode' satisfies AgentBackendKind);
    expect(editorOnSelect).not.toHaveBeenCalled();

    modalEl.remove();
    await Promise.resolve();

    expect(modalFloatingEl?.isConnected).toBe(false);
    expect(document.body.querySelectorAll('.opencodian-agent-switcher-floating')).toHaveLength(1);
    expect(editorFloatingEl?.isConnected).toBe(true);
    expect(editorFloatingEl?.getAttribute('aria-hidden')).toBe('false');
  });

  it('cleans repeated renders per owner without removing the other surface rail', () => {
    const editorContainerEl = document.body.createDiv();
    const modalEl = document.body.createDiv({ cls: 'modal mod-settings' });
    const modalContainerEl = modalEl.createDiv();
    const renderOptions = {
      selectedAgent: 'claude-code' as const,
      enabledAgents: ['opencode', 'claude-code'] as const,
      onSelect: jest.fn(),
    };

    renderAgentSwitcherFloatingIcons(editorContainerEl, renderOptions);
    const firstEditorFloatingEl = document.body.querySelector<HTMLElement>('.opencodian-agent-switcher-floating');
    renderAgentSwitcherFloatingIcons(modalContainerEl, renderOptions);
    const firstModalFloatingEl = document.body.querySelectorAll<HTMLElement>(
      '.opencodian-agent-switcher-floating',
    )[1];

    renderAgentSwitcherFloatingIcons(editorContainerEl, renderOptions);
    const secondEditorFloatingEl = document.body.querySelectorAll<HTMLElement>(
      '.opencodian-agent-switcher-floating',
    )[1];

    expect(firstEditorFloatingEl?.isConnected).toBe(false);
    expect(secondEditorFloatingEl).not.toBe(firstEditorFloatingEl);
    expect(firstModalFloatingEl?.isConnected).toBe(true);
    expect(editorContainerEl.querySelectorAll('.opencodian-agent-switcher-hover-zone')).toHaveLength(1);
    expect(document.body.querySelectorAll('.opencodian-agent-switcher-floating')).toHaveLength(2);

    renderAgentSwitcherFloatingIcons(modalContainerEl, renderOptions);
    const floatingRails = Array.from(
      document.body.querySelectorAll<HTMLElement>('.opencodian-agent-switcher-floating'),
    );

    expect(firstModalFloatingEl?.isConnected).toBe(false);
    expect(floatingRails).toHaveLength(2);
    expect(floatingRails).toContain(secondEditorFloatingEl);
    expect(modalContainerEl.querySelectorAll('.opencodian-agent-switcher-hover-zone')).toHaveLength(1);
  });

  it('keeps the floating rail until an initially detached settings page is connected', async () => {
    const containerEl = document.createElement('div');

    renderAgentSwitcherFloatingIcons(containerEl, {
      selectedAgent: 'opencode',
      enabledAgents: ['opencode', 'claude-code'],
      onSelect: jest.fn(),
    });
    const floatingEl = document.body.querySelector<HTMLElement>('.opencodian-agent-switcher-floating');

    await Promise.resolve();
    expect(floatingEl?.isConnected).toBe(true);

    document.body.appendChild(containerEl);
    await Promise.resolve();

    expect(floatingEl?.isConnected).toBe(true);
    expect(floatingEl?.style.getPropertyValue('--opencodian-agent-switcher-fixed-left')).toBe('0px');

    containerEl.remove();
    await Promise.resolve();

    expect(floatingEl?.isConnected).toBe(false);
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
