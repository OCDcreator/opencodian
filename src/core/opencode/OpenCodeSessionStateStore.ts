import type { SessionDiffEntry } from '../types';
import type { OpenCodeStreamMutation } from './OpenCodeStreamEventTransformer';
import type {
  OpenCodeCanonicalMessageInfo,
  OpenCodeCanonicalPart,
  OpenCodeCanonicalSessionState,
  OpenCodeSessionMessageWithParts,
  OpenCodeSessionSnapshotToken,
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
  // Independent foreground ingress must not recreate authoritatively removed
  // IDs. Weak ownership releases these barriers when a session is evicted.
  private readonly streamRetractions = new WeakMap<OpenCodeCanonicalSessionState, {
    messages: Set<string>;
    parts: Map<string, Set<string>>;
    revision: number;
    nextRequest: number;
    appliedRequest: number;
    messageRevisions: Map<string, number>;
    partRevisions: Map<string, Map<string, number>>;
  }>();

  beginSessionSnapshot(sessionID: string): OpenCodeSessionSnapshotToken {
    const owner = this.getStreamRetractions(this.getOrCreateSessionState(sessionID));
    return { revision: owner.revision, request: ++owner.nextRequest, owner };
  }

  replaceSessionSnapshot(
    sessionID: string,
    messages: OpenCodeSessionMessageWithParts[],
    token?: OpenCodeSessionSnapshotToken,
  ): OpenCodeCanonicalSessionState {
    const previous = this.sessions.get(sessionID);
    const owner = previous && this.getStreamRetractions(previous);
    if (token && (!owner || token.owner !== owner || token.request < owner.appliedRequest)) {
      return previous ? cloneState(previous) : { sessionID, messages: [], partsByMessageID: {} };
    }
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

    if (token && previous) this.mergeConcurrentSnapshotChanges(state, previous, token.revision);
    this.updateSnapshotRetractions(state);
    const tracking = this.getStreamRetractions(state);
    tracking.appliedRequest = token?.request ?? ++tracking.nextRequest;
    this.sessions.set(sessionID, state);
    return cloneState(state);
  }

  upsertMessage(info: OpenCodeCanonicalMessageInfo): OpenCodeCanonicalSessionState {
    const state = this.getOrCreateSessionState(info.sessionID);
    this.streamRetractions.get(state)?.messages.delete(info.id);
    this.recordSnapshotMutation(state, info.id);
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
    const retractions = this.getStreamRetractions(state);
    retractions.messages.add(messageID);
    const removedParts = retractions.parts.get(messageID) ?? new Set<string>();
    for (const part of state.partsByMessageID[messageID] ?? []) {
      removedParts.add(part.id);
      this.recordSnapshotMutation(state, messageID, part.id);
    }
    if (removedParts.size) retractions.parts.set(messageID, removedParts);
    this.recordSnapshotMutation(state, messageID);
    state.messages = state.messages.filter((message) => message.id !== messageID);
    delete state.partsByMessageID[messageID];
    return cloneState(state);
  }

  upsertPart(part: OpenCodeCanonicalPart): OpenCodeCanonicalSessionState {
    const state = this.getOrCreateSessionState(part.sessionID);
    this.streamRetractions.get(state)?.parts.get(part.messageID)?.delete(part.id);
    this.recordSnapshotMutation(state, part.messageID, part.id);
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
      if (!parts && !state.messages.some((message) => message.id === messageID)) {
        continue;
      }

      const retractions = this.getStreamRetractions(state);
      const removedParts = retractions.parts.get(messageID) ?? new Set<string>();
      removedParts.add(partID);
      this.recordSnapshotMutation(state, messageID, partID);
      retractions.parts.set(messageID, removedParts);
      state.partsByMessageID[messageID] = (parts ?? []).filter((part) => part.id !== partID);
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
      this.recordSnapshotMutation(state, input.messageID, input.partID);
      return cloneState(state);
    }

    return null;
  }

  applyStreamMutations(mutations: OpenCodeStreamMutation[]): void {
    for (const mutation of mutations) {
      const state = this.sessions.get(mutation.sessionID);
      const retractions = state && this.streamRetractions.get(state);
      const partID = mutation.partID ?? mutation.part?.id;
      if (retractions?.messages.has(mutation.messageID)
        || (partID && retractions?.parts.get(mutation.messageID)?.has(partID))) continue;
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

  deleteSession(sessionID: string): boolean {
    const deleted = this.sessions.delete(sessionID);
    this.diffEntriesBySessionId.delete(sessionID);
    return deleted;
  }

  deleteSessions(sessionIDs: Iterable<string>): string[] {
    const deletedSessionIds: string[] = [];
    for (const sessionID of sessionIDs) {
      if (this.deleteSession(sessionID)) {
        deletedSessionIds.push(sessionID);
      }
    }
    return deletedSessionIds;
  }

  getSessionIds(): string[] {
    return [...this.sessions.keys()];
  }

  getSessionCount(): number {
    return this.sessions.size;
  }

  getSessionState(sessionID: string): OpenCodeCanonicalSessionState | null {
    const state = this.sessions.get(sessionID);
    return state ? cloneState(state) : null;
  }

  private recordSnapshotMutation(state: OpenCodeCanonicalSessionState, messageID: string, partID?: string): void {
    const tracking = this.getStreamRetractions(state);
    const revision = ++tracking.revision;
    if (!partID) {
      tracking.messageRevisions.set(messageID, revision);
      return;
    }
    const parts = tracking.partRevisions.get(messageID) ?? new Map<string, number>();
    parts.set(partID, revision);
    tracking.partRevisions.set(messageID, parts);
  }

  private mergeConcurrentSnapshotChanges(
    snapshot: OpenCodeCanonicalSessionState,
    current: OpenCodeCanonicalSessionState,
    revision: number,
  ): void {
    const tracking = this.getStreamRetractions(current);
    for (const [messageID, changedAt] of tracking.messageRevisions) {
      if (changedAt <= revision) continue;
      const live = current.messages.find((message) => message.id === messageID);
      const index = snapshot.messages.findIndex((message) => message.id === messageID);
      if (live && index >= 0) snapshot.messages[index] = cloneMessage(live);
      else if (live) snapshot.messages.push(cloneMessage(live));
      else {
        snapshot.messages = snapshot.messages.filter((message) => message.id !== messageID);
        delete snapshot.partsByMessageID[messageID];
      }
    }
    for (const [messageID, parts] of tracking.partRevisions) {
      if (tracking.messages.has(messageID)) continue;
      for (const [partID, changedAt] of parts) {
        if (changedAt <= revision) continue;
        this.mergeConcurrentSnapshotPart(snapshot, current, messageID, partID);
      }
    }
  }

  private mergeConcurrentSnapshotPart(
    snapshot: OpenCodeCanonicalSessionState,
    current: OpenCodeCanonicalSessionState,
    messageID: string,
    partID: string,
  ): void {
    const live = current.partsByMessageID[messageID]?.find((part) => part.id === partID);
    const parts = (snapshot.partsByMessageID[messageID] ?? []).filter((part) => part.id !== partID);
    if (live) {
      parts.push(clonePart(live));
      if (!snapshot.messages.some((message) => message.id === messageID)) {
        const info = current.messages.find((message) => message.id === messageID);
        if (info) snapshot.messages.push(cloneMessage(info));
      }
    }
    if (parts.length) snapshot.partsByMessageID[messageID] = parts.sort(compareById);
    else delete snapshot.partsByMessageID[messageID];
  }

  private getStreamRetractions(state: OpenCodeCanonicalSessionState) {
    let retractions = this.streamRetractions.get(state);
    if (!retractions) {
      retractions = {
        messages: new Set<string>(), parts: new Map<string, Set<string>>(),
        revision: 0, nextRequest: 0, appliedRequest: 0,
        messageRevisions: new Map<string, number>(), partRevisions: new Map<string, Map<string, number>>(),
      };
      this.streamRetractions.set(state, retractions);
    }
    return retractions;
  }

  private updateSnapshotRetractions(state: OpenCodeCanonicalSessionState): void {
    const previous = this.sessions.get(state.sessionID);
    const retractions = previous ? this.getStreamRetractions(previous) : this.getStreamRetractions(state);
    const messageIDs = new Set(state.messages.map((message) => message.id));
    for (const message of previous?.messages ?? []) {
      if (!messageIDs.has(message.id)) retractions.messages.add(message.id);
    }
    for (const [messageID, parts] of Object.entries(previous?.partsByMessageID ?? {})) {
      const partIDs = new Set(state.partsByMessageID[messageID]?.map((part) => part.id));
      const removedParts = retractions.parts.get(messageID) ?? new Set<string>();
      for (const part of parts) if (!partIDs.has(part.id)) removedParts.add(part.id);
      if (removedParts.size) retractions.parts.set(messageID, removedParts);
    }
    // A subsequent authoritative snapshot can explicitly restore an ID.
    for (const messageID of messageIDs) retractions.messages.delete(messageID);
    for (const [messageID, parts] of Object.entries(state.partsByMessageID)) {
      for (const part of parts) retractions.parts.get(messageID)?.delete(part.id);
    }
    this.streamRetractions.set(state, retractions);
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
