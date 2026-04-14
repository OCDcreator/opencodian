import {
  formatContextLabel,
  getToolIdentity,
  isInternalStructuredOutputTool,
  parseLineRangeFromFileUrl,
  parseObsidianContextTag,
  resolveContextMimeFromPath,
  resolveToolExecutionStatus,
  resolveToolResultText,
  type ToolIdentityKind,
} from '../../shared';
import {
  contextPathFromFileUrl,
  normalizeContextAttachmentPath,
} from '../../shared/contextPath';
import type {
  ChatMessage,
  ContentBlock,
  MessageContextAttachment,
  PromptContextLineRange,
  QuestionOption,
  QuestionPrompt,
  QuestionRequest as ChatQuestionRequest,
  ToolCallInfo,
} from '../types';
import { detectOmoMessageMeta } from './omoCompat';
import type { OpenCodeCatalogToolIdentityContext } from './OpenCodeCatalogStateStore';

const INLINE_READ_TOOL_PREFIX = 'Called the Read tool with the following input:';

interface OpenCodeMessageRecord {
  id: string;
  role: 'user' | 'assistant';
  providerID?: string;
  modelID?: string;
  structured?: unknown;
  time?: {
    created?: number;
  };
}

interface OpenCodeMessagePart {
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

interface OpenCodeToolStateData {
  status: string;
  input?: Record<string, unknown>;
  output?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

interface OpenCodeToolPartData extends OpenCodeMessagePart {
  callID?: string;
  tool?: string;
  state?: OpenCodeToolStateData;
}

type OpenCodeChatRole = ChatMessage['role'];
type OpenCodeTextPart = OpenCodeMessagePart & { text: string };

interface OpenCodeToolContentAssembly {
  toolCalls: ToolCallInfo[];
  contentBlocks: ContentBlock[];
}

function resolveReasoningDurationSeconds(
  part: Pick<OpenCodeMessagePart, 'duration' | 'time'>,
): number | undefined {
  const start = part.time?.start;
  const end = part.time?.end;
  if (typeof start === 'number' && typeof end === 'number' && end >= start) {
    return Math.max(0, end - start) / 1000;
  }

  if (typeof part.duration === 'number' && part.duration > 0) {
    return part.duration;
  }

  return undefined;
}

function resolveOpenCodeToolKind(
  toolName: string | undefined | null,
  context: OpenCodeCatalogToolIdentityContext = {},
): ToolIdentityKind {
  return getToolIdentity(toolName || 'unknown', {
    source: 'opencode',
    knownMcpTools: context.knownMcpTools,
    registryTools: context.registryTools,
    observedExternalTools: context.observedExternalTools,
  }).kind;
}

class OpenCodeToolContentAssembler {
  assemble(
    parts: OpenCodeMessagePart[],
    content: string,
    toolIdentityContext: OpenCodeCatalogToolIdentityContext,
  ): OpenCodeToolContentAssembly {
    const toolParts = this.collectRenderableToolParts(parts);

    return {
      toolCalls: this.buildPendingToolCalls(toolParts, toolIdentityContext),
      contentBlocks: this.buildContentBlocks(parts, toolParts, content, toolIdentityContext),
    };
  }

  private collectRenderableToolParts(parts: OpenCodeMessagePart[]): OpenCodeToolPartData[] {
    return parts.filter((part) =>
      part.type === 'tool' && !isInternalStructuredOutputTool((part as OpenCodeToolPartData).tool),
    ) as OpenCodeToolPartData[];
  }

  private buildPendingToolCalls(
    toolParts: OpenCodeToolPartData[],
    toolIdentityContext: OpenCodeCatalogToolIdentityContext,
  ): ToolCallInfo[] {
    return toolParts
      .filter((part) => {
        const toolStatus = resolveToolExecutionStatus({
          toolName: part.tool,
          state: part.state,
        });
        return toolStatus === 'pending' || toolStatus === 'running';
      })
      .map((part) => ({
        id: part.callID ?? '',
        name: part.tool ?? '',
        toolSourceKey: part.tool ?? undefined,
        kind: resolveOpenCodeToolKind(part.tool, toolIdentityContext),
        input: part.state?.input ?? {},
        status: 'pending' as const,
      }));
  }

  private buildContentBlocks(
    parts: OpenCodeMessagePart[],
    toolParts: OpenCodeToolPartData[],
    content: string,
    toolIdentityContext: OpenCodeCatalogToolIdentityContext,
  ): ContentBlock[] {
    const contentBlocks = [
      ...this.buildThinkingContentBlocks(parts),
      ...this.buildToolUseContentBlocks(toolParts, toolIdentityContext),
    ];

    if (content) {
      contentBlocks.push({ type: 'text', text: content });
    }

    return contentBlocks;
  }

  private buildThinkingContentBlocks(parts: OpenCodeMessagePart[]): ContentBlock[] {
    return parts
      .filter((part): part is OpenCodeTextPart =>
        part.type === 'reasoning' && typeof part.text === 'string'
      )
      .map((part) => ({
        type: 'thinking' as const,
        thinking: part.text,
        durationSeconds: resolveReasoningDurationSeconds(part),
      }));
  }

