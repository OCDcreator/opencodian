/**
 * ZCodeInteractionBridge — the permission / question interaction loop between
 * the official ZCode runtime and the existing OpenCodian permission surface.
 *
 * Native asks arrive as server-initiated requests (`interaction/requestPermission`,
 * `interaction/requestUserInput`) and their replies are STRICT schemas proven
 * live against the runtime:
 *   - requestPermission  → `{ decision: allow|deny|escalate|modify, reason?, modifiedInput?, permissionUpdates? }`
 *   - requestUserInput   → `{ action: accept|decline|cancel, content?, reason? }`
 *     with `content.answers: Record<questionText, string[]>` (also `answer_<i>`
 *     / single `answer` shorthands).
 *
 * Fail-closed everywhere: unknown request shapes are declined/denied without
 * ever allowing, responses are exactly-once (stale or duplicate responses
 * raise and never re-reply), and teardown settles pending asks as
 * cancel/deny so a dead session can never leave an approval hanging.
 */

import type { PermissionReply, PermissionRequest, QuestionRequest } from '../../../types';
import type { StreamChunk } from '../../../types/chat';
import { SessionPermissionTracker } from '../../../types/permission';

/** Strict reply body for `interaction/requestPermission` (native schema `JL`). */
export interface ZCodePermissionReplyBody {
  readonly decision: 'allow' | 'deny' | 'escalate' | 'modify';
  readonly reason?: string;
  readonly modifiedInput?: unknown;
  readonly permissionUpdates?: ReadonlyArray<{
    readonly type: 'addRules';
    readonly behavior: 'allow' | 'deny' | 'ask';
    readonly rules: ReadonlyArray<{ readonly toolName: string; readonly ruleContent?: string }>;
  }>;
}

/** Strict reply body for `interaction/requestUserInput` (native schema `CYe`). */
export interface ZCodeUserInputReplyBody {
  readonly action: 'accept' | 'decline' | 'cancel';
  readonly content?: Record<string, unknown>;
  readonly reason?: string;
}

export type ZCodeInteractionReply = ZCodePermissionReplyBody | ZCodeUserInputReplyBody;

interface PendingInteraction {
  readonly kind: 'permission' | 'user-input';
  readonly requestId: string;
  readonly sessionId: string;
  readonly request: PermissionRequest | QuestionRequest;
  readonly nativeParams: Record<string, unknown>;
  readonly reply: Promise<ZCodeInteractionReply>;
  settled: boolean;
  readonly settle: (reply: ZCodeInteractionReply) => void;
  readonly fail: (error: Error) => void;
}

function questionAskSignature(params: Record<string, unknown>): string {
  return JSON.stringify({
    requestId: params['requestId'],
    sessionId: params['sessionId'],
    toolCallId: params['toolCallId'],
    turnId: params['turnId'],
    questions: params['questions'],
  });
}

