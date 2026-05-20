import type {
  PermissionReply,
  QuestionRequest,
  StreamChunk,
} from '../../types';

type PermissionRequestChunk = Extract<StreamChunk, { type: 'permission_request' }>;

export type ClaudeCodePermissionUpdate = Record<string, unknown>;

export interface ClaudeCodeCanUseToolContext {
  signal?: AbortSignal;
  suggestions?: ClaudeCodePermissionUpdate[];
  blockedPath?: string;
  decisionReason?: string;
  toolUseID?: string;
  agentID?: string;
}

export type ClaudeCodePermissionResult =
  | {
      behavior: 'allow';
      updatedInput?: Record<string, unknown>;
      updatedPermissions?: ClaudeCodePermissionUpdate[];
      toolUseID?: string;
    }
  | {
      behavior: 'deny';
      message: string;
      interrupt?: boolean;
      toolUseID?: string;
    };

export interface ClaudeCodeApprovalDecision {
  reply: PermissionReply;
  message?: string;
  updatedInput?: Record<string, unknown>;
  interrupt?: boolean;
}

export interface ClaudeCodeQuestionDecision {
  answers: string[][];
  updatedInput?: Record<string, unknown>;
}

export interface ClaudeCodePermissionBridgeHost {
  collectToolApproval?: (
    request: PermissionRequestChunk,
    context: ClaudeCodeCanUseToolContext,
  ) => Promise<ClaudeCodeApprovalDecision | PermissionReply | null>;
  collectQuestionAnswers?: (
    request: QuestionRequest,
    context: ClaudeCodeCanUseToolContext,
  ) => Promise<ClaudeCodeQuestionDecision | string[][] | null>;
}

export interface ClaudeCodePermissionBridgeOptions {
  sessionId?: string;
}

interface NormalizedQuestionPrompt {
  question: string;
  header: string;
  options: Array<{ label: string; description: string; preview?: string }>;
  multiple?: boolean;
  custom?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function readNonEmptyString(value: unknown): string | undefined {
  const trimmed = readString(value)?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function cloneInput(input: Record<string, unknown>): Record<string, unknown> {
  return { ...input };
}

function isAskUserQuestion(toolName: string): boolean {
  return toolName.trim().toLowerCase() === 'askuserquestion';
}

function getToolUseID(context: ClaudeCodeCanUseToolContext): string | undefined {
  return readNonEmptyString(context.toolUseID);
}

function destinationOf(update: ClaudeCodePermissionUpdate): string | undefined {
  return readString(update.destination);
}

function permissionUpdatesForReply(
  reply: PermissionReply,
  suggestions: readonly ClaudeCodePermissionUpdate[] | undefined,
): ClaudeCodePermissionUpdate[] | undefined {
  if (!suggestions || suggestions.length === 0) {
    return undefined;
  }

  const destinations = reply === 'always'
    ? ['localSettings', 'projectSettings', 'userSettings']
    : reply === 'session'
      ? ['session']
      : [];
  if (destinations.length === 0) {
    return undefined;
  }

  const updates = suggestions.filter((suggestion) => {
    const destination = destinationOf(suggestion);
    return destination ? destinations.includes(destination) : false;
  });
  return updates.length > 0 ? updates : undefined;
}

function createDenyResult(
  message: string,
  context: ClaudeCodeCanUseToolContext,
  interrupt?: boolean,
): ClaudeCodePermissionResult {
  const toolUseID = getToolUseID(context);
  return {
    behavior: 'deny',
    message,
    ...(interrupt ? { interrupt: true } : {}),
    ...(toolUseID ? { toolUseID } : {}),
  };
}

function createAllowResult(
  input: Record<string, unknown>,
  context: ClaudeCodeCanUseToolContext,
  updatedPermissions?: ClaudeCodePermissionUpdate[],
): ClaudeCodePermissionResult {
  const toolUseID = getToolUseID(context);
  return {
    behavior: 'allow',
    updatedInput: input,
    ...(updatedPermissions && updatedPermissions.length > 0 ? { updatedPermissions } : {}),
    ...(toolUseID ? { toolUseID } : {}),
  };
}

function normalizeApprovalDecision(
  decision: ClaudeCodeApprovalDecision | PermissionReply,
): ClaudeCodeApprovalDecision {
  return typeof decision === 'string' ? { reply: decision } : decision;
}

function metadataFromInput(
  input: Record<string, unknown>,
  context: ClaudeCodeCanUseToolContext,
): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    source: 'claude-code',
    input: cloneInput(input),
  };
  const command = readNonEmptyString(input.command);
  if (command) {
    metadata.command = command;
  }
  const filePath = readNonEmptyString(input.file_path)
    ?? readNonEmptyString(input.filePath)
    ?? readNonEmptyString(context.blockedPath);
  if (filePath) {
    metadata.path = filePath;
  }
  if (context.decisionReason) {
    metadata.decisionReason = context.decisionReason;
  }
  if (context.agentID) {
    metadata.agentID = context.agentID;
  }
  return metadata;
}

