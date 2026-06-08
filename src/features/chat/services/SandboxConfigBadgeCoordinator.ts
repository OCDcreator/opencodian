/**
 * SandboxConfigBadgeCoordinator — read-only sandbox status badge for chat toolbar.
 *
 * Shows a small badge next to the permission mode selector when:
 * 1. The active backend is Claude Code (gated by ChatSelectionControlsCoordinator.showSandbox)
 * 2. Sandbox is enabled in plugin settings
 *
 * This is a readback surface: the badge reflects the plugin settings,
 * NOT independently verified OS-level enforcement.
 *
 * Badge states:
 * - Not mounted when backend is not Claude Code (showSandbox=false)
 * - Not shown when sandbox is disabled (default)
 * - "Sandbox" with sub-policy count when enabled
 * - Tooltip shows detailed policy configuration (i18n-aware)
 *
 * Settings access: reads directly from the Obsidian plugin instance via the global
 * `app` object, avoiding coupling to the guarded `OpenCodianView.ts` host object.
 */
import { setIcon } from 'obsidian';

import type { ClaudeCodeSandboxSettings } from '../../../core/types';
import { t } from '../../../i18n';

/**
 * Read sandbox settings from the live plugin instance.
 * Uses the Obsidian global `app` to reach the plugin without routing through
 * the guarded `OpenCodianView.ts` host object.
 */
function readSandboxSettingsFromPlugin(): ClaudeCodeSandboxSettings | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const plugin = (globalThis as any).app?.plugins?.plugins?.opencodian;
    return plugin?.settings?.backendSettings?.claudeCode?.sandbox;
  } catch {
    return undefined;
  }
}

const DEFAULT_SANDBOX_SETTINGS: ClaudeCodeSandboxSettings = {
  enabled: false,
  failIfUnavailable: false,
  autoAllowBashIfSandboxed: false,
  excludedCommands: [],
  allowUnsandboxedCommands: true,
  filesystem: { allowWrite: [], denyWrite: [], denyRead: [] },
  network: { allowedDomains: [], deniedDomains: [] },
  enableWeakerNestedSandbox: false,
  enableWeakerNetworkIsolation: false,
  ripgrep: { command: '', args: [] },
};

export class SandboxConfigBadgeCoordinator {
  private containerEl: HTMLElement | null = null;
  private badgeEl: HTMLElement | null = null;

  mount(containerEl: HTMLElement): void {
    this.destroy();
    this.containerEl = containerEl;
    this.render();
  }

  update(): void {
    this.render();
  }

  applyLocaleTexts(): void {
    this.render();
  }

  destroy(): void {
    this.badgeEl = null;
    this.containerEl = null;
  }

  private render(): void {
    if (!this.containerEl) {
      return;
    }

    // Remove existing badge
    const existing = this.containerEl.querySelector('.opencodian-sandbox-config-badge');
    if (existing) {
      existing.remove();
    }

    const settings = readSandboxSettingsFromPlugin() ?? DEFAULT_SANDBOX_SETTINGS;
    if (!settings.enabled) {
      this.badgeEl = null;
      return;
    }

    // Build sub-policy summary
    const subPolicyCount = this.countActiveSubPolicies(settings);
    const label = subPolicyCount > 0
      ? t('settings.claudeCode.sandbox.chatBadge.withPolicies', { count: subPolicyCount })
      : t('settings.claudeCode.sandbox.chatBadge.basic');

    this.badgeEl = this.containerEl.createDiv({
      cls: 'opencodian-sandbox-config-badge',
      attr: {
        'data-sandbox-enabled': 'true',
        'data-sandbox-sub-policies': String(subPolicyCount),
        'aria-label': label,
      },
    });

    const iconEl = this.badgeEl.createSpan({ cls: 'opencodian-sandbox-config-badge-icon' });
    setIcon(iconEl, 'shield-check');

    this.badgeEl.createSpan({
      cls: 'opencodian-sandbox-config-badge-text',
      text: label,
    });

    // Build tooltip with detailed config
    const tooltip = this.buildTooltip(settings);
    this.badgeEl.setAttribute('title', tooltip);
  }

