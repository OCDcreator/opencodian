import {
  formatContextLabel,
  parseLineRangeFromFileUrl,
  parseObsidianContextTag,
  resolveContextMimeFromPath,
} from '../../shared';
import {
  contextPathFromFileUrl,
  normalizeContextAttachmentPath,
} from '../../shared/contextPath';
import type {
  ChatMessage,
  MessageContextAttachment,
  PromptContextLineRange,
} from '../types';
import { detectOmoMessageMeta } from './omoCompat';

const INLINE_READ_TOOL_PREFIX = 'Called the Read tool with the following input:';

export interface OpenCodeMessagePart {
  id: string;
  sessionID: string;
  messageID: string;
  type: string;
  text?: string;
  duration?: number;
  time?: {
    start?: number;
    end?: number;
  };
  [key: string]: unknown;
}

export type OpenCodeChatRole = ChatMessage['role'];
export type OpenCodeTextPart = OpenCodeMessagePart & { text: string };

export interface OpenCodeMessageContextOmoAssembly extends Pick<
  ChatMessage,
  'content' | 'displayStyle' | 'noticeTone' | 'omo'
> {
  renderableContent: string;
  contextAttachments: MessageContextAttachment[];
}

interface OpenCodeFilePart extends OpenCodeMessagePart {
  mime?: string;
  url?: string;
  source?: {
    type?: string;
    path?: string;
    text?: {
      value?: string;
    };
  };
}

export class OpenCodeMessageContextOmoAssembler {
  assemble(
    role: OpenCodeChatRole,
    parts: OpenCodeMessagePart[],
    vaultPath?: string,
  ): OpenCodeMessageContextOmoAssembly {
    const { content: renderableContent, contextAttachments } = this.collectRenderableTextState(
      role,
      parts,
      vaultPath,
    );
    const normalizedContent = this.normalizeOmoContent(role, renderableContent);

    return {
      renderableContent,
      content: normalizedContent.content,
      contextAttachments: contextAttachments.length > 0
        ? this.dedupeContextAttachments(contextAttachments)
        : [],
      displayStyle: normalizedContent.displayStyle,
      noticeTone: normalizedContent.noticeTone,
      omo: normalizedContent.omo,
    };
  }

  private collectRenderableTextState(
    role: OpenCodeChatRole,
    parts: OpenCodeMessagePart[],
    vaultPath?: string,
  ): { content: string; contextAttachments: MessageContextAttachment[] } {
    const visibleTextParts: string[] = [];
    const contextAttachments: MessageContextAttachment[] = [];

    for (const part of parts) {
      if (part.type !== 'text' || typeof part.text !== 'string') {
        continue;
      }

      const normalizedPart = this.normalizeTextPart(role, part, vaultPath);
      if (normalizedPart.visibleText) {
        visibleTextParts.push(normalizedPart.visibleText);
      }
      if (normalizedPart.attachments.length > 0) {
        contextAttachments.push(...normalizedPart.attachments);
      }
    }

    const content = visibleTextParts.join('');
    if (role !== 'user') {
      return { content, contextAttachments };
    }

    contextAttachments.push(...this.collectFileContextAttachments(parts, vaultPath));

    const inlineReadContext = this.extractInlineReadToolContext(content, vaultPath);
    return {
      content: inlineReadContext.content,
      contextAttachments: contextAttachments.concat(inlineReadContext.attachments),
    };
  }

  private normalizeTextPart(
    role: OpenCodeChatRole,
    part: OpenCodeTextPart,
    vaultPath?: string,
  ): { visibleText?: string; attachments: MessageContextAttachment[] } {
    if (role !== 'user') {
      return {
        visibleText: part.text,
        attachments: [],
      };
    }

    const contextAttachment = parseObsidianContextTag(part.text);
    if (contextAttachment) {
      return { attachments: [contextAttachment] };
    }

    if ((part as OpenCodeMessagePart & { synthetic?: boolean }).synthetic === true) {
      return this.extractInlineReadToolContext(part.text, vaultPath);
    }

    return {
      visibleText: part.text,
      attachments: [],
    };
  }

  private collectFileContextAttachments(
    parts: OpenCodeMessagePart[],
    vaultPath?: string,
  ): MessageContextAttachment[] {
    return parts.reduce<MessageContextAttachment[]>((attachments, part) => {
      const contextAttachment = this.parseFileContextAttachment(part, vaultPath);
      if (contextAttachment) {
        attachments.push(contextAttachment);
      }
      return attachments;
    }, []);
  }

  private normalizeOmoContent(
    role: OpenCodeChatRole,
    content: string,
  ): Pick<ChatMessage, 'content' | 'displayStyle' | 'noticeTone' | 'omo'> {
    const omo = detectOmoMessageMeta(role, content);
    return {
      content: omo?.kind === 'user-injection'
        ? omo.originalText
        : omo?.kind === 'system-reminder'
          ? omo.reminderText
          : content,
      displayStyle: omo?.kind === 'system-reminder' ? 'notice' : undefined,
      noticeTone: omo?.kind === 'system-reminder' ? 'info' : undefined,
      omo: omo ?? undefined,
    };
  }

