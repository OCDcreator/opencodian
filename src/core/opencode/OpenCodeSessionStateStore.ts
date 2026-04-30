import type { SessionDiffEntry } from '../types';
import type { OpenCodeStreamMutation } from './OpenCodeStreamEventTransformer';
import type {
  OpenCodeCanonicalMessageInfo,
  OpenCodeCanonicalPart,
  OpenCodeCanonicalSessionState,
  OpenCodeSessionMessageWithParts,
} from './types';

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function compareById<T extends { id: string }>(left: T, right: T): number {
  return left.id.localeCompare(right.id);
}

function cloneMessage(info: OpenCodeCanonicalMessageInfo): OpenCodeCanonicalMessageInfo {
  return {
    ...info,
    time: { ...info.time },
    tokens: info.tokens
      ? {
        ...info.tokens,
        cache: { ...info.tokens.cache },
      }
      : undefined,
  };
}

function clonePart(part: OpenCodeCanonicalPart): OpenCodeCanonicalPart {
  return {
    ...part,
    time: part.time ? { ...part.time } : undefined,
  };
}

function cloneState(state: OpenCodeCanonicalSessionState): OpenCodeCanonicalSessionState {
  return {
    sessionID: state.sessionID,
    messages: state.messages.map(cloneMessage),
    partsByMessageID: Object.fromEntries(
      Object.entries(state.partsByMessageID).map(([messageID, parts]) => [
        messageID,
        parts.map(clonePart),
      ]),
    ),
  };
}

export class OpenCodeSessionStateStore {
  private readonly sessions = new Map<string, OpenCodeCanonicalSessionState>();
  private readonly diffEntriesBySessionId = new Map<string, SessionDiffEntry[]>();

  replaceSessionSnapshot(
    sessionID: string,
    messages: OpenCodeSessionMessageWithParts[],
  ): OpenCodeCanonicalSessionState {
    const state: OpenCodeCanonicalSessionState = {
      sessionID,
      messages: [],
      partsByMessageID: {},
    };

    for (const message of messages) {
      const info = {
        ...message.info,
        sessionID: message.info.sessionID ?? sessionID,
      } as OpenCodeCanonicalMessageInfo;
      state.messages.push(cloneMessage(info));

      const parts = message.parts.map((part) => clonePart({
        ...part,
        sessionID: part.sessionID ?? info.sessionID,
        messageID: part.messageID ?? info.id,
      } as OpenCodeCanonicalPart));
      if (parts.length > 0) {
        state.partsByMessageID[info.id] = parts.sort(compareById);
      }
    }

    this.sessions.set(sessionID, state);
    return cloneState(state);
  }

  upsertMessage(info: OpenCodeCanonicalMessageInfo): OpenCodeCanonicalSessionState {
    const state = this.getOrCreateSessionState(info.sessionID);
    const next = cloneMessage(info);
    const index = state.messages.findIndex((message) => message.id === info.id);
    if (index >= 0) {
      state.messages[index] = next;
    } else {
      state.messages.push(next);
    }
    return cloneState(state);
  }

  removeMessage(sessionID: string, messageID: string): OpenCodeCanonicalSessionState {
    const state = this.getOrCreateSessionState(sessionID);
    state.messages = state.messages.filter((message) => message.id !== messageID);
    delete state.partsByMessageID[messageID];
    return cloneState(state);
  }

  upsertPart(part: OpenCodeCanonicalPart): OpenCodeCanonicalSessionState {
    const state = this.getOrCreateSessionState(part.sessionID);
    const next = clonePart(part);
    const parts = state.partsByMessageID[part.messageID] ?? [];
    const index = parts.findIndex((candidate) => candidate.id === part.id);
    if (index >= 0) {
      parts[index] = next;
    } else {
      parts.push(next);
    }
    state.partsByMessageID[part.messageID] = parts.sort(compareById);
    return cloneState(state);
  }

  removePart(messageID: string, partID: string): OpenCodeCanonicalSessionState | null {
    for (const state of this.sessions.values()) {
      const parts = state.partsByMessageID[messageID];
      if (!parts) {
        continue;
      }

      state.partsByMessageID[messageID] = parts.filter((part) => part.id !== partID);
      if (state.partsByMessageID[messageID].length === 0) {
        delete state.partsByMessageID[messageID];
      }
      return cloneState(state);
    }

    return null;
  }

  appendPartDelta(input: {
    messageID: string;
    partID: string;
    field: string;
    delta: string;
  }): OpenCodeCanonicalSessionState | null {
    for (const state of this.sessions.values()) {
      const parts = state.partsByMessageID[input.messageID];
      const index = parts?.findIndex((part) => part.id === input.partID) ?? -1;
      if (!parts || index < 0) {
        continue;
      }

      const next = clonePart(parts[index]) as OpenCodeCanonicalPart & Record<string, unknown>;
      const currentValue = typeof next[input.field] === 'string' ? next[input.field] as string : '';
      next[input.field] = `${currentValue}${input.delta}`;
      parts[index] = next;
      return cloneState(state);
    }

    return null;
  }