function permissionPatternsFromInput(
  input: Record<string, unknown>,
  context: ClaudeCodeCanUseToolContext,
): string[] {
  const candidates = [
    context.blockedPath,
    readNonEmptyString(input.file_path),
    readNonEmptyString(input.filePath),
    readNonEmptyString(input.path),
    readNonEmptyString(input.command),
  ];
  const patterns = candidates.filter((candidate): candidate is string => Boolean(candidate));
  return patterns.length > 0 ? patterns : ['*'];
}

function normalizeQuestionOption(raw: unknown): NormalizedQuestionPrompt['options'][number] | null {
  if (!isRecord(raw)) {
    return null;
  }
  const label = readNonEmptyString(raw.label);
  if (!label) {
    return null;
  }
  const option: NormalizedQuestionPrompt['options'][number] = {
    label,
    description: readString(raw.description)?.trim() ?? '',
  };
  const preview = readNonEmptyString(raw.preview);
  if (preview) {
    option.preview = preview;
  }
  return option;
}

function normalizeQuestionPrompt(raw: unknown): NormalizedQuestionPrompt | null {
  if (!isRecord(raw)) {
    return null;
  }
  const question = readNonEmptyString(raw.question);
  if (!question) {
    return null;
  }
  const options = Array.isArray(raw.options)
    ? raw.options.map(normalizeQuestionOption).filter((option): option is NormalizedQuestionPrompt['options'][number] => Boolean(option))
    : [];
  if (options.length === 0) {
    return null;
  }

  return {
    question,
    header: readNonEmptyString(raw.header) ?? 'Question',
    options,
    multiple: readBoolean(raw.multiSelect) ?? readBoolean(raw.multiple) ?? false,
    custom: true,
  };
}

function normalizeQuestionRequest(
  input: Record<string, unknown>,
  context: ClaudeCodeCanUseToolContext,
  sessionId: string,
): QuestionRequest | null {
  const rawQuestions = Array.isArray(input.questions) ? input.questions : [];
  const questions = rawQuestions
    .map(normalizeQuestionPrompt)
    .filter((question): question is NormalizedQuestionPrompt => Boolean(question));
  if (questions.length === 0) {
    return null;
  }

  return {
    id: getToolUseID(context) ?? `claude-question-${Date.now()}`,
    sessionId,
    questions,
  };
}

function normalizeQuestionDecision(
  decision: ClaudeCodeQuestionDecision | string[][],
): ClaudeCodeQuestionDecision {
  return Array.isArray(decision) ? { answers: decision } : decision;
}

