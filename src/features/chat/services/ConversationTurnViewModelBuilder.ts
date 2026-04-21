import type {
  OpenCodeCanonicalMessageInfo,
  OpenCodeCanonicalPart,
  OpenCodeCanonicalSessionState,
} from '../../../core/opencode';
import type { ChatMessage } from '../../../core/types';

export interface OpenCodeNormalizedError {
  message: string;
  name?: string;
}

export interface ConversationTurnViewModel {
  userMessageID: string;
  userInfo: OpenCodeCanonicalMessageInfo;
  userParts: OpenCodeCanonicalPart[];
  assistantMessages: OpenCodeCanonicalMessageInfo[];
  assistantPartsByMessageID: Record<string, OpenCodeCanonicalPart[]>;
  interrupted: boolean;
  error: OpenCodeNormalizedError | null;
}

export interface ConversationCanonicalRenderInput {
  turns: ConversationTurnViewModel[];
  messages: ChatMessage[];
}

export type ConversationTurnMessageHydrator = (
  info: OpenCodeCanonicalMessageInfo,
  parts: OpenCodeCanonicalPart[],
) => ChatMessage;

interface MutableConversationTurnViewModel extends ConversationTurnViewModel {
  assistantMessages: OpenCodeCanonicalMessageInfo[];
  assistantPartsByMessageID: Record<string, OpenCodeCanonicalPart[]>;
}

function getRecordString(
  record: Record<string, unknown>,
  key: string,
): string | null {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export class ConversationTurnViewModelBuilder {
  buildCanonicalRenderInput(
    sessionState: OpenCodeCanonicalSessionState,
    hydrateMessage: ConversationTurnMessageHydrator,
  ): ConversationCanonicalRenderInput {
    const turns = this.buildTurns(sessionState);
    const messages = sessionState.messages.map((message) => {
      const parts = this.getPartsForMessage(sessionState, message.id);
      const renderedMessage = hydrateMessage(message, parts);
      if (message.role === 'assistant' && this.isInterruptedAssistantMessage(message, parts)) {
        renderedMessage.streamState = 'interrupted';
      }

      return renderedMessage;
    });

    return {
      turns,
      messages,
    };
  }

  buildTurns(sessionState: OpenCodeCanonicalSessionState): ConversationTurnViewModel[] {
    const turns: MutableConversationTurnViewModel[] = [];
    let currentTurn: MutableConversationTurnViewModel | null = null;

    for (const message of sessionState.messages) {
      const parts = this.getPartsForMessage(sessionState, message.id);
      if (message.role === 'user') {
        currentTurn = {
          userMessageID: message.id,
          userInfo: message,
          userParts: parts,
          assistantMessages: [],
          assistantPartsByMessageID: {},
          interrupted: false,
          error: null,
        };
        turns.push(currentTurn);
        continue;
      }

      if (!currentTurn) {
        continue;
      }

      this.appendAssistantMessage(currentTurn, message, parts);
    }

    return turns;
  }

  buildRenderMessages(
    turns: ConversationTurnViewModel[],
    hydrateMessage: ConversationTurnMessageHydrator,
  ): ChatMessage[] {
    const messages: ChatMessage[] = [];

    for (const turn of turns) {
      messages.push(hydrateMessage(turn.userInfo, turn.userParts));
      for (const assistantMessage of turn.assistantMessages) {
        const assistantParts = turn.assistantPartsByMessageID[assistantMessage.id] ?? [];
        const renderedMessage = hydrateMessage(assistantMessage, assistantParts);
        if (this.isInterruptedAssistantMessage(assistantMessage, assistantParts)) {
          renderedMessage.streamState = 'interrupted';
        }
        messages.push(renderedMessage);
      }
    }

    return messages;
  }

  private appendAssistantMessage(
    turn: MutableConversationTurnViewModel,
    message: OpenCodeCanonicalMessageInfo,
    parts: OpenCodeCanonicalPart[],
  ): void {
    turn.assistantMessages.push(message);
    turn.assistantPartsByMessageID[message.id] = parts;
    turn.interrupted = turn.interrupted || this.isInterruptedAssistantMessage(message, parts);
    turn.error = turn.error ?? this.normalizeError(message.error);
  }

  private getPartsForMessage(
    sessionState: OpenCodeCanonicalSessionState,
    messageID: string,
  ): OpenCodeCanonicalPart[] {
    return sessionState.partsByMessageID[messageID] ?? [];
  }

  private isInterruptedAssistantMessage(
    message: OpenCodeCanonicalMessageInfo,
    parts: OpenCodeCanonicalPart[],
  ): boolean {
    const error = this.normalizeError(message.error);
    if (error && this.isInterruptedText(`${error.name ?? ''} ${error.message}`)) {
      return true;
    }

    return parts.some((part) => this.isInterruptedPart(part));
  }

  private isInterruptedPart(part: OpenCodeCanonicalPart): boolean {
    if (this.isInterruptedText(String(part.status ?? ''))) {
      return true;
    }

    if (!isRecord(part.state)) {
      return false;
    }

    return this.isInterruptedText(String(part.state.status ?? ''));
  }

  private isInterruptedText(text: string): boolean {
    return /\b(abort(?:ed)?|cancel(?:led|ed)?|interrupt(?:ed)?)\b/iu.test(text);
  }

  private normalizeError(errorLike: unknown): OpenCodeNormalizedError | null {
    if (!errorLike) {
      return null;
    }

    if (errorLike instanceof Error) {
      return {
        message: errorLike.message || errorLike.name,
        name: errorLike.name || undefined,
      };
    }

    if (typeof errorLike === 'string') {
      const message = errorLike.trim();
      return message ? { message } : null;
    }

    if (!isRecord(errorLike)) {
      return {
        message: String(errorLike),
      };
    }

    const data = isRecord(errorLike.data) ? errorLike.data : {};
    const name = getRecordString(errorLike, 'name') ?? getRecordString(data, 'name') ?? undefined;
    const message =
      getRecordString(data, 'message')
      ?? getRecordString(errorLike, 'message')
      ?? getRecordString(errorLike, 'error')
      ?? name
      ?? 'OpenCode message error';

    return {
      message,
      name,
    };
  }
}