function permissionAskSignature(params: Record<string, unknown>): string {
  return JSON.stringify({
    requestId: params['requestId'],
    sessionId: params['sessionId'],
    toolCallId: params['toolCallId'],
    turnId: params['turnId'],
    toolName: params['toolName'],
    input: params['input'],
    reason: params['reason'],
    riskLevel: params['riskLevel'],
    options: params['options'],
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * Normalize a native permission ask into the existing permission surface.
 * Unknown shapes return null → the caller declines fail-closed.
 */
export function normalizeZCodePermissionAsk(params: unknown): PermissionRequest | null {
  const record = asRecord(params);
  const requestId = asString(record['requestId']);
  const sessionId = asString(record['sessionId']);
  const toolName = asString(record['toolName']);
  if (!requestId || !sessionId || !toolName) {
    return null;
  }
  const toolCallId = asString(record['toolCallId']);
  const turnId = asString(record['turnId']);
  return {
    id: requestId,
    sessionID: sessionId,
    permission: toolName,
    patterns: [],
    metadata: {
      reason: asString(record['reason']),
      riskLevel: asString(record['riskLevel']),
      input: record['input'] ?? {},
      options: record['options'] ?? [],
    },
    always: [],
    ...(toolCallId
      ? { tool: { messageID: turnId || toolCallId, callID: toolCallId } }
      : {}),
  };
}

/**
 * Normalize a native user-input ask into the existing question surface,
 * preserving option order exactly as the runtime offered it.
 */
export function normalizeZCodeQuestionAsk(params: unknown): QuestionRequest | null {
  const record = asRecord(params);
  const requestId = asString(record['requestId']);
  const sessionId = asString(record['sessionId']);
  const rawQuestions = record['questions'];
  if (!requestId || !sessionId || !Array.isArray(rawQuestions)) {
    return null;
  }
  const questions = rawQuestions.map((rawQuestion) => {
    const question = asRecord(rawQuestion);
    const rawOptions = question['options'];
    const options = Array.isArray(rawOptions)
      ? rawOptions.map((rawOption) => {
          const option = asRecord(rawOption);
          const label = asString(option['label'] ?? option['value']);
          return {
            label,
            description: asString(option['description']),
            ...(typeof option['preview'] === 'string' ? { preview: option['preview'] as string } : {}),
          };
        })
      : [];
    return {
      question: asString(question['question']),
      header: asString(question['header']),
      options,
      ...(question['multiSelect'] === true ? { multiple: true as const } : {}),
      // Free-form answers are supported through the reply content.
      custom: true,
    };
  });
  if (questions.length === 0 || questions.some((question) => !question.question || question.options.length === 0)) {
    return null;
  }
  return { id: requestId, sessionId, questions };
}

export class ZCodeInteractionBridge {
  private readonly pending = new Map<string, PendingInteraction>();
  private readonly timedOutPermissions = new Map<string, string>();
  /** Short-lived answers for identical native question retries using the same request ID. */
  private readonly recentQuestionReplies = new Map<string, { signature: string; reply: ZCodeInteractionReply; at: number }>();
  /** Session-scoped approvals for `PermissionReply === 'session'` (plugin-side, no native rule writes). */
  private readonly sessionApprovals = new SessionPermissionTracker();

  /** All currently pending asks of one kind (stable identities included). */
  getPending(kind: 'permission' | 'user-input'): Array<PermissionRequest | QuestionRequest> {
    return [...this.pending.values()]
      .filter((entry) => entry.kind === kind && !entry.settled)
      .map((entry) => entry.request);
  }

  /**
   * Register a native ask. Returns the reply promise for the transport plus
   * the surface request to stream into chat. Invalid shapes settle fail-closed
   * immediately and return null (no accidental approval).
   */
  registerAsk(
    kind: 'permission' | 'user-input',
    params: unknown,
  ): { reply: Promise<ZCodeInteractionReply>; request: PermissionRequest | QuestionRequest } | null {
    const request = kind === 'permission'
      ? normalizeZCodePermissionAsk(params)
      : normalizeZCodeQuestionAsk(params);
    const nativeParams = asRecord(params);
    const requestId = asString(nativeParams['requestId']);
    if (!request || !requestId || this.pending.has(requestId)) {
      // Unknown shape or duplicate id: deny/decline fail-closed, never allow.
      return null;
    }
    let settle!: (reply: ZCodeInteractionReply) => void;
    let fail!: (error: Error) => void;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const reply = new Promise<ZCodeInteractionReply>((resolve, reject) => {
      settle = resolve;
      fail = reject;
    });
    this.pending.set(requestId, {
      kind,
      requestId,
      sessionId: (kind === 'permission'
        ? (request as PermissionRequest).sessionID
        : (request as QuestionRequest).sessionId) || asString(nativeParams['sessionId']),
      request,
      nativeParams,
      reply,
      settled: false,
      // The settle closure exclusively owns marking settled, removing the
      // entry, and resolving the native reply — exactly-once by construction.
      settle: (value) => {
        const entry = this.pending.get(requestId);
        if (!entry || entry.settled) {
          return;
        }
        entry.settled = true;
        this.pending.delete(requestId);
        if (timeout) clearTimeout(timeout);
        if (entry.kind === 'user-input') {
          this.recentQuestionReplies.set(requestId, {
            signature: questionAskSignature(entry.nativeParams), reply: value, at: Date.now(),
          });
          if (this.recentQuestionReplies.size > 32) {
            const oldest = this.recentQuestionReplies.keys().next().value;
            if (oldest) this.recentQuestionReplies.delete(oldest);
          }
        }
        settle(value);
      },
      fail,
    });
    if (kind === 'permission') {
      timeout = setTimeout(() => {
        const entry = this.pending.get(requestId);
        if (!entry || entry.settled) return;
        this.timedOutPermissions.set(requestId, entry.sessionId);
        entry.settle({ decision: 'deny', reason: 'Permission request timed out.' });
      }, 60_000);
    }
    return { reply, request };
  }

  /**
   * Register a native ask and emit its surface chunk through the caller's
   * emitter (unknown shapes are denied/declined fail-closed, never approved).
   */
  registerAskForAdapter(
    kind: 'permission' | 'user-input',
    params: unknown,
    emitChunk: (sessionId: string, chunk: StreamChunk) => void,
  ): Promise<ZCodeInteractionReply> {
    if (kind === 'permission') {
      const record = asRecord(params);
      const requestId = asString(record['requestId']);
      if (this.timedOutPermissions.has(requestId)) {
        return Promise.resolve({ decision: 'deny', reason: 'Permission request timed out.' });
      }
      const pending = this.pending.get(requestId);
      if (pending) {
        // The runtime may retransmit the same native ask before the user
        // answers. Both transport requests must wait for that one decision;
        // a changed payload under the same ID remains fail-closed.
        return pending.kind === kind
          && permissionAskSignature(pending.nativeParams) === permissionAskSignature(record)
          ? pending.reply
          : Promise.resolve(this.failClosedReply(kind));
      }
      const request = normalizeZCodePermissionAsk(record);
      if (request && this.isSessionApproved(request.sessionID, request.permission, request.patterns)) {
        return Promise.resolve({ decision: 'allow', reason: 'Approved for this session' });
      }
    }
    if (kind === 'user-input') {
      const record = asRecord(params);
      const requestId = asString(record['requestId']);
      const signature = questionAskSignature(record);
      const pending = this.pending.get(requestId);
      if (pending) {
        return pending.kind === kind && questionAskSignature(pending.nativeParams) === signature
          ? pending.reply
          : Promise.resolve(this.failClosedReply(kind));
      }
      const recent = this.recentQuestionReplies.get(requestId);
      if (recent) {
        return recent.signature === signature && Date.now() - recent.at < 30_000
          ? Promise.resolve(recent.reply)
          : Promise.resolve(this.failClosedReply(kind));
      }
    }
    const registered = this.registerAsk(kind, params);
    if (!registered) {
      return Promise.resolve(this.failClosedReply(kind));
    }
    const sessionId = kind === 'permission'
      ? (registered.request as PermissionRequest).sessionID
      : (registered.request as QuestionRequest).sessionId;
    emitChunk(sessionId, kind === 'permission'
      ? this.permissionChunk(registered.request as PermissionRequest)
      : this.questionChunk(registered.request as QuestionRequest));
    return registered.reply;
  }

  /**
   * Build the fail-closed reply for an ask that could not be normalized.
   * Permission asks are denied; user-input asks are declined.
   */
  failClosedReply(kind: 'permission' | 'user-input'): ZCodeInteractionReply {
    return kind === 'permission'
      ? { decision: 'deny', reason: 'Unsupported permission request shape; denied fail-closed.' }
      : { action: 'decline', reason: 'Unsupported question shape; declined fail-closed.' };
  }

  /**
   * Approve or reject a pending permission exactly once. Mirrors the official
   * option semantics (once → allow; always → the offered allow-always response
   * or a persisted addRules rule; session → allow plus a plugin-side session
   * record that never writes native configuration; reject → deny).
   */
  respondToPermission(requestID: string, reply: PermissionReply, message?: string): void {
    const entry = this.requirePending(requestID, 'permission');
    const options = asRecord(entry.nativeParams['options']);
    const offered = Array.isArray(entry.nativeParams['options'])
      ? (entry.nativeParams['options'] as unknown[]).map(asRecord)
      : [];
    void options;
    const toolName = entry.request ? (entry.request as PermissionRequest).permission : '';
    const body = this.buildPermissionBody(reply, message, offered, toolName);
    if (reply === 'session') {
      const request = entry.request as PermissionRequest;
      this.sessionApprovals.addSessionApproval(request.sessionID, request.permission, 'allow', request.patterns);
    }
    entry.settle(body);
  }

  private buildPermissionBody(
    reply: PermissionReply,
    message: string | undefined,
    offered: Array<Record<string, unknown>>,
    toolName: string,
  ): ZCodePermissionReplyBody {
    const findByKind = (kind: string) => offered.find((option) => asString(option['kind']) === kind);
    if (reply === 'reject') {
      const denyOption = findByKind('deny');
      const preset = denyOption ? asRecord(denyOption['response']) : {};
      return {
        ...preset,
        decision: 'deny',
        ...(message ? { reason: message } : {}),
      } as ZCodePermissionReplyBody;
    }
    if (reply === 'once') {
      return { decision: 'allow', reason: message ?? 'Approved once' };
    }
    // 'always' / 'session': prefer the runtime-offered allow_always response,
    // otherwise persist a native allow rule through the sanctioned
    // permissionUpdates channel ('always' only — 'session' never writes).
    const allowAlways = findByKind('allow_always') ?? findByKind('allow');
    if (reply === 'always') {
      const preset = allowAlways ? asRecord(allowAlways['response']) : {};
      if (Object.keys(preset).length > 0) {
        return { ...preset, decision: 'allow' } as ZCodePermissionReplyBody;
      }
      return {
        decision: 'allow',
        ...(message ? { reason: message } : {}),
        permissionUpdates: [{ type: 'addRules', behavior: 'allow', rules: [{ toolName }] }],
      };
    }
    return { decision: 'allow', reason: message ?? 'Approved for this session' };
  }

  /** Answer a pending question exactly once with per-question selections. */
  replyToQuestion(requestID: string, answers: string[][]): void {
    const entry = this.requirePending(requestID, 'user-input');
    const request = entry.request as QuestionRequest;
    const answersByQuestion: Record<string, string[]> = {};
    request.questions.forEach((question, index) => {
      const selected = answers[index] ?? [];
      if (selected.length > 0) {
        answersByQuestion[question.question] = [...selected];
      }
    });
    // Single free-form answer shorthands (`answer`) are also understood by the
    // runtime; the question-keyed map is used for all cases (order preserved).
    entry.settle({ action: 'accept', content: { answers: answersByQuestion } });
  }

  /** Reject a pending question exactly once (native `decline`). */
  rejectQuestion(requestID: string): void {
    const entry = this.requirePending(requestID, 'user-input');
    entry.settle({ action: 'decline' });
  }

  /**
   * Teardown: settle every pending ask of a session (or all) so a stopped
   * session / dead process / backend switch can never leave an approval
   * hanging. Fail-closed values: deny / cancel.
   */
  settlePendingForTeardown(sessionId?: string): void {
    this.recentQuestionReplies.clear();
    for (const entry of [...this.pending.values()]) {
      if (entry.settled || (sessionId !== undefined && entry.sessionId !== sessionId)) {
        continue;
      }
      entry.settle(entry.kind === 'permission'
        ? { decision: 'deny', reason: 'Session stopped before the request was answered.' }
        : { action: 'cancel', reason: 'Session stopped before the question was answered.' });
    }
    if (sessionId === undefined) {
      this.sessionApprovals.clearAll();
      this.timedOutPermissions.clear();
    } else {
      this.sessionApprovals.clearSession(sessionId);
      for (const [requestId, ownerSessionId] of this.timedOutPermissions) {
        if (ownerSessionId === sessionId) this.timedOutPermissions.delete(requestId);
      }
    }
  }

  /** StreamChunk for the existing permission surface (stable identities). */
  permissionChunk(request: PermissionRequest): StreamChunk {
    return {
      type: 'permission_request',
      id: request.id,
      sessionID: request.sessionID,
      permission: request.permission,
      patterns: request.patterns,
      metadata: request.metadata,
      always: request.always,
      ...(request.tool ? { tool: request.tool } : {}),
    };
  }

  /** StreamChunk for the existing question surface. */
  questionChunk(request: QuestionRequest): StreamChunk {
    return { type: 'question_request', request };
  }

  /** Whether a session-scoped approval already covers this ask (`session` replies). */
  isSessionApproved(sessionId: string, toolName: string, patterns: readonly string[]): boolean {
    return this.sessionApprovals.isSessionApproved(sessionId, toolName, 'allow', [...patterns]);
  }

  private requirePending(requestID: string, kind: 'permission' | 'user-input'): PendingInteraction {
    const entry = this.pending.get(requestID);
    if (!entry || entry.settled || entry.kind !== kind) {
      // Stale, duplicate, or mismatched responses never reach the runtime.
      // The settle closure owns removal, so a failed lookup here cannot
      // consume an ask either.
      throw new Error(`ZCode interaction request is not pending: ${requestID}`);
    }
    return entry;
  }
}
