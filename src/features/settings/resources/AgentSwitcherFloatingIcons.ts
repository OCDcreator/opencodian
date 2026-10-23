import { addIcon, setIcon } from 'obsidian';

import type { AgentBackendKind } from '../../../core/types/chat';
import { t } from '../../../i18n';
import {
  LOBEHUB_ICON_MANIFEST,
  type LobehubManifestStaticVariant,
} from '../../../utils/icons/lobehubIconManifest';
import { BACKEND_OPTIONS } from '../backends/opencode/SettingsBackendSection';

interface AgentSwitcherIconConfig {
  fallbackIcon: string;
  iconId?: string;
  variant?: LobehubManifestStaticVariant;
}

const LOBEHUB_ICON_MANIFEST_BY_ID = new Map(LOBEHUB_ICON_MANIFEST.map((entry) => [entry.iconId, entry]));

// User-supplied Pi artwork, scaled from its 800-unit viewBox to Obsidian's 100-unit icon canvas.
export const PI_BACKEND_ICON = 'opencodian-pi';
addIcon(PI_BACKEND_ICON, '<g transform="scale(0.125)" fill="currentColor" stroke="none"><path fill-rule="evenodd" d="M165.29 165.29 H517.36 V400 H400 V517.36 H282.65 V634.72 H165.29 Z M282.65 282.65 V400 H400 V282.65 Z"/><path d="M517.36 400 H634.72 V634.72 H517.36 Z"/></g>');

// User-supplied ZCode artwork (30-unit viewBox), scaled to Obsidian's 100-unit icon canvas.
export const ZCODE_BACKEND_ICON = 'opencodian-zcode';
addIcon(ZCODE_BACKEND_ICON, '<g transform="scale(3.3333)"><path fill="#2D2D2D" d="M24.51 28.51H5.49c-2.21 0-4-1.79-4-4V5.49c0-2.21 1.79-4 4-4h19.03c2.21 0 4 1.79 4 4v19.03c0 2.21-1.79 4-4 4z"/><path fill="#fff" d="M15.47 7.1l-1.3 1.85c-.2.29-.54.47-.9.47h-7.1V7.09C6.16 7.1 15.47 7.1 15.47 7.1z"/><path fill="#fff" d="M24.3 7.1L13.14 22.91H5.7L16.86 7.1z"/><path fill="#fff" d="M14.53 22.91l1.31-1.86c.2-.29.54-.47.9-.47h7.09v2.33h-9.3z"/></g>');

