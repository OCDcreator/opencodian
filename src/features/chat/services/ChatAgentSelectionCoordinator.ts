import { setIcon } from 'obsidian';

import { t } from '../../../i18n';
import type { AgentSelectionCandidate } from './AgentMentionCandidateService';

export interface ChatAgentSelectionCoordinatorHost {
  loadAgentSelectionCandidates(): Promise<AgentSelectionCandidate[]>;
  closePeerDropdowns(): void;
  restoreInputFocus(): void;
}

export class ChatAgentSelectionCoordinator {
  private containerEl: HTMLElement | null = null;
  private triggerEl: HTMLElement | null = null;
  private dropdownEl: HTMLElement | null = null;
  private candidates: AgentSelectionCandidate[] = [];
  private selectedAgentId: string | null = null;
  private isDropdownOpen = false;
  private status: 'idle' | 'loading' | 'ready' | 'failed' = 'idle';
  private loadRunId = 0;
  private clickOutsideHandler: ((event: MouseEvent) => void) | null = null;

  constructor(private readonly host: ChatAgentSelectionCoordinatorHost) {}

  mount(containerEl: HTMLElement): void {
    this.destroy();
    this.containerEl = containerEl;
    this.triggerEl = containerEl.createDiv({ cls: 'opencodian-agent-trigger' });
    const triggerContent = this.triggerEl.createDiv({ cls: 'opencodian-agent-trigger-content' });

    const iconWrapper = triggerContent.createSpan({ cls: 'opencodian-agent-trigger-icon' });
    setIcon(iconWrapper, 'bot');
    triggerContent.createSpan({ cls: 'opencodian-agent-trigger-text' });
    const chevronWrapper = triggerContent.createSpan({ cls: 'opencodian-agent-trigger-chevron' });
    setIcon(chevronWrapper, 'chevron-down');

    this.dropdownEl = containerEl.createDiv({ cls: 'opencodian-agent-dropdown' });
    this.dropdownEl.style.display = 'none';
    this.renderList();
    this.updateDisplay();

    this.triggerEl.addEventListener('click', (event) => {
      event.stopPropagation();
      this.toggleDropdown();
    });

    this.clickOutsideHandler = (event: MouseEvent) => {
      if (!this.containerEl?.contains(event.target as Node)) {
        this.closeDropdown();
      }
    };
  }

  getSelectedAgentId(): string | null {
    return this.selectedAgentId;
  }

  async reloadCatalog(): Promise<void> {
    const runId = ++this.loadRunId;
    this.status = 'loading';
    this.renderList();

    try {
      const candidates = await this.host.loadAgentSelectionCandidates();
      if (runId !== this.loadRunId) {
        return;
      }

      this.candidates = candidates.map((candidate) => ({ ...candidate }));
      this.status = 'ready';
      if (this.selectedAgentId && !this.candidates.some((candidate) => candidate.id === this.selectedAgentId)) {
        this.selectedAgentId = null;
      }
    } catch {
      if (runId !== this.loadRunId) {
        return;
      }

      this.candidates = [];
      this.status = 'failed';
    }

    this.renderList();
    this.updateDisplay();
  }

  applyLocaleTexts(): void {
    this.renderList();
    this.updateDisplay();
  }

  isOpen(): boolean {
    return this.isDropdownOpen;
  }

  closeDropdown(): void {
    this.isDropdownOpen = false;
    if (this.dropdownEl) {
      this.dropdownEl.style.display = 'none';
    }
    this.triggerEl?.removeClass('is-open');

    if (this.clickOutsideHandler) {
      document.removeEventListener('click', this.clickOutsideHandler, true);
    }
  }

  destroy(): void {
    this.closeDropdown();
    this.containerEl = null;
    this.triggerEl = null;
    this.dropdownEl = null;
    this.candidates = [];
    this.status = 'idle';
    this.loadRunId += 1;
  }

  private updateDisplay(): void {
    if (!this.triggerEl) {
      return;
    }

    const selected = this.getSelectedAgentCandidate();
    const textEl = this.triggerEl.querySelector('.opencodian-agent-trigger-text');
    if (textEl) {
      textEl.textContent = selected?.displayName ?? t('chat.agentSelector.trigger');
    }

    this.triggerEl.toggleClass('is-selected', Boolean(selected));
    this.triggerEl.setAttribute(
      'title',
      selected
        ? t('chat.agentSelector.selectedTitle', { name: selected.displayName })
        : t('chat.agentSelector.defaultTitle'),
    );
    this.updateDropdownSelection();
  }

