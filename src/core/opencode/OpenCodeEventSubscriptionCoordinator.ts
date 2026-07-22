/* eslint-disable max-lines -- Plugin evidence state machine and event routing are intentionally colocated in this single coordinator. */

import { createLogger } from '../../shared';
import type { SdkEvent } from './sdkTypes';
import type { SdkEventEnvelope } from './types';

const logger = createLogger('OpenCodeEventSubscriptionCoordinator');
const EVENT_RETRY_DELAY_MS = 1_000;
const EVENT_RESUBSCRIBE_DELAY_MS = 250;
const EVENT_SOURCES: Array<Exclude<SdkEventEnvelope['source'], 'sync'>> = ['event', 'global'];

export type OpenCodeEventListener = (update: SdkEventEnvelope) => void;

export type PluginEvidenceListener = (snapshot: PluginEvidenceSnapshot) => void;

export interface OpenCodePluginEvidenceObserver {
  onPluginEvidence: PluginEvidenceListener;
  getConnectionSignature: () => string;
  fetchPluginConfig: () => Promise<unknown>;
}

export type OpenCodeEventSubscriptionInput =
  | OpenCodeEventListener
  | OpenCodePluginEvidenceObserver;

export interface OpenCodePluginEvidenceSubscriptionHandle {
  getPluginEvidenceSnapshot(): PluginEvidenceSnapshot;
  refreshPluginConfigEvidence(): Promise<PluginEvidenceSnapshot>;
}

export type OpenCodeEventUnsubscribe =
  (() => void) & Partial<OpenCodePluginEvidenceSubscriptionHandle>;

export type OpenCodeEventSource = Exclude<SdkEventEnvelope['source'], 'sync'>;

export type PluginEvidenceFetchStatus = 'idle' | 'ready' | 'error';

export interface PluginEffectiveConfigEvidence {
  plugin: Array<string | [string, Record<string, unknown>]>;
  fetchedAt: number;
  generation: string;
  stale: boolean;
}

export interface PluginFetchState {
  status: PluginEvidenceFetchStatus;
  attemptedAt: number | null;
  generation: string | null;
  error: string | null;
}

export interface PluginRuntimeEvidence {
  runtimeId: string;
  firstObservedAt: number;
  lastObservedAt: number;
  generation: string;
  stale: boolean;
  sources: OpenCodeEventSource[];
}

export interface PluginTransportState {
  wanted: boolean;
  activeSources: OpenCodeEventSource[];
  captureGeneration: string | null;
  captureStartedAt: number | null;
}

export interface PluginEvidenceSnapshot {
  connectionGeneration: string | null;
  effective: PluginEffectiveConfigEvidence | null;
  previousEffective: PluginEffectiveConfigEvidence | null;
  fetch: PluginFetchState;
  runtime: PluginRuntimeEvidence[];
  staleRuntime: PluginRuntimeEvidence[];
  transport: PluginTransportState;
}

type SourceState = {
  abortController: AbortController | null;
  promise: Promise<void> | null;
};

function deepCloneJsonLike<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

type CatalogRelevantEventPayload = {
  type?: unknown;
  properties?: {
    info?: {
      tools?: Record<string, boolean>;
    };
    part?: {
      type?: unknown;
      tool?: unknown;
    };
    permission?: unknown;
  };
};

export interface OpenCodeEventSubscriptionCoordinatorHost {
  subscribeToEvents(source: OpenCodeEventSource, signal: AbortSignal): Promise<AsyncIterable<unknown>>;
  hasCatalogUpdateListeners(): boolean;
  observeRuntimeToolNames(toolNames: Iterable<string>): boolean;
  emitCatalogUpdate(): void;
  refreshMcpServerStatus(): Promise<unknown>;
  logEventSubscriptionFailure(source: OpenCodeEventSource, error: unknown): void;
  delay(ms: number, signal?: AbortSignal): Promise<void>;
  /** Test/legacy fallback for plugin evidence transport. Production callers should use observer callbacks via `subscribeToOpenCodeEvents`. */
  getConnectionSignature?(): string;
  /** Test/legacy fallback for plugin evidence transport. Production callers should use observer callbacks via `subscribeToOpenCodeEvents`. */
  fetchPluginConfig?(): Promise<unknown>;
}