  applyStreamMutations(mutations: OpenCodeStreamMutation[]): void {
    for (const mutation of mutations) {
      this.applyStreamMutation(mutation);
    }
  }

  private applyStreamMutation(mutation: OpenCodeStreamMutation): void {
    switch (mutation.type) {
      case 'message.upserted':
        this.ensureStreamMessage(mutation);
        break;
      case 'part.upserted':
        this.ensureStreamMessage(mutation);
        if (mutation.part) {
          this.upsertStreamPart(mutation.part as OpenCodeCanonicalPart);
        }
        break;
      case 'part.delta':
        this.ensureStreamMessage(mutation);
        this.applyStreamPartDelta(mutation);
        break;
      case 'part.completed':
        this.ensureStreamMessage(mutation);
        break;
    }
  }

  private ensureStreamMessage(mutation: Pick<
    OpenCodeStreamMutation,
    'sessionID' | 'messageID' | 'role' | 'createdAt'
  >): void {
    const existing = this.sessions.get(mutation.sessionID)?.messages.find(
      (message) => message.id === mutation.messageID,
    );
    if (existing) {
      return;
    }

    this.upsertMessage({
      id: mutation.messageID,
      sessionID: mutation.sessionID,
      role: mutation.role ?? 'assistant',
      time: {
        created: mutation.createdAt ?? Date.now(),
      },
    });
  }

  private upsertStreamPart(part: OpenCodeCanonicalPart): void {
    const existing = this.sessions.get(part.sessionID)?.partsByMessageID[part.messageID]
      ?.find((candidate) => candidate.id === part.id);
    const nextPart = existing ? this.mergeStreamPart(existing, part) : part;
    this.upsertPart(nextPart);
  }

  private mergeStreamPart(
    existing: OpenCodeCanonicalPart,
    incoming: OpenCodeCanonicalPart,
  ): OpenCodeCanonicalPart {
    return this.mergeDefinedRecords(
      existing as Record<string, unknown>,
      incoming as Record<string, unknown>,
    ) as OpenCodeCanonicalPart;
  }

  private mergeDefinedRecords(
    existing: Record<string, unknown>,
    incoming: Record<string, unknown>,
  ): Record<string, unknown> {
    const merged: Record<string, unknown> = { ...existing };
    for (const [key, value] of Object.entries(incoming)) {
      if (value === undefined) {
        continue;
      }

      if (isPlainRecord(value) && isPlainRecord(merged[key])) {
        merged[key] = this.mergeDefinedRecords(
          merged[key] as Record<string, unknown>,
          value,
        );
        continue;
      }

      merged[key] = value;
    }

    return merged;
  }

  private applyStreamPartDelta(mutation: OpenCodeStreamMutation): void {
    if (!mutation.partID || !mutation.field || typeof mutation.delta !== 'string') {
      return;
    }

    const nextState = this.appendPartDelta({
      messageID: mutation.messageID,
      partID: mutation.partID,
      field: mutation.field,
      delta: mutation.delta,
    });
    if (nextState) {
      return;
    }

    const nextPart: Record<string, unknown> = {
      id: mutation.partID,
      sessionID: mutation.sessionID,
      messageID: mutation.messageID,
      type: mutation.partType ?? 'text',
    };
    nextPart[mutation.field] = mutation.delta;
    this.upsertPart(nextPart as OpenCodeCanonicalPart);
  }

  setSessionDiffEntries(sessionID: string, entries: SessionDiffEntry[]): void {
    if (entries.length > 0) {
      this.diffEntriesBySessionId.set(sessionID, entries.map((entry) => ({ ...entry })));
    } else {
      this.diffEntriesBySessionId.delete(sessionID);
    }
  }

  getSessionDiffEntries(sessionID: string): SessionDiffEntry[] {
    const entries = this.diffEntriesBySessionId.get(sessionID);
    return entries ? entries.map((entry) => ({ ...entry })) : [];
  }

  removeSessionDiffEntries(sessionID: string): void {
    this.diffEntriesBySessionId.delete(sessionID);
  }

  getSessionState(sessionID: string): OpenCodeCanonicalSessionState | null {
    const state = this.sessions.get(sessionID);
    return state ? cloneState(state) : null;
  }

  private getOrCreateSessionState(sessionID: string): OpenCodeCanonicalSessionState {
    const existing = this.sessions.get(sessionID);
    if (existing) {
      return existing;
    }

    const state: OpenCodeCanonicalSessionState = {
      sessionID,
      messages: [],
      partsByMessageID: {},
    };
    this.sessions.set(sessionID, state);
    return state;
  }
}