// DeepSeek Harness favicon supplied by the upstream project.
export const DSH_BACKEND_ICON = 'opencodian-dsh';
addIcon(DSH_BACKEND_ICON, '<g transform="scale(2)" stroke="none"><path d="M48.8354 10.0479C48.3232 9.79199 48.1025 10.2798 47.8032 10.5278C47.7007 10.6079 47.6143 10.7119 47.5273 10.8076C46.7793 11.624 45.9048 12.1597 44.7622 12.0957C43.0923 12 41.666 12.5356 40.4058 13.8398C40.1377 12.2319 39.2476 11.272 37.8926 10.6558C37.1836 10.3359 36.4668 10.0156 35.9702 9.31982C35.6235 8.82373 35.5293 8.27197 35.356 7.72754C35.2456 7.3999 35.1353 7.06396 34.7651 7.00781C34.3633 6.94385 34.2056 7.2876 34.0479 7.57568C33.418 8.75195 33.1733 10.0479 33.1973 11.3599C33.2524 14.312 34.4736 16.6641 36.8999 18.3359C37.1758 18.5278 37.2466 18.7197 37.1597 19C36.9946 19.5757 36.7974 20.1357 36.624 20.7119C36.5137 21.0801 36.3486 21.1597 35.9624 21C34.6309 20.4321 33.481 19.5918 32.4644 18.5757C30.7393 16.8721 29.1792 14.9917 27.2334 13.52C26.7764 13.1758 26.3193 12.856 25.8467 12.5518C23.8618 10.584 26.1069 8.96777 26.627 8.77588C27.1704 8.57568 26.8159 7.8877 25.0591 7.896C23.3022 7.90381 21.6953 8.50391 19.647 9.30371C19.3477 9.42383 19.0322 9.51172 18.7095 9.58398C16.8501 9.22363 14.9199 9.14355 12.9033 9.37598C9.10596 9.80762 6.07275 11.6396 3.84326 14.7681C1.16455 18.5278 0.53418 22.7998 1.30664 27.2559C2.11768 31.9521 4.46582 35.8398 8.07373 38.8799C11.8159 42.0322 16.1255 43.5762 21.041 43.2803C24.0269 43.104 27.3516 42.6963 31.1016 39.4561C32.0469 39.936 33.0396 40.1279 34.686 40.272C35.9546 40.3921 37.1758 40.208 38.1211 40.0078C39.6021 39.688 39.4995 38.2881 38.9639 38.0322C34.623 35.9678 35.5762 36.8081 34.71 36.1279C36.9155 33.4639 40.2402 30.6958 41.54 21.728C41.6426 21.0161 41.5557 20.5679 41.54 19.9917C41.5322 19.6396 41.6108 19.5039 42.0049 19.4639C43.0923 19.3359 44.1479 19.0317 45.1167 18.4878C47.9292 16.9199 49.064 14.3438 49.3315 11.2559C49.3711 10.7837 49.3237 10.2959 48.8354 10.0479ZM24.3262 37.8398C20.1196 34.4639 18.0791 33.3521 17.2358 33.3999C16.4482 33.4482 16.5898 34.3682 16.7632 34.9678C16.9443 35.5601 17.1812 35.9683 17.5117 36.4878C17.7402 36.832 17.8979 37.3442 17.2832 37.728C15.9282 38.584 13.5728 37.4399 13.4624 37.3838C10.7207 35.7358 8.42822 33.5601 6.81348 30.584C5.25342 27.7197 4.34766 24.6479 4.19775 21.3677C4.1582 20.5757 4.38672 20.2959 5.15869 20.1519C6.17529 19.96 7.22314 19.9199 8.23926 20.0718C12.5327 20.7119 16.1885 22.6719 19.2529 25.7759C21.002 27.5439 22.3252 29.6558 23.6885 31.7202C25.1377 33.9121 26.6978 36 28.6831 37.7119C29.3843 38.312 29.9434 38.7681 30.479 39.104C28.8643 39.2881 26.1699 39.3281 24.3262 37.8398ZM26.3433 24.6001C26.3433 24.248 26.6191 23.9678 26.9658 23.9678C27.0444 23.9678 27.1152 23.9839 27.1782 24.0078C27.2651 24.04 27.3438 24.0879 27.4067 24.1602C27.5171 24.272 27.5801 24.4321 27.5801 24.6001C27.5801 24.9521 27.3042 25.2319 26.9575 25.2319C26.6108 25.2319 26.3433 24.9521 26.3433 24.6001ZM32.6064 27.8799C32.2046 28.0479 31.8027 28.1919 31.4165 28.208C30.8179 28.2397 30.1641 27.9922 29.8096 27.688C29.2583 27.2158 28.8643 26.9521 28.6987 26.1279C28.6279 25.7759 28.6675 25.2319 28.7305 24.9199C28.8721 24.248 28.7144 23.8159 28.2495 23.4238C27.8716 23.104 27.3911 23.0161 26.8633 23.0161C26.666 23.0161 26.4849 22.9277 26.3511 22.856C26.1304 22.7441 25.9492 22.4639 26.1226 22.1201C26.1777 22.0078 26.4458 21.7358 26.5088 21.688C27.2256 21.272 28.0527 21.4077 28.8169 21.7197C29.5259 22.0161 30.0615 22.5601 30.834 23.3281C31.6216 24.2559 31.7632 24.5117 32.2124 25.208C32.5669 25.752 32.8901 26.312 33.1104 26.9521C33.2446 27.3521 33.0713 27.6802 32.6064 27.8799Z" fill="#4D6BFE" fill-rule="nonzero"/></g>');

const AGENT_ICON_BY_BACKEND: Record<AgentBackendKind, AgentSwitcherIconConfig> = {
  opencode: { fallbackIcon: 'bot', iconId: 'opencode', variant: 'color' },
  opencode2: { fallbackIcon: 'bot', iconId: 'opencode', variant: 'color' },
  'claude-code': { fallbackIcon: 'sparkles', iconId: 'claudecode', variant: 'color' },
  codex: { fallbackIcon: 'code-2', iconId: 'codex', variant: 'color' },
  copilot: { fallbackIcon: 'github', iconId: 'githubcopilot', variant: 'color' },
  pi: { fallbackIcon: PI_BACKEND_ICON },
  zcode: { fallbackIcon: ZCODE_BACKEND_ICON },
  dsh: { fallbackIcon: DSH_BACKEND_ICON },
};

interface AgentSwitcherOptions {
  selectedAgent: AgentBackendKind | undefined;
  enabledAgents: AgentBackendKind[];
  onSelect: (agent: AgentBackendKind) => void;
}

type FloatingSwitcherCleanup = () => void;

const FLOATING_SWITCHER_CLEANUP_BY_OWNER = new WeakMap<HTMLElement, FloatingSwitcherCleanup>();

