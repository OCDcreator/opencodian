import { MarkdownRenderer as ObsidianMarkdownRenderer } from 'obsidian';

import { processFileLinks, registerFileLinkHandler } from './fileLink';
import { replaceImageEmbedsWithHtml } from './imageEmbed';
import type { CodeBlockOptions, MarkdownRendererOptions, RenderResult } from './types';

const DEFAULT_CODE_BLOCK_OPTIONS: CodeBlockOptions = {
  addLanguageLabel: true,
  addCopyButton: true,
  wrapperClass: 'markdown-code-wrapper',
  languageLabelClass: 'markdown-code-lang-label',
};

const TABLE_URL_TRUNCATION_THRESHOLD = 80;
const TABLE_URL_TRUNCATION_HEAD_LENGTH = 36;
const TABLE_URL_TRUNCATION_TAIL_LENGTH = 18;

export class MarkdownRenderService {
  private app: MarkdownRendererOptions['app'];
  private component: MarkdownRendererOptions['component'];
  private container: MarkdownRendererOptions['container'];
  private mediaFolder?: string;
  private onFileLinkClick?: MarkdownRendererOptions['onFileLinkClick'];
  private codeBlockOptions: CodeBlockOptions;

  constructor(options: MarkdownRendererOptions) {
    this.app = options.app;
    this.component = options.component;
    this.container = options.container;
    this.mediaFolder = options.mediaFolder;
    this.onFileLinkClick = options.onFileLinkClick;
    this.codeBlockOptions = DEFAULT_CODE_BLOCK_OPTIONS;

    this.init();
  }

  private init(): void {
    registerFileLinkHandler({
      app: this.app,
      container: this.container,
      component: this.component,
      onClick: this.onFileLinkClick,
    });
  }

  async render(el: HTMLElement, markdown: string): Promise<RenderResult> {
    el.empty();

    try {
      const processedMarkdown = replaceImageEmbedsWithHtml(markdown, {
        app: this.app,
        mediaFolder: this.mediaFolder,
      });

      await ObsidianMarkdownRenderer.renderMarkdown(
        processedMarkdown,
        el,
        '',
        this.component
      );

      this.enhanceTableLinks(el);
      this.enhanceCodeBlocks(el);
      processFileLinks(this.app, el);

      return { success: true };
    } catch (error) {
      el.createDiv({
        cls: 'markdown-render-error',
        text: 'Failed to render content.',
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private enhanceCodeBlocks(container: HTMLElement): void {
    const { addLanguageLabel, addCopyButton, wrapperClass, languageLabelClass } = this.codeBlockOptions;

    container.querySelectorAll('pre').forEach((pre) => {
      if (pre.parentElement?.classList.contains(wrapperClass!)) return;

      const wrapper = createEl('div', { cls: wrapperClass });
      pre.parentElement?.insertBefore(wrapper, pre);
      wrapper.appendChild(pre);

      const code = pre.querySelector('code[class*="language-"]');
      if (code && addLanguageLabel) {
        const match = code.className.match(/language-(\w+)/);
        if (match) {
          wrapper.classList.add('has-language');
          const label = createEl('span', {
            cls: languageLabelClass,
            text: match[1],
          });
          wrapper.appendChild(label);

          if (addCopyButton) {
            label.addEventListener('click', async () => {
              try {
                await navigator.clipboard.writeText(code.textContent || '');
                label.setText('copied!');
                setTimeout(() => label.setText(match[1]), 1500);
              } catch {
                // Clipboard API may fail in non-secure contexts
              }
            });
          }
        }
      }

      const obsidianCopyBtn = pre.querySelector('.copy-code-button');
      if (obsidianCopyBtn) {
        obsidianCopyBtn.remove();
      }
    });
  }

  private enhanceTableLinks(container: HTMLElement): void {
    container.querySelectorAll('table a[href]').forEach((linkEl) => {
      const link = linkEl as HTMLAnchorElement;
      const href = linkEl.getAttribute('href');
      const linkText = linkEl.textContent?.trim();

      if (!href || !linkText || linkText !== href) {
        return;
      }

      if (href.length <= TABLE_URL_TRUNCATION_THRESHOLD) {
        return;
      }

      const truncatedHref =
        `${href.slice(0, TABLE_URL_TRUNCATION_HEAD_LENGTH)}...${href.slice(-TABLE_URL_TRUNCATION_TAIL_LENGTH)}`;

      link.textContent = truncatedHref;
      link.title = href;
      link.setAttribute('aria-label', href);
    });
  }

  setCodeBlockOptions(options: Partial<CodeBlockOptions>): void {
    this.codeBlockOptions = { ...this.codeBlockOptions, ...options };
  }

  setMediaFolder(folder: string): void {
    this.mediaFolder = folder;
  }
}

export async function renderMarkdown(
  el: HTMLElement,
  markdown: string,
  options: MarkdownRendererOptions
): Promise<RenderResult> {
  const service = new MarkdownRenderService(options);
  return service.render(el, markdown);
}
