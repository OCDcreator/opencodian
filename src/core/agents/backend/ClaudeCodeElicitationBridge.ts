import type { ElicitationRequest, UserDialogRequest, UserDialogResult } from '@anthropic-ai/claude-agent-sdk';

import type { QuestionRequest } from '../../types';

type ElicitationSchemaProperty = {
  enum?: unknown;
  title?: unknown;
  type?: unknown;
};

type ElicitationContent = Record<string, string | number | boolean | string[]>;
type ElicitationScalarContent = string | number | boolean;

function getSchemaProperties(
  schema: Record<string, unknown> | undefined,
): Record<string, ElicitationSchemaProperty> {
  const properties = schema?.properties;
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) {
    return {};
  }
  return properties as Record<string, ElicitationSchemaProperty>;
}

function getHeader(
  request: ElicitationRequest,
  property?: ElicitationSchemaProperty,
): string {
  return typeof property?.title === 'string'
    ? property.title
    : request.title ?? request.displayName ?? request.serverName;
}

export function buildClaudeCodeElicitationQuestionRequest(
  request: ElicitationRequest,
): QuestionRequest {
  const schemaProperties = getSchemaProperties(request.requestedSchema);
  const schemaQuestions = Object.entries(schemaProperties).map(([key, property]) => {
    const options = Array.isArray(property.enum)
      ? property.enum
          .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
          .map((value) => ({ label: value, description: '' }))
      : [];

    return {
      question: key,
      header: getHeader(request, property),
      options,
      multiple: property.type === 'array',
      custom: true,
    };
  });

  return {
    id: request.elicitationId ?? `claude-elicitation-${Date.now()}`,
    sessionId: 'claude-code',
    questions: schemaQuestions.length > 0
      ? schemaQuestions
      : [{
          question: request.message,
          header: getHeader(request),
          options: [
            {
              label: 'Accept',
              description: request.description ?? '',
              ...(request.url ? { preview: request.url } : {}),
            },
            { label: 'Decline', description: '' },
          ],
          multiple: false,
          custom: true,
        }],
  };
}

export function buildClaudeCodeElicitationContent(
  request: QuestionRequest,
  answers: readonly string[][],
  source?: ElicitationRequest,
): ElicitationContent {
  const schemaProperties = getSchemaProperties(source?.requestedSchema);
  const content: ElicitationContent = {};
  request.questions.forEach((question, index) => {
    const selected = answers[index] ?? [];
    if (question.question === request.questions[0]?.question && selected[0] === 'Decline') {
      return;
    }
    const property = schemaProperties[question.question];
    content[question.question] = question.multiple
      ? [...selected]
      : coerceElicitationScalarAnswer(selected[0] ?? '', property);
  });
  return content;
}

function coerceElicitationScalarAnswer(
  value: string,
  property: ElicitationSchemaProperty | undefined,
): ElicitationScalarContent {
  if (property?.type === 'number' || property?.type === 'integer') {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : value;
  }

  if (property?.type === 'boolean') {
    const normalized = value.trim().toLowerCase();
    if (['true', 'yes', 'y', '1'].includes(normalized)) {
      return true;
    }
    if (['false', 'no', 'n', '0'].includes(normalized)) {
      return false;
    }
  }

  return value;
}

export function normalizeClaudeCodeElicitationContent(
  content: Record<string, unknown> | undefined,
): ElicitationContent | undefined {
  if (!content) {
    return undefined;
  }
  const normalized: ElicitationContent = {};
  for (const [key, value] of Object.entries(content)) {
    if (
      typeof value === 'string'
      || typeof value === 'number'
      || typeof value === 'boolean'
      || (Array.isArray(value) && value.every((item): item is string => typeof item === 'string'))
    ) {
      normalized[key] = value;
    }
  }
  return normalized;
}

// ─── SDK >= 0.3.2xx request_user_dialog bridge ──────────────────────────────

/**
 * Known `request_user_dialog` result payloads. Each dialogKind defines its own
 * result shape; `refusal_fallback_prompt` asks the user to choose between
 * retrying on the fallback model and editing the prompt (CLI-internal enum:
 * 'retry_fallback' | 'edit_prompt'). Everything else maps to 'cancelled',
 * which makes the CLI apply the dialog's default behavior (the pre-callback
 * status quo), so unknown kinds stay fail-safe.
 */
const USER_DIALOG_OPTION_OUTCOMES: Record<string, string> = {
  'Retry with fallback model': 'retry_fallback',
  'Edit prompt': 'edit_prompt',
};

/**
 * Builds the shared question card for a `request_user_dialog` control request.
 * Only `refusal_fallback_prompt` has a known payload contract
 * ({originalModel, fallbackModel, apiRefusalCategory?, guidanceText?,
 * retractedMessageUuids?}); other kinds get a generic card whose every answer
 * maps back to 'cancelled'.
 */
export function buildClaudeCodeUserDialogQuestionRequest(
  request: UserDialogRequest,
): QuestionRequest {
  if (request.dialogKind === 'refusal_fallback_prompt') {
    const payload = request.payload ?? {};
    const originalModel = typeof payload.originalModel === 'string' ? payload.originalModel : '';
    const fallbackModel = typeof payload.fallbackModel === 'string' ? payload.fallbackModel : '';
    const guidanceText = typeof payload.guidanceText === 'string' && payload.guidanceText.trim().length > 0
      ? payload.guidanceText
      : '';
    return {
      id: `claude-user-dialog-${request.toolUseID ?? Date.now()}`,
      sessionId: 'claude-code',
      questions: [{
        question: guidanceText || 'The model refused to answer. How should Claude continue?',
        header: 'Claude needs your input',
        options: [
          {
            label: 'Retry with fallback model',
            description: fallbackModel
              ? `Retry the refused turn on ${fallbackModel}`
              : 'Retry the refused turn on the fallback model',
          },
          { label: 'Edit prompt', description: originalModel ? `Stop and edit your prompt (was on ${originalModel})` : 'Stop and edit your prompt' },
        ],
        multiple: false,
        custom: false,
      }],
    };
  }
  return {
    id: `claude-user-dialog-${request.dialogKind}-${Date.now()}`,
    sessionId: 'claude-code',
    questions: [{
      question: `Claude requested a "${request.dialogKind}" dialog that OpenCodian cannot render. The turn will continue with the CLI's default behavior.`,
      header: 'Claude needs your input',
      options: [{ label: 'Continue with default', description: '' }],
      multiple: false,
      custom: false,
    }],
  };
}

/**
 * Maps the question card response back to the SDK `UserDialogResult`.
 * `{behavior: 'cancelled'}` is always safe: the CLI applies the dialog's
 * default behavior, exactly as if the callback were not wired.
 */
export function buildClaudeCodeUserDialogResult(
  dialogKind: string,
  response: { action: 'accept' | 'decline' | 'cancel'; answers?: string[][] } | null,
): UserDialogResult {
  if (!response || response.action !== 'accept') {
    return { behavior: 'cancelled' };
  }
  const firstAnswer = response.answers?.[0]?.[0];
  if (dialogKind === 'refusal_fallback_prompt' && firstAnswer) {
    const outcome = USER_DIALOG_OPTION_OUTCOMES[firstAnswer];
    if (outcome) {
      return { behavior: 'completed', result: outcome };
    }
  }
  return { behavior: 'cancelled' };
}
