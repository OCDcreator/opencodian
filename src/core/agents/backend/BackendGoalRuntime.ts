/** Backend-owned Goal projection. This store observes native state; it never schedules work. */
import type { AgentBackendKind } from '../../types/chat';

export type AgentGoalAction = 'set' | 'edit' | 'pause' | 'resume' | 'clear' | 'budget';
export type AgentGoalExecution = 'unknown' | 'running' | 'evaluating' | 'waiting' | 'stopping' | 'stopped' | 'idle';
export type AgentGoalStatus = 'active' | 'paused' | 'complete' | 'blocked' | 'limited' | 'waiting' | 'unknown';

export interface AgentGoalCapabilities {
  source: 'native' | 'extension';
  driver: string;
  actions: readonly AgentGoalAction[];
  /** Execution interruption preserves the objective, but is not a native paused Goal state. */
  pauseMode: 'goal' | 'execution';
  editMode: 'edit' | 'replace';
  objectiveLimit?: number;
  budgets: readonly ('tokens' | 'rounds')[];
  reason?: string;
}

export interface AgentGoalSnapshot {
  backend: AgentBackendKind;
  sessionId: string;
  source: 'native' | 'extension';
  driver: string;
  id?: string;
  objective: string;
  status: AgentGoalStatus;
  rawStatus: string;
  execution: AgentGoalExecution;
  reason?: string;
  armed?: boolean;
  tokensUsed?: number;
  tokenBudget?: number | null;
  rounds?: number;
  automaticResponses?: number;
  maxRounds?: number;
  elapsedSeconds?: number;
  revision?: number;
  updatedAt?: number;
}

export type AgentGoalReadback =
  | { status: 'ready'; goal: AgentGoalSnapshot | null; observedAt: number }
  | { status: 'unknown' | 'stale' | 'unavailable' | 'failed'; goal: AgentGoalSnapshot | null; reason?: string; observedAt?: number };

export interface AgentGoalCommand {
  action: AgentGoalAction;
  objective?: string;
  tokenBudget?: number | null;
  expectedRevision?: number;
}

export interface AgentGoalControlResult {
  status: 'confirmed' | 'accepted' | 'partial' | 'failed' | 'unavailable';
  readback: AgentGoalReadback;
  reason?: string;
}

export type AgentGoalEvent =
  | { type: 'state'; sessionId: string; readback: AgentGoalReadback }
  | { type: 'activity'; sessionId: string; execution: AgentGoalExecution; turnId?: string };

/** Shared by the six adapter boundaries to keep read races, subscriptions and failures consistent. */
export class BackendGoalRuntime {
  private readonly states = new Map<string, AgentGoalReadback>();
  private readonly versions = new Map<string, number>();
  private readonly executions = new Map<string, AgentGoalExecution>();
  private readonly handlers = new Set<(event: AgentGoalEvent) => void>();
  private readonly controls = new Map<string, Promise<unknown>>();

  constructor(readonly backend: AgentBackendKind, readonly capabilities: AgentGoalCapabilities) {}

  get(sessionId: string): AgentGoalReadback {
    return this.states.get(sessionId) ?? { status: 'unknown', goal: null };
  }

  version(sessionId: string): number { return this.versions.get(sessionId) ?? 0; }

  subscribe(handler: (event: AgentGoalEvent) => void): { dispose(): void } {
    this.handlers.add(handler);
    return { dispose: () => { this.handlers.delete(handler); } };
  }

  waitForState(sessionId: string, afterVersion: number, timeoutMs = 10000): Promise<AgentGoalReadback> {
    if (this.version(sessionId) > afterVersion) return Promise.resolve(this.get(sessionId));
    return new Promise((resolve) => {
      const subscription = this.subscribe((event) => {
        if (event.type !== 'state' || event.sessionId !== sessionId || this.version(sessionId) <= afterVersion) return;
        clearTimeout(timer); subscription.dispose(); resolve(event.readback);
      });
      const timer = setTimeout(() => {
        subscription.dispose();
        resolve({ ...this.get(sessionId), status: 'stale', reason: 'Native Goal confirmation has not arrived' });
      }, timeoutMs);
    });
  }

  /** Ignore a slow snapshot if an authoritative event arrived after its read began. */
  observeRead(sessionId: string, value: unknown, version: number): AgentGoalReadback {
    return version === this.version(sessionId) ? this.observe(sessionId, value) : this.get(sessionId);
  }

  observe(sessionId: string, value: unknown): AgentGoalReadback {
    try {
      const goal = value === null ? null : this.normalize(sessionId, value);
      return this.publish(sessionId, { status: 'ready', goal, observedAt: Date.now() });
    } catch (error) {
      return this.fail(sessionId, error);
    }
  }

  activity(sessionId: string, execution: AgentGoalExecution, turnId?: string): void {
    this.executions.set(sessionId, execution);
    const state = this.states.get(sessionId);
    if (state?.goal) this.states.set(sessionId, { ...state, goal: { ...state.goal, execution } });
    this.emit({ type: 'activity', sessionId, execution, ...(turnId ? { turnId } : {}) });
  }

