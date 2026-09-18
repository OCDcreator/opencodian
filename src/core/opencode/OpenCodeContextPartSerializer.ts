import * as path from 'path';

import {
  buildObsidianContextTag,
  buildPdfContextTag,
  createLogger,
  isTextLikeMime,
  toFileContextUrl,
} from '../../shared';
import { resolveContextPath } from '../../shared/contextPath';
import type { PromptContextItem } from '../types';
import type { PromptRequestPart } from './OpenCodePromptRequestBuilder';
import type { QueryOptions } from './types';

const logger = createLogger('OpenCodeContextPartSerializer');
const REMOTE_CONTEXT_TEXT_LIMIT_BYTES = 64 * 1024;

/** UTF-8 byte length with the jsdom-safe fallback (memoryTypes convention). */
function utf8ByteLength(text: string): number {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(text).length;
  }
  return Buffer.byteLength(text, 'utf8');
}

interface OpenCodeContextPartSerializerHost {
  isLocalServerMode(): boolean;
  getVaultPath(): string | undefined;
}

export class OpenCodeContextPartSerializer {
  constructor(private readonly host: OpenCodeContextPartSerializerHost) {}

  buildPromptRequestParts(message: string, options: QueryOptions): PromptRequestPart[] {
    const parts: PromptRequestPart[] = [{ type: 'text', text: message }];

    for (const item of options.contextItems ?? []) {
      parts.push(this.createPromptContextPart(item));
    }

    for (const image of options.images ?? []) {
      parts.push({
        type: 'file',
        mime: image.mediaType,
        filename: image.filename,
        url: `data:${image.mediaType};base64,${image.data}`,
      });
    }

    if (options.externalContextPaths?.length) {
      logger.debug('externalContextPaths are deprecated for sendMessage/requestAssistantResponse and are being omitted', {
        count: options.externalContextPaths.length,
      });
    }

    return parts;
  }

  createPromptContextPart(item: PromptContextItem): PromptRequestPart {
    // Directory references (R-A7) are path-only tags in both server modes: a
    // file URL is meaningless for a folder, and no text snapshot ever exists.
    if (item.kind === 'folder') {
      return {
        type: 'text',
        text: buildObsidianContextTag(item),
        synthetic: true,
        metadata: {
          kind: item.kind,
          path: item.path,
        },
      };
    }
    // PDF entries (R-C4) are text-only in both server modes: the payload is
    // the extracted text layer carried on `pdfPages`/`pdfSelection` — never
    // a binary file URL, never `textSnapshot`.
    if (item.kind === 'pdf_document' || item.kind === 'pdf_selection') {
      return this.createPdfContextPart(item);
    }
    return this.host.isLocalServerMode()
      ? this.createLocalContextPart(item)
      : this.createRemoteContextPart(item);
  }

  /**
   * PDF context parts (R-C4): the same synthetic `<obsidian_context>` text
   * part in local and remote mode, so the extracted pages reach every
   * backend identically (design §4 row 5). The remote byte cap applies to
   * the rendered payload; over-limit documents were already refused at
   * attach time — this is the last-line guard, fail-closed like the rest.
   */
  private createPdfContextPart(item: PromptContextItem): PromptRequestPart {
    const text = buildPdfContextTag(item);
    const byteLength = utf8ByteLength(text);
    if (!this.host.isLocalServerMode() && byteLength > REMOTE_CONTEXT_TEXT_LIMIT_BYTES) {
      // Remote mode: same hard cap as every other text context; over-limit
      // documents were already refused at attach time (fail-closed).
      throw new Error(`PDF context exceeds remote size limit: ${item.label}`);
    }

    logger.debug('Preparing PDF context part', {
      kind: item.kind,
      path: item.path,
      pageCount: item.pdf?.pageCount,
      pages: item.pdfPages?.length,
      hasSelection: Boolean(item.pdfSelection),
      byteLength,
    });

    return {
      type: 'text',
      text,
      synthetic: true,
      metadata: {
        kind: item.kind,
        path: item.path,
        ...(item.pdf?.fragment
          ? { pages: `${item.pdf.fragment.pageFrom}-${item.pdf.fragment.pageTo}` }
          : {}),
      },
    };
  }

  private createLocalContextPart(item: PromptContextItem): PromptRequestPart {
    const absolutePath = resolveContextPath(item.path, this.host.getVaultPath());
    const normalizedMime = isTextLikeMime(item.mime) ? 'text/plain' : item.mime;
    const part: Extract<PromptRequestPart, { type: 'file' }> = {
      type: 'file',
      mime: normalizedMime,
      filename: path.basename(item.path.replace(/\\/g, '/')),
      url: toFileContextUrl(absolutePath, item.lineRange),
    };

    logger.debug('Preparing local Obsidian context part', {
      kind: item.kind,
      path: item.path,
      requestedMime: item.mime,
      normalizedMime,
      hasLineRange: Boolean(item.lineRange),
      hasTextSnapshot: Boolean(item.textSnapshot),
    });

    if (item.kind === 'selection' && item.textSnapshot) {
      part.source = {
        type: 'file',
        path: item.path,
        text: {
          value: item.textSnapshot,
          start: 0,
          end: item.textSnapshot.length,
        },
      };
    }

    return part;
  }

  private createRemoteContextPart(item: PromptContextItem): PromptRequestPart {
    if (!isTextLikeMime(item.mime)) {
      throw new Error(`Only text context is supported in remote mode: ${item.label}`);
    }

    if (!item.textSnapshot) {
      throw new Error(`Missing text snapshot for remote context: ${item.label}`);
    }

    const byteLength = new TextEncoder().encode(item.textSnapshot).length;
    if (byteLength > REMOTE_CONTEXT_TEXT_LIMIT_BYTES) {
      throw new Error(`Context exceeds remote size limit: ${item.label}`);
    }

    return {
      type: 'text',
      text: buildObsidianContextTag(item),
      synthetic: true,
      metadata: {
        kind: item.kind,
        path: item.path,
        lines: item.lineRange ? `${item.lineRange.startLine}-${item.lineRange.endLine}` : undefined,
      },
    };
  }
}
