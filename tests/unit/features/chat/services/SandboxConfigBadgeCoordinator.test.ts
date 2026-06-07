/**
 * Unit tests for SandboxConfigBadgeCoordinator.
 *
 * Validates:
 * - badge hidden when sandbox disabled
 * - badge visible when sandbox enabled
 * - sub-policy count reflects configured policies
 * - tooltip contains expected config lines
 * - locale refresh re-renders badge
 * - destroy cleans up
 * - dynamic enable/disable reflects in badge
 */
import {
  type ClaudeCodeSandboxSettings,
  getDefaultClaudeCodeBackendSettings,
} from '../../../../../src/core/types';
import { SandboxConfigBadgeCoordinator } from '../../../../../src/features/chat/services/SandboxConfigBadgeCoordinator';
import { t } from '../../../../../src/i18n';

// ---------------------------------------------------------------------------
// Obsidian DOM polyfill (same pattern as ModifiedFilesSidebar.test.ts)
// ---------------------------------------------------------------------------

type ObsidianLikeElement = HTMLElement & {
  createDiv: (options?: { cls?: string; text?: string; attr?: Record<string, string> }) => HTMLDivElement;
  createSpan: (options?: { cls?: string; text?: string; attr?: Record<string, string> }) => HTMLSpanElement;
};

function appendChildElement(
  parent: HTMLElement,
  tag: 'div' | 'span',
  options: { cls?: string; text?: string; attr?: Record<string, string> } = {},
): HTMLDivElement & HTMLSpanElement {
  const element = document.createElement(tag) as HTMLDivElement & HTMLSpanElement;
  if (options.cls) element.className = options.cls;
  if (options.text) element.textContent = options.text;
  if (options.attr) {
    for (const [key, value] of Object.entries(options.attr)) {
      element.setAttribute(key, value);
    }
  }
  parent.appendChild(element);
  return element;
}

function installObsidianElementHelpers(): void {
  const prototype = HTMLElement.prototype as ObsidianLikeElement;
  if (!prototype.createDiv) {
    prototype.createDiv = function createDiv(options = {}) {
      return appendChildElement(this, 'div', options);
    };
  }
  if (!prototype.createSpan) {
    prototype.createSpan = function createSpan(options = {}) {
      return appendChildElement(this, 'span', options);
    };
  }
}

// ---------------------------------------------------------------------------
// Mock obsidian setIcon
// ---------------------------------------------------------------------------

jest.mock('obsidian', () => ({
  setIcon: (el: HTMLElement, _icon: string) => {
    el.innerHTML = '<svg></svg>';
  },
}));

// ---------------------------------------------------------------------------
// Mock global plugin instance (reads from globalThis.app.plugins.plugins.opencodian)
// ---------------------------------------------------------------------------

let mockSettings: Record<string, unknown>;

