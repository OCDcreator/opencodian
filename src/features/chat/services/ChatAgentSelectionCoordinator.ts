import { setIcon } from 'obsidian';

import { t } from '../../../i18n';
import { AnchoredOverlayLayoutController } from '../ui/AnchoredOverlayLayoutController';
import {
  type ComposerPopoverFrameHandle,
  type ComposerPopoverFrameTexts,
  mountComposerPopoverFrame,
} from '../ui/ComposerPopoverFrame';
import {
  focusPopoverOption,
  getPopoverOptions,
  getSelectedPopoverOptionIndex,
  movePopoverOptionFocus,
} from '../ui/ComposerPopoverListNavigation';
import type { AgentSelectionCandidate } from './AgentMentionCandidateService';

const AGENT_DROPDOWN_PREFERRED_WIDTH = 340;
const AGENT_DROPDOWN_MINIMUM_WIDTH = 272;
const AGENT_DROPDOWN_SAFE_INSET = 8;

export interface ChatAgentSelectionCoordinatorHost {
  loadAgentSelectionCandidates(): Promise<AgentSelectionCandidate[]>;
  closePeerDropdowns(): void;
  restoreInputFocus(): void;
  registerEscapeHandler(handler: () => boolean): void;
}

export class ChatAgentSelectionCoordinator {
  private containerEl: HTMLElement | null = null;
  private triggerEl: HTMLElement | null = null;
  private dropdownEl: HTMLElement | null = null;
  private frame: ComposerPopoverFrameHandle | null = null;
  private candidates: AgentSelectionCandidate[] = [];
  private selectedAgentId: string | null = null;
  private isDropdownOpen = false;
  private status: 'idle' | 'loading' | 'ready' | 'failed' = 'idle';
  private loadRunId = 0;
  private clickOutsideHandler: ((event: MouseEvent) => void) | null = null;
  private dropdownLayoutController: AnchoredOverlayLayoutController | null = null;
  private openedWithKeyboard = false;
  private focusedOptionIndex: number | null = null;
  private hasRegisteredEscapeHandler = false;

  constructor(private readonly host: ChatAgentSelectionCoordinatorHost) {}

