import { setIcon } from 'obsidian';

import type { PermissionMode } from '../../../core/types/settings';
import { t } from '../../../i18n';

export interface PermissionModeSelectorHost {
  getPermissionMode(): PermissionMode;
  switchPermissionMode(mode: PermissionMode): Promise<void>;
}

interface PermissionModeOption {
  id: PermissionMode;
  label: string;
  description: string;
}

interface PermissionTriggerDisplayState {
  label: string;
  modeClass: `mode-${PermissionMode}`;
}

const PERMISSION_MODE_CLASSES = ['mode-yolo', 'mode-normal', 'mode-plan'] as const;

const PERMISSION_MODE_DISPLAY: Record<PermissionMode, string> = {
  yolo: 'YOLO',
  normal: 'ASK',
  plan: 'PLAN',
};

export class PermissionModeSelectorCoordinator {
  private containerEl: HTMLElement | null = null;
  private triggerEl: HTMLElement | null = null;
  private dropdownEl: HTMLElement | null = null;
  private isDropdownOpen = false;
  private clickOutsideHandler: ((event: MouseEvent) => void) | null = null;

  constructor(private readonly host: PermissionModeSelectorHost) {}

  mount(containerEl: HTMLElement): void {
    this.destroy();
    this.containerEl = containerEl;
    this.triggerEl = containerEl.createDiv({ cls: 'opencodian-permission-trigger' });

    const iconEl = this.triggerEl.createSpan({ cls: 'opencodian-permission-trigger-icon' });
    setIcon(iconEl, 'shield');
    this.triggerEl.createSpan({ cls: 'opencodian-permission-trigger-text' });

    this.dropdownEl = containerEl.createDiv({ cls: 'opencodian-permission-dropdown' });
    this.dropdownEl.style.display = 'none';
    this.buildDropdown();
    this.updateTriggerDisplay();

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
      this.dropdownEl.style.display = 'none';
    }
    this.triggerEl?.removeClass('is-open');

    if (this.clickOutsideHandler) {
      document.removeEventListener('click', this.clickOutsideHandler);
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
      label: PERMISSION_MODE_DISPLAY[mode] || mode,
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

    triggerEl.removeClass(...PERMISSION_MODE_CLASSES);
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
    return [
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
    ];
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
    this.triggerEl.addClass('is-open');
    this.updateDropdownSelection();

    if (this.clickOutsideHandler) {
      document.addEventListener('click', this.clickOutsideHandler);
    }
  }

  private async selectPermissionMode(mode: PermissionMode): Promise<void> {
    await this.host.switchPermissionMode(mode);
    this.updateTriggerDisplay();
    this.closeDropdown();
  }
}
