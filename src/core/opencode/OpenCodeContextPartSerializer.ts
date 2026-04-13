import * as path from 'path';

import {
  buildObsidianContextTag,
  createLogger,
  isTextLikeMime,
  toFileContextUrl,
} from '../../shared';
import { resolveContextPath } from '../../shared/contextPath';
import type { PromptContextItem } from '../types';
import type { QueryOptions } from './types';
import type { PromptRequestPart } from './OpenCodePromptRequestBuilder';

const logger = createLogger('OpenCodeContextPartSerializer');
const REMOTE_CONTEXT_TEXT_LIMIT_BYTES = 64 * 1024;

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
    return this.host.isLocalServerMode()
      ? this.createLocalContextPart(item)
      : this.createRemoteContextPart(item);
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
