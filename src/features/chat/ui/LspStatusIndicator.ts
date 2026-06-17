import { Component } from 'obsidian';

import { t } from '../../../i18n';

export interface LspStatusSummary {
  total: number;
  connected: number;
  errored: number;
  servers: Array<{ id: string; name: string; status: string }>;
}

interface LspStatusIndicatorOptions {
  onClick: () => void;
  setTooltipLabel?: (element: HTMLElement, label: string, position?: 'bottom' | 'left' | 'right' | 'top') => void;
}

type LspStatusTone = 'connected' | 'partial' | 'error';

export class LspStatusIndicator extends Component {
  private readonly el: HTMLElement;
  private readonly dotEl: HTMLElement;
  private readonly textEl: HTMLElement;
  private status: LspStatusSummary | null = null;

  constructor(
    containerEl: HTMLElement,
    private readonly options: LspStatusIndicatorOptions,
  ) {
    super();
    this.el = containerEl.createDiv({ cls: 'opencodian-lsp-status opencodian-tooltip-trigger' });
    this.dotEl = this.el.createSpan({ cls: 'opencodian-lsp-status-dot connected' });
    this.textEl = this.el.createSpan({ cls: 'opencodian-lsp-status-text' });
    this.el.addEventListener('click', () => {
      this.options.onClick();
    });
  }

  onload(): void {
    this.render();
  }

  update(status: LspStatusSummary): void {
    this.status = status;
    this.render();
  }

  refreshLocale(): void {
    this.render();
  }

  private render(): void {
    const status = this.status;
    if (!status || status.total === 0) {
      this.el.hide();
      this.textEl.setText(t('lsp.status.none'));
      return;
    }

    this.el.show();
    const tone = this.getTone(status);
    this.dotEl.removeClass('connected', 'partial', 'error');
    this.dotEl.addClass(tone);
    this.textEl.setText(this.getLabel(status, tone));
    this.options.setTooltipLabel?.(this.el, this.getTooltip(status), 'bottom');
  }

  private getTone(status: LspStatusSummary): LspStatusTone {
    if (status.errored > 0) {
      return 'error';
    }

    if (status.connected < status.total) {
      return 'partial';
    }

    return 'connected';
  }

  private getLabel(status: LspStatusSummary, tone: LspStatusTone): string {
    if (tone === 'error') {
      return t('lsp.status.error');
    }

    if (tone === 'partial') {
      return t('lsp.status.partial', {
        connected: status.connected,
        total: status.total,
      });
    }

    return t('lsp.status.connected', { count: status.connected });
  }

  private getTooltip(status: LspStatusSummary): string {
    const serverSummary = status.servers
      .map((server) => `${server.name}: ${server.status}`)
      .join('\n');
    return serverSummary || t('lsp.status.none');
  }
}
