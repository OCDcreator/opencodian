/**
 * EffortSelector - Thinking budget and effort level selector.
 *
 * Shows either:
 * - Effort selector for adaptive reasoning models (GPT-5/o-series)
 * - Thinking budget selector for custom models
 */

import type { EffortLevel, ThinkingBudget } from '../../../core/types/settings';
import { t } from '../../../i18n';

/** Available effort levels */
export const EFFORT_LEVELS: { value: EffortLevel; label: string }[] = [
  { value: 'minimal', label: 'Minimal' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'xhigh', label: 'XHigh' },
];

/** Available thinking budgets with token counts */
export const THINKING_BUDGETS: { value: ThinkingBudget; label: string; tokens: number }[] = [
  { value: 0, label: 'Off', tokens: 0 },
  { value: 1024, label: '1K', tokens: 1024 },
  { value: 4096, label: '4K', tokens: 4096 },
  { value: 8192, label: '8K', tokens: 8192 },
  { value: 16384, label: '16K', tokens: 16384 },
];

/** Default effort level */
export const DEFAULT_EFFORT_LEVEL: EffortLevel = 'high';

/** Default thinking budget */
export const DEFAULT_THINKING_BUDGET: ThinkingBudget = 4096;

/**
 * Check if a model supports effort-based reasoning control.
 * This currently targets OpenAI reasoning models, which expose
 * `reasoningEffort` values like minimal/low/medium/high/xhigh.
 */
export function isAdaptiveThinkingModel(model: string): boolean {
  const normalized = model.toLowerCase().trim();
  if (!normalized) {
    return false;
  }

  if (!normalized.startsWith('openai/')) {
    return false;
  }

  return (
    normalized.includes('/gpt-5') ||
    normalized.includes('/o1') ||
    normalized.includes('/o3') ||
    normalized.includes('/o4')
  );
}

export interface EffortSelectorCallbacks {
  onEffortLevelChange: (effort: EffortLevel) => Promise<void>;
  onThinkingBudgetChange: (budget: ThinkingBudget) => Promise<void>;
  getEffortLevel: () => EffortLevel;
  getThinkingBudget: () => ThinkingBudget;
  getCurrentModel: () => string;
}

export class EffortSelector {
  private static tooltipLabelId = 0;
  private container: HTMLElement;
  private effortEl: HTMLElement | null = null;
  private effortGearsEl: HTMLElement | null = null;
  private budgetEl: HTMLElement | null = null;
  private budgetGearsEl: HTMLElement | null = null;
  private callbacks: EffortSelectorCallbacks;
  private activeMenu: 'effort' | 'budget' | null = null;
  private readonly handleDocumentMouseDown: (event: MouseEvent) => void;
  private readonly handleDocumentKeyDown: (event: KeyboardEvent) => void;