  mount(containerEl: HTMLElement): void {
    this.destroy();
    this.registerEscapeHandler();
    this.containerEl = containerEl;
    this.triggerEl = containerEl.createDiv({
      cls: 'opencodian-agent-trigger',
      attr: {
        role: 'button',
        tabindex: '0',
        'aria-haspopup': 'listbox',
        'aria-expanded': 'false',
      },
    });
    const triggerContent = this.triggerEl.createDiv({ cls: 'opencodian-agent-trigger-content' });

    const iconWrapper = triggerContent.createSpan({ cls: 'opencodian-agent-trigger-icon' });
    setIcon(iconWrapper, 'at-sign');
    triggerContent.createSpan({ cls: 'opencodian-agent-trigger-text' });
    const chevronWrapper = triggerContent.createSpan({ cls: 'opencodian-agent-trigger-chevron' });
    setIcon(chevronWrapper, 'chevron-down');

    this.dropdownEl = containerEl.createDiv({ cls: 'opencodian-agent-dropdown' });
    this.dropdownEl.setAttribute('role', 'listbox');
    this.dropdownEl.setAttribute('aria-hidden', 'true');
    this.dropdownEl.style.display = 'none';
    this.frame = mountComposerPopoverFrame(this.dropdownEl, this.getFrameTexts());
    this.mountDropdownLayoutController();
    this.renderList();
    this.updateDisplay();

    this.triggerEl.addEventListener('click', (event) => {
      event.stopPropagation();
      this.toggleDropdown(false);
    });
    this.triggerEl.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        this.toggleDropdown(true);
        return;
      }

      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (this.isDropdownOpen) {
          this.openedWithKeyboard = true;
          if (this.status !== 'loading') {
            this.focusSelectedOption();
          }
          return;
        }
        this.openDropdown(true);
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        this.closeDropdown();
      }
    });
    this.dropdownEl.addEventListener('keydown', (event) => {
      if (!this.frame) {
        return;
      }

      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        this.focusedOptionIndex = movePopoverOptionFocus(
          this.frame.contentEl,
          '.opencodian-agent-option',
          this.focusedOptionIndex,
          event.key === 'ArrowDown' ? 1 : -1,
        );
        event.preventDefault();
      } else if (event.key === 'Enter' && this.focusedOptionIndex !== null) {
        this.getOptionElements()[this.focusedOptionIndex]?.click();
        event.preventDefault();
      } else if (event.key === 'Escape') {
        this.closeDropdown({ restoreTriggerFocus: true });
        event.preventDefault();
      }
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
    this.focusSelectedOptionAfterCatalogReload();
  }

  applyLocaleTexts(): void {
    this.frame?.refresh(this.getFrameTexts());
    this.renderList();
    this.updateDisplay();
    if (this.status !== 'loading') {
      this.focusSelectedOptionAfterCatalogReload();
    }
  }

  isOpen(): boolean {
    return this.isDropdownOpen;
  }

  closeDropdown(options: { restoreTriggerFocus?: boolean } = {}): void {
    this.isDropdownOpen = false;
    this.openedWithKeyboard = false;
    this.focusedOptionIndex = null;
    for (const optionEl of this.getOptionElements()) {
      optionEl.tabIndex = -1;
    }
    if (this.dropdownEl) {
      this.dropdownEl.removeClass('is-open');
      this.dropdownEl.style.display = 'none';
      this.dropdownEl.setAttribute('aria-hidden', 'true');
    }
    this.triggerEl?.removeClass('is-open');
    this.triggerEl?.setAttribute('aria-expanded', 'false');

    if (this.clickOutsideHandler) {
      document.removeEventListener('click', this.clickOutsideHandler, true);
    }

    if (options.restoreTriggerFocus) {
      this.triggerEl?.focus({ preventScroll: true });
    }
  }

  destroy(): void {
    this.closeDropdown();
    this.dropdownLayoutController?.destroy();
    this.dropdownLayoutController = null;
    this.containerEl = null;
    this.triggerEl = null;
    this.dropdownEl = null;
    this.frame = null;
    this.candidates = [];
    this.status = 'idle';
    this.loadRunId += 1;
  }

  private registerEscapeHandler(): void {
    if (this.hasRegisteredEscapeHandler) {
      return;
    }

    this.hasRegisteredEscapeHandler = true;
    this.host.registerEscapeHandler(() => {
      if (!this.isDropdownOpen) {
        return false;
      }

      this.closeDropdown({ restoreTriggerFocus: true });
      return true;
    });
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

  private mountDropdownLayoutController(): void {
    this.dropdownLayoutController?.destroy();
    this.dropdownLayoutController = null;
    if (!this.containerEl || !this.dropdownEl) {
      return;
    }

    this.dropdownLayoutController = new AnchoredOverlayLayoutController({
      anchorEl: this.containerEl,
      overlayEl: this.dropdownEl,
      resolveBoundary: () => this.containerEl?.closest<HTMLElement>('.opencodian-container') ?? null,
      alignment: 'start',
      preferredWidth: AGENT_DROPDOWN_PREFERRED_WIDTH,
      minimumWidth: AGENT_DROPDOWN_MINIMUM_WIDTH,
      safeInset: AGENT_DROPDOWN_SAFE_INSET,
      isOpen: () => this.isDropdownOpen,
    });
    this.dropdownLayoutController.observe();
  }

  private renderList(): void {
    if (!this.frame) {
      return;
    }

    this.frame.contentEl.empty();
    this.frame.contentEl.createDiv({
      cls: 'opencodian-agent-dropdown-heading',
      text: t('chat.agentSelector.heading'),
      attr: {
        role: 'presentation',
      },
    });
    this.renderOption({
      agentId: null,
      displayName: t('chat.agentSelector.default'),
      description: t('chat.agentSelector.defaultDesc'),
      mode: null,
    });

    if (this.status === 'loading') {
      this.frame.contentEl.createDiv({ cls: 'opencodian-agent-dropdown-state', text: t('chat.agentSelector.loading') });
      this.updateDropdownSelection();
      return;
    }

    if (this.status === 'failed') {
      this.frame.contentEl.createDiv({ cls: 'opencodian-agent-dropdown-state', text: t('chat.agentSelector.loadFailed') });
      this.updateDropdownSelection();
      return;
    }

    if (this.candidates.length === 0) {
      this.frame.contentEl.createDiv({ cls: 'opencodian-agent-dropdown-state', text: t('chat.agentSelector.empty') });
      this.updateDropdownSelection();
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
    if (!this.frame) {
      return;
    }

    const optionEl = this.frame.contentEl.createDiv({
      cls: `opencodian-composer-popover-option opencodian-agent-option${input.agentId ? '' : ' is-default'}`,
      attr: {
        role: 'option',
        tabindex: '-1',
        'aria-selected': 'false',
        'data-agent-id': input.agentId ?? '',
        'data-agent-kind': input.agentId ? 'agent' : 'default',
      },
    });

    optionEl.createSpan({ cls: 'opencodian-agent-option-marker' });

    const contentEl = optionEl.createDiv({ cls: 'opencodian-agent-option-content' });
    const mainEl = contentEl.createDiv({ cls: 'opencodian-agent-option-main' });
    const labelRowEl = mainEl.createDiv({ cls: 'opencodian-agent-option-label-row' });
    labelRowEl.createSpan({ cls: 'opencodian-agent-option-label', text: input.displayName });
    const metaEl = labelRowEl.createSpan({ cls: 'opencodian-agent-option-meta' });
    if (!input.agentId) {
      metaEl.createSpan({
        cls: 'opencodian-agent-option-mode is-default-mode',
        text: t('chat.agentSelector.defaultBadge'),
      });
    }
    if (input.mode) {
      metaEl.createSpan({
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
    const selectedAgentId = this.selectedAgentId ?? '';
    for (const optionEl of this.getOptionElements()) {
      if (optionEl.dataset.agentId === selectedAgentId) {
        optionEl.addClass('is-selected');
        optionEl.setAttribute('aria-selected', 'true');
      } else {
        optionEl.removeClass('is-selected');
        optionEl.setAttribute('aria-selected', 'false');
      }
    }
  }

  private toggleDropdown(openedWithKeyboard: boolean): void {
    if (this.isDropdownOpen) {
      this.closeDropdown();
    } else {
      this.openDropdown(openedWithKeyboard);
    }
  }

  private openDropdown(openedWithKeyboard: boolean): void {
    if (!this.dropdownEl || !this.triggerEl) {
      return;
    }

    this.host.closePeerDropdowns();
    this.openedWithKeyboard = openedWithKeyboard;
    if (this.status === 'idle') {
      void this.reloadCatalog();
    }
    this.isDropdownOpen = true;
    this.dropdownEl.style.display = 'block';
    this.dropdownLayoutController?.observe();
    this.dropdownLayoutController?.sync();
    this.dropdownEl.addClass('is-open');
    this.dropdownEl.setAttribute('aria-hidden', 'false');
    this.triggerEl.addClass('is-open');
    this.triggerEl.setAttribute('aria-expanded', 'true');
    this.updateDropdownSelection();
    if (openedWithKeyboard && this.status !== 'loading') {
      this.focusSelectedOption();
    }

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

  private getFrameTexts(): ComposerPopoverFrameTexts {
    return {
      title: t('chat.composerPopover.agentTitle'),
      escapeKey: 'Esc',
      navigateHint: t('chat.composerPopover.navigateHint'),
      selectHint: t('chat.composerPopover.selectHint'),
      closeHint: t('chat.composerPopover.closeHint'),
    };
  }

  private getOptionElements(): HTMLElement[] {
    return this.frame ? getPopoverOptions(this.frame.contentEl, '.opencodian-agent-option') : [];
  }

  private focusSelectedOptionAfterCatalogReload(): void {
    if (this.isDropdownOpen && this.openedWithKeyboard) {
      this.focusSelectedOption();
    }
  }

  private focusSelectedOption(): void {
    if (!this.frame) {
      return;
    }

    const selectedIndex = getSelectedPopoverOptionIndex(this.frame.contentEl, '.opencodian-agent-option') ?? 0;
    this.focusedOptionIndex = focusPopoverOption(
      this.frame.contentEl,
      '.opencodian-agent-option',
      selectedIndex,
    );
  }
}
