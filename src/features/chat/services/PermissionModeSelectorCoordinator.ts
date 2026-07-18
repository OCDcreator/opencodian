import { setIcon } from 'obsidian';

import type { ClaudeCodePermissionMode } from '../../../core/types/settings';
import type { CodexSandboxMode } from '../../../core/types/settings';
import type { PermissionMode } from '../../../core/types/settings';
import { t } from '../../../i18n';
import { AnchoredOverlayLayoutController } from '../ui/AnchoredOverlayLayoutController';
import {
  type ComposerPopoverFrameHandle,
  type ComposerPopoverFrameTexts,
  mountComposerPopoverFrame,
} from '../ui/ComposerPopoverFrame';
import {
  focusPopoverOption,
  getSelectedPopoverOptionIndex,
  movePopoverOptionFocus,
} from '../ui/ComposerPopoverListNavigation';

const PERMISSION_DROPDOWN_PREFERRED_WIDTH = 280;
const PERMISSION_DROPDOWN_MINIMUM_WIDTH = 220;
const PERMISSION_DROPDOWN_SAFE_INSET = 8;

export interface PermissionModeSelectorHost {
  getPermissionMode(): string;
  switchPermissionMode(mode: string): Promise<boolean>;
  restoreInputFocus(): void;
}

export interface PermissionModeOption {
  id: string;
  label: string;
  description: string;
  icon?: string;
}

export interface PermissionModeConfig {
  options: PermissionModeOption[];
  /** Short display labels for the trigger button (e.g. 'YOLO', 'ASK', 'DEF'). */
  displayMap: Record<string, string>;
  /** CSS class names for each mode, used on the trigger element. */
  modeCssClasses: readonly string[];
  /** Stable data attribute value identifying the backend system. */
  backendLabel: 'opencode' | 'claude-code' | 'codex';
  /** Optional visual variant class shared by the container, trigger, and dropdown. */
  variantClass?: string;
  /**
   * Optional boundary hint shown as the trigger element title.
   * Use this to honestly communicate that the selector only affects
   * subsequent thread creation/resume, not the currently running thread.
   */
  boundaryHint?: string;
}

interface PermissionTriggerDisplayState {
  label: string;
  modeClass: string;
  icon: string;
}

// ─── Factory: OpenCode permission templates (yolo/normal/plan) ────────

export function createOpenCodePermissionConfig(): PermissionModeConfig {
  return {
    backendLabel: 'opencode',
    options: [
      {
        id: 'yolo',
        label: t('settings.security.permissionMode.yolo'),
        description: t('settings.security.permissionMode.yoloDescription')
          || 'Allow all tools without asking',
      },
      {
        id: 'normal',
        label: t('settings.security.permissionMode.normal'),
        description: t('settings.security.permissionMode.normalDescription')
          || 'Ask before executing tools',
      },
      {
        id: 'plan',
        label: t('settings.security.permissionMode.plan'),
        description: t('settings.security.permissionMode.planDescription')
          || 'Review and approve all actions',
      },
    ],
    displayMap: { yolo: 'YOLO', normal: 'ASK', plan: 'PLAN' } as Record<PermissionMode, string>,
    modeCssClasses: ['mode-yolo', 'mode-normal', 'mode-plan'] as const,
  };
}

// ─── Factory: Claude Code permission modes ───────────────────────────

