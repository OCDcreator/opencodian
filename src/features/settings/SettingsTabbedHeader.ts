import type { AgentBackendKind } from '../../core/types/chat';
import { renderAgentSwitcherHeaderIcons } from './AgentSwitcherFloatingIcons';

export interface SettingsTabbedHeaderOptions {
  selectedAgent: AgentBackendKind | undefined;
  enabledAgents: AgentBackendKind[];
  onSelectAgent: (agent: AgentBackendKind) => void;
}

export function refreshSettingsTabbedHeader(
  containerEl: HTMLElement,
  options: SettingsTabbedHeaderOptions,
): void {
  const titleEl = containerEl.querySelector<HTMLElement>('.opencodian-settings-panel-title');
  clearSettingsTabbedBody(containerEl, titleEl);
  titleEl?.querySelector<HTMLElement>('.opencodian-settings-panel-title-actions')?.remove();

  if (!titleEl || options.enabledAgents.length < 2) {
    return;
  }

  const actionsEl = titleEl.createSpan({ cls: 'opencodian-settings-panel-title-actions' });
  renderAgentSwitcherHeaderIcons(actionsEl, {
    selectedAgent: options.selectedAgent,
    enabledAgents: options.enabledAgents,
    onSelect: options.onSelectAgent,
  });
}

function clearSettingsTabbedBody(containerEl: HTMLElement, preservedTitleEl: HTMLElement | null): void {
  for (const childEl of Array.from(containerEl.children)) {
    if (childEl === preservedTitleEl) {
      continue;
    }

    childEl.remove();
  }
}
