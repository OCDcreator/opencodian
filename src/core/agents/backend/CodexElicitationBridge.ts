/**
 * Elicitation bridge for the Codex app-server `mcpServer/elicitation/request`
 * route (Codex 0.159.0).
 *
 * Mirrors `ClaudeCodeElicitationBridge.ts`: the bridge turns the server's
 * typed form schema into a `QuestionRequest` with `custom: true` free-text
 * prompts (enums → options, arrays → multiple), and coerces the inline-card
 * answers back into structured `content` per `requestedSchema`.  The url mode
 * opens the URL in the system browser and asks the user to confirm.  The
 * `openai/form` and `openaiForm` modes use a schema dialect this bridge does
 * not render; the adapter declines them gracefully.
 *
 * This file deliberately does NOT share helpers with the Claude bridge: two
 * consumers stay below the repo's 3+ reuse threshold for a new abstraction.
 */

import type { QuestionRequest } from '../../types';

/** One const option of a single/multi-select enum property. */
export interface CodexElicitationConstOption {
  const: string;
  title: string;
}

/** Primitive property schema of a form-mode `requestedSchema`. */
export interface CodexElicitationPropertySchema {
  type?: 'string' | 'number' | 'integer' | 'boolean' | 'array';
  title?: string | null;
  description?: string | null;
  default?: unknown;
  /** Plain enum (single select, or multi select via `type: 'array'`). */
  enum?: string[];
  enumNames?: string[] | null;
  /** Titled single-select options (Codex 0.159.0 variant). */
  oneOf?: CodexElicitationConstOption[];
  /** Items of a multi-select array (Codex 0.159.0 variant). */
  items?: {
    type?: 'string';
    enum?: string[];
    anyOf?: CodexElicitationConstOption[];
  };
  format?: 'email' | 'uri' | 'date' | 'date-time';
}

/** Form-mode `requestedSchema` (MCP 2025-11-25 ElicitRequestFormParams shape). */
export interface CodexElicitationFormSchema {
  type: 'object';
  properties: Record<string, CodexElicitationPropertySchema>;
  required?: string[] | null;
  $schema?: string | null;
}

/** Common fields of every `mcpServer/elicitation/request` param variant. */
interface CodexElicitationCommonParams {
  serverName: string;
  threadId: string;
  turnId?: string | null;
}

/** Form-mode elicitation params (wire: `mode: "form"`). */
export interface CodexElicitationFormParams extends CodexElicitationCommonParams {
  mode: 'form';
  message: string;
  requestedSchema: CodexElicitationFormSchema;
}

/** URL-mode elicitation params (wire: `mode: "url"`). */
export interface CodexElicitationUrlParams extends CodexElicitationCommonParams {
  mode: 'url';
  message: string;
  url: string;
  elicitationId: string;
}

/** openai/form dialect params — logged and declined by the adapter. */
export interface CodexElicitationOpenAiFormParams extends CodexElicitationCommonParams {
  mode: 'openai/form' | 'openaiForm';
  message: string;
  requestedSchema?: unknown;
}

/** Discriminated union of the wire param variants (Codex 0.159.0). */
export type CodexMcpElicitationWireParams =
  | CodexElicitationFormParams
  | CodexElicitationUrlParams
  | CodexElicitationOpenAiFormParams;

/** Narrow runtime guard for the wire params that arrive untyped over JSON-RPC. */
export function isCodexElicitationWireParams(params: unknown): params is CodexMcpElicitationWireParams {
  if (typeof params !== 'object' || params === null) return false;
  const candidate = params as Record<string, unknown>;
  return typeof candidate.serverName === 'string'
    && typeof candidate.threadId === 'string'
    && (candidate.mode === 'form' || candidate.mode === 'url' || candidate.mode === 'openai/form' || candidate.mode === 'openaiForm');
}

export type CodexElicitationContent = Record<string, string | number | boolean | string[]>;
type CodexElicitationScalarContent = string | number | boolean;

/** Option labels of the fallback card shown when a form has no properties. */
const ACCEPT_LABEL = 'Accept';
const DECLINE_LABEL = 'Decline';

function getEnumOptions(property: CodexElicitationPropertySchema): Array<{ label: string; description: string }> {
  if (property.oneOf && property.oneOf.length > 0) {
    return property.oneOf.map((option) => ({ label: option.const, description: option.title }));
  }
  const rawEnum = property.enum ?? property.items?.enum ?? [];
  const names = property.enumNames ?? [];
  return rawEnum.map((value, index) => ({
    label: value,
    description: names[index] ?? '',
  }));
}

/**
 * Build a `QuestionRequest` for a form-mode elicitation: one prompt per
 * schema property, enums become selectable options, arrays become
 * `multiple: true`, and every prompt is `custom: true` so the user can type
 * a free-text answer.  A schema without properties falls back to a single
 * Accept/Decline confirm card.
 */
