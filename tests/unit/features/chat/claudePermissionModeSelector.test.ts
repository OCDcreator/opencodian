import type { ClaudeCodePermissionMode } from '../../../../src/core/types/settings';
import {
  createClaudeCodePermissionConfig,
  PermissionModeSelectorCoordinator,
  type PermissionModeSelectorHost,
} from '../../../../src/features/chat/services/PermissionModeSelectorCoordinator';

describe('Claude Code permission mode selector', () => {
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
      },
    };

    beforeEach(() => {
      currentMode = 'bypassPermissions';
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
  });
});
