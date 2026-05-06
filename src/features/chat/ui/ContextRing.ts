import type { TabContextState } from '../../../core/types';
import { t } from '../../../i18n';
import { ContextUsageService } from '../services/ContextUsageService';

const RADIUS = 13.4;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export class ContextRing {
  private static tooltipLabelId = 0;
  private readonly buttonEl: HTMLButtonElement;
  private readonly progressEl: SVGCircleElement;
  private readonly labelEl: HTMLSpanElement;
  private readonly srLabelEl: HTMLSpanElement;

  constructor(
    parentEl: HTMLElement,
    private readonly onClick: () => void,
  ) {
    this.buttonEl = parentEl.createEl('button', {
      cls: 'opencodian-context-ring opencodian-tooltip-trigger',
      attr: { type: 'button', 'data-tooltip-position': 'top' },
    });

    const meterEl = this.buttonEl.createSpan({ cls: 'opencodian-context-ring-meter' });

    const svgEl = meterEl.createSvg('svg', {
      cls: 'opencodian-context-ring-svg',
      attr: { viewBox: '0 0 36 36', 'aria-hidden': 'true' },
    });

    svgEl.createSvg('circle', {
      cls: 'opencodian-context-ring-track',
      attr: { cx: '18', cy: '18', r: String(RADIUS) },
    });

    this.progressEl = svgEl.createSvg('circle', {
      cls: 'opencodian-context-ring-progress',
      attr: { cx: '18', cy: '18', r: String(RADIUS) },
    });
    this.progressEl.style.strokeDasharray = String(CIRCUMFERENCE);
    this.progressEl.style.strokeDashoffset = String(CIRCUMFERENCE);

    this.labelEl = meterEl.createSpan({ cls: 'opencodian-context-ring-label' });
    this.srLabelEl = this.buttonEl.createSpan({ cls: 'opencodian-visually-hidden' });
    this.srLabelEl.id = `opencodian-context-ring-label-${ContextRing.tooltipLabelId++}`;
    this.buttonEl.setAttribute('aria-labelledby', this.srLabelEl.id);

    this.buttonEl.addEventListener('click', () => {
      this.onClick();
    });
  }

  update(state: TabContextState | null): void {
    const summary = ContextUsageService.summarize(state);
    const offset = CIRCUMFERENCE * (1 - summary.percentage / 100);

    this.buttonEl.removeClass(
      'is-success',
      'is-warning',
      'is-danger',
      'is-muted',
      'is-unavailable',
    );
    this.buttonEl.addClass(`is-${summary.tone}`);
    this.buttonEl.toggleClass('is-unavailable', summary.isUnavailable);

    this.progressEl.style.strokeDashoffset = String(offset);
    this.labelEl.setText(summary.ringLabel);
    this.buttonEl.setAttribute('data-tooltip', summary.tooltip);
    this.buttonEl.removeAttribute('title');
    this.srLabelEl.setText(summary.isUnavailable
      ? t('context.usage.title')
      : summary.isCompacting
        ? `${t('context.usage.title')}: ${t('context.usage.compacting')}`
        : `${t('context.usage.title')}: ${summary.percentage}%`);
    this.buttonEl.removeAttribute('aria-label');
  }

  destroy(): void {
    this.buttonEl.remove();
  }
}
