/**
 * EffortSelector - Thinking budget and effort level selector.
 *
 * Shows either:
 * - Effort selector for adaptive thinking models (claude-sonnet-4, claude-opus-4)
 * - Thinking budget selector for custom models
 */

import { setIcon } from 'obsidian';
import { t } from '../../../i18n';

/** Effort levels for adaptive thinking models */
export type EffortLevel = 'low' | 'medium' | 'high' | 'max';

/** Thinking budget values for custom models */
export type ThinkingBudget = 'off' | 'low' | 'medium' | 'high' | 'xhigh';

/** Available effort levels */
export const EFFORT_LEVELS: { value: EffortLevel; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Med' },
  { value: 'high', label: 'High' },
  { value: 'max', label: 'Max' },
];

/** Available thinking budgets with token counts */
export const THINKING_BUDGETS: { value: ThinkingBudget; label: string; tokens: number }[] = [
  { value: 'off', label: 'Off', tokens: 0 },
  { value: 'low', label: '1K', tokens: 1024 },
  { value: 'medium', label: '4K', tokens: 4096 },
  { value: 'high', label: '8K', tokens: 8192 },
  { value: 'xhigh', label: '16K', tokens: 16384 },
];

/** Default effort level */
export const DEFAULT_EFFORT_LEVEL: EffortLevel = 'high';

/** Default thinking budget */
export const DEFAULT_THINKING_BUDGET: ThinkingBudget = 'medium';

/**
 * Check if a model supports adaptive thinking (effort-based).
 * These are the newer Claude models that use effort levels.
 */
export function isAdaptiveThinkingModel(model: string): boolean {
  const adaptiveModels = [
    'claude-sonnet-4',
    'claude-opus-4',
    'claude-4-sonnet',
    'claude-4-opus',
    'claude-3-7-sonnet',
    'claude-3.7-sonnet',
  ];
  return adaptiveModels.some(m => model.toLowerCase().includes(m));
}

export interface EffortSelectorCallbacks {
  onEffortLevelChange: (effort: EffortLevel) => Promise<void>;
  onThinkingBudgetChange: (budget: ThinkingBudget) => Promise<void>;
  getEffortLevel: () => EffortLevel;
  getThinkingBudget: () => ThinkingBudget;
  getCurrentModel: () => string;
}

export class EffortSelector {
  private container: HTMLElement;
  private effortEl: HTMLElement | null = null;
  private effortGearsEl: HTMLElement | null = null;
  private budgetEl: HTMLElement | null = null;
  private budgetGearsEl: HTMLElement | null = null;
  private callbacks: EffortSelectorCallbacks;

  constructor(parentEl: HTMLElement, callbacks: EffortSelectorCallbacks) {
    this.callbacks = callbacks;
    this.container = parentEl.createDiv({ cls: 'opencodian-effort-selector' });
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

    // Dropdown options
    const optionsEl = this.budgetGearsEl.createDiv({ cls: 'opencodian-effort-options' });

    for (const budget of [...THINKING_BUDGETS].reverse()) {
      const gearEl = optionsEl.createDiv({ cls: 'opencodian-effort-gear' });
      gearEl.setText(budget.label);
      gearEl.setAttribute('title', budget.tokens > 0 ? `${budget.tokens.toLocaleString()} tokens` : t('chat.effort.disabled'));

      if (budget.value === currentBudget) {
        gearEl.addClass('selected');
      }

      gearEl.addEventListener('click', async (e) => {
        e.stopPropagation();
        await this.callbacks.onThinkingBudgetChange(budget.value);
        this.updateDisplay();
      });
    }
  }

  updateDisplay(): void {
    const model = this.callbacks.getCurrentModel();
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

  /** Get the container element */
  getElement(): HTMLElement {
    return this.container;
  }
}
