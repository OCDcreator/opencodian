import type { AgentBackendKind } from '../../core/types/chat';
import { t } from '../../i18n';
import { BACKEND_OPTIONS } from './SettingsBackendSection';

interface AgentSwitcherChipsOptions {
  selectedAgent: AgentBackendKind | undefined;
  enabledAgents: AgentBackendKind[];
  onSelect: (agent: AgentBackendKind) => void;
}

export function renderAgentSwitcherChips(
  containerEl: HTMLElement,
  options: AgentSwitcherChipsOptions,
): void {
  if (options.enabledAgents.length < 2) {
    return;
  }

  const chipsEl = containerEl.createDiv({ cls: 'opencodian-agent-chips' });
  for (const agent of options.enabledAgents) {
    const backendOption = BACKEND_OPTIONS.find((candidate) => candidate.id === agent);
    if (!backendOption) {
      continue;
    }

    const selected = options.selectedAgent === agent;
    const chipEl = chipsEl.createEl('button', {
      cls: `opencodian-agent-chip${selected ? ' opencodian-agent-chip-selected' : ''}`,
      text: t(backendOption.labelKey),
      attr: {
        'aria-pressed': selected ? 'true' : 'false',
      },
    });
    chipEl.type = 'button';
    chipEl.addEventListener('click', () => {
      options.onSelect(agent);
    });
  }
}