export class OpenCodeEventSubscriptionCoordinator {
  private readonly openCodeEventListeners = new Set<OpenCodeEventListener>();
  private readonly pluginEvidenceListeners = new Set<PluginEvidenceListener>();
  private readonly sourceStates: Record<OpenCodeEventSource, SourceState> = {
    event: {
      abortController: null,
      promise: null,
    },
    global: {
      abortController: null,
      promise: null,
    },
  };
  private pluginEvidenceObserver: OpenCodePluginEvidenceObserver | null = null;
  private wanted = false;
  private currentGeneration: string | null = null;
  private captureGeneration: string | null = null;
  private captureStartedAt: number | null = null;
  private effective: PluginEffectiveConfigEvidence | null = null;
  private refreshAttemptToken = 0;
  private previousEffective: PluginEffectiveConfigEvidence | null = null;
  private fetchState: PluginFetchState = {
    status: 'idle',
    attemptedAt: null,
    generation: null,
    error: null,
  };
  private runtimeEvidence: PluginRuntimeEvidence[] = [];
  private staleRuntimeEvidence: PluginRuntimeEvidence[] = [];

  constructor(private readonly host: OpenCodeEventSubscriptionCoordinatorHost) {}

  subscribeToOpenCodeEvents(input: OpenCodeEventSubscriptionInput): OpenCodeEventUnsubscribe {
    if (typeof input === 'function') {
      const listener = input as OpenCodeEventListener;
      this.openCodeEventListeners.add(listener);
    } else {
      if (this.pluginEvidenceObserver) {
        throw new Error('Only one OpenCodePluginEvidenceObserver may be active at a time');
      }
      this.pluginEvidenceObserver = input;
      this.pluginEvidenceListeners.add(input.onPluginEvidence);
    }

    this.wanted = true;
    this.ensureSubscriptions();

    const dispose = (() => {
      if (typeof input === 'function') {
        this.openCodeEventListeners.delete(input as OpenCodeEventListener);
      } else {
        this.pluginEvidenceListeners.delete(input.onPluginEvidence);
        if (this.pluginEvidenceObserver === input) {
          this.pluginEvidenceObserver = null;
        }
      }

      if (!this.hasListeners()) {
        this.stopSubscriptions();
      }
    }) as OpenCodeEventUnsubscribe;

    if (typeof input !== 'function') {
      dispose.getPluginEvidenceSnapshot = () => this.getPluginEvidenceSnapshot();
      dispose.refreshPluginConfigEvidence = () => this.refreshPluginConfigEvidence();
    }

    return dispose;
  }

  subscribeToPluginEvidence(listener: PluginEvidenceListener): () => void {
    this.pluginEvidenceListeners.add(listener);
    this.wanted = true;
    this.ensureSubscriptions();

    return () => {
      this.pluginEvidenceListeners.delete(listener);
      if (!this.hasListeners()) {
        this.stopSubscriptions();
      }
    };
  }

  hasListeners(): boolean {
    return this.openCodeEventListeners.size > 0
      || this.pluginEvidenceListeners.size > 0
      || this.host.hasCatalogUpdateListeners();
  }

  ensureSubscriptions(): void {
    if (!this.hasListeners()) {
      return;
    }

    this.wanted = true;
    const changed = this.observeGeneration();
    if (this.captureGeneration === null || changed) {
      this.captureGeneration = this.currentGeneration;
      this.captureStartedAt = Date.now();
    }
    for (const source of EVENT_SOURCES) {
      this.ensureSourceSubscription(source);
    }
  }