  private buildToolUseContentBlocks(
    toolParts: OpenCodeToolPartData[],
    toolIdentityContext: OpenCodeCatalogToolIdentityContext,
  ): ContentBlock[] {
    const contentBlocks: ContentBlock[] = [];
    const processedToolIds = new Set<string>();

    for (const part of toolParts) {
      const toolId = part.callID || part.id;
      if (!toolId || processedToolIds.has(toolId)) {
        continue;
      }

      processedToolIds.add(toolId);
      const resultPart = this.findResolvedToolResultPart(toolParts, toolId);
      const toolStatus = resolveToolExecutionStatus({
        toolName: part.tool,
        state: resultPart?.state ?? part.state,
      });

      contentBlocks.push({
        type: 'tool_use',
        toolId,
        toolName: part.tool || 'unknown',
        toolSourceKey: part.tool || undefined,
        toolKind: resolveOpenCodeToolKind(part.tool, toolIdentityContext),
        toolInput: part.state?.input || {},
        toolStatus,
        toolResult: resolveToolResultText(resultPart?.state),
      });
    }

    return contentBlocks;
  }

  private findResolvedToolResultPart(
    toolParts: OpenCodeToolPartData[],
    toolId: string,
  ): OpenCodeToolPartData | undefined {
    return toolParts.find((candidate) => {
      if ((candidate.callID || candidate.id) !== toolId) {
        return false;
      }

      const toolStatus = resolveToolExecutionStatus({
        toolName: candidate.tool,
        state: candidate.state,
      });
      return toolStatus === 'completed' || toolStatus === 'error';
    });
  }
}

export class OpenCodeMessageNormalizationMapper {
  private readonly toolContentAssembler = new OpenCodeToolContentAssembler();

  normalizeQuestionRequest(raw: unknown): ChatQuestionRequest | null {
    if (!raw || typeof raw !== 'object') {
      return null;
    }

    const request = raw as {
      id?: unknown;
      sessionID?: unknown;
      questions?: unknown;
    };

    if (typeof request.id !== 'string' || typeof request.sessionID !== 'string') {
      return null;
    }

    const questions = Array.isArray(request.questions)
      ? request.questions.reduce<QuestionPrompt[]>((items, question) => {
          const normalized = this.normalizeQuestionPrompt(question);
          if (normalized) {
            items.push(normalized);
          }
          return items;
        }, [])
      : [];

    if (questions.length === 0) {
      return null;
    }

    return {
      id: request.id,
      sessionId: request.sessionID,
      questions,
    };
  }

  getOpenCodeToolKind(
    toolName: string | undefined | null,
    context: OpenCodeCatalogToolIdentityContext = {},
  ): ToolIdentityKind {
    return resolveOpenCodeToolKind(toolName, context);
  }

  openCodeMessageToChatMessage(
    info: OpenCodeMessageRecord,
    parts: OpenCodeMessagePart[],
    vaultPath?: string,
    toolIdentityContext: OpenCodeCatalogToolIdentityContext = {},
  ): ChatMessage {
    const role: OpenCodeChatRole = info.role === 'assistant' ? 'assistant' : 'user';
    const { content, contextAttachments } = this.collectMessageTextState(role, parts, vaultPath);
    const toolContent = this.toolContentAssembler.assemble(
      parts,
      content,
      toolIdentityContext,
    );
    const timestamp = typeof info.time?.created === 'number'
      ? info.time.created
      : Date.now();
    const normalizedContent = this.normalizeOmoContent(role, content);
    const structured = role === 'assistant' ? info.structured : undefined;

    return {
      id: info.id,
      role,
      content: normalizedContent.content,
      timestamp,
      modelId: role === 'assistant'
        ? OpenCodeMessageNormalizationMapper.formatModelIdentifier(info.providerID, info.modelID)
        : undefined,
      sourceMessageId: info.id,
      toolCalls: toolContent.toolCalls.length > 0 ? toolContent.toolCalls : undefined,
      contentBlocks: toolContent.contentBlocks.length > 0 ? toolContent.contentBlocks : undefined,
      contextAttachments: contextAttachments.length > 0
        ? this.dedupeContextAttachments(contextAttachments)
        : undefined,
      displayStyle: normalizedContent.displayStyle,
      noticeTone: normalizedContent.noticeTone,
      omo: normalizedContent.omo,
      structured,
      parts,
    };
  }

  static formatModelIdentifier(providerID?: string, modelID?: string): string | undefined {
    if (providerID && modelID) {
      return `${providerID}/${modelID}`;
    }

    if (typeof modelID === 'string' && modelID.trim()) {
      return modelID.trim();
    }

    return undefined;
  }

  private normalizeQuestionPrompt(raw: unknown): QuestionPrompt | null {
    if (!raw || typeof raw !== 'object') {
      return null;
    }

    const prompt = raw as {
      question?: unknown;
      header?: unknown;
      options?: unknown;
      multiple?: unknown;
      custom?: unknown;
    };

    const questionText = typeof prompt.question === 'string' ? prompt.question.trim() : '';
    const header = typeof prompt.header === 'string' && prompt.header.trim()
      ? prompt.header.trim()
      : questionText;
    if (!questionText || !header) {
      return null;
    }

    const options = Array.isArray(prompt.options)
      ? prompt.options.reduce<QuestionOption[]>((items, option) => {
          if (!option || typeof option !== 'object') {
            return items;
          }

          const normalizedOption = option as { label?: unknown; description?: unknown };
          const label = typeof normalizedOption.label === 'string' ? normalizedOption.label.trim() : '';
          if (!label) {
            return items;
          }

          items.push({
            label,
            description: typeof normalizedOption.description === 'string'
              ? normalizedOption.description.trim()
              : '',
          });
          return items;
        }, [])
      : [];

    return {
      question: questionText,
      header,
      options,
      multiple: prompt.multiple === true,
      custom: prompt.custom !== false,
    };
  }

  private collectMessageTextState(
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

    const filePart = part as OpenCodeMessagePart & {
      mime?: string;
      url?: string;
      source?: {
        type?: string;
        path?: string;
        text?: {
          value?: string;
        };
      };
    };

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
