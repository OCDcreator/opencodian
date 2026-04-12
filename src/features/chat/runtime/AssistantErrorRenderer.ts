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
    errorEl.createSpan({ cls: 'streaming-error-text', text: footerOptions.content });

    this.host.finalizeErrorFooter(footerOptions);
  }
}
