/**
 * AdditionalDirectoriesConfigBadgeCoordinator — read-only configured-scope badge.
 *
 * Shows Claude Code additionalDirectories in the chat toolbar as a requested
 * next-query scope indicator. This is a readback surface only: the SDK option
 * wiring is verified elsewhere, but actual directory expansion is opaque.
 */
import { setIcon } from 'obsidian';

import { t } from '../../../i18n';

interface LiveOpenCodianPluginWithClaudeDirectories {
  settings?: {
    backendSettings?: {
      claudeCode?: {
        additionalDirectories?: unknown;
      };
    };
  };
}

function readOpenCodianPlugin(): LiveOpenCodianPluginWithClaudeDirectories | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (globalThis as any).app?.plugins?.plugins?.opencodian ?? null;
  } catch {
    return null;
  }
}

function readAdditionalDirectoriesFromPlugin(): string[] {
  const value = readOpenCodianPlugin()?.settings?.backendSettings?.claudeCode?.additionalDirectories;
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export class AdditionalDirectoriesConfigBadgeCoordinator {
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

    const existing = this.containerEl.querySelector('.opencodian-additional-directories-config-badge');
    existing?.remove();

    const directories = readAdditionalDirectoriesFromPlugin();
    if (directories.length === 0) {
      this.badgeEl = null;
      return;
    }

    const label = directories.length === 1
      ? t('settings.claudeCode.additionalDirectories.chatBadge.one')
      : t('settings.claudeCode.additionalDirectories.chatBadge.many', { count: directories.length });

    this.badgeEl = this.containerEl.createDiv({
      cls: 'opencodian-additional-directories-config-badge',
      attr: {
        'data-additional-directory-count': String(directories.length),
        'aria-label': label,
      },
    });

    const iconEl = this.badgeEl.createSpan({
      cls: 'opencodian-additional-directories-config-badge-icon',
    });
    setIcon(iconEl, 'folder-plus');

    this.badgeEl.createSpan({
      cls: 'opencodian-additional-directories-config-badge-text',
      text: label,
    });

    this.badgeEl.setAttribute('title', this.buildTooltip(directories));
  }

  private buildTooltip(directories: string[]): string {
    const lines = [
      t('settings.claudeCode.additionalDirectories.chatBadge.tooltipHeader'),
      ...directories.map((directory) => `- ${directory}`),
      t('settings.claudeCode.additionalDirectories.chatBadge.tooltipLifecycle'),
      t('settings.claudeCode.additionalDirectories.chatBadge.tooltipReadback'),
    ];
    return lines.join('\n');
  }
}
