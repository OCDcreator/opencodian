import type { App, TFile } from 'obsidian';

import type { ImageEmbedOptions } from './types';

const IMAGE_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'svg',
  'bmp',
  'ico',
]);

const IMAGE_EMBED_PATTERN = /!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

function isImagePath(path: string): boolean {
  const ext = path.split('.').pop()?.toLowerCase();
  return ext ? IMAGE_EXTENSIONS.has(ext) : false;
}

function escapeHtml(str: string): string {
  const htmlEntities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return str.replace(/[&<>"']/g, (char) => htmlEntities[char] || char);
}

function resolveImageFile(
  app: App,
  imagePath: string,
  mediaFolder?: string
): TFile | null {
  let file = app.vault.getFileByPath(imagePath);
  if (file) return file;

  if (mediaFolder) {
    const withFolder = `${mediaFolder}/${imagePath}`;
    file = app.vault.getFileByPath(withFolder);
    if (file) return file;
  }

  const resolved = app.metadataCache.getFirstLinkpathDest(imagePath, '');
  if (resolved) return resolved;

  return null;
}

function buildStyleAttribute(altText: string | undefined): string {
  if (!altText) return '';

  const dimMatch = altText.match(/^(\d+)(?:x(\d+))?$/);
  if (!dimMatch) return '';

  const width = dimMatch[1];
  const height = dimMatch[2];

  if (height) {
    return ` style="width: ${width}px; height: ${height}px;"`;
  }
  return ` style="width: ${width}px;"`;
}

function createImageHtml(
  app: App,
  file: TFile,
  altText: string | undefined,
  wrapperClass: string
): string {
  const src = app.vault.getResourcePath(file);
  const alt = escapeHtml(altText || file.basename);
  const style = buildStyleAttribute(altText);

  return `<span class="${wrapperClass}"><img src="${escapeHtml(src)}" alt="${alt}" loading="lazy"${style}></span>`;
}

function createFallbackHtml(wikilink: string, fallbackClass: string): string {
  return `<span class="${fallbackClass}">${escapeHtml(wikilink)}</span>`;
}

export interface ReplaceImageEmbedsOptions extends ImageEmbedOptions {
  wrapperClass?: string;
  fallbackClass?: string;
}

/**
 * 在 MarkdownRenderer.renderMarkdown() 之前调用。
 * 将 ![[image.png]] 替换为 HTML img 标签。
 * 非图片嵌入（如 ![[note.md]]）保持不变。
 */
export function replaceImageEmbedsWithHtml(
  markdown: string,
  options: ReplaceImageEmbedsOptions
): string {
  const { app, mediaFolder, wrapperClass = 'markdown-embedded-image', fallbackClass = 'markdown-embedded-image-fallback' } = options;

  if (!app?.vault || !app?.metadataCache) {
    return markdown;
  }

  IMAGE_EMBED_PATTERN.lastIndex = 0;

  return markdown.replace(
    IMAGE_EMBED_PATTERN,
    (match, imagePath: string, altText: string | undefined) => {
      try {
        if (!isImagePath(imagePath)) {
          return match;
        }

        const file = resolveImageFile(app, imagePath, mediaFolder);
        if (!file) {
          return createFallbackHtml(match, fallbackClass);
        }

        return createImageHtml(app, file, altText, wrapperClass);
      } catch {
        return createFallbackHtml(match, fallbackClass);
      }
    }
  );
}