  private renderList(): void {
    if (!this.dropdownEl) {
      return;
    }

    this.dropdownEl.empty();
    this.renderOption({
      agentId: null,
      displayName: t('chat.agentSelector.default'),
      description: t('chat.agentSelector.defaultDesc'),
      mode: null,
    });

    if (this.status === 'loading') {
      this.dropdownEl.createDiv({ cls: 'opencodian-agent-dropdown-state', text: t('chat.agentSelector.loading') });
      return;
    }

    if (this.status === 'failed') {
      this.dropdownEl.createDiv({ cls: 'opencodian-agent-dropdown-state', text: t('chat.agentSelector.loadFailed') });
      return;
    }

    if (this.candidates.length === 0) {
      this.dropdownEl.createDiv({ cls: 'opencodian-agent-dropdown-state', text: t('chat.agentSelector.empty') });
      return;
    }

    for (const candidate of this.candidates) {
      this.renderOption({
        agentId: candidate.id,
        displayName: candidate.displayName,
        description: candidate.description,
        mode: candidate.mode,
      });
    }

    this.updateDropdownSelection();
  }

  private renderOption(input: {
    agentId: string | null;
    displayName: string;
    description: string;
    mode: AgentSelectionCandidate['mode'];
  }): void {
    if (!this.dropdownEl) {
      return;
    }

    const optionEl = this.dropdownEl.createDiv({
      cls: 'opencodian-agent-option',
      attr: { 'data-agent-id': input.agentId ?? '' },
    });

    const iconWrapper = optionEl.createSpan({ cls: 'opencodian-agent-option-icon' });
    setIcon(iconWrapper, input.agentId ? 'bot' : 'sparkles');

    const contentEl = optionEl.createDiv({ cls: 'opencodian-agent-option-content' });
    const labelRowEl = contentEl.createDiv({ cls: 'opencodian-agent-option-label-row' });
    labelRowEl.createSpan({ cls: 'opencodian-agent-option-label', text: input.displayName });
    if (input.mode) {
      labelRowEl.createSpan({
        cls: 'opencodian-agent-option-mode',
        text: this.getAgentModeLabel(input.mode),
      });
    }
    if (input.description) {
      contentEl.createDiv({ cls: 'opencodian-agent-option-desc', text: input.description });
    }

    const checkmark = optionEl.createSpan({ cls: 'opencodian-agent-option-check' });
    setIcon(checkmark, 'check');

    optionEl.addEventListener('click', (event) => {
      event.stopPropagation();
      this.selectAgent(input.agentId);
    });
  }

  private getAgentModeLabel(mode: NonNullable<AgentSelectionCandidate['mode']>): string {
    return mode === 'all'
      ? t('settings.agents.catalog.mode.all')
      : t('settings.agents.catalog.mode.primary');
  }

  private getSelectedAgentCandidate(): AgentSelectionCandidate | null {
    return this.selectedAgentId
      ? this.candidates.find((candidate) => candidate.id === this.selectedAgentId) ?? null
      : null;
  }

  private updateDropdownSelection(): void {
    if (!this.dropdownEl) {
      return;
    }

    const selectedAgentId = this.selectedAgentId ?? '';
    this.dropdownEl.querySelectorAll('.opencodian-agent-option').forEach((option) => {
      if ((option as HTMLElement).dataset.agentId === selectedAgentId) {
        option.addClass('is-selected');
      } else {
        option.removeClass('is-selected');
      }
    });
  }

  private toggleDropdown(): void {
    if (this.isDropdownOpen) {
      this.closeDropdown();
    } else {
      this.openDropdown();
    }
  }

  private openDropdown(): void {
    if (!this.dropdownEl || !this.triggerEl) {
      return;
    }

    this.host.closePeerDropdowns();
    if (this.status === 'idle') {
      void this.reloadCatalog();
    }
    this.isDropdownOpen = true;
    this.dropdownEl.style.display = 'block';
    this.triggerEl.addClass('is-open');
    this.updateDropdownSelection();

    if (this.clickOutsideHandler) {
      document.addEventListener('click', this.clickOutsideHandler, true);
    }
  }

  private selectAgent(agentId: string | null): void {
    this.selectedAgentId = agentId;
    this.updateDisplay();
    this.closeDropdown();
    this.host.restoreInputFocus();
  }
}