export function buildCodexElicitationQuestionRequest(
  params: CodexElicitationFormParams,
): QuestionRequest {
  const schemaProperties = params.requestedSchema?.properties ?? {};
  const schemaQuestions = Object.entries(schemaProperties).map(([key, property]) => ({
    question: key,
    header: property.title ?? params.serverName,
    options: getEnumOptions(property),
    multiple: property.type === 'array',
    custom: true,
  }));

  return {
    id: `codex-elicitation-${Date.now()}`,
    sessionId: 'codex',
    questions: schemaQuestions.length > 0
      ? schemaQuestions
      : [{
          question: params.message,
          header: params.serverName,
          options: [
            { label: ACCEPT_LABEL, description: '' },
            { label: DECLINE_LABEL, description: '' },
          ],
          multiple: false,
          custom: true,
        }],
  };
}

/**
 * Build the confirm card for a url-mode elicitation.  The adapter opens the
 * URL before showing this card; the user's choice maps straight onto the
 * wire actions (`accept` / `decline`, card cancel → `cancel`).
 */
export function buildCodexElicitationUrlQuestionRequest(
  params: CodexElicitationUrlParams,
): QuestionRequest {
  return {
    id: `codex-elicitation-url-${params.elicitationId}`,
    sessionId: 'codex',
    questions: [{
      question: params.message,
      header: params.serverName,
      options: [
        { label: ACCEPT_LABEL, description: params.url },
        { label: DECLINE_LABEL, description: '' },
      ],
      multiple: false,
      custom: false,
    }],
  };
}

function coerceScalarAnswer(
  value: string,
  property: CodexElicitationPropertySchema | undefined,
): CodexElicitationScalarContent {
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

/**
 * Coerce inline-card answers back into structured elicitation `content`,
 * keyed by schema property and typed per `requestedSchema` (numbers,
 * booleans, string arrays).  Mirrors `buildClaudeCodeElicitationContent`.
 */
export function buildCodexElicitationContent(
  request: QuestionRequest,
  answers: readonly string[][],
  source: CodexElicitationFormParams,
): CodexElicitationContent {
  const schemaProperties = source.requestedSchema?.properties ?? {};
  const content: CodexElicitationContent = {};
  request.questions.forEach((question, index) => {
    const selected = answers[index] ?? [];
    if (
      request.questions.length === 1
      && question.options.some((option) => option.label === DECLINE_LABEL)
      && selected[0] === DECLINE_LABEL
    ) {
      return;
    }
    const property = schemaProperties[question.question];
    content[question.question] = question.multiple
      ? [...selected]
      : coerceScalarAnswer(selected[0] ?? '', property);
  });
  return content;
}

/** True when the card resolution picked the fallback Decline option. */
export function isCodexElicitationDecline(
  request: QuestionRequest,
  answers: readonly string[][] | undefined,
): boolean {
  return request.questions.length === 1
    && request.questions[0].options.some((option) => option.label === DECLINE_LABEL)
    && answers?.[0]?.[0] === DECLINE_LABEL;
}

// ─── Host seam ──────────────────────────────────────────────────────────────

/** Card request the elicitation host surfaces to the UI. */
export interface CodexElicitationCardRequest {
  /** Ready-to-render question card (form prompts or url confirm). */
  questionRequest: QuestionRequest;
  /** Original wire params, preserved for coercion and advanced rendering. */
  params: CodexMcpElicitationWireParams;
}

/** User outcome collected by the elicitation card renderer. */
export interface CodexElicitationHostResponse {
  action: 'accept' | 'decline' | 'cancel';
  answers?: string[][];
}

/**
 * UI renderer that surfaces a Codex elicitation as an inline card.  Mirrors
 * `ClaudeCodeElicitationCardRenderer` but keeps raw answers (the adapter
 * coerces them through `buildCodexElicitationContent`).
 */
export interface CodexElicitationCardRenderer {
  collectResponse(
    request: CodexElicitationCardRequest,
    tabId: string | null,
  ): Promise<CodexElicitationHostResponse | null>;
}

/**
 * Mutable host context slice the elicitation factory reads.  Structurally
 * satisfied by the plugin's shared `CodexApprovalHostContext`.
 */
export interface CodexElicitationHostContext {
  getActiveTabId: () => string | null;
  elicitationCardRenderer?: CodexElicitationCardRenderer;
}

/** Host callback seam consumed by `CodexAdapter.setElicitationHost`. */
export interface CodexElicitationBridgeHost {
  collectElicitation?(request: CodexElicitationCardRequest): Promise<CodexElicitationHostResponse | null>;
}

/**
 * Create a `CodexElicitationBridgeHost` that reads its renderer from the
 * context lazily on every call.  When the context has no renderer (e.g. the
 * chat view is not active), `collectElicitation` returns `null` and the
 * adapter declines the elicitation gracefully.
 */
export function createCodexElicitationBridgeHost(
  getContext: () => CodexElicitationHostContext,
): CodexElicitationBridgeHost {
  return {
    async collectElicitation(
      request: CodexElicitationCardRequest,
    ): Promise<CodexElicitationHostResponse | null> {
      const ctx = getContext();
      if (!ctx.elicitationCardRenderer) {
        return null;
      }
      const tabId = ctx.getActiveTabId();
      return ctx.elicitationCardRenderer.collectResponse(request, tabId);
    },
  };
}