  stopSubscriptions(keepWanted = false): void {
    this.wanted = keepWanted;
    for (const source of EVENT_SOURCES) {
      this.sourceStates[source].abortController?.abort();
    }
  }

  restartSubscriptions(): void {
    if (!this.hasListeners()) {
      return;
    }

    this.stopSubscriptions(true);
    this.ensureSubscriptions();
  }

  getPluginEvidenceSnapshot(): PluginEvidenceSnapshot {
    const changed = this.observeGeneration();
    const snapshot = this.cloneSnapshot();
    if (changed) {
      this.emitPluginEvidenceUpdate();
    }
    return snapshot;
  }

  async refreshPluginConfigEvidence(): Promise<PluginEvidenceSnapshot> {
    const fetchPluginConfig = this.pluginEvidenceObserver?.fetchPluginConfig
      ?? this.host.fetchPluginConfig;
    if (!fetchPluginConfig) {
      throw new Error('Plugin evidence refresh requires a fetchPluginConfig callback');
    }

    this.observeGeneration();
    const generation = this.currentGeneration
      ?? this.pluginEvidenceObserver?.getConnectionSignature()
      ?? this.host.getConnectionSignature?.();
    if (!generation) {
      throw new Error('Plugin evidence refresh requires a getConnectionSignature callback');
    }

    const attemptToken = this.refreshAttemptToken + 1;
    this.refreshAttemptToken = attemptToken;
    this.fetchState = {
      status: 'idle',
      attemptedAt: Date.now(),
      generation,
      error: null,
    };
    this.emitPluginEvidenceUpdate();

    try {
      const raw = await fetchPluginConfig();
      this.observeGeneration();

      const normalized = this.normalizePluginConfig(raw);
      const fetchedAt = Date.now();

      if (this.refreshAttemptToken !== attemptToken) {
        // A newer refresh was started while this one was in flight; do not
        // overwrite newer state or emit stale completion.
        return this.cloneSnapshot();
      }

      if (this.currentGeneration !== generation) {
        this.previousEffective = {
          plugin: normalized,
          fetchedAt,
          generation,
          stale: true,
        };
        this.fetchState = {
          status: 'error',
          attemptedAt: fetchedAt,
          generation,
          error: 'Connection changed during config fetch',
        };
      } else {
        this.effective = {
          plugin: normalized,
          fetchedAt,
          generation,
          stale: false,
        };
        this.previousEffective = null;
        this.fetchState = {
          status: 'ready',
          attemptedAt: fetchedAt,
          generation,
          error: null,
        };
      }
    } catch (error) {
      this.observeGeneration();

      if (this.refreshAttemptToken !== attemptToken) {
        return this.cloneSnapshot();
      }

      if (this.effective) {
        this.previousEffective = { ...this.effective, stale: true };
        this.effective = null;
      }
      this.fetchState = {
        status: 'error',
        attemptedAt: Date.now(),
        generation,
        error: error instanceof Error ? error.message : String(error),
      };
    }

    this.emitPluginEvidenceUpdate();
    return this.cloneSnapshot();
  }

  private ensureSourceSubscription(source: OpenCodeEventSource): void {
    const state = this.sourceStates[source];
    if (!this.wanted || !this.hasListeners() || state.promise) {
      return;
    }

    const abortController = new AbortController();
    state.abortController = abortController;
    state.promise = this.runLoop(source, abortController).finally(() => {
      if (this.sourceStates[source].abortController === abortController) {
        this.sourceStates[source].abortController = null;
      }
      this.sourceStates[source].promise = null;
      if (this.wanted && this.hasListeners()) {
        this.ensureSourceSubscription(source);
      }
    });
  }

