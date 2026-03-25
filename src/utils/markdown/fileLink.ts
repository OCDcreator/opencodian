import type { App } from 'obsidian';

import type { FileLinkOptions } from './types';

const WIKILINK_PATTERN_SOURCE = '(?<!!)\\[\\[([^\\]|#^]+)(?:#[^\\]|]+)?(?:\\^[^\\]|]+)?(?:\\|[^\\]]+)?\\]\\]';

function createWikilinkPattern(): RegExp {
  return new RegExp(WIKILINK_PATTERN_SOURCE, 'g');
}

interface WikilinkMatch {
  index: number;
  fullMatch: string;
  linkPath: string;
  linkTarget: string;
  displayText: string;
}

export function extractLinkTarget(fullMatch: string): string {
  const inner = fullMatch.slice(2, -2);
  const pipeIndex = inner.indexOf('|');
  return pipeIndex >= 0 ? inner.slice(0, pipeIndex) : inner;
}

function fileExistsInVault(app: App, linkPath: string): boolean {
  const file = app.metadataCache.getFirstLinkpathDest(linkPath, '');
  if (file) return true;

  const directFile = app.vault.getFileByPath(linkPath);
  if (directFile) return true;

  if (!linkPath.endsWith('.md')) {
    const withExt = app.vault.getFileByPath(linkPath + '.md');
    if (withExt) return true;
  }

  return false;
}

function findWikilinks(app: App, text: string): WikilinkMatch[] {
  const pattern = createWikilinkPattern();
  const matches: WikilinkMatch[] = [];

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const fullMatch = match[0];
    const linkPath = match[1];
    const linkTarget = extractLinkTarget(fullMatch);

    if (!fileExistsInVault(app, linkPath)) continue;

    const pipeIndex = fullMatch.lastIndexOf('|');
    const displayText = pipeIndex > 0 ? fullMatch.slice(pipeIndex + 1, -2) : linkPath;

    matches.push({ index: match.index, fullMatch, linkPath, linkTarget, displayText });
  }

  return matches.sort((a, b) => b.index - a.index);
}

function createWikilinkElement(
  linkTarget: string,
  displayText: string,
  linkClass: string
): HTMLElement {
  const link = document.createElement('a');
  link.className = `${linkClass} internal-link`;
  link.textContent = displayText;
  link.setAttribute('data-href', linkTarget);
  link.setAttribute('href', linkTarget);
  return link;
}

function buildFragmentWithLinks(
  text: string,
  matches: WikilinkMatch[],
  linkClass: string
): DocumentFragment {
  const fragment = document.createDocumentFragment();
  let currentIndex = text.length;

  for (const { index, fullMatch, linkTarget, displayText } of matches) {
    const endIndex = index + fullMatch.length;

    if (endIndex < currentIndex) {
      fragment.insertBefore(
        document.createTextNode(text.slice(endIndex, currentIndex)),
        fragment.firstChild
      );
    }

    fragment.insertBefore(
      createWikilinkElement(linkTarget, displayText, linkClass),
      fragment.firstChild
    );
    currentIndex = index;
  }

  if (currentIndex > 0) {
    fragment.insertBefore(
      document.createTextNode(text.slice(0, currentIndex)),
      fragment.firstChild
    );
  }

  return fragment;
}

function processTextNode(
  app: App,
  node: Text,
  linkClass: string
): boolean {
  const text = node.textContent;
  if (!text || !text.includes('[[')) return false;

  const matches = findWikilinks(app, text);
  if (matches.length === 0) return false;

  node.parentNode?.replaceChild(buildFragmentWithLinks(text, matches, linkClass), node);
  return true;
}

export interface ProcessFileLinksOptions extends FileLinkOptions {
  linkClass?: string;
}

/**
 * 在 MarkdownRenderer.renderMarkdown() 之后调用。
 * 处理 Obsidian 渲染器未处理的 wikilinks（如代码块中的）。
 */
export function processFileLinks(
  app: App,
  container: HTMLElement,
  linkClass: string = 'markdown-file-link'
): void {
  if (!app || !container) return;

  container.querySelectorAll('code').forEach((codeEl) => {
    if (codeEl.parentElement?.tagName === 'PRE') return;

    const text = codeEl.textContent;
    if (!text || !text.includes('[[')) return;

    const matches = findWikilinks(app, text);
    if (matches.length === 0) return;

    codeEl.textContent = '';
    codeEl.appendChild(buildFragmentWithLinks(text, matches, linkClass));
  });

  const walker = document.createTreeWalker(
    container,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;

        const tagName = parent.tagName.toUpperCase();
        if (tagName === 'PRE' || tagName === 'CODE' || tagName === 'A') {
          return NodeFilter.FILTER_REJECT;
        }

        if (parent.closest('pre, code, a, .markdown-file-link, .internal-link')) {
          return NodeFilter.FILTER_REJECT;
        }

        return NodeFilter.FILTER_ACCEPT;
      },
    }
  );

  const textNodes: Text[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) {
    textNodes.push(node as Text);
  }

  for (const textNode of textNodes) {
    processTextNode(app, textNode, linkClass);
  }
}

export interface RegisterFileLinkHandlerOptions extends FileLinkOptions {
  linkSelector?: string;
}

/**
 * 在容器上注册委托的点击事件处理器。
 * 处理自定义链接和 Obsidian 的 .internal-link。
 */
export function registerFileLinkHandler(
  options: RegisterFileLinkHandlerOptions
): void {
  const { app, container, component, onClick, linkSelector = '.markdown-file-link, .internal-link' } = options;

  component.registerDomEvent(container, 'click', (event: MouseEvent) => {
    const target = event.target as HTMLElement;
    const link = target.closest(linkSelector) as HTMLAnchorElement;

    if (link) {
      event.preventDefault();
      const linkTarget = link.dataset.href || link.getAttribute('href');

      if (linkTarget) {
        if (onClick) {
          onClick(linkTarget, event);
        } else {
          void app.workspace.openLinkText(linkTarget, '', 'tab');
        }
      }
    }
  });
}
