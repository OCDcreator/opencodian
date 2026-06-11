import { setIcon } from 'obsidian';

import type { ClaudeCodePermissionMode } from '../../../core/types/settings';
import type { CodexSandboxMode } from '../../../core/types/settings';
import type { PermissionMode } from '../../../core/types/settings';
import { t } from '../../../i18n';

export interface PermissionModeSelectorHost {
  getPermissionMode(): string;
  switchPermissionMode(mode: string): Promise<void>;
}

export interface PermissionModeOption {
  id: string;
  label: string;
  description: string;
}

export interface PermissionModeConfig {
  options: PermissionModeOption[];
  /** Short display labels for the trigger button (e.g. 'YOLO', 'ASK', 'DEF'). */
  displayMap: Record<string, string>;
  /** CSS class names for each mode, used on the trigger element. */
  modeCssClasses: readonly string[];
  /** Stable data attribute value identifying the backend system. */
  backendLabel: 'opencode' | 'claude-code' | 'codex';
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
      },
      {
        id: 'acceptEdits',
        label: t('settings.claudeCode.permissionMode.acceptEdits'),
        description: t('chat.claudeCode.permissionMode.acceptEdits.description')
          || 'Auto-accept file edits',
      },
      {
        id: 'bypassPermissions',
        label: t('settings.claudeCode.permissionMode.bypassPermissions'),
        description: t('chat.claudeCode.permissionMode.bypassPermissions.description')
          || 'Skip all permission prompts',
      },
      {
        id: 'plan',
        label: t('settings.claudeCode.permissionMode.plan'),
        description: t('chat.claudeCode.permissionMode.plan.description')
          || 'Plan mode — review before executing',
      },
    ],
    displayMap: {
      default: 'DEF',
      acceptEdits: 'EDIT',
      bypassPermissions: 'BYP',
      plan: 'PLAN',
    } as Record<ClaudeCodePermissionMode, string>,
    modeCssClasses: ['mode-default', 'mode-acceptEdits', 'mode-bypassPermissions', 'mode-plan'] as const,
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
  private clickOutsideHandler: ((event: MouseEvent) => void) | null = null;
  private config: PermissionModeConfig;

  constructor(
    private readonly host: PermissionModeSelectorHost,
    config?: PermissionModeConfig,
  ) {
    this.config = config ?? createOpenCodePermissionConfig();
  }

  mount(containerEl: HTMLElement): void {
    this.destroy();
    this.containerEl = containerEl;
    this.triggerEl = containerEl.createDiv({
      cls: 'opencodian-permission-trigger',
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

    this.dropdownEl = containerEl.createDiv({ cls: 'opencodian-permission-dropdown' });
    this.dropdownEl.style.display = 'none';
    this.buildDropdown();
    this.updateTriggerDisplay();

    // Set boundary hint title if provided (e.g. "only affects next thread").
    if (this.config.boundaryHint) {
      this.triggerEl.setAttribute('title', this.config.boundaryHint);
    }

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

  applyLocaleTexts(): void {
    this.buildDropdown();
    this.updateTriggerDisplay();
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

  closeDropdown(): void {
    this.isDropdownOpen = false;
    if (this.dropdownEl) {
      this.dropdownEl.removeClass('is-open');
      this.dropdownEl.style.display = 'none';
    }
    this.triggerEl?.removeClass('is-open');
    this.triggerEl?.setAttribute('aria-expanded', 'false');

    if (this.clickOutsideHandler) {
      document.removeEventListener('click', this.clickOutsideHandler, true);
    }
  }

  destroy(): void {
    this.closeDropdown();
    this.containerEl = null;
    this.triggerEl = null;
    this.dropdownEl = null;
  }

  private getTriggerDisplayState(): PermissionTriggerDisplayState {
    const mode = this.host.getPermissionMode();
    return {
      label: this.config.displayMap[mode] || mode,
      modeClass: `mode-${mode}`,
    };
  }

  private applyTriggerDisplay(
    triggerEl: HTMLElement,
    displayState: PermissionTriggerDisplayState,
  ): void {
    const textEl = triggerEl.querySelector('.opencodian-permission-trigger-text');
    if (textEl) {
      textEl.textContent = displayState.label;
    }

    triggerEl.removeClass(...this.config.modeCssClasses);
    triggerEl.addClass(displayState.modeClass);
  }

  private buildDropdown(): void {
    if (!this.dropdownEl) {
      return;
    }

    this.dropdownEl.empty();

    for (const mode of this.getPermissionModeOptions()) {
      const optionEl = this.dropdownEl.createDiv({
        cls: 'opencodian-permission-option',
        attr: { 'data-mode': mode.id },
      });

      const iconWrapper = optionEl.createSpan({ cls: 'opencodian-permission-option-icon' });
      setIcon(iconWrapper, 'shield');

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

  private updateDropdownSelection(): void {
    if (!this.dropdownEl) {
      return;
    }

    const currentMode = this.host.getPermissionMode();
    this.dropdownEl.querySelectorAll('.opencodian-permission-option').forEach((option) => {
      const mode = option.getAttribute('data-mode');
      if (mode === currentMode) {
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

    this.isDropdownOpen = true;
    this.dropdownEl.style.display = 'block';
    this.dropdownEl.addClass('is-open');
    this.triggerEl.addClass('is-open');
    this.triggerEl.setAttribute('aria-expanded', 'true');
    this.updateDropdownSelection();

    if (this.clickOutsideHandler) {
      document.addEventListener('click', this.clickOutsideHandler, true);
    }
  }

  private async selectPermissionMode(mode: string): Promise<void> {
    await this.host.switchPermissionMode(mode);
    this.updateTriggerDisplay();
    this.closeDropdown();
  }
}