export function createClaudeCodePermissionConfig(): PermissionModeConfig {
  return {
    backendLabel: 'claude-code',
    options: [
      {
        id: 'default',
        label: t('settings.claudeCode.permissionMode.default'),
        description: t('chat.claudeCode.permissionMode.default.description')
          || 'Default permission prompts',
        icon: 'hand',
      },
      {
        id: 'acceptEdits',
        label: t('settings.claudeCode.permissionMode.acceptEdits'),
        description: t('chat.claudeCode.permissionMode.acceptEdits.description')
          || 'Auto-accept file edits',
        icon: 'shield-check',
      },
      {
        id: 'plan',
        label: t('settings.claudeCode.permissionMode.plan'),
        description: t('chat.claudeCode.permissionMode.plan.description')
          || 'Plan mode — review before executing',
        icon: 'clipboard-list',
      },
      {
        id: 'bypassPermissions',
        label: t('settings.claudeCode.permissionMode.bypassPermissions'),
        description: t('chat.claudeCode.permissionMode.bypassPermissions.description')
          || 'Reduce confirmations; bypasses permission checks',
        icon: 'shield-alert',
      },
    ],
    displayMap: {
      default: t('settings.claudeCode.permissionMode.default'),
      acceptEdits: t('settings.claudeCode.permissionMode.acceptEdits'),
      bypassPermissions: t('settings.claudeCode.permissionMode.bypassPermissions'),
      plan: t('settings.claudeCode.permissionMode.plan'),
    } as Record<ClaudeCodePermissionMode, string>,
    modeCssClasses: ['mode-default', 'mode-acceptEdits', 'mode-bypassPermissions', 'mode-plan'] as const,
    variantClass: 'opencodian-permission-selector--claude-code',
  };
}

// ─── Factory: Codex sandbox modes ────────────────────────────────────

export function createCodexSandboxConfig(): PermissionModeConfig {
  return {
    backendLabel: 'codex',
    options: [
      {
        id: 'read-only',
        label: t('settings.codex.sandbox.readOnly'),
        description: t('chat.codex.sandboxMode.readOnly.description')
          || 'Filesystem reads only; no writes or shell execution',
      },
      {
        id: 'workspace-write',
        label: t('settings.codex.sandbox.workspaceWrite'),
        description: t('chat.codex.sandboxMode.workspaceWrite.description')
          || 'Allow writes within the workspace directory',
      },
      {
        id: 'danger-full-access',
        label: t('settings.codex.sandbox.dangerFullAccess'),
        description: t('chat.codex.sandboxMode.dangerFullAccess.description')
          || 'Full system access without sandbox restrictions',
      },
    ],
    displayMap: {
      'read-only': 'RO',
      'workspace-write': 'WS',
      'danger-full-access': 'FULL',
    } as Record<CodexSandboxMode, string>,
    modeCssClasses: ['mode-read-only', 'mode-workspace-write', 'mode-danger-full-access'] as const,
    boundaryHint: t('chat.codex.sandboxMode.boundaryHint')
      || 'Sandbox mode applies to the next thread only.',
  };
}

export class PermissionModeSelectorCoordinator {
  private containerEl: HTMLElement | null = null;
  private triggerEl: HTMLElement | null = null;
  private dropdownEl: HTMLElement | null = null;
  private isDropdownOpen = false;
  private frame: ComposerPopoverFrameHandle | null = null;
  private openedWithKeyboard = false;
  private focusedOptionIndex: number | null = null;
  private clickOutsideHandler: ((event: MouseEvent) => void) | null = null;
  private config: PermissionModeConfig;
  private dropdownLayoutController: AnchoredOverlayLayoutController | null = null;

  constructor(
    private readonly host: PermissionModeSelectorHost,
    config?: PermissionModeConfig,
  ) {
    this.config = config ?? createOpenCodePermissionConfig();
  }

  private get optionContentEl(): HTMLElement | null {
    return this.frame?.contentEl ?? this.dropdownEl;
  }

