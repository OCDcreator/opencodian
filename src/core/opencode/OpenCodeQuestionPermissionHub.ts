import { createLogger } from '../../shared';
import type {
  PermissionReply,
  PermissionRequest,
  QuestionRequest as ChatQuestionRequest,
} from '../types';

const logger = createLogger('OpenCodeQuestionPermissionHub');
const QUESTION_MUTATION_MAX_RETRIES = 2;

export interface OpenCodeQuestionSdk {
  list(): Promise<unknown>;
  reply(request: { requestID: string; answers: string[][] }): Promise<unknown>;
  reject(request: { requestID: string }): Promise<unknown>;
}

export interface OpenCodePermissionSdk {
  list(): Promise<unknown>;
  reply(request: { requestID: string; reply: PermissionReply; message?: string }): Promise<unknown>;
  respond(request: { sessionID: string; permissionID: string; response: PermissionReply }): Promise<unknown>;
}

export interface OpenCodeQuestionPermissionHubHost {
  shouldUseSdkQuestions(): boolean;
  shouldUseSdkCrud(): boolean;
  getSdkQuestion(): OpenCodeQuestionSdk;
  getSdkPermission(): OpenCodePermissionSdk;
  getLegacy<T>(path: string): Promise<T>;
  postLegacy<T>(path: string, body: unknown): Promise<T>;
  normalizeQuestionRequest(raw: unknown): ChatQuestionRequest | null;
  logServiceWarning(key: string, message: string, error: unknown): void;
  logServiceError(key: string, message: string, error: unknown): void;
}

function normalizePermissionToolReference(raw: unknown): PermissionRequest['tool'] | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }

  const tool = raw as {
    messageID?: unknown;
    callID?: unknown;
  };

  if (typeof tool.messageID !== 'string' || typeof tool.callID !== 'string') {
    return undefined;
  }

  return {
    messageID: tool.messageID,
    callID: tool.callID,
  };
}

function normalizeStringArray(raw: unknown): string[] {
  return Array.isArray(raw)
    ? raw.filter((value): value is string => typeof value === 'string')
    : [];
}

export function normalizePermissionRequest(raw: unknown): PermissionRequest | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const request = raw as {
    id?: unknown;
    sessionID?: unknown;
    permission?: unknown;
    patterns?: unknown;
    metadata?: unknown;
    always?: unknown;
    tool?: unknown;
  };

  if (
    typeof request.id !== 'string'
    || typeof request.sessionID !== 'string'
    || typeof request.permission !== 'string'
  ) {
    return null;
  }

  const patterns = normalizeStringArray(request.patterns);
  const always = normalizeStringArray(request.always);
  const metadata = request.metadata && typeof request.metadata === 'object' && !Array.isArray(request.metadata)
    ? request.metadata as Record<string, unknown>
    : {};
  const tool = normalizePermissionToolReference(request.tool);

  return {
    id: request.id,
    sessionID: request.sessionID,
    permission: request.permission,
    patterns,
    metadata,
    always,
    ...(tool ? { tool } : {}),
  };
}

export function normalizePermissionResponse(response: unknown): PermissionRequest[] {
  const rawRequests = Array.isArray(response)
    ? response
    : response && typeof response === 'object' && 'data' in response && Array.isArray((response as { data?: unknown }).data)
      ? (response as { data: unknown[] }).data
      : [];

  return rawRequests.reduce<PermissionRequest[]>((requests, rawRequest) => {
    const normalized = normalizePermissionRequest(rawRequest);
    if (normalized) {
      requests.push(normalized);
    }
    return requests;
  }, []);
}

