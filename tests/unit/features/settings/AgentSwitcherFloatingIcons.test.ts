import type { AgentBackendKind } from '../../../../src/core/types/chat';
import {
  renderAgentSwitcherBackendIcon,
  renderAgentSwitcherFloatingIcons,
  renderAgentSwitcherHeaderIcons,
} from '../../../../src/features/settings/resources/AgentSwitcherFloatingIcons';

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
      enabledAgents: ['opencode2', 'claude-code'],
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
    expect(claudeLightIconEl?.getAttribute('src')).toMatch(/^data:image\/svg\+xml/);
    expect(claudeDarkIconEl?.getAttribute('src')).toMatch(/^data:image\/svg\+xml/);
    expect(buttons[1]?.getAttribute('aria-pressed')).toBe('true');

    buttons[0]?.click();
    expect(onSelect).toHaveBeenCalledWith('opencode2' satisfies AgentBackendKind);

    containerEl.remove();
    floatingEl?.remove();
  });

  it('tracks the detached owner window even when only its left position changes', async () => {
    const frame = document.createElement('iframe');
    document.body.appendChild(frame);
    const ownerWindow = frame.contentWindow!;
    const ownerDocument = frame.contentDocument!;
    // Create with the setup realm's Obsidian DOM helpers, then adopt into the
    // detached document. The owner window is still the iframe after adoption.
    const containerEl = document.createElement('div');
    ownerDocument.body.appendChild(containerEl);
    let left = 418;
    jest.spyOn(containerEl, 'getBoundingClientRect').mockImplementation(() => ({
      left, right: left + 396, top: 30, bottom: 866, width: 396, height: 836,
      x: left, y: 30, toJSON: () => ({}),
    }));

    renderAgentSwitcherFloatingIcons(containerEl, {
      selectedAgent: 'opencode2', enabledAgents: ['opencode2', 'claude-code'], onSelect: jest.fn(),
    });
    const floatingEl = ownerDocument.querySelector<HTMLElement>('.opencodian-agent-switcher-floating')!;
    expect(floatingEl.style.getPropertyValue('--opencodian-agent-switcher-fixed-left')).toBe('418px');

    left = 252;
    ownerWindow.dispatchEvent(new Event('resize'));
    expect(floatingEl.style.getPropertyValue('--opencodian-agent-switcher-fixed-left')).toBe('252px');

    containerEl.remove();
    await Promise.resolve();
    expect(floatingEl.isConnected).toBe(false);
    frame.remove();
  });

  it('hides the editor-area switcher while an unrelated Obsidian settings modal is in front', async () => {
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);

    renderAgentSwitcherFloatingIcons(containerEl, {
      selectedAgent: 'claude-code',
      enabledAgents: ['opencode2', 'claude-code'],
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
      enabledAgents: ['opencode2', 'claude-code'] as const,
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
    expect(modalOnSelect).toHaveBeenCalledWith('opencode2' satisfies AgentBackendKind);
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
      enabledAgents: ['opencode2', 'claude-code'] as const,
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

  it('waits to portal an initially detached settings page until its anchor connects', async () => {
    const containerEl = document.createElement('div');

    renderAgentSwitcherFloatingIcons(containerEl, {
      selectedAgent: 'opencode2',
      enabledAgents: ['opencode2', 'claude-code'],
      onSelect: jest.fn(),
    });
    await Promise.resolve();
    expect(document.body.querySelector('.opencodian-agent-switcher-floating')).toBeNull();

    document.body.appendChild(containerEl);
    await Promise.resolve();

    const floatingEl = document.body.querySelector<HTMLElement>('.opencodian-agent-switcher-floating');
    expect(floatingEl?.isConnected).toBe(true);
    expect(floatingEl?.style.getPropertyValue('--opencodian-agent-switcher-fixed-left')).toBe('0px');

    containerEl.remove();
    await Promise.resolve();

    expect(floatingEl?.isConnected).toBe(false);
  });

});

describe('renderAgentSwitcherFloatingIcons window adoption', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('portals a pre-rendered page into its adopted window and cleans up when that window closes', async () => {
    const frame = document.createElement('iframe');
    document.body.appendChild(frame);
    const ownerDocument = frame.contentDocument!;
    const ownerWindow = frame.contentWindow!;
    const callbacks: Array<() => void> = [];
    const previousObserver = Object.getOwnPropertyDescriptor(window, 'ResizeObserver');
    Object.defineProperty(window, 'ResizeObserver', {
      configurable: true,
      value: class {
        constructor(callback: () => void) { callbacks.push(callback); }
        observe = jest.fn();
        disconnect = jest.fn();
      },
    });
    const containerEl = document.createElement('div');
    let left = 250;
    jest.spyOn(containerEl, 'getBoundingClientRect').mockImplementation(() => ({
      left, right: left + 396, top: 30, bottom: 866, width: 396, height: 836,
      x: left, y: 30, toJSON: () => ({}),
    }));
    try {
      renderAgentSwitcherFloatingIcons(containerEl, {
        selectedAgent: 'opencode2', enabledAgents: ['opencode2', 'claude-code'], onSelect: jest.fn(),
      });
      // Obsidian renders before adopting the settings content into its own
      // BrowserWindow. Layout observation then reports the connected owner.
      await Promise.resolve();
      ownerDocument.body.appendChild(containerEl);
      callbacks[0]!();
      await Promise.resolve();

      const floatingEl = ownerDocument.querySelector<HTMLElement>('.opencodian-agent-switcher-floating');
      expect(floatingEl).not.toBeNull();
      expect(document.querySelector('.opencodian-agent-switcher-floating')).toBeNull();
      expect(floatingEl?.style.getPropertyValue('--opencodian-agent-switcher-fixed-left')).toBe('250px');
      left = 312;
      window.dispatchEvent(new Event('resize'));
      expect(floatingEl?.style.getPropertyValue('--opencodian-agent-switcher-fixed-left')).toBe('250px');
      ownerWindow.dispatchEvent(new Event('resize'));
      expect(floatingEl?.style.getPropertyValue('--opencodian-agent-switcher-fixed-left')).toBe('312px');

      ownerWindow.dispatchEvent(new Event('pagehide'));
      expect(floatingEl?.isConnected).toBe(false);
      expect(document.querySelector('.opencodian-agent-switcher-floating')).toBeNull();
    } finally {
      containerEl.remove();
      await Promise.resolve();
      frame.remove();
      if (previousObserver) Object.defineProperty(window, 'ResizeObserver', previousObserver);
      else Reflect.deleteProperty(window, 'ResizeObserver');
    }
  });

  it('moves an already connected rail with its owner instead of abandoning it in the first window', async () => {
    const frame = document.createElement('iframe');
    document.body.appendChild(frame);
    const containerEl = document.body.createDiv();
    renderAgentSwitcherFloatingIcons(containerEl, {
      selectedAgent: 'opencode2', enabledAgents: ['opencode2', 'claude-code'], onSelect: jest.fn(),
    });
    const floatingEl = document.querySelector('.opencodian-agent-switcher-floating');
    frame.contentDocument!.body.appendChild(containerEl);
    await Promise.resolve();
    expect(document.querySelector('.opencodian-agent-switcher-floating')).toBeNull();
    expect(frame.contentDocument!.querySelector('.opencodian-agent-switcher-floating')).toBe(floatingEl);
    expect(floatingEl?.isConnected).toBe(true);
    containerEl.remove();
    await Promise.resolve();
    expect(floatingEl?.isConnected).toBe(false);
    frame.remove();
  });
});