  mount(containerEl: HTMLElement): void {
    this.destroy();
    this.containerEl = containerEl;
    if (this.config.variantClass) {
      this.containerEl.addClass(this.config.variantClass);
    }
    this.triggerEl = containerEl.createDiv({
      cls: this.joinClasses('opencodian-permission-trigger', this.config.variantClass),
      attr: {
        role: 'button',
        tabindex: '0',
        'aria-haspopup': 'listbox',
        'aria-expanded': 'false',
        'data-permission-backend': this.config.backendLabel,
      },
    });

    const iconEl = this.triggerEl.createSpan({ cls: 'opencodian-permission-trigger-icon' });
    setIcon(iconEl, 'shield');
    this.triggerEl.createSpan({ cls: 'opencodian-permission-trigger-text' });
    const chevronEl = this.triggerEl.createSpan({ cls: 'opencodian-permission-trigger-chevron' });
    setIcon(chevronEl, 'chevron-down');

    this.dropdownEl = containerEl.createDiv({
      cls: this.joinClasses('opencodian-permission-dropdown', this.config.variantClass),
      attr: { role: 'listbox' },
    });
    this.dropdownEl.style.display = 'none';
    this.buildDropdown();
    this.mountDropdownLayoutController();
    this.updateTriggerDisplay();

    // Set boundary hint title if provided (e.g. "only affects next thread").
    if (this.config.boundaryHint) {
      this.triggerEl.setAttribute('title', this.config.boundaryHint);
    }

    this.triggerEl.addEventListener('click', (event) => {
      event.stopPropagation();
      this.toggleDropdown(false);
    });

    this.triggerEl.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
        return;
      }