  private async runLoop(
    source: OpenCodeEventSource,
    abortController: AbortController,
  ): Promise<void> {
    while (!abortController.signal.aborted && this.wanted && this.hasListeners()) {
      try {
        const stream = await this.host.subscribeToEvents(source, abortController.signal);
        for await (const value of stream) {
          if (abortController.signal.aborted) {
            return;
          }

          this.handleSdkEventEnvelope({
            source,
            payload: value,
            timestamp: Date.now(),
          });
        }

        if (abortController.signal.aborted || !this.wanted || !this.hasListeners()) {
          return;
        }

        await this.host.delay(EVENT_RESUBSCRIBE_DELAY_MS, abortController.signal).catch(() => {});
      } catch (error) {
        if (abortController.signal.aborted || !this.wanted || !this.hasListeners()) {
          return;
        }

        this.host.logEventSubscriptionFailure(source, error);
        await this.host.delay(EVENT_RETRY_DELAY_MS, abortController.signal).catch(() => {});
      }
    }
  }

  private getEventPayload(payload: unknown): SdkEvent | null {
    if (payload && typeof payload === 'object' && 'payload' in (payload as Record<string, unknown>)) {
      const nestedPayload = (payload as { payload?: unknown }).payload;
      return nestedPayload && typeof nestedPayload === 'object' && 'type' in (nestedPayload as Record<string, unknown>)
        ? nestedPayload as SdkEvent
        : null;
    }

    return payload && typeof payload === 'object' && 'type' in (payload as Record<string, unknown>)
      ? payload as SdkEvent
      : null;
  }

  private handleCatalogRelevantEvent(payload: unknown): void {
    const event = this.getEventPayload(payload) as CatalogRelevantEventPayload | null;
    if (!event || typeof event.type !== 'string') {
      return;
    }

    if (event.type === 'mcp.tools.changed') {
      void this.host.refreshMcpServerStatus();
      return;
    }

    if (event.type === 'message.part.updated') {
      const part = event.properties?.part;
      if (part?.type === 'tool' && typeof part.tool === 'string') {
        if (this.host.observeRuntimeToolNames([part.tool])) {
          this.host.emitCatalogUpdate();
        }
      }
      return;
    }

    if (event.type === 'message.updated') {
      const info = event.properties?.info;
      if (info?.tools && typeof info.tools === 'object') {
        if (this.host.observeRuntimeToolNames(Object.keys(info.tools))) {
          this.host.emitCatalogUpdate();
        }
      }
      return;
    }

    if (event.type === 'permission.asked' && typeof event.properties?.permission === 'string') {
      if (this.host.observeRuntimeToolNames([event.properties.permission])) {
        this.host.emitCatalogUpdate();
      }
    }
  }

  private emitOpenCodeEvent(update: SdkEventEnvelope): void {
    for (const listener of [...this.openCodeEventListeners]) {
      try {
        listener(update);
      } catch (error) {
        logger.error('OpenCode event listener failed', error);
      }
    }
  }

  private handleSdkEventEnvelope(update: SdkEventEnvelope): void {
    const changed = this.observeGeneration();
    if (this.captureGeneration === null || changed) {
      this.captureGeneration = this.currentGeneration;
      this.captureStartedAt = update.timestamp;
    }
    this.handleCatalogRelevantEvent(update.payload);
    this.handlePluginAddedEvent(update.payload, update.source as OpenCodeEventSource, update.timestamp);
    this.emitOpenCodeEvent(update);
  }

  private observeGeneration(): boolean {
    const signature = this.pluginEvidenceObserver?.getConnectionSignature()
      ?? this.host.getConnectionSignature?.();
    if (!signature || this.currentGeneration === signature) {
      return false;
    }

    if (this.effective) {
      this.previousEffective = { ...this.effective, stale: true };
      this.effective = null;
    }

    for (const evidence of this.runtimeEvidence) {
      evidence.stale = true;
    }
    this.staleRuntimeEvidence.push(...this.runtimeEvidence);
    this.runtimeEvidence = [];

    this.currentGeneration = signature;
    this.captureGeneration = null;
    this.captureStartedAt = null;
    return true;
  }