  private countActiveSubPolicies(settings: ClaudeCodeSandboxSettings): number {
    let count = 0;
    if (settings.excludedCommands.length > 0) count++;
    if (!settings.allowUnsandboxedCommands) count++;
    if (settings.filesystem.allowWrite.length > 0) count++;
    if (settings.filesystem.denyWrite.length > 0) count++;
    if (settings.filesystem.denyRead.length > 0) count++;
    if (settings.network.allowedDomains.length > 0) count++;
    if (settings.network.deniedDomains.length > 0) count++;
    if (settings.enableWeakerNestedSandbox) count++;
    if (settings.enableWeakerNetworkIsolation) count++;
    if (settings.ripgrep.command.trim().length > 0) count++;
    return count;
  }

  private buildTooltip(settings: ClaudeCodeSandboxSettings): string {
    const lines: string[] = [
      t('settings.claudeCode.sandbox.chatBadge.tooltipHeader'),
    ];

    lines.push(`${t('settings.claudeCode.sandbox.chatBadge.tooltip.failIfUnavailable')}: ${settings.failIfUnavailable ? t('settings.claudeCode.sandbox.chatBadge.tooltip.yes') : t('settings.claudeCode.sandbox.chatBadge.tooltip.no')}`);
    lines.push(`${t('settings.claudeCode.sandbox.chatBadge.tooltip.autoAllowBash')}: ${settings.autoAllowBashIfSandboxed ? t('settings.claudeCode.sandbox.chatBadge.tooltip.yes') : t('settings.claudeCode.sandbox.chatBadge.tooltip.no')}`);

    if (settings.excludedCommands.length > 0) {
      lines.push(`${t('settings.claudeCode.sandbox.chatBadge.tooltip.excluded')}: ${settings.excludedCommands.join(', ')}`);
    }
    if (!settings.allowUnsandboxedCommands) {
      lines.push(t('settings.claudeCode.sandbox.chatBadge.tooltip.unsandboxedBlocked'));
    }
    if (settings.filesystem.allowWrite.length > 0) {
      lines.push(`${t('settings.claudeCode.sandbox.chatBadge.tooltip.fsAllowWrite')}: ${settings.filesystem.allowWrite.join(', ')}`);
    }
    if (settings.filesystem.denyWrite.length > 0) {
      lines.push(`${t('settings.claudeCode.sandbox.chatBadge.tooltip.fsDenyWrite')}: ${settings.filesystem.denyWrite.join(', ')}`);
    }
    if (settings.filesystem.denyRead.length > 0) {
      lines.push(`${t('settings.claudeCode.sandbox.chatBadge.tooltip.fsDenyRead')}: ${settings.filesystem.denyRead.join(', ')}`);
    }
    if (settings.network.allowedDomains.length > 0) {
      lines.push(`${t('settings.claudeCode.sandbox.chatBadge.tooltip.netAllowed')}: ${settings.network.allowedDomains.join(', ')}`);
    }
    if (settings.network.deniedDomains.length > 0) {
      lines.push(`${t('settings.claudeCode.sandbox.chatBadge.tooltip.netDenied')}: ${settings.network.deniedDomains.join(', ')}`);
    }
    if (settings.enableWeakerNestedSandbox) {
      lines.push(t('settings.claudeCode.sandbox.chatBadge.tooltip.weakerNested'));
    }
    if (settings.enableWeakerNetworkIsolation) {
      lines.push(t('settings.claudeCode.sandbox.chatBadge.tooltip.weakerNet'));
    }
    if (settings.ripgrep.command.trim().length > 0) {
      lines.push(`${t('settings.claudeCode.sandbox.chatBadge.tooltip.ripgrep')}: ${settings.ripgrep.command}`);
    }

    lines.push(t('settings.claudeCode.sandbox.chatBadge.tooltipReadback'));

    return lines.join('\n');
  }
}
