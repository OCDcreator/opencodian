import { addIcon, setIcon } from 'obsidian';

import type { AgentBackendKind } from '../../../core/types/chat';
import { t } from '../../../i18n';
import type { LobehubManifestStaticVariant } from '../../../utils/icons/lobehubIconManifest';
import { BACKEND_OPTIONS } from '../backends/opencode/SettingsBackendSection';

interface AgentSwitcherIconConfig {
  fallbackIcon: string;
  iconId?: string;
  variant?: LobehubManifestStaticVariant;
}

/**
 * @license LobeHub backend artwork, @lobehub/icons-static-svg 1.101.0.
 * https://github.com/lobehub/lobe-icons
 *
 * MIT License
 *
 * Copyright (c) 2023 LobeHub
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
// Fixed backend marks are embedded once, shared by Settings and Chat, and work offline.
const BUNDLED_AGENT_ICON_SVGS: Record<string, string> = {
  "opencode": "<svg fill=\"currentColor\" fill-rule=\"evenodd\" height=\"1em\" style=\"flex:none;line-height:1\" viewBox=\"0 0 24 24\" width=\"1em\" xmlns=\"http://www.w3.org/2000/svg\"><title>opencode</title><path d=\"M16 6H8v12h8V6zm4 16H4V2h16v20z\"></path></svg>",
  "claudecode": "<svg height=\"1em\" style=\"flex:none;line-height:1\" viewBox=\"0 0 24 24\" width=\"1em\" xmlns=\"http://www.w3.org/2000/svg\"><title>Claude Code</title><path clip-rule=\"evenodd\" d=\"M20.998 10.949H24v3.102h-3v3.028h-1.487V20H18v-2.921h-1.487V20H15v-2.921H9V20H7.488v-2.921H6V20H4.487v-2.921H3V14.05H0V10.95h3V5h17.998v5.949zM6 10.949h1.488V8.102H6v2.847zm10.51 0H18V8.102h-1.49v2.847z\" fill=\"#D97757\" fill-rule=\"evenodd\"></path></svg>",
  "codex": "<svg height=\"1em\" style=\"flex:none;line-height:1\" viewBox=\"0 0 24 24\" width=\"1em\" xmlns=\"http://www.w3.org/2000/svg\"><title>Codex</title><path d=\"M19.503 0H4.496A4.496 4.496 0 000 4.496v15.007A4.496 4.496 0 004.496 24h15.007A4.496 4.496 0 0024 19.503V4.496A4.496 4.496 0 0019.503 0z\" fill=\"#fff\"></path><path d=\"M9.064 3.344a4.578 4.578 0 012.285-.312c1 .115 1.891.54 2.673 1.275.01.01.024.017.037.021a.09.09 0 00.043 0 4.55 4.55 0 013.046.275l.047.022.116.057a4.581 4.581 0 012.188 2.399c.209.51.313 1.041.315 1.595a4.24 4.24 0 01-.134 1.223.123.123 0 00.03.115c.594.607.988 1.33 1.183 2.17.289 1.425-.007 2.71-.887 3.854l-.136.166a4.548 4.548 0 01-2.201 1.388.123.123 0 00-.081.076c-.191.551-.383 1.023-.74 1.494-.9 1.187-2.222 1.846-3.711 1.838-1.187-.006-2.239-.44-3.157-1.302a.107.107 0 00-.105-.024c-.388.125-.78.143-1.204.138a4.441 4.441 0 01-1.945-.466 4.544 4.544 0 01-1.61-1.335c-.152-.202-.303-.392-.414-.617a5.81 5.81 0 01-.37-.961 4.582 4.582 0 01-.014-2.298.124.124 0 00.006-.056.085.085 0 00-.027-.048 4.467 4.467 0 01-1.034-1.651 3.896 3.896 0 01-.251-1.192 5.189 5.189 0 01.141-1.6c.337-1.112.982-1.985 1.933-2.618.212-.141.413-.251.601-.33.215-.089.43-.164.646-.227a.098.098 0 00.065-.066 4.51 4.51 0 01.829-1.615 4.535 4.535 0 011.837-1.388zm3.482 10.565a.637.637 0 000 1.272h3.636a.637.637 0 100-1.272h-3.636zM8.462 9.23a.637.637 0 00-1.106.631l1.272 2.224-1.266 2.136a.636.636 0 101.095.649l1.454-2.455a.636.636 0 00.005-.64L8.462 9.23z\" fill=\"url(#lobe-icons-codex-_R_0_)\"></path><defs><linearGradient gradientUnits=\"userSpaceOnUse\" id=\"lobe-icons-codex-_R_0_\" x1=\"12\" x2=\"12\" y1=\"3\" y2=\"21\"><stop stop-color=\"#B1A7FF\"></stop><stop offset=\".5\" stop-color=\"#7A9DFF\"></stop><stop offset=\"1\" stop-color=\"#3941FF\"></stop></linearGradient></defs></svg>",
  "githubcopilot": "<svg fill=\"currentColor\" fill-rule=\"evenodd\" height=\"1em\" style=\"flex:none;line-height:1\" viewBox=\"0 0 24 24\" width=\"1em\" xmlns=\"http://www.w3.org/2000/svg\"><title>GithubCopilot</title><path d=\"M19.245 5.364c1.322 1.36 1.877 3.216 2.11 5.817.622 0 1.2.135 1.592.654l.73.964c.21.278.323.61.323.955v2.62c0 .339-.173.669-.453.868C20.239 19.602 16.157 21.5 12 21.5c-4.6 0-9.205-2.583-11.547-4.258-.28-.2-.452-.53-.453-.868v-2.62c0-.345.113-.679.321-.956l.73-.963c.392-.517.974-.654 1.593-.654l.029-.297c.25-2.446.81-4.213 2.082-5.52 2.461-2.54 5.71-2.851 7.146-2.864h.198c1.436.013 4.685.323 7.146 2.864zm-7.244 4.328c-.284 0-.613.016-.962.05-.123.447-.305.85-.57 1.108-1.05 1.023-2.316 1.18-2.994 1.18-.638 0-1.306-.13-1.851-.464-.516.165-1.012.403-1.044.996a65.882 65.882 0 00-.063 2.884l-.002.48c-.002.563-.005 1.126-.013 1.69.002.326.204.63.51.765 2.482 1.102 4.83 1.657 6.99 1.657 2.156 0 4.504-.555 6.985-1.657a.854.854 0 00.51-.766c.03-1.682.006-3.372-.076-5.053-.031-.596-.528-.83-1.046-.996-.546.333-1.212.464-1.85.464-.677 0-1.942-.157-2.993-1.18-.266-.258-.447-.661-.57-1.108-.32-.032-.64-.049-.96-.05zm-2.525 4.013c.539 0 .976.426.976.95v1.753c0 .525-.437.95-.976.95a.964.964 0 01-.976-.95v-1.752c0-.525.437-.951.976-.951zm5 0c.539 0 .976.426.976.95v1.753c0 .525-.437.95-.976.95a.964.964 0 01-.976-.95v-1.752c0-.525.437-.951.976-.951zM7.635 5.087c-1.05.102-1.935.438-2.385.906-.975 1.037-.765 3.668-.21 4.224.405.394 1.17.657 1.995.657h.09c.649-.013 1.785-.176 2.73-1.11.435-.41.705-1.433.675-2.47-.03-.834-.27-1.52-.63-1.813-.39-.336-1.275-.482-2.265-.394zm6.465.394c-.36.292-.6.98-.63 1.813-.03 1.037.24 2.06.675 2.47.968.957 2.136 1.104 2.776 1.11h.044c.825 0 1.59-.263 1.995-.657.555-.556.765-3.187-.21-4.224-.45-.468-1.335-.804-2.385-.906-.99-.088-1.875.058-2.265.394zM12 7.615c-.24 0-.525.015-.84.044.03.16.045.336.06.526l-.001.159a2.94 2.94 0 01-.014.25c.225-.022.425-.027.612-.028h.366c.187 0 .387.006.612.028-.015-.146-.015-.277-.015-.409.015-.19.03-.365.06-.526a9.29 9.29 0 00-.84-.044z\"></path></svg>",
};
const BUNDLED_AGENT_ICON_URLS = new Map<string, Record<'light' | 'dark', string>>(
  Object.entries(BUNDLED_AGENT_ICON_SVGS).map(([id, svg]) => [id, {
    light: `data:image/svg+xml,${encodeURIComponent(svg.replace(/currentColor/g, '#211E1E'))}`,
    dark: `data:image/svg+xml,${encodeURIComponent(svg.replace(/currentColor/g, '#F1ECEC'))}`,
  }]),
);

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
  let ownerDocument = containerEl.ownerDocument;
  let ownerWindow = ownerDocument.defaultView ?? window;
  let resizeObserver: ResizeObserver | null = null;
  let mutationObserver: MutationObserver | null = null;
  let anchorWasConnected = false;
  let cleanedUp = false;

  const disconnectOwner = () => {
    ownerWindow.removeEventListener('resize', syncPosition);
    ownerWindow.removeEventListener('pagehide', cleanup);
    resizeObserver?.disconnect();
    mutationObserver?.disconnect();
  };
  const cleanup = () => {
    if (cleanedUp) {
      return;
    }
    cleanedUp = true;
    disconnectOwner();
    floatingEl.remove();
  };
  const syncPosition = () => {
    if (cleanedUp) {
      return;
    }
    if (!anchorEl.isConnected) {
      if (anchorWasConnected) cleanup();
      return;
    }
    // Obsidian may render in the vault document, then adopt the settings
    // content into a separate window. Follow the connected anchor's owner.
    if (ownerDocument !== anchorEl.ownerDocument) {
      disconnectOwner();
      ownerDocument = anchorEl.ownerDocument;
      ownerWindow = ownerDocument.defaultView ?? window;
      observeOwner();
    }
    anchorWasConnected = true;
    if (floatingEl.parentElement !== ownerDocument.body) {
      ownerDocument.body.appendChild(floatingEl);
    }
    const rect = containerEl.getBoundingClientRect();
    floatingEl.style.setProperty(
      '--opencodian-agent-switcher-fixed-left',
      `${Math.max(0, Math.round(rect.left))}px`,
    );
    syncModalVisibility();
  };
  const syncModalVisibility = () => {
    const modalInFront = isUnrelatedSettingsModalOpen(ownerDocument, containerEl);
    floatingEl.toggleClass('is-hidden-behind-modal', modalInFront);
    floatingEl.setAttribute('aria-hidden', modalInFront ? 'true' : 'false');
  };

  function observeOwner(): void {
    const { ResizeObserver: OwnerResizeObserver, MutationObserver: OwnerMutationObserver } = ownerWindow as Window & typeof globalThis;
    resizeObserver = typeof OwnerResizeObserver !== 'undefined'
      ? new OwnerResizeObserver(syncPosition)
      : null;
    mutationObserver = new OwnerMutationObserver(syncPosition);
    ownerWindow.addEventListener('resize', syncPosition);
    ownerWindow.addEventListener('pagehide', cleanup);
    // Layout observation also detects a page first connected in another
    // document, whose body mutations cannot reach the original observer.
    resizeObserver?.observe(containerEl);
    mutationObserver.observe(ownerDocument.body, { childList: true, subtree: true });
  }

  observeOwner();
  syncPosition();
  queueMicrotask(syncPosition);
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
      decoding: 'sync',
      draggable: 'false',
      loading: 'eager',
      src,
    },
  });
}

function resolveLobehubAgentIconUrls(icon: AgentSwitcherIconConfig): Record<'light' | 'dark', string> | null {
  if (!icon.iconId) {
    return null;
  }

  return BUNDLED_AGENT_ICON_URLS.get(icon.iconId) ?? null;
}
