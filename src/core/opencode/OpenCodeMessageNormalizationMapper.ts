import {
  getToolIdentity,
  isInternalStructuredOutputTool,
  resolveToolExecutionStatus,
  resolveToolResultText,
  type ToolIdentityKind,
} from '../../shared';
import type {
  ChatMessage,
  ContentBlock,
  QuestionOption,
  QuestionPrompt,
  QuestionRequest as ChatQuestionRequest,
  ToolCallInfo,
} from '../types';
import type { OpenCodeCatalogToolIdentityContext } from './OpenCodeCatalogStateStore';
import {
  type OpenCodeChatRole,
  OpenCodeMessageContextOmoAssembler,
  type OpenCodeMessagePart,
  type OpenCodeTextPart,
} from './OpenCodeMessageContextOmoAssembler';

interface OpenCodeMessageRecord {
  id: string;
  role: 'user' | 'assistant';
  providerID?: string;
  modelID?: string;
  summary?: boolean;
  structured?: unknown;
  time?: {
    created?: number;
  };
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

interface OpenCodeToolContentAssembly {
  toolCalls: ToolCallInfo[];
  contentBlocks: ContentBlock[];
}

function extractRenderableToolMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!metadata) {
    return undefined;
  }

  const sessionId = typeof metadata.sessionId === 'string' && metadata.sessionId.trim()
    ? metadata.sessionId.trim()
    : null;
  if (!sessionId) {
    return undefined;
  }

  return { sessionId };
}

function resolveToolResultVisibility(
  toolName: string | undefined | null,
  toolKind: ToolIdentityKind,
): 'hidden' | undefined {
  return toolKind === 'task' || getToolIdentity(toolName || 'unknown').kind === 'task'
    ? 'hidden'
    : undefined;
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
      .map((part) => {
        const kind = resolveOpenCodeToolKind(part.tool, toolIdentityContext);
        return {
          id: part.callID ?? '',
          name: part.tool ?? '',
          toolSourceKey: part.tool ?? undefined,
          kind,
          input: part.state?.input ?? {},
          toolMetadata: extractRenderableToolMetadata(part.state?.metadata),
          resultVisibility: resolveToolResultVisibility(part.tool, kind),
          status: 'pending' as const,
        };
      });
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
      const toolKind = resolveOpenCodeToolKind(part.tool, toolIdentityContext);
      const toolStatus = resolveToolExecutionStatus({
        toolName: part.tool,
        state: resultPart?.state ?? part.state,
      });
      const toolMetadata = extractRenderableToolMetadata(
        resultPart?.state?.metadata ?? part.state?.metadata,
      );

      contentBlocks.push({
        type: 'tool_use',
        toolId,
        toolName: part.tool || 'unknown',
        toolSourceKey: part.tool || undefined,
        toolKind,
        toolInput: part.state?.input || {},
        ...(toolMetadata ? { toolMetadata } : {}),
        toolStatus,
        toolResult: resolveToolResultText(resultPart?.state),
        toolResultVisibility: resolveToolResultVisibility(part.tool, toolKind),
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
  private readonly contextOmoAssembler = new OpenCodeMessageContextOmoAssembler();

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
    const normalizedMessageContent = this.contextOmoAssembler.assemble(role, parts, vaultPath);
    const toolContent = this.toolContentAssembler.assemble(
      parts,
      normalizedMessageContent.renderableContent,
      toolIdentityContext,
    );
    const timestamp = typeof info.time?.created === 'number'
      ? info.time.created
      : Date.now();
    const structured = role === 'assistant' ? info.structured : undefined;

    return {
      id: info.id,
      role,
      content: normalizedMessageContent.content,
      timestamp,
      summary: role === 'assistant' && info.summary === true ? true : undefined,
      modelId: role === 'assistant'
        ? OpenCodeMessageNormalizationMapper.formatModelIdentifier(info.providerID, info.modelID)
        : undefined,
      sourceMessageId: info.id,
      toolCalls: toolContent.toolCalls.length > 0 ? toolContent.toolCalls : undefined,
      contentBlocks: toolContent.contentBlocks.length > 0 ? toolContent.contentBlocks : undefined,
      contextAttachments: normalizedMessageContent.contextAttachments.length > 0
        ? normalizedMessageContent.contextAttachments
        : undefined,
      displayStyle: normalizedMessageContent.displayStyle,
      noticeTone: normalizedMessageContent.noticeTone,
      omo: normalizedMessageContent.omo,
      compactionDivider: normalizedMessageContent.compactionDivider,
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

}
