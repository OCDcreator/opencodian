import type { ElicitationRequest } from '@anthropic-ai/claude-agent-sdk';

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