function setMockSandboxSettings(sandbox: ClaudeCodeSandboxSettings): void {
  mockSettings = { ...mockSettings, backendSettings: { claudeCode: { sandbox } } };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).app = {
    plugins: {
      plugins: {
        opencodian: { settings: mockSettings },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createContainer(): HTMLElement {
  return document.body.createDiv();
}

function defaultSandbox(): ClaudeCodeSandboxSettings {
  return getDefaultClaudeCodeBackendSettings().sandbox;
}

function enabledSandbox(overrides?: Partial<ClaudeCodeSandboxSettings>): ClaudeCodeSandboxSettings {
  return {
    ...defaultSandbox(),
    enabled: true,
    ...overrides,
  };
}

// Install polyfills and mock global before tests
beforeAll(() => {
  installObsidianElementHelpers();
  mockSettings = {};
});

afterAll(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (globalThis as any).app;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SandboxConfigBadgeCoordinator', () => {
  it('does not render a badge when sandbox is disabled', () => {
    setMockSandboxSettings(defaultSandbox());
    const container = createContainer();
    const coordinator = new SandboxConfigBadgeCoordinator();
    coordinator.mount(container);

    const badge = container.querySelector('.opencodian-sandbox-config-badge');
    expect(badge).toBeNull();
  });

  it('renders a badge when sandbox is enabled', () => {
    setMockSandboxSettings(enabledSandbox());
    const container = createContainer();
    const coordinator = new SandboxConfigBadgeCoordinator();
    coordinator.mount(container);

    const badge = container.querySelector('.opencodian-sandbox-config-badge');
    expect(badge).not.toBeNull();
    expect(badge!.getAttribute('data-sandbox-enabled')).toBe('true');
  });

  it('shows basic label when no sub-policies are active', () => {
    setMockSandboxSettings(enabledSandbox());
    const container = createContainer();
    const coordinator = new SandboxConfigBadgeCoordinator();
    coordinator.mount(container);

    const text = container.querySelector('.opencodian-sandbox-config-badge-text');
    expect(text?.textContent).toBe(t('settings.claudeCode.sandbox.chatBadge.basic'));
  });

  it('shows policy count when sub-policies are active', () => {
    setMockSandboxSettings(enabledSandbox({
      excludedCommands: ['docker *'],
      filesystem: { allowWrite: ['/tmp'], denyWrite: [], denyRead: [] },
    }));
    const container = createContainer();
    const coordinator = new SandboxConfigBadgeCoordinator();
    coordinator.mount(container);

    const badge = container.querySelector('.opencodian-sandbox-config-badge');
    expect(badge?.getAttribute('data-sandbox-sub-policies')).toBe('2');

    const text = container.querySelector('.opencodian-sandbox-config-badge-text');
    expect(text?.textContent).toContain('2');
  });

  it('counts allowUnsandboxedCommands=false as a sub-policy', () => {
    setMockSandboxSettings(enabledSandbox({ allowUnsandboxedCommands: false }));
    const container = createContainer();
    const coordinator = new SandboxConfigBadgeCoordinator();
    coordinator.mount(container);

    const badge = container.querySelector('.opencodian-sandbox-config-badge');
    expect(badge?.getAttribute('data-sandbox-sub-policies')).toBe('1');
  });

  it('counts network domain policies', () => {
    setMockSandboxSettings(enabledSandbox({
      network: { allowedDomains: ['github.com'], deniedDomains: ['evil.com'] },
    }));
    const container = createContainer();
    const coordinator = new SandboxConfigBadgeCoordinator();
    coordinator.mount(container);

    const badge = container.querySelector('.opencodian-sandbox-config-badge');
    expect(badge?.getAttribute('data-sandbox-sub-policies')).toBe('2');
  });

  it('counts weaker sandbox toggles', () => {
    setMockSandboxSettings(enabledSandbox({
      enableWeakerNestedSandbox: true,
      enableWeakerNetworkIsolation: true,
    }));
    const container = createContainer();
    const coordinator = new SandboxConfigBadgeCoordinator();
    coordinator.mount(container);

    const badge = container.querySelector('.opencodian-sandbox-config-badge');
    expect(badge?.getAttribute('data-sandbox-sub-policies')).toBe('2');
  });

  it('counts custom ripgrep', () => {
    setMockSandboxSettings(enabledSandbox({
      ripgrep: { command: '/usr/local/bin/rg', args: [] },
    }));
    const container = createContainer();
    const coordinator = new SandboxConfigBadgeCoordinator();
    coordinator.mount(container);

    const badge = container.querySelector('.opencodian-sandbox-config-badge');
    expect(badge?.getAttribute('data-sandbox-sub-policies')).toBe('1');
  });

  it('includes config details in tooltip', () => {
    setMockSandboxSettings(enabledSandbox({
      excludedCommands: ['docker *'],
      filesystem: { allowWrite: ['/tmp/build'], denyWrite: ['/etc'], denyRead: ['~/.aws'] },
      network: { allowedDomains: ['github.com'], deniedDomains: [] },
    }));
    const container = createContainer();
    const coordinator = new SandboxConfigBadgeCoordinator();
    coordinator.mount(container);

    const badge = container.querySelector('.opencodian-sandbox-config-badge');
    const title = badge?.getAttribute('title') ?? '';
    expect(title).toContain('docker *');
    expect(title).toContain('/tmp/build');
    expect(title).toContain('/etc');
    expect(title).toContain('~/.aws');
    expect(title).toContain('github.com');
    expect(title).toContain('Readback');
  });

  it('shows BLOCKED in tooltip when unsandboxed escape is disabled', () => {
    setMockSandboxSettings(enabledSandbox({ allowUnsandboxedCommands: false }));
    const container = createContainer();
    const coordinator = new SandboxConfigBadgeCoordinator();
    coordinator.mount(container);

    const badge = container.querySelector('.opencodian-sandbox-config-badge');
    const title = badge?.getAttribute('title') ?? '';
    expect(title).toContain('BLOCKED');
  });

  it('removes badge on update when sandbox is disabled', () => {
    setMockSandboxSettings(enabledSandbox());
    const container = createContainer();
    const coordinator = new SandboxConfigBadgeCoordinator();
    coordinator.mount(container);

    expect(container.querySelector('.opencodian-sandbox-config-badge')).not.toBeNull();

    // Disable sandbox
    setMockSandboxSettings(defaultSandbox());
    coordinator.update();

    expect(container.querySelector('.opencodian-sandbox-config-badge')).toBeNull();
  });

  it('re-renders badge on locale refresh', () => {
    setMockSandboxSettings(enabledSandbox());
    const container = createContainer();
    const coordinator = new SandboxConfigBadgeCoordinator();
    coordinator.mount(container);

    const badge1 = container.querySelector('.opencodian-sandbox-config-badge');
    expect(badge1).not.toBeNull();

    coordinator.applyLocaleTexts();

    // Badge should be re-rendered (old element removed, new one created)
    const badge2 = container.querySelector('.opencodian-sandbox-config-badge');
    expect(badge2).not.toBeNull();
    expect(badge2).not.toBe(badge1);
  });

  it('destroy clears internal references and allows re-mount', () => {
    setMockSandboxSettings(enabledSandbox());
    const container = createContainer();
    const coordinator = new SandboxConfigBadgeCoordinator();
    coordinator.mount(container);

    coordinator.destroy();

    // After destroy, mounting on a new container should still work
    const container2 = createContainer();
    coordinator.mount(container2);
    expect(container2.querySelector('.opencodian-sandbox-config-badge')).not.toBeNull();
  });

  it('tooltip includes readback disclaimer, not enforcement proof', () => {
    setMockSandboxSettings(enabledSandbox());
    const container = createContainer();
    const coordinator = new SandboxConfigBadgeCoordinator();
    coordinator.mount(container);

    const badge = container.querySelector('.opencodian-sandbox-config-badge');
    const title = badge?.getAttribute('title') ?? '';

    // Readback disclaimer should be present
    expect(title).toContain('Readback');

    // Must contain the explicit "not independently verified" boundary
    expect(title).toContain('not independently verified');

    // Must NOT claim enforcement is confirmed/independently proven
    // (The readback line itself says "not independently verified" — that's the boundary.)
    expect(title).not.toContain('enforcement confirmed');
    expect(title).not.toContain('enforcement verified');
  });
});