export function renderAgentSwitcherFloatingIcons(
  containerEl: HTMLElement,
  options: AgentSwitcherOptions,
): void {
  removeExistingFloatingSwitcher(containerEl);

  if (options.enabledAgents.length < 2) {
    return;
  }

  const anchorEl = containerEl.createDiv({ cls: 'opencodian-agent-switcher-hover-zone' });
  const floatingEl = containerEl.createDiv({ cls: 'opencodian-agent-switcher-floating' });
  const pinCleanup = pinAgentSwitcherToSettingsEdge(containerEl, floatingEl, anchorEl);
  const cleanup: FloatingSwitcherCleanup = () => {
    pinCleanup();
    anchorEl.remove();
  };
  FLOATING_SWITCHER_CLEANUP_BY_OWNER.set(containerEl, cleanup);

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

export function renderAgentSwitcherHeaderIcons(
  containerEl: HTMLElement,
  options: AgentSwitcherOptions,
): void {
  if (options.enabledAgents.length < 2) {
    return;
  }

  const groupEl = containerEl.createSpan({
    cls: 'opencodian-agent-switcher-header-icons',
    attr: {
      'aria-label': t('settings.agent.default'),
      role: 'group',
    },
  });

  for (const agent of options.enabledAgents) {
    const backendOption = BACKEND_OPTIONS.find((candidate) => candidate.id === agent);
    if (!backendOption) {
      continue;
    }

    const selected = options.selectedAgent === agent;
    const label = t(backendOption.labelKey);
    const iconButtonEl = groupEl.createEl('button', {
      cls: `opencodian-agent-switcher-header-icon${selected ? ' opencodian-agent-switcher-selected' : ''}`,
      attr: {
        'aria-label': label,
        'aria-pressed': selected ? 'true' : 'false',
        title: label,
      },
    });
    iconButtonEl.type = 'button';
    renderAgentSwitcherIcon(iconButtonEl, AGENT_ICON_BY_BACKEND[agent]);
    iconButtonEl.addEventListener('click', () => {
      iconButtonEl.classList.add('opencodian-agent-switcher-clicked');
      window.setTimeout(() => {
        iconButtonEl.classList.remove('opencodian-agent-switcher-clicked');
      }, 220);
      options.onSelect(agent);
    });
  }
}

function removeExistingFloatingSwitcher(ownerContainer: HTMLElement): void {
  const cleanup = FLOATING_SWITCHER_CLEANUP_BY_OWNER.get(ownerContainer);
  if (!cleanup) {
    return;
  }

  cleanup();
  FLOATING_SWITCHER_CLEANUP_BY_OWNER.delete(ownerContainer);
}

function pinAgentSwitcherToSettingsEdge(
  containerEl: HTMLElement,
  floatingEl: HTMLElement,
  anchorEl: HTMLElement,
): FloatingSwitcherCleanup {
  const ownerDocument = containerEl.ownerDocument;
  const syncPosition = () => {
    const rect = containerEl.getBoundingClientRect();
    floatingEl.style.setProperty(
      '--opencodian-agent-switcher-fixed-left',
      `${Math.max(0, Math.round(rect.left))}px`,
    );
  };
  const syncModalVisibility = () => {
    const modalInFront = isUnrelatedSettingsModalOpen(ownerDocument, containerEl);
    floatingEl.toggleClass('is-hidden-behind-modal', modalInFront);
    floatingEl.setAttribute('aria-hidden', modalInFront ? 'true' : 'false');
  };

  syncPosition();
  syncModalVisibility();
  let cleanedUp = false;
  const resizeObserver = typeof ResizeObserver !== 'undefined'
    ? new ResizeObserver(syncPosition)
    : null;
  let anchorWasConnected = ownerDocument.body.contains(anchorEl);
  let cleanup: FloatingSwitcherCleanup = () => {};
  const mutationObserver = new MutationObserver(() => {
    const anchorIsConnected = ownerDocument.body.contains(anchorEl);
    if (!anchorWasConnected && anchorIsConnected) {
      anchorWasConnected = true;
      syncPosition();
      syncModalVisibility();
      return;
    }
    if (anchorWasConnected && !anchorIsConnected) {
      cleanup();
      return;
    }
    syncModalVisibility();
  });

  cleanup = () => {
    if (cleanedUp) {
      return;
    }

    cleanedUp = true;
    window.removeEventListener('resize', syncPosition);
    resizeObserver?.disconnect();
    mutationObserver.disconnect();
    floatingEl.remove();
  };

  ownerDocument.body.appendChild(floatingEl);
  if (!ownerDocument.body.contains(floatingEl)) {
    return cleanup;
  }

  window.addEventListener('resize', syncPosition);
  resizeObserver?.observe(containerEl);
  mutationObserver.observe(ownerDocument.body, {
    childList: true,
    subtree: true,
  });

  return cleanup;
}

function isUnrelatedSettingsModalOpen(ownerDocument: Document, containerEl: HTMLElement): boolean {
  return Array.from(ownerDocument.querySelectorAll<HTMLElement>('.modal.mod-settings'))
    .some((modalEl) => !modalEl.contains(containerEl));
}

function renderAgentSwitcherIcon(buttonEl: HTMLElement, icon: AgentSwitcherIconConfig): void {
  const urls = resolveLobehubAgentIconUrls(icon);
  if (!urls) {
    // The modifier class hides non-lobehub glyphs, so it must not survive on a
    // reused container after the backend loses its lobehub icon.
    buttonEl.removeClass('opencodian-agent-switcher-icon--lobehub');
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

export function renderAgentSwitcherBackendIcon(containerEl: HTMLElement, backend: AgentBackendKind): void {
  renderAgentSwitcherIcon(containerEl, AGENT_ICON_BY_BACKEND[backend]);
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