describe('renderAgentSwitcherHeaderIcons', () => {
  it('renders compact title-row backend buttons with LobeHub light and dark icons', () => {
    const containerEl = document.createElement('div');
    const onSelect = jest.fn();

    renderAgentSwitcherHeaderIcons(containerEl, {
      selectedAgent: 'claude-code',
      enabledAgents: ['opencode2', 'claude-code'],
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
    expect(buttons[0]?.getAttribute('aria-label')).toBe('OpenCode 2');
    expect(buttons[1]?.getAttribute('aria-label')).toBe('Claude Code');
    expect(buttons[1]?.getAttribute('aria-pressed')).toBe('true');
    expect(opencodeIconEl?.dataset.lobehubIcon).toBe('opencode');
    expect(claudeCodeIconEl?.dataset.lobehubIcon).toBe('claudecode');
    expect(claudeLightIconEl?.getAttribute('src')).toMatch(/^data:image\/svg\+xml/);
    expect(claudeDarkIconEl?.getAttribute('src')).toMatch(/^data:image\/svg\+xml/);

    buttons[0]?.click();
    expect(onSelect).toHaveBeenCalledWith('opencode2' satisfies AgentBackendKind);
  });
});

describe('renderAgentSwitcherBackendIcon', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it.each(['opencode2', 'claude-code', 'codex', 'copilot'] as const)(
    'renders %s immediately from the same bundled URLs across surfaces', (backend) => {
      const first = document.createElement('span');
      const second = document.createElement('span');
      renderAgentSwitcherBackendIcon(first, backend);
      renderAgentSwitcherBackendIcon(second, backend);
      const images = Array.from(first.querySelectorAll('img'));
      expect(images).toHaveLength(2);
      for (const img of images) {
        expect(img.getAttribute('src')).toMatch(/^data:image\/svg\+xml/);
        expect(img.getAttribute('loading')).toBe('eager');
        expect(img.getAttribute('decoding')).toBe('sync');
      }
      expect(images.map((img) => img.src)).toEqual(Array.from(second.querySelectorAll('img')).map((img) => img.src));
    },
  );

  it('drops the stale LobeHub modifier when a reused container falls back to the Pi glyph', () => {
    const iconEl = document.createElement('span');
    renderAgentSwitcherBackendIcon(iconEl, 'opencode');
    expect(iconEl.classList.contains('opencodian-agent-switcher-icon--lobehub')).toBe(true);

    renderAgentSwitcherBackendIcon(iconEl, 'pi');

    expect(iconEl.classList.contains('opencodian-agent-switcher-icon--lobehub')).toBe(false);
    expect(iconEl.querySelector('.opencodian-agent-switcher-lobehub-icon')).toBeNull();
  });
});
