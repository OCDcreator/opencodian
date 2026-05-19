import { setIcon } from 'obsidian';

import type { AgentBackendKind } from '../../core/types/chat';
import { t } from '../../i18n';
import { BACKEND_OPTIONS } from './SettingsBackendSection';

const AGENT_ICON_BY_BACKEND: Record<AgentBackendKind, string> = {
  opencode: 'bot',
  'claude-code': 'sparkles',
  codex: 'code-2',
  copilot: 'github',
  pi: 'cpu',
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

  containerEl.createDiv({ cls: 'opencodian-agent-switcher-hover-zone' });
  const floatingEl = containerEl.createDiv({ cls: 'opencodian-agent-switcher-floating' });

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
    setIcon(iconButtonEl, AGENT_ICON_BY_BACKEND[agent]);
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