function readErrorStringProperty(error: unknown, key: string): string | undefined {
  if (!error || typeof error !== 'object' || !(key in error)) {
    return undefined;
  }

  const value = (error as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : undefined;
}

function readErrorNumberProperty(error: unknown, key: string): number | undefined {
  if (!error || typeof error !== 'object' || !(key in error)) {
    return undefined;
  }

  const value = (error as Record<string, unknown>)[key];
  return typeof value === 'number' ? value : undefined;
}

function isTransientQuestionMutationError(error: unknown): boolean {
  const status = readErrorNumberProperty(error, 'status')
    ?? readErrorNumberProperty(error, 'statusCode')
    ?? readErrorNumberProperty(error, 'code');
  if (
    status === 408
    || status === 409
    || status === 425
    || status === 429
    || (typeof status === 'number' && status >= 500 && status < 600)
  ) {
    return true;
  }

  const code = readErrorStringProperty(error, 'code')?.toUpperCase();
  if (code && [
    'ECONNRESET',
    'ECONNREFUSED',
    'EHOSTUNREACH',
    'ENETDOWN',
    'ENETRESET',
    'ENETUNREACH',
    'ETIMEDOUT',
  ].includes(code)) {
    return true;
  }

  const name = readErrorStringProperty(error, 'name')?.toLowerCase();
  if (name === 'aborterror' || name === 'timeouterror' || name === 'networkerror') {
    return true;
  }

  const message = error instanceof Error ? error.message.toLowerCase() : '';
  return [
    'network error',
    'socket hang up',
    'timeout',
    'timed out',
    'temporarily unavailable',
    'temporary failure',
  ].some((pattern) => message.includes(pattern));
}

async function runQuestionMutationWithRetry(operation: () => Promise<unknown>): Promise<void> {
  let attempt = 0;

  for (;;) {
    try {
      await operation();
      return;
    } catch (error) {
      if (attempt >= QUESTION_MUTATION_MAX_RETRIES || !isTransientQuestionMutationError(error)) {
        throw error;
      }
      attempt += 1;
    }
  }
}

export class OpenCodeQuestionPermissionHub {
  constructor(private readonly host: OpenCodeQuestionPermissionHubHost) {}

  async getPendingQuestions(): Promise<ChatQuestionRequest[]> {
    if (this.host.shouldUseSdkQuestions()) {
      try {
        const response = await this.host.getSdkQuestion().list();
        return this.normalizeQuestionResponse(response);
      } catch (error) {
        this.host.logServiceWarning('question.list', 'SDK question.list failed, falling back to legacy HTTP', error);
      }
    }

    try {
      const response = await this.host.getLegacy<unknown>('/question');
      return this.normalizeQuestionResponse(response);
    } catch (error) {
      this.host.logServiceError('question.list', 'Failed to get pending questions:', error);
      return [];
    }
  }

  async replyToQuestion(requestID: string, answers: string[][]): Promise<void> {
    if (this.host.shouldUseSdkQuestions()) {
      try {
        await runQuestionMutationWithRetry(() => this.host.getSdkQuestion().reply({
          requestID,
          answers,
        }));
        return;
      } catch (error) {
        this.host.logServiceWarning('question.reply', 'SDK question.reply failed, falling back to legacy HTTP', error);
      }
    }

    await runQuestionMutationWithRetry(() => this.host.postLegacy(`/question/${requestID}/reply`, { answers }));
  }

  async rejectQuestion(requestID: string): Promise<void> {
    if (this.host.shouldUseSdkQuestions()) {
      try {
        await runQuestionMutationWithRetry(() => this.host.getSdkQuestion().reject({
          requestID,
        }));
        return;
      } catch (error) {
        this.host.logServiceWarning('question.reject', 'SDK question.reject failed, falling back to legacy HTTP', error);
      }
    }

    await runQuestionMutationWithRetry(() => this.host.postLegacy(`/question/${requestID}/reject`, {}));
  }

  async respondToSessionPermission(
    sessionId: string,
    permissionId: string,
    reply: PermissionReply,
  ): Promise<void> {
    await this.host.getSdkPermission().respond({
      sessionID: sessionId,
      permissionID: permissionId,
      response: reply,
    });
  }

  async getPendingPermissions(): Promise<PermissionRequest[]> {
    if (this.host.shouldUseSdkCrud()) {
      try {
        const response = await this.host.getSdkPermission().list();
        return normalizePermissionResponse(response);
      } catch (error) {
        this.host.logServiceWarning('permission.list', 'SDK permission.list failed, falling back to legacy HTTP', error);
      }
    }

    try {
      const response = await this.host.getLegacy<unknown>('/permission');
      return normalizePermissionResponse(response);
    } catch (error) {
      this.host.logServiceError('permission.list', 'Failed to get pending permissions:', error);
      return [];
    }
  }

  async respondToPermission(
    requestID: string,
    reply: PermissionReply,
    message?: string,
  ): Promise<void> {
    try {
      if (this.host.shouldUseSdkCrud()) {
        await this.host.getSdkPermission().reply({
          requestID,
          reply,
          message,
        });
        return;
      }

      await this.host.postLegacy(`/permission/${requestID}/reply`, { reply, message });
    } catch (error) {
      logger.error('Failed to respond to permission:', error);
      throw error;
    }
  }

  private normalizeQuestionResponse(response: unknown): ChatQuestionRequest[] {
    const rawRequests = Array.isArray(response)
      ? response
      : response && typeof response === 'object' && 'data' in response && Array.isArray((response as { data?: unknown }).data)
        ? (response as { data: unknown[] }).data
        : [];

    return rawRequests.reduce<ChatQuestionRequest[]>((requests, rawRequest) => {
      const normalized = this.host.normalizeQuestionRequest(rawRequest);
      if (normalized) {
        requests.push(normalized);
      }
      return requests;
    }, []);
  }

}