  constructor(parentEl: HTMLElement, callbacks: EffortSelectorCallbacks) {
    this.callbacks = callbacks;
    this.container = parentEl.createDiv({ cls: 'opencodian-effort-selector' });
    const doc = this.container.ownerDocument;
    this.handleDocumentMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Node && this.container.contains(target)) {
        return;
      }
      this.closeMenus();
    };
    this.handleDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        this.closeMenus();
      }
    };
    doc.addEventListener('mousedown', this.handleDocumentMouseDown, true);
    doc.addEventListener('keydown', this.handleDocumentKeyDown, true);
    this.render();
  }

  private render(): void {
    this.container.empty();

    // Effort selector (for adaptive thinking models)
    this.effortEl = this.container.createDiv({ cls: 'opencodian-effort-group' });
    const effortLabel = this.effortEl.createSpan({ cls: 'opencodian-effort-label' });
    effortLabel.setText(t('chat.effort.label'));
    this.effortGearsEl = this.effortEl.createDiv({ cls: 'opencodian-effort-gears' });

    // Budget selector (for custom models)
    this.budgetEl = this.container.createDiv({ cls: 'opencodian-effort-group' });
    const budgetLabel = this.budgetEl.createSpan({ cls: 'opencodian-effort-label' });
    budgetLabel.setText(t('chat.effort.thinking'));
    this.budgetGearsEl = this.budgetEl.createDiv({ cls: 'opencodian-effort-gears' });

    this.updateDisplay();
  }

  private renderEffortGears(): void {
    if (!this.effortGearsEl) return;
    this.effortGearsEl.empty();

    const currentEffort = this.callbacks.getEffortLevel();
    const currentInfo = EFFORT_LEVELS.find(e => e.value === currentEffort);

    // Current value display
    const currentEl = this.effortGearsEl.createDiv({ cls: 'opencodian-effort-current' });
    currentEl.setText(currentInfo?.label || 'High');
    currentEl.setAttribute('role', 'button');
    currentEl.setAttribute('tabindex', '0');
    currentEl.setAttribute('aria-haspopup', 'menu');
    currentEl.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.toggleMenu('effort');
    });
    currentEl.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        this.toggleMenu('effort');
      }
    });

    // Dropdown options
    const optionsEl = this.effortGearsEl.createDiv({ cls: 'opencodian-effort-options' });

    for (const effort of [...EFFORT_LEVELS].reverse()) {
      const gearEl = optionsEl.createDiv({ cls: 'opencodian-effort-gear' });
      gearEl.setText(effort.label);

      if (effort.value === currentEffort) {
        gearEl.addClass('selected');
      }

      gearEl.addEventListener('click', async (e) => {
        e.stopPropagation();
        await this.callbacks.onEffortLevelChange(effort.value);
        this.closeMenus();
        this.updateDisplay();
      });
    }
  }

  private renderBudgetGears(): void {
    if (!this.budgetGearsEl) return;
    this.budgetGearsEl.empty();

    const currentBudget = this.callbacks.getThinkingBudget();
    const currentBudgetInfo = THINKING_BUDGETS.find(b => b.value === currentBudget);

    // Current value display
    const currentEl = this.budgetGearsEl.createDiv({ cls: 'opencodian-effort-current' });
    currentEl.setText(currentBudgetInfo?.label || 'Off');
    currentEl.setAttribute('role', 'button');
    currentEl.setAttribute('tabindex', '0');
    currentEl.setAttribute('aria-haspopup', 'menu');
    currentEl.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.toggleMenu('budget');
    });
    currentEl.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        this.toggleMenu('budget');
      }
    });

    // Dropdown options
    const optionsEl = this.budgetGearsEl.createDiv({ cls: 'opencodian-effort-options' });

    for (const budget of [...THINKING_BUDGETS].reverse()) {
      const gearEl = optionsEl.createDiv({ cls: 'opencodian-effort-gear' });
      const tooltip = budget.tokens > 0
        ? t('chat.effort.tokens', { count: budget.tokens.toLocaleString() })
        : t('chat.effort.disabled');
      gearEl.setText(budget.label);
      gearEl.addClass('opencodian-tooltip-trigger');
      gearEl.setAttribute('data-tooltip', tooltip);
      gearEl.setAttribute('data-tooltip-align', 'right');
      this.attachTooltipLabel(gearEl, tooltip);

      if (budget.value === currentBudget) {
        gearEl.addClass('selected');
      }

      gearEl.addEventListener('click', async (e) => {
        e.stopPropagation();
        await this.callbacks.onThinkingBudgetChange(budget.value);
        this.closeMenus();
        this.updateDisplay();
      });
    }
  }

  updateDisplay(): void {
    const model = this.callbacks.getCurrentModel();
    if (!model) {
      this.closeMenus();
      if (this.effortEl) {
        this.effortEl.style.display = 'none';
      }
      if (this.budgetEl) {
        this.budgetEl.style.display = 'none';
      }
      return;
    }

    const adaptive = isAdaptiveThinkingModel(model);

    // Show effort selector for adaptive models, budget selector for others
    if (this.effortEl) {
      this.effortEl.style.display = adaptive ? '' : 'none';
    }
    if (this.budgetEl) {
      this.budgetEl.style.display = adaptive ? 'none' : '';
    }

    if (adaptive) {
      this.renderEffortGears();
    } else {
      this.renderBudgetGears();
    }
  }

  isEffortModel(model: string): boolean {
    return isAdaptiveThinkingModel(model);
  }

  /** Get the container element */
  getElement(): HTMLElement {
    return this.container;
  }

  destroy(): void {
    const doc = this.container.ownerDocument;
    doc.removeEventListener('mousedown', this.handleDocumentMouseDown, true);
    doc.removeEventListener('keydown', this.handleDocumentKeyDown, true);
    this.closeMenus();
    this.container.remove();
  }

  private toggleMenu(menu: 'effort' | 'budget'): void {
    if (this.activeMenu === menu) {
      this.closeMenus();
      return;
    }

    this.closeMenus();
    this.activeMenu = menu;

    if (menu === 'effort') {
      this.effortGearsEl?.addClass('is-open');
      return;
    }

    this.budgetGearsEl?.addClass('is-open');
  }

  private closeMenus(): void {
    this.activeMenu = null;
    this.effortGearsEl?.removeClass('is-open');
    this.budgetGearsEl?.removeClass('is-open');
  }

  private attachTooltipLabel(element: HTMLElement, label: string): void {
    const labelId = `opencodian-effort-tooltip-label-${EffortSelector.tooltipLabelId++}`;
    const labelEl = element.createSpan({
      cls: 'opencodian-visually-hidden',
      text: label,
    });
    labelEl.id = labelId;
    element.setAttribute('aria-labelledby', labelId);
  }
}