      this.toggleDropdown(true);
      event.preventDefault();
    });

    this.dropdownEl.addEventListener('keydown', (event) => {
      const contentEl = this.frame?.contentEl;
      if (!contentEl) {
        return;
      }

      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        this.focusedOptionIndex = movePopoverOptionFocus(
          contentEl,
          '.opencodian-permission-option',
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

  applyLocaleTexts(): void {
    this.buildDropdown();
    this.updateTriggerDisplay();
    if (this.isDropdownOpen && this.openedWithKeyboard) {
      this.focusSelectedOption();
    }
  }

  updateTriggerDisplay(): void {
    if (!this.triggerEl) {
      return;
    }

    this.applyTriggerDisplay(this.triggerEl, this.getTriggerDisplayState());
    this.updateDropdownSelection();
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
    }
    this.triggerEl?.removeClass('is-open');
    this.triggerEl?.setAttribute('aria-expanded', 'false');

    if (this.clickOutsideHandler) {
      document.removeEventListener('click', this.clickOutsideHandler, true);
    }

    if (options.restoreTriggerFocus) {
      this.triggerEl?.focus();
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
  }

  private getTriggerDisplayState(): PermissionTriggerDisplayState {
    const mode = this.host.getPermissionMode();
    const option = this.getPermissionModeOptions().find((candidate) => candidate.id === mode);
    return {
      label: this.config.displayMap[mode] || mode,
      modeClass: `mode-${mode}`,
      icon: option?.icon ?? 'shield',
    };
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
      preferredWidth: PERMISSION_DROPDOWN_PREFERRED_WIDTH,
      minimumWidth: PERMISSION_DROPDOWN_MINIMUM_WIDTH,
      safeInset: PERMISSION_DROPDOWN_SAFE_INSET,
      isOpen: () => this.isDropdownOpen,
    });
    this.dropdownLayoutController.observe();
  }

  private applyTriggerDisplay(
    triggerEl: HTMLElement,
    displayState: PermissionTriggerDisplayState,
  ): void {
    const textEl = triggerEl.querySelector('.opencodian-permission-trigger-text');
    if (textEl) {
      textEl.textContent = displayState.label;
    }

    const iconEl = triggerEl.querySelector<HTMLElement>('.opencodian-permission-trigger-icon');
    if (iconEl) {
      setIcon(iconEl, displayState.icon);
    }

    triggerEl.removeClass(...this.config.modeCssClasses);
    triggerEl.addClass(displayState.modeClass);
  }

  private buildDropdown(): void {
    if (!this.dropdownEl) {
      return;
    }

    this.dropdownEl.empty();
    this.frame = mountComposerPopoverFrame(this.dropdownEl, this.getFrameTexts());

    for (const mode of this.getPermissionModeOptions()) {
      const optionEl = this.frame.contentEl.createDiv({
        cls: 'opencodian-permission-option opencodian-composer-popover-option',
        attr: {
          'data-mode': mode.id,
          'data-permission-semantic': this.getPermissionSemantic(mode.id),
          role: 'option',
          tabindex: '-1',
          'aria-selected': String(mode.id === this.host.getPermissionMode()),
        },
      });

      const iconWrapper = optionEl.createSpan({ cls: 'opencodian-permission-option-icon' });
      setIcon(iconWrapper, mode.icon ?? 'shield');

      const contentEl = optionEl.createDiv({ cls: 'opencodian-permission-option-content' });
      contentEl.createDiv({ cls: 'opencodian-permission-option-label', text: mode.label });
      contentEl.createDiv({ cls: 'opencodian-permission-option-desc', text: mode.description });

      const checkmark = optionEl.createSpan({ cls: 'opencodian-permission-option-check' });
      setIcon(checkmark, 'check');

      optionEl.addEventListener('click', (event) => {
        event.stopPropagation();
        void this.selectPermissionMode(mode.id);
      });
    }

    this.updateDropdownSelection();
  }

  private getPermissionModeOptions(): PermissionModeOption[] {
    return this.config.options;
  }

  private joinClasses(...classes: Array<string | undefined>): string {
    return classes.filter(Boolean).join(' ');
  }

  private updateDropdownSelection(): void {
    const contentEl = this.optionContentEl;
    if (!contentEl) {
      return;
    }

    const currentMode = this.host.getPermissionMode();
    contentEl.querySelectorAll('.opencodian-permission-option').forEach((option) => {
      const mode = option.getAttribute('data-mode');
      if (mode === currentMode) {
        option.addClass('is-selected');
        option.setAttribute('aria-selected', 'true');
      } else {
        option.removeClass('is-selected');
        option.setAttribute('aria-selected', 'false');
      }
    });
  }

  private getFrameTexts(): ComposerPopoverFrameTexts {
    return {
      title: t('chat.composerPopover.permissionTitle'),
      escapeKey: 'Esc',
      navigateHint: t('chat.composerPopover.navigateHint'),
      selectHint: t('chat.composerPopover.selectHint'),
    };
  }

  private getPermissionSemantic(mode: string): 'danger' | 'safe' | 'neutral' {
    if (mode === 'yolo' || mode === 'bypassPermissions' || mode === 'danger-full-access') {
      return 'danger';
    }
    if (mode === 'plan' || mode === 'read-only') {
      return 'safe';
    }
    return 'neutral';
  }

  private getOptionElements(): HTMLElement[] {
    return Array.from(this.optionContentEl?.querySelectorAll<HTMLElement>('.opencodian-permission-option') ?? []);
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

    this.isDropdownOpen = true;
    this.openedWithKeyboard = openedWithKeyboard;
    this.dropdownEl.style.display = 'block';
    this.dropdownLayoutController?.observe();
    this.dropdownLayoutController?.sync();
    this.dropdownEl.addClass('is-open');
    this.triggerEl.addClass('is-open');
    this.triggerEl.setAttribute('aria-expanded', 'true');
    this.updateDropdownSelection();
    if (this.openedWithKeyboard) {
      this.focusSelectedOption();
    }

    if (this.clickOutsideHandler) {
      document.addEventListener('click', this.clickOutsideHandler, true);
    }
  }

  private async selectPermissionMode(mode: string): Promise<void> {
    const didSwitch = await this.host.switchPermissionMode(mode);
    if (!didSwitch) {
      return;
    }
    this.updateTriggerDisplay();
    this.closeDropdown();
    this.host.restoreInputFocus();
  }

  private focusSelectedOption(): void {
    const contentEl = this.frame?.contentEl;
    if (!contentEl) {
      return;
    }

    const selectedIndex = getSelectedPopoverOptionIndex(contentEl, '.opencodian-permission-option');
    this.focusedOptionIndex = focusPopoverOption(
      contentEl,
      '.opencodian-permission-option',
      selectedIndex ?? 0,
    );
  }
}