  fail(sessionId: string, error: unknown, unavailable = false): AgentGoalReadback {
    const current = this.get(sessionId);
    return this.publish(sessionId, { ...current, status: unavailable ? 'unavailable' : 'failed',
      reason: error instanceof Error ? error.message : String(error) });
  }

  invalidate(reason: string): void {
    for (const [sessionId, state] of this.states) this.publish(sessionId, { ...state, status: 'stale', reason });
    this.executions.clear();
  }

  forget(sessionId: string): void {
    this.observe(sessionId, null);
    this.executions.delete(sessionId);
  }

  /** Controls for one session serialize without blocking independent sessions. */
  async control<T>(sessionId: string, operation: () => Promise<T>): Promise<T> {
    const prior = this.controls.get(sessionId) ?? Promise.resolve();
    const current = prior.catch(() => undefined).then(operation);
    this.controls.set(sessionId, current);
    try { return await current; }
    finally { if (this.controls.get(sessionId) === current) this.controls.delete(sessionId); }
  }

  private publish(sessionId: string, readback: AgentGoalReadback): AgentGoalReadback {
    this.versions.set(sessionId, this.version(sessionId) + 1);
    this.states.set(sessionId, readback);
    this.emit({ type: 'state', sessionId, readback });
    return readback;
  }

  private emit(event: AgentGoalEvent): void {
    for (const handler of this.handlers) {
      try { handler(event); } catch { /* A detached UI must never break the native chat pump. */ }
    }
  }

  private normalize(sessionId: string, value: unknown): AgentGoalSnapshot {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed native Goal state');
    const raw = value as Record<string, unknown>;
    const objective = raw.objective ?? raw.condition;
    if (typeof objective !== 'string' || !objective.trim()) throw new Error('Native Goal state has no objective');
    const status = typeof raw.status === 'string' ? raw.status : this.backend === 'claude-code' ? 'active' : 'unknown';
    const text = (field: unknown) => typeof field === 'string' && field ? field : undefined;
    const number = (field: unknown) => typeof field === 'number' && Number.isFinite(field) && field >= 0 ? field : undefined;
    return {
      backend: this.backend, sessionId, source: this.capabilities.source, driver: this.capabilities.driver,
      objective, rawStatus: status, status: normalizeGoalStatus(status),
      execution: this.executions.get(sessionId) ?? 'unknown',
      id: text(raw.id ?? raw.targetId ?? raw.goalId), reason: text(raw.reason ?? raw.last_reason),
      ...(typeof raw.armed === 'boolean' ? { armed: raw.armed } : {}),
      tokensUsed: number(raw.tokensUsed),
      ...(raw.tokenBudget === null ? { tokenBudget: null } : { tokenBudget: number(raw.tokenBudget) }),
      rounds: number(raw.rounds ?? raw.iterations), maxRounds: number(raw.maxRounds),
      automaticResponses: number(raw.automaticResponses),
      elapsedSeconds: number(raw.timeUsedSeconds), revision: number(raw.revision),
      updatedAt: number(raw.updatedAt ?? raw.set_at),
    };
  }
}

export function normalizeGoalStatus(value: string): AgentGoalStatus {
  switch (value) {
    case 'active': return 'active';
    case 'paused': return 'paused';
    case 'complete': case 'completed': case 'achieved': return 'complete';
    case 'blocked': return 'blocked';
    case 'waiting': return 'waiting';
    case 'usageLimited': case 'budgetLimited': case 'usage-limited': case 'budget-limited':
    case 'usage_limited': case 'budget_limited': return 'limited';
    default: return 'unknown';
  }
}

export function validateGoalCommand(command: AgentGoalCommand, capabilities: AgentGoalCapabilities): void {
  if (!capabilities.actions.includes(command.action)) throw new Error(`Goal action unavailable: ${command.action}`);
  if (command.action === 'set' || command.action === 'edit') {
    if (!command.objective?.trim()) throw new Error('A Goal objective is required');
    if (capabilities.objectiveLimit && command.objective.length > capabilities.objectiveLimit)
      throw new Error(`Goal objective exceeds ${capabilities.objectiveLimit} characters`);
  }
  if (command.tokenBudget !== undefined && !capabilities.budgets.includes('tokens'))
    throw new Error('This Goal driver does not expose a token budget');
  if (command.tokenBudget !== undefined && command.tokenBudget !== null
    && (!Number.isSafeInteger(command.tokenBudget) || command.tokenBudget <= 0))
    throw new Error('A supported positive integer token budget is required');
}

/** A command ACK cannot substitute for matching state. */
export function confirmGoalCommand(command: AgentGoalCommand, readback: AgentGoalReadback): AgentGoalControlResult {
  if (readback.status !== 'ready') return { status: readback.status === 'unavailable' ? 'unavailable' : 'partial', readback };
  const goal = readback.goal;
  const matches = command.action === 'clear' ? goal === null
    : command.action === 'set' || command.action === 'edit' ? goal?.objective === command.objective
    : command.action === 'pause' ? goal?.status === 'paused'
    : command.action === 'resume' ? goal?.status === 'active' && goal.armed !== false
    : goal?.tokenBudget === command.tokenBudget;
  return matches ? { status: 'confirmed', readback }
    : { status: 'partial', readback, reason: 'Goal command was accepted but the requested state was not confirmed' };
}
