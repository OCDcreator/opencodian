/**
 * CodexRuntimeDefaultsBadgeCoordinator — quiet readback of non-default Codex runtime defaults.
 *
 * Shows small toolbar chips only when Codex settings materially affect the next
 * thread or clarify a non-default state. The badge is intentionally silent when
 * everything is at default:
 *   - networkAccessEnabled = false  → hidden
 *   - webSearchMode = 'cached'      → hidden
 *   - additionalDirectories empty   → hidden
 *
 * This follows the same readback-only pattern as the Claude Code sandbox and
 * additional-directories badges, and reads the live plugin instance via the
 * Obsidian global `app` object to avoid coupling to OpenCodianView.ts.
 */
import { setIcon } from 'obsidian';

import type { CodexWebSearchMode } from '../../../core/types/settings';
import { t } from '../../../i18n';

interface LiveOpenCodianPlugin {
  settings?: {
    activeBackend?: string;
    backendSettings?: {
      codex?: {
        networkAccessEnabled?: unknown;
        webSearchMode?: unknown;
        additionalDirectories?: unknown;
      };
    };
  };
}

function readOpenCodianPlugin(): LiveOpenCodianPlugin | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (globalThis as any).app?.plugins?.plugins?.opencodian ?? null;
  } catch {
    return null;
  }
}

function readNetworkAccessEnabled(): boolean {
  return readOpenCodianPlugin()?.settings?.backendSettings?.codex?.networkAccessEnabled === true;
}

function readWebSearchMode(): CodexWebSearchMode {
  const value = readOpenCodianPlugin()?.settings?.backendSettings?.codex?.webSearchMode;
  if (value === 'disabled' || value === 'cached' || value === 'live') {
    return value;
  }
  return 'cached';
}

function readAdditionalDirectories(): string[] {
  const value = readOpenCodianPlugin()?.settings?.backendSettings?.codex?.additionalDirectories;
  if (typeof value !== 'string') {
    return [];
  }
  return value
    .split('\n')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

type BadgeKind = 'network' | 'webSearch' | 'additionalDirectories';

interface BadgeItem {
  kind: BadgeKind;
  text: string;
  tooltip: string;
  icon: string;
}

export class CodexRuntimeDefaultsBadgeCoordinator {
  private containerEl: HTMLElement | null = null;

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
    this.containerEl?.remove();
    this.containerEl = null;
  }

  private render(): void {
    if (!this.containerEl) {
      return;
    }

    this.containerEl.empty();

    const badges = this.resolveBadges();
    if (badges.length === 0) {
      // Keep container hidden by removing it from layout via display:none when
      // there is nothing to show. The caller's pruneEmptyToolbar() will remove
      // it from the toolbar if it stays empty.
      this.containerEl.style.display = 'none';
      return;
    }

    this.containerEl.style.display = '';
    for (const badge of badges) {
      this.renderBadge(badge);
    }
  }

  private resolveBadges(): BadgeItem[] {
    const badges: BadgeItem[] = [];

    if (readNetworkAccessEnabled()) {
      badges.push({
        kind: 'network',
        text: t('chat.codex.runtimeDefaultsBadge.network.label'),
        tooltip: t('chat.codex.runtimeDefaultsBadge.network.tooltip'),
        icon: 'globe',
      });
    }

    const webSearchMode = readWebSearchMode();
    if (webSearchMode !== 'cached') {
      badges.push({
        kind: 'webSearch',
        text: t(`chat.codex.runtimeDefaultsBadge.webSearch.${webSearchMode}`),
        tooltip: t('chat.codex.runtimeDefaultsBadge.webSearch.tooltip'),
        icon: 'search',
      });
    }

    const additionalDirectories = readAdditionalDirectories();
    if (additionalDirectories.length > 0) {
      badges.push({
        kind: 'additionalDirectories',
        text: t('chat.codex.runtimeDefaultsBadge.additionalDirectories.label_one', {
          count: additionalDirectories.length,
        }),
        tooltip: [
          t('chat.codex.runtimeDefaultsBadge.additionalDirectories.tooltipHeader'),
          ...additionalDirectories.map((directory) => `- ${directory}`),
          t('chat.codex.runtimeDefaultsBadge.tooltipLifecycle'),
          t('chat.codex.runtimeDefaultsBadge.tooltipReadback'),
        ].join('\n'),
        icon: 'folder-plus',
      });
    }

    return badges;
  }

  private renderBadge(item: BadgeItem): void {
    if (!this.containerEl) {
      return;
    }

    const badgeEl = this.containerEl.createDiv({
      cls: 'opencodian-codex-runtime-defaults-badge',
      attr: {
        'data-badge-kind': item.kind,
        'aria-label': item.text,
      },
    });

    const iconEl = badgeEl.createSpan({ cls: 'opencodian-codex-runtime-defaults-badge-icon' });
    setIcon(iconEl, item.icon);

    badgeEl.createSpan({
      cls: 'opencodian-codex-runtime-defaults-badge-text',
      text: item.text,
    });

    badgeEl.setAttribute('title', item.tooltip);
  }
}
