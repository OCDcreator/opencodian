import { createLogger } from '../../shared';

const logger = createLogger('OpenCodeStreamingRuntimeCoordinator');

export interface OpenCodeStreamingRuntimeCoordinatorHost {
  abortSessionOnServer(sessionId: string): Promise<void> | void;
}

export class OpenCodeStreamingRuntimeContext {
  readonly sessionId: string;
  private readonly abortController = new AbortController();
  private readonly partTypeMap = new Map<string, string>();

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  get signal(): AbortSignal {
    return this.abortController.signal;
  }

  abort(): void {
    this.abortController.abort();
  }

  hasPartType(partId: string): boolean {
    return this.partTypeMap.has(partId);
  }

  setPartType(partId: string, partType: string): void {
    if (!partId || !partType) {
      return;
    }

    this.partTypeMap.set(partId, partType);
  }

  getPartType(partId: string): string | undefined {
    return this.partTypeMap.get(partId);
  }
}

export class OpenCodeStreamingRuntimeCoordinator {
  private readonly activeStreams = new Map<string, OpenCodeStreamingRuntimeContext>();

  constructor(private readonly host: OpenCodeStreamingRuntimeCoordinatorHost) {}

  createActiveStreamContext(sessionId: string): OpenCodeStreamingRuntimeContext {
    const existing = this.activeStreams.get(sessionId);
    if (existing) {
      logger.warn(`Replacing existing active stream context for session ${sessionId}`);
      existing.abort();
    }

    const context = new OpenCodeStreamingRuntimeContext(sessionId);
    this.activeStreams.set(sessionId, context);
    return context;
  }

  releaseActiveStreamContext(streamContext: OpenCodeStreamingRuntimeContext): void {
    const current = this.activeStreams.get(streamContext.sessionId);
    if (current === streamContext) {
      this.activeStreams.delete(streamContext.sessionId);
    }
  }

  cancelStream(sessionId?: string | null): void {
    const targetSessionId = this.normalizeSessionId(sessionId);
    if (!targetSessionId) {
      logger.debug('No session specified for stream cancellation');
      return;
    }

    const streamContext = this.activeStreams.get(targetSessionId);
    if (!streamContext) {
      logger.debug(`No active stream to cancel for session ${targetSessionId}`);
      return;
    }

    logger.debug(`Cancelling stream for session ${targetSessionId}...`);
    streamContext.abort();
    logger.debug('Abort signal sent');
    void this.host.abortSessionOnServer(targetSessionId);
  }

  detachStream(sessionId?: string | null): void {
    const targetSessionId = this.normalizeSessionId(sessionId);
    if (!targetSessionId) {
      logger.debug('No session specified for local stream detach');
      return;
    }

    const streamContext = this.activeStreams.get(targetSessionId);
    if (!streamContext) {
      logger.debug(`No active stream to detach for session ${targetSessionId}`);
      return;
    }

    logger.debug(`Detaching local stream listener for session ${targetSessionId}...`);
    streamContext.abort();
    logger.debug('Local stream detach signal sent');
  }

  private normalizeSessionId(sessionId?: string | null): string {
    return typeof sessionId === 'string' ? sessionId : '';
  }
}
