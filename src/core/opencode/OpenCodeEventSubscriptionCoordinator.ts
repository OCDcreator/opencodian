import { createLogger } from '../../shared';
import type { SdkEvent } from './sdkTypes';
import type { SdkEventEnvelope } from './types';

const logger = createLogger('OpenCodeEventSubscriptionCoordinator');
const EVENT_RETRY_DELAY_MS = 1_000;
const EVENT_RESUBSCRIBE_DELAY_MS = 250;
const EVENT_SOURCES: Array<Exclude<SdkEventEnvelope['source'], 'sync'>> = ['event', 'global'];

export type OpenCodeEventListener = (update: SdkEventEnvelope) => void;

type OpenCodeEventSource = Exclude<SdkEventEnvelope['source'], 'sync'>;

type SourceState = {
  abortController: AbortController | null;
  promise: Promise<void> | null;
};

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
}

export class OpenCodeEventSubscriptionCoordinator {
  private readonly openCodeEventListeners = new Set<OpenCodeEventListener>();
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
  private wanted = false;

  constructor(private readonly host: OpenCodeEventSubscriptionCoordinatorHost) {}

  subscribeToOpenCodeEvents(listener: OpenCodeEventListener): () => void {
    this.openCodeEventListeners.add(listener);
    this.wanted = true;
    this.ensureSubscriptions();

    return () => {
      this.openCodeEventListeners.delete(listener);
      if (!this.hasListeners()) {
        this.stopSubscriptions();
      }
    };
  }

  hasListeners(): boolean {
    return this.openCodeEventListeners.size > 0 || this.host.hasCatalogUpdateListeners();
  }

  ensureSubscriptions(): void {
    if (!this.hasListeners()) {
      return;
    }

    this.wanted = true;
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
    this.handleCatalogRelevantEvent(update.payload);
    this.emitOpenCodeEvent(update);
  }
}
