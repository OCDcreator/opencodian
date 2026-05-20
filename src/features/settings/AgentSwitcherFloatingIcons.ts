import { setIcon } from 'obsidian';

import type { AgentBackendKind } from '../../core/types/chat';
import { t } from '../../i18n';
import {
  LOBEHUB_ICON_MANIFEST,
  type LobehubManifestStaticVariant,
} from '../../utils/icons/lobehubIconManifest';
import { BACKEND_OPTIONS } from './SettingsBackendSection';

interface AgentSwitcherIconConfig {
  fallbackIcon: string;
  iconId?: string;
  variant?: LobehubManifestStaticVariant;
}

const LOBEHUB_ICON_MANIFEST_BY_ID = new Map(LOBEHUB_ICON_MANIFEST.map((entry) => [entry.iconId, entry]));

const AGENT_ICON_BY_BACKEND: Record<AgentBackendKind, AgentSwitcherIconConfig> = {
  opencode: { fallbackIcon: 'bot', iconId: 'opencode', variant: 'color' },
  'claude-code': { fallbackIcon: 'sparkles', iconId: 'claudecode', variant: 'color' },
  codex: { fallbackIcon: 'code-2', iconId: 'codex', variant: 'color' },
  copilot: { fallbackIcon: 'github', iconId: 'githubcopilot', variant: 'color' },
  pi: { fallbackIcon: 'cpu', iconId: 'perplexity', variant: 'color' },
};

interface AgentSwitcherFloatingIconsOptions {
  selectedAgent: AgentBackendKind | undefined;
  enabledAgents: AgentBackendKind[];
  onSelect: (agent: AgentBackendKind) => void;
}

export function renderAgentSwitcherFloatingIcons(
  containerEl: HTMLElement,
  options: AgentSwitcherFloatingIconsOptions,
): void {
  if (options.enabledAgents.length < 2) {
    return;
  }

  const anchorEl = containerEl.createDiv({ cls: 'opencodian-agent-switcher-hover-zone' });
  const floatingEl = containerEl.createDiv({ cls: 'opencodian-agent-switcher-floating' });
  pinAgentSwitcherToSettingsEdge(containerEl, floatingEl, anchorEl);

  options.enabledAgents.forEach((agent, index) => {
    const backendOption = BACKEND_OPTIONS.find((candidate) => candidate.id === agent);
    if (!backendOption) {
      return;
    }

    const selected = options.selectedAgent === agent;
    const iconButtonEl = floatingEl.createEl('button', {
      cls: `opencodian-agent-switcher-icon entering${selected ? ' opencodian-agent-switcher-selected' : ''}`,
      attr: {
        'aria-label': t(backendOption.labelKey),
        'aria-pressed': selected ? 'true' : 'false',
      },
    });
    iconButtonEl.type = 'button';
    iconButtonEl.style.animationDelay = `${index * 50}ms`;
    renderAgentSwitcherIcon(iconButtonEl, AGENT_ICON_BY_BACKEND[agent]);
    window.setTimeout(() => {
      iconButtonEl.classList.remove('entering');
      iconButtonEl.style.animationDelay = `${index * 180}ms`;
    }, 350 + index * 50);
    iconButtonEl.addEventListener('click', () => {
      iconButtonEl.classList.add('opencodian-agent-switcher-clicked');
      window.setTimeout(() => {
        iconButtonEl.classList.remove('opencodian-agent-switcher-clicked');
      }, 260);
      options.onSelect(agent);
    });
  });
}

function pinAgentSwitcherToSettingsEdge(
  containerEl: HTMLElement,
  floatingEl: HTMLElement,
  anchorEl: HTMLElement,
): void {
  const ownerDocument = containerEl.ownerDocument;
  const syncPosition = () => {
    const rect = containerEl.getBoundingClientRect();
    floatingEl.style.setProperty(
      '--opencodian-agent-switcher-fixed-left',
      `${Math.max(0, Math.round(rect.left))}px`,
    );
  };

  syncPosition();
  ownerDocument.body.appendChild(floatingEl);

  if (!ownerDocument.body.contains(floatingEl)) {
    return;
  }

  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) {
      return;
    }

    cleanedUp = true;
    window.removeEventListener('resize', syncPosition);
    resizeObserver?.disconnect();
    mutationObserver.disconnect();
    floatingEl.remove();
  };
  const resizeObserver = typeof ResizeObserver !== 'undefined'
    ? new ResizeObserver(syncPosition)
    : null;
  const mutationObserver = new MutationObserver(() => {
    if (!ownerDocument.body.contains(anchorEl)) {
      cleanup();
    }
  });

  window.addEventListener('resize', syncPosition);
  resizeObserver?.observe(containerEl);
  mutationObserver.observe(ownerDocument.body, {
    childList: true,
    subtree: true,
  });
}

function renderAgentSwitcherIcon(buttonEl: HTMLElement, icon: AgentSwitcherIconConfig): void {
  const urls = resolveLobehubAgentIconUrls(icon);
  if (!urls) {
    setIcon(buttonEl, icon.fallbackIcon);
    return;
  }

  buttonEl.addClass('opencodian-agent-switcher-icon--lobehub');
  const iconEl = buttonEl.createSpan({
    cls: 'opencodian-agent-switcher-lobehub-icon',
    attr: {
      'aria-hidden': 'true',
      'data-lobehub-icon': icon.iconId ?? '',
      'data-lobehub-variant': icon.variant ?? 'color',
    },
  });
  renderThemeIconImage(iconEl, urls.light, 'light');
  renderThemeIconImage(iconEl, urls.dark, 'dark');
}

function renderThemeIconImage(
  iconEl: HTMLElement,
  src: string,
  theme: 'light' | 'dark',
): void {
  iconEl.createEl('img', {
    cls: `opencodian-agent-switcher-lobehub-img opencodian-agent-switcher-lobehub-img--${theme}`,
    attr: {
      alt: '',
      decoding: 'async',
      draggable: 'false',
      loading: 'lazy',
      src,
    },
  });
}

function resolveLobehubAgentIconUrls(icon: AgentSwitcherIconConfig): Record<'light' | 'dark', string> | null {
  if (!icon.iconId) {
    return null;
  }

  const manifestEntry = LOBEHUB_ICON_MANIFEST_BY_ID.get(icon.iconId);
  const preferredVariants: LobehubManifestStaticVariant[] = [
    icon.variant ?? 'color',
    'mono',
  ];

  for (const variant of preferredVariants) {
    const variantEntry = manifestEntry?.variants[variant];
    if (!variantEntry?.staticSupport) {
      continue;
    }

    if (variantEntry.urls.webp?.light && variantEntry.urls.webp.dark) {
      return variantEntry.urls.webp;
    }

    if (variantEntry.urls.png?.light && variantEntry.urls.png.dark) {
      return variantEntry.urls.png;
    }

    if (variantEntry.urls.svg) {
      return {
        light: variantEntry.urls.svg,
        dark: variantEntry.urls.svg,
      };
    }
  }

  return null;
}
