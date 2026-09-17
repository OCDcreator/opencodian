import type { AssistantErrorFooterOptions } from './AssistantFooterRenderer';

export interface AssistantStreamErrorRenderOptions extends AssistantErrorFooterOptions {
  contentEl: HTMLElement;
}

export interface AssistantErrorRendererHost {
  finalizeErrorFooter(options: AssistantErrorFooterOptions): void;
}

export class AssistantErrorRenderer {
  constructor(private readonly host: AssistantErrorRendererHost) {}

  renderStreamError(options: AssistantStreamErrorRenderOptions): void {
    const {
      contentEl,
      ...footerOptions
    } = options;

    contentEl.empty();
    const errorEl = contentEl.createDiv({ cls: 'streaming-error-block' });
    errorEl.createSpan({ cls: 'streaming-error-icon', text: '❌' });

    const bodyEl = errorEl.createDiv({ cls: 'streaming-error-body' });
    const [headline, ...detailLines] = footerOptions.content.split('\n');
    const detail = detailLines.join('\n').trim();
    if (detail) {
      // Providers answer with a readable summary followed by their raw payload; keep both, but
      // only the summary is the headline the user has to read.
      bodyEl.createDiv({ cls: 'streaming-error-title', text: headline.trim() });
      bodyEl.createDiv({ cls: 'streaming-error-text', text: detail });
    } else {
      bodyEl.createDiv({ cls: 'streaming-error-text', text: headline });
    }

    this.host.finalizeErrorFooter(footerOptions);
  }
}
