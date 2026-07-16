/**
 * Tests for Codex sandbox mode selector in the chat toolbar.
 *
 * The sandbox mode selector reuses the existing permission-mode selector
 * surface. When the Codex backend is active, the selector shows sandbox
 * mode options (read-only, workspace-write, danger-full-access) instead
 * of OpenCode or Claude Code permission modes.
 *
 * Boundary honesty: changing sandbox mode only affects subsequent thread
 * creation/resume — it does NOT reconfigure the OS-level sandbox of the
 * current running thread. The trigger title carries a boundary hint.
 */
import type { CodexSandboxMode } from '../../../../src/core/types/settings';
import {
  createCodexSandboxConfig,
  PermissionModeSelectorCoordinator,
  type PermissionModeSelectorHost,
} from '../../../../src/features/chat/services/PermissionModeSelectorCoordinator';

describe('Codex sandbox mode selector', () => {
  describe('createCodexSandboxConfig', () => {
    it('returns exactly three sandbox mode options', () => {
      const config = createCodexSandboxConfig();
      expect(config.options).toHaveLength(3);
      expect(config.options.map((o) => o.id)).toEqual([
        'read-only',
        'workspace-write',
        'danger-full-access',
      ]);
    });

    it('has a display abbreviation for each mode', () => {
      const config = createCodexSandboxConfig();
      expect(config.displayMap['read-only']).toBe('RO');
      expect(config.displayMap['workspace-write']).toBe('WS');
      expect(config.displayMap['danger-full-access']).toBe('FULL');
    });

    it('sets backendLabel to codex', () => {
      const config = createCodexSandboxConfig();
      expect(config.backendLabel).toBe('codex');
    });

    it('includes a boundary hint', () => {
      const config = createCodexSandboxConfig();
      expect(config.boundaryHint).toBeTruthy();
    });

    it('includes CSS classes for each mode', () => {
      const config = createCodexSandboxConfig();
      expect(config.modeCssClasses).toContain('mode-read-only');
      expect(config.modeCssClasses).toContain('mode-workspace-write');
      expect(config.modeCssClasses).toContain('mode-danger-full-access');
    });
  });

  describe('PermissionModeSelectorCoordinator with Codex sandbox config', () => {
    let currentMode: CodexSandboxMode = 'workspace-write';
    const host: PermissionModeSelectorHost = {
      getPermissionMode: () => currentMode,
      switchPermissionMode: async (mode: string) => {
        currentMode = mode as CodexSandboxMode;
      },
    };

    beforeEach(() => {
      currentMode = 'workspace-write';
    });

    it('mounts and shows the current mode display label', () => {
      const container = document.createElement('div');
      const config = createCodexSandboxConfig();
      const coordinator = new PermissionModeSelectorCoordinator(host, config);
      coordinator.mount(container);

      const textEl = container.querySelector('.opencodian-permission-trigger-text');
      expect(textEl?.textContent).toBe('WS');

      coordinator.destroy();
    });

    it('clamps the permission dropdown to the chat boundary when it opens', () => {
      const boundary = document.createElement('div');
      boundary.className = 'opencodian-container';
      const container = document.createElement('div');
      boundary.appendChild(container);
      document.body.appendChild(boundary);
      const coordinator = new PermissionModeSelectorCoordinator(host, createCodexSandboxConfig());
      coordinator.mount(container);

      jest.spyOn(boundary, 'getBoundingClientRect').mockReturnValue({
        left: 100, right: 360, top: 0, bottom: 800, width: 260, height: 800, x: 100, y: 0, toJSON: () => ({}),
      });
      jest.spyOn(container, 'getBoundingClientRect').mockReturnValue({
        left: 120, right: 180, top: 700, bottom: 730, width: 60, height: 30, x: 120, y: 700, toJSON: () => ({}),
      });

      container.querySelector<HTMLElement>('.opencodian-permission-trigger')?.click();

      const dropdown = container.querySelector<HTMLElement>('.opencodian-permission-dropdown');
      expect(dropdown?.style.left).toBe('-12px');
      expect(dropdown?.style.width).toBe('244px');
      expect(dropdown?.style.minWidth).toBe('220px');
      coordinator.destroy();
    });

    it('shows the correct mode class', () => {
      const container = document.createElement('div');
      const config = createCodexSandboxConfig();
      const coordinator = new PermissionModeSelectorCoordinator(host, config);
      coordinator.mount(container);

      const trigger = container.querySelector('.opencodian-permission-trigger');
      expect(trigger?.classList.contains('mode-workspace-write')).toBe(true);

      coordinator.destroy();
    });

    it('sets data-permission-backend to codex', () => {
      const container = document.createElement('div');
      const config = createCodexSandboxConfig();
      const coordinator = new PermissionModeSelectorCoordinator(host, config);
      coordinator.mount(container);

      const trigger = container.querySelector('.opencodian-permission-trigger');
      expect(trigger?.getAttribute('data-permission-backend')).toBe('codex');

      coordinator.destroy();
    });

    it('sets trigger title to boundary hint when config provides one', () => {
      const container = document.createElement('div');
      const config = createCodexSandboxConfig();
      const coordinator = new PermissionModeSelectorCoordinator(host, config);
      coordinator.mount(container);

      const trigger = container.querySelector('.opencodian-permission-trigger');
      expect(trigger?.getAttribute('title')).toBeTruthy();
      expect(trigger?.getAttribute('title')).toBe(config.boundaryHint);

      coordinator.destroy();
    });

    it('does not set title when boundaryHint is absent', () => {
      const container = document.createElement('div');
      const config = createCodexSandboxConfig();
      // Explicitly remove boundary hint
      const configNoHint = { ...config, boundaryHint: undefined };
      const coordinator = new PermissionModeSelectorCoordinator(host, configNoHint);
      coordinator.mount(container);

      const trigger = container.querySelector('.opencodian-permission-trigger');
      expect(trigger?.getAttribute('title')).toBeFalsy();

      coordinator.destroy();
    });

    it('renders all three sandbox options in the dropdown', () => {
      const container = document.createElement('div');
      const config = createCodexSandboxConfig();
      const coordinator = new PermissionModeSelectorCoordinator(host, config);
      coordinator.mount(container);

      const options = container.querySelectorAll('.opencodian-permission-option');
      expect(options.length).toBe(3);

      const ids = Array.from(options).map((el) => el.getAttribute('data-mode'));
      expect(ids).toEqual(['read-only', 'workspace-write', 'danger-full-access']);

      coordinator.destroy();
    });

    it('marks the current mode as selected in the dropdown', () => {
      currentMode = 'read-only';
      const container = document.createElement('div');
      const config = createCodexSandboxConfig();
      const coordinator = new PermissionModeSelectorCoordinator(host, config);
      coordinator.mount(container);

      const selected = container.querySelector('.opencodian-permission-option.is-selected');
      expect(selected?.getAttribute('data-mode')).toBe('read-only');

      coordinator.destroy();
    });

    it('updates the trigger display after switching mode', async () => {
      const container = document.createElement('div');
      const config = createCodexSandboxConfig();
      const coordinator = new PermissionModeSelectorCoordinator(host, config);
      coordinator.mount(container);

      // Simulate switching to danger-full-access
      currentMode = 'danger-full-access';
      coordinator.updateTriggerDisplay();

      const textEl = container.querySelector('.opencodian-permission-trigger-text');
      expect(textEl?.textContent).toBe('FULL');

      const trigger = container.querySelector('.opencodian-permission-trigger');
      expect(trigger?.classList.contains('mode-danger-full-access')).toBe(true);

      coordinator.destroy();
    });
  });
});
