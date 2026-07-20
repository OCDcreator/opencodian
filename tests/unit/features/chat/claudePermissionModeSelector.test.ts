import { readFileSync } from 'node:fs';

import type { ClaudeCodePermissionMode } from '../../../../src/core/types/settings';
import {
  createClaudeCodePermissionConfig,
  PermissionModeSelectorCoordinator,
  type PermissionModeSelectorHost,
} from '../../../../src/features/chat/services/PermissionModeSelectorCoordinator';

describe('Claude Code permission mode selector', () => {
  beforeEach(() => {
    HTMLElement.prototype.scrollIntoView = jest.fn();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    jest.restoreAllMocks();
  });

  describe('createClaudeCodePermissionConfig', () => {
    it('keeps the Claude SDK-supported permission modes in the compact menu order', () => {
      const config = createClaudeCodePermissionConfig();

      expect(config.backendLabel).toBe('claude-code');
      expect(config.variantClass).toBe('opencodian-permission-selector--claude-code');
      expect(config.options.map((option) => option.id)).toEqual([
        'default',
        'acceptEdits',
        'plan',
        'bypassPermissions',
      ]);
    });

    it('uses screenshot-style labels while preserving the stronger bypass semantics', () => {
      const config = createClaudeCodePermissionConfig();

      expect(config.displayMap.default).toBe('Ask first');
      expect(config.displayMap.acceptEdits).toBe('Auto edit');
      expect(config.displayMap.plan).toBe('Plan mode');
      expect(config.displayMap.bypassPermissions).toBe('Full access');

      const bypassOption = config.options.find((option) => option.id === 'bypassPermissions');
      expect(bypassOption?.label).toBe('Full access');
      expect(bypassOption?.description).toContain('bypasses permission checks');
    });

    it('assigns distinct Claude mode icons instead of a single generic shield', () => {
      const config = createClaudeCodePermissionConfig();

      expect(config.options.map((option) => option.icon)).toEqual([
        'hand',
        'shield-check',
        'clipboard-list',
        'shield-alert',
      ]);
    });
  });

  describe('PermissionModeSelectorCoordinator with Claude config', () => {
    let currentMode: ClaudeCodePermissionMode = 'bypassPermissions';
    const host: PermissionModeSelectorHost = {
      getPermissionMode: () => currentMode,
      switchPermissionMode: async (mode: string) => {
        currentMode = mode as ClaudeCodePermissionMode;
        return true;
      },
      restoreInputFocus: jest.fn(),
    };

    beforeEach(() => {
      currentMode = 'bypassPermissions';
      jest.clearAllMocks();
    });

    it('mounts Claude-specific chrome and shows the selected full label in the trigger', () => {
      const container = document.createElement('div');
      const config = createClaudeCodePermissionConfig();
      const coordinator = new PermissionModeSelectorCoordinator(host, config);
      coordinator.mount(container);

      const trigger = container.querySelector<HTMLElement>('.opencodian-permission-trigger');
      const dropdown = container.querySelector<HTMLElement>('.opencodian-permission-dropdown');

      expect(container.classList.contains('opencodian-permission-selector--claude-code')).toBe(true);
      expect(trigger?.classList.contains('opencodian-permission-selector--claude-code')).toBe(true);
      expect(dropdown?.classList.contains('opencodian-permission-selector--claude-code')).toBe(true);
      expect(trigger?.querySelector('.opencodian-permission-trigger-text')?.textContent).toBe('Full access');
      expect(trigger?.querySelector('svg')?.getAttribute('data-icon')).toBe('shield-alert');
      expect(
        trigger?.querySelector('.opencodian-permission-trigger-chevron svg')?.getAttribute('data-icon'),
      ).toBe('chevron-down');

      coordinator.destroy();
    });

    it('renders each Claude option with its own icon and selected checkmark', () => {
      const container = document.createElement('div');
      const config = createClaudeCodePermissionConfig();
      const coordinator = new PermissionModeSelectorCoordinator(host, config);
      coordinator.mount(container);

      const options = Array.from(container.querySelectorAll<HTMLElement>('.opencodian-permission-option'));
      expect(options.map((option) => option.getAttribute('data-mode'))).toEqual([
        'default',
        'acceptEdits',
        'plan',
        'bypassPermissions',
      ]);
      expect(options.map((option) =>
        option.querySelector('.opencodian-permission-option-icon svg')?.getAttribute('data-icon'),
      )).toEqual([
        'hand',
        'shield-check',
        'clipboard-list',
        'shield-alert',
      ]);

      const selected = container.querySelector<HTMLElement>('.opencodian-permission-option.is-selected');
      expect(selected?.getAttribute('data-mode')).toBe('bypassPermissions');
      expect(selected?.querySelector('.opencodian-permission-option-check svg')?.getAttribute('data-icon')).toBe('check');

      coordinator.destroy();
    });

    it('uses the shared card frame and wraps keyboard focus through Claude permission options', async () => {
      const container = document.createElement('div');
      document.body.appendChild(container);
      const coordinator = new PermissionModeSelectorCoordinator(host, createClaudeCodePermissionConfig());
      coordinator.mount(container);
      const trigger = container.querySelector<HTMLElement>('.opencodian-permission-trigger');

      trigger?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

      const dropdown = container.querySelector<HTMLElement>('.opencodian-permission-dropdown');
      const frame = container.querySelector<HTMLElement>('.opencodian-composer-popover-frame');
      const selectedOption = container.querySelector<HTMLElement>('[data-mode="bypassPermissions"]');
      expect(frame?.querySelector('.opencodian-composer-popover-title')?.textContent).toBe('Permission mode');
      expect(frame?.querySelector('kbd')?.textContent).toBe('Esc');
      expect(frame?.querySelector('.opencodian-composer-popover-footer')?.textContent).toContain('Navigate');
      expect(frame?.querySelector('.opencodian-composer-popover-footer')?.textContent).toContain('Select');
      expect(selectedOption?.getAttribute('data-permission-semantic')).toBe('danger');
      expect(document.activeElement).toBe(selectedOption);

      dropdown?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      expect(document.activeElement).toBe(container.querySelector('[data-mode="default"]'));

      dropdown?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
      expect(document.activeElement).toBe(selectedOption);

      dropdown?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(trigger?.getAttribute('aria-expanded')).toBe('false');
      expect(document.activeElement).toBe(trigger);
      expect(Array.from(container.querySelectorAll<HTMLElement>('.opencodian-permission-option'))
        .filter((option) => option.tabIndex === 0)).toHaveLength(0);

      coordinator.destroy();
    });

    it('selects the focused permission mode and restores composer focus once', async () => {
      const container = document.createElement('div');
      document.body.appendChild(container);
      const coordinator = new PermissionModeSelectorCoordinator(host, createClaudeCodePermissionConfig());
      coordinator.mount(container);
      const trigger = container.querySelector<HTMLElement>('.opencodian-permission-trigger');

      trigger?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      const dropdown = container.querySelector<HTMLElement>('.opencodian-permission-dropdown');
      dropdown?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
      dropdown?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();

      expect(currentMode).toBe('plan');
      expect(trigger?.getAttribute('aria-expanded')).toBe('false');
      expect(host.restoreInputFocus).toHaveBeenCalledTimes(1);

      coordinator.destroy();
    });

    it('keeps a failed permission write open with the current selection intact', async () => {
      const failedHost: PermissionModeSelectorHost = {
        getPermissionMode: () => 'default',
        switchPermissionMode: jest.fn(async () => false),
        restoreInputFocus: jest.fn(),
      };
      const container = document.createElement('div');
      const coordinator = new PermissionModeSelectorCoordinator(failedHost, createClaudeCodePermissionConfig());
      coordinator.mount(container);
      const trigger = container.querySelector<HTMLElement>('.opencodian-permission-trigger');

      trigger?.click();
      container.querySelector<HTMLElement>('[data-mode="acceptEdits"]')?.click();
      await Promise.resolve();

      expect(trigger?.getAttribute('aria-expanded')).toBe('true');
      expect(container.querySelector<HTMLElement>('[data-mode="default"]')?.hasClass('is-selected')).toBe(true);
      expect(failedHost.restoreInputFocus).not.toHaveBeenCalled();

      coordinator.destroy();
    });

    it('scopes semantic danger and safe colors to icon and check without flooding the row', () => {
      const css = readFileSync('src/style/components/permission-mode-selector.css', 'utf8');

      const dangerRowRule = css.match(
        /\[data-permission-semantic=['"]danger['"]\]\.is-selected\s*\{[^}]*\}/,
      );
      const safeRowRule = css.match(
        /\[data-permission-semantic=['"]safe['"]\]\.is-selected\s*\{[^}]*\}/,
      );

      expect(dangerRowRule).toBeNull();
      expect(safeRowRule).toBeNull();

      expect(css).toMatch(
        /\[data-permission-semantic=['"]danger['"]\]\s*\{[^}]*--background-modifier-error/,
      );
      expect(css).toMatch(
        /\[data-permission-semantic=['"]safe['"]\]\s*\{[^}]*--background-modifier-success/,
      );

      expect(css).toMatch(
        /\.is-selected \.opencodian-permission-option-(?:icon|check|label)[^}]*var\(--opencodian-permission-option-accent/,
      );

      expect(css).not.toMatch(/\[data-mode=['"]yolo['"]\]\.is-selected \.opencodian-permission-option-check/);
      expect(css).not.toMatch(/\[data-mode=['"]plan['"]\]\.is-selected \.opencodian-permission-option-check/);
    });
  });
});