  private parseFileContextAttachment(
    part: OpenCodeMessagePart,
    vaultPath?: string,
  ): MessageContextAttachment | null {
    if (part.type !== 'file') {
      return null;
    }

    const filePart = part as OpenCodeFilePart;
    const sourcePath = typeof filePart.source?.path === 'string'
      ? normalizeContextAttachmentPath(filePart.source.path, vaultPath)
      : undefined;
    const rawUrlPath = typeof filePart.url === 'string'
      ? contextPathFromFileUrl(filePart.url)
      : null;
    const urlPath = rawUrlPath
      ? normalizeContextAttachmentPath(rawUrlPath, vaultPath)
      : null;
    const contextPath = sourcePath ?? urlPath;
    if (!contextPath) {
      return null;
    }

    const lineRange = typeof filePart.url === 'string'
      ? parseLineRangeFromFileUrl(filePart.url) ?? undefined
      : undefined;
    const textSnapshot = typeof filePart.source?.text?.value === 'string'
      ? filePart.source.text.value
      : undefined;

    return {
      kind: lineRange ? 'selection' : 'file',
      path: contextPath,
      label: formatContextLabel(contextPath, lineRange),
      mime: typeof filePart.mime === 'string' && filePart.mime.trim()
        ? filePart.mime
        : resolveContextMimeFromPath(contextPath),
      lineRange,
      textSnapshot,
    };
  }

  private extractInlineReadToolContext(
    text: string,
    vaultPath?: string,
  ): { content: string; attachments: MessageContextAttachment[] } {
    if (!text.includes(INLINE_READ_TOOL_PREFIX)) {
      return {
        content: text,
        attachments: [],
      };
    }

    const attachments: MessageContextAttachment[] = [];
    const visibleSegments: string[] = [];
    let cursor = 0;

    while (cursor < text.length) {
      const markerIndex = text.indexOf(INLINE_READ_TOOL_PREFIX, cursor);
      if (markerIndex < 0) {
        visibleSegments.push(text.slice(cursor));
        break;
      }

      const parsedInvocation = this.parseInlineReadToolInvocation(text, markerIndex, vaultPath);
      if (!parsedInvocation) {
        visibleSegments.push(text.slice(cursor, markerIndex + INLINE_READ_TOOL_PREFIX.length));
        cursor = markerIndex + INLINE_READ_TOOL_PREFIX.length;
        continue;
      }

      visibleSegments.push(text.slice(cursor, markerIndex));
      attachments.push(parsedInvocation.attachment);
      cursor = parsedInvocation.nextIndex;
    }

    return {
      content: visibleSegments.join('').trim(),
      attachments,
    };
  }

  private parseInlineReadToolInvocation(
    text: string,
    markerIndex: number,
    vaultPath?: string,
  ): { attachment: MessageContextAttachment; nextIndex: number } | null {
    let cursor = markerIndex + INLINE_READ_TOOL_PREFIX.length;
    while (cursor < text.length && /\s/.test(text[cursor])) {
      cursor += 1;
    }

    if (text[cursor] !== '{') {
      return null;
    }

    const jsonEnd = this.findBalancedJsonObjectEnd(text, cursor);
    if (jsonEnd < 0) {
      return null;
    }

    const parsedInput = this.safeParseJsonRecord(text.slice(cursor, jsonEnd + 1));
    const inputPath = this.extractPathFromToolInput(parsedInput);
    if (!inputPath) {
      return null;
    }

    const contextPath = normalizeContextAttachmentPath(inputPath, vaultPath);
    const lineRange = this.extractLineRangeFromToolInput(parsedInput);

    return {
      attachment: {
        kind: lineRange ? 'selection' : 'file',
        path: contextPath,
        label: formatContextLabel(contextPath, lineRange),
        mime: resolveContextMimeFromPath(contextPath),
        lineRange,
      },
      nextIndex: jsonEnd + 1,
    };
  }

  private findBalancedJsonObjectEnd(text: string, startIndex: number): number {
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = startIndex; index < text.length; index += 1) {
      const char = text[index];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === '\\') {
        escaped = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (inString) {
        continue;
      }

      if (char === '{') {
        depth += 1;
      } else if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          return index;
        }
      }
    }

    return -1;
  }

  private safeParseJsonRecord(value: string): Record<string, unknown> | null {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object'
        ? parsed as Record<string, unknown>
        : null;
    } catch {
      return null;
    }
  }

  private extractPathFromToolInput(input: Record<string, unknown> | null): string | null {
    if (!input) {
      return null;
    }

    const candidates = [
      input.filePath,
      input.file_path,
      input.path,
      input.notebook_path,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate.trim();
      }
    }

    return null;
  }

  private extractLineRangeFromToolInput(
    input: Record<string, unknown> | null,
  ): PromptContextLineRange | undefined {
    if (!input) {
      return undefined;
    }

    const offset = this.parsePositiveInteger(input.offset);
    const limit = this.parsePositiveInteger(input.limit);
    if (offset === null || limit === null) {
      return undefined;
    }

    return {
      startLine: offset,
      endLine: offset + limit - 1,
    };
  }

  private parsePositiveInteger(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return Math.floor(value);
    }

    if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
      const parsed = Number(value.trim());
      return parsed > 0 ? parsed : null;
    }

    return null;
  }

  private dedupeContextAttachments(
    attachments: MessageContextAttachment[],
  ): MessageContextAttachment[] {
    const seen = new Set<string>();
    const deduped: MessageContextAttachment[] = [];

    for (const attachment of attachments) {
      const key = [
        attachment.kind,
        attachment.path,
        attachment.lineRange?.startLine ?? '',
        attachment.lineRange?.endLine ?? '',
      ].join(':');

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      deduped.push(attachment);
    }

    return deduped;
  }
}