  private handlePluginAddedEvent(
    payload: unknown,
    source: OpenCodeEventSource,
    timestamp: number,
  ): void {
    const event = this.getEventPayload(payload);
    if (!event || event.type !== 'plugin.added') {
      return;
    }

    const properties = (event as { properties?: unknown }).properties;
    if (!properties || typeof properties !== 'object') {
      return;
    }

    const runtimeId = (properties as { id?: unknown }).id;
    if (typeof runtimeId !== 'string' || !runtimeId) {
      return;
    }

    const generation = this.currentGeneration
      ?? this.pluginEvidenceObserver?.getConnectionSignature()
      ?? this.host.getConnectionSignature?.();
    if (!generation) {
      return;
    }

    const existing = this.runtimeEvidence.find(
      (evidence) => evidence.runtimeId === runtimeId && !evidence.stale,
    );

    if (existing && existing.generation === generation) {
      existing.lastObservedAt = timestamp;
      if (!existing.sources.includes(source)) {
        existing.sources.push(source);
      }
    } else {
      this.runtimeEvidence.push({
        runtimeId,
        firstObservedAt: timestamp,
        lastObservedAt: timestamp,
        generation,
        stale: false,
        sources: [source],
      });
    }

    this.emitPluginEvidenceUpdate();
  }

  private normalizePluginConfig(
    raw: unknown,
  ): Array<string | [string, Record<string, unknown>]> {
    if (!raw || typeof raw !== 'object') {
      return [];
    }

    const config = raw as { plugin?: unknown };
    if (!Array.isArray(config.plugin)) {
      return [];
    }

    return config.plugin.reduce<Array<string | [string, Record<string, unknown>]>>(
      (acc, item) => {
        if (typeof item === 'string') {
          acc.push(item);
          return acc;
        }

        if (
          Array.isArray(item)
          && item.length === 2
          && typeof item[0] === 'string'
          && isPlainRecord(item[1])
        ) {
          acc.push([item[0], deepCloneJsonLike(item[1])]);
        }

        return acc;
      },
      [],
    );
  }

  private emitPluginEvidenceUpdate(): void {
    for (const listener of [...this.pluginEvidenceListeners]) {
      try {
        listener(this.cloneSnapshot());
      } catch (error) {
        logger.error('Plugin evidence listener failed', error);
      }
    }
  }

  private getTransportState(): PluginTransportState {
    const activeSources = EVENT_SOURCES.filter((source) => {
      const state = this.sourceStates[source];
      return state.promise !== null
        && state.abortController !== null
        && !state.abortController.signal.aborted;
    });

    return {
      wanted: this.wanted,
      activeSources,
      captureGeneration: this.captureGeneration,
      captureStartedAt: this.captureStartedAt,
    };
  }

  private clonePluginSpec(spec: string | [string, Record<string, unknown>]) {
    return typeof spec === 'string'
      ? spec
      : ([spec[0], deepCloneJsonLike(spec[1])] as [string, Record<string, unknown>]);
  }

  private cloneSnapshot(): PluginEvidenceSnapshot {
    return {
      connectionGeneration: this.currentGeneration,
      effective: this.effective
        ? {
          plugin: this.effective.plugin.map((spec) => this.clonePluginSpec(spec)),
          fetchedAt: this.effective.fetchedAt,
          generation: this.effective.generation,
          stale: this.effective.stale,
        }
        : null,
      previousEffective: this.previousEffective
        ? {
          plugin: this.previousEffective.plugin.map((spec) => this.clonePluginSpec(spec)),
          fetchedAt: this.previousEffective.fetchedAt,
          generation: this.previousEffective.generation,
          stale: this.previousEffective.stale,
        }
        : null,
      fetch: { ...this.fetchState },
      runtime: this.runtimeEvidence.map((evidence) => ({
        ...evidence,
        sources: [...evidence.sources],
      })),
      staleRuntime: this.staleRuntimeEvidence.map((evidence) => ({
        ...evidence,
        sources: [...evidence.sources],
      })),
      transport: { ...this.getTransportState() },
    };
  }
}