function buildAskUserQuestionInput(
  originalInput: Record<string, unknown>,
  request: QuestionRequest,
  answers: readonly string[][],
  updatedInput?: Record<string, unknown>,
): Record<string, unknown> {
  const answerMap: Record<string, string | string[]> = {};
  request.questions.forEach((question, index) => {
    const selected = answers[index] ?? [];
    answerMap[question.question] = question.multiple ? selected : selected[0] ?? '';
  });

  return {
    ...cloneInput(originalInput),
    ...(updatedInput ? cloneInput(updatedInput) : {}),
    questions: originalInput.questions,
    answers: answerMap,
  };
}

export class ClaudeCodePermissionBridge {
  constructor(
    private readonly host: ClaudeCodePermissionBridgeHost = {},
    private readonly options: ClaudeCodePermissionBridgeOptions = {},
  ) {}

  async canUseTool(
    toolName: string,
    input: Record<string, unknown>,
    context: ClaudeCodeCanUseToolContext = {},
  ): Promise<ClaudeCodePermissionResult> {
    if (context.signal?.aborted) {
      return createDenyResult('Claude Code permission request was interrupted.', context, true);
    }

    if (isAskUserQuestion(toolName)) {
      return this.handleAskUserQuestion(input, context);
    }

    if (!this.host.collectToolApproval) {
      return createDenyResult('No Claude Code permission handler is available.', context);
    }

    const request = this.createPermissionRequest(toolName, input, context);
    const rawDecision = await this.host.collectToolApproval(request, context);
    if (!rawDecision) {
      return createDenyResult('Claude Code permission request was cancelled.', context, true);
    }

    const decision = normalizeApprovalDecision(rawDecision);
    if (decision.reply === 'reject') {
      return createDenyResult(
        decision.message ?? 'User denied this Claude Code tool request.',
        context,
        decision.interrupt,
      );
    }

    const updatedPermissions = permissionUpdatesForReply(decision.reply, context.suggestions);
    return createAllowResult(
      decision.updatedInput ?? cloneInput(input),
      context,
      updatedPermissions,
    );
  }

  createPermissionRequest(
    toolName: string,
    input: Record<string, unknown>,
    context: ClaudeCodeCanUseToolContext = {},
  ): PermissionRequestChunk {
    const toolUseID = getToolUseID(context);
    const sessionID = this.options.sessionId ?? 'claude-code';
    return {
      type: 'permission_request',
      id: toolUseID ?? `claude-permission-${Date.now()}`,
      sessionID,
      permission: toolName,
      patterns: permissionPatternsFromInput(input, context),
      metadata: metadataFromInput(input, context),
      always: [],
      ...(toolUseID ? { tool: { messageID: toolUseID, callID: toolUseID } } : {}),
    };
  }

  createQuestionRequest(
    input: Record<string, unknown>,
    context: ClaudeCodeCanUseToolContext = {},
  ): QuestionRequest | null {
    return normalizeQuestionRequest(
      input,
      context,
      this.options.sessionId ?? 'claude-code',
    );
  }

  private async handleAskUserQuestion(
    input: Record<string, unknown>,
    context: ClaudeCodeCanUseToolContext,
  ): Promise<ClaudeCodePermissionResult> {
    if (!this.host.collectQuestionAnswers) {
      return createDenyResult('No Claude Code question handler is available.', context);
    }

    const request = this.createQuestionRequest(input, context);
    if (!request) {
      return createDenyResult('Claude Code asked an invalid question.', context);
    }

    const rawDecision = await this.host.collectQuestionAnswers(request, context);
    if (!rawDecision) {
      return createDenyResult('Claude Code question was cancelled.', context, true);
    }

    const decision = normalizeQuestionDecision(rawDecision);
    return createAllowResult(
      buildAskUserQuestionInput(input, request, decision.answers, decision.updatedInput),
      context,
    );
  }
}

export function createClaudeCodePermissionBridge(
  host: ClaudeCodePermissionBridgeHost = {},
  options: ClaudeCodePermissionBridgeOptions = {},
): ClaudeCodePermissionBridge {
  return new ClaudeCodePermissionBridge(host, options);
}
