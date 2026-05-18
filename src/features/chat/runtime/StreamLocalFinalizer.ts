import { buildLocalStreamOutcome } from './buildLocalStreamOutcome';
import { persistLocalStreamOutcome } from './LocalStreamMessagePersistence';
import type {
  LocalStreamOutcome,
  StreamLocalFinalizerOptions,
  StreamLocalFinalizerResult,
} from './SendPipelineTypes';
import { finalizeStreamingShell } from './StreamShellFinalizer';

export class StreamLocalFinalizer {
  constructor(private readonly options: StreamLocalFinalizerOptions) {}

  async finalize(): Promise<StreamLocalFinalizerResult> {
    const outcome = this.buildOutcome();
    this.logFinalizationEntry(outcome);
    this.options.host.transitionTabSessionLifecycle(
      this.options.preparedSend.tabId,
      'finalizing',
      'stream-local-finalizer',
    );
    this.markSyncInFlight(outcome);

    this.options.routedStream.resetStreamingState();
    this.options.host.completeTabContextUsageStream(this.options.preparedSend.tabId);
    this.options.routedStream.cleanupPendingIndicator();

    await this.finalizeStreamingShell(outcome);
    await this.runPostShellCleanup();
    await this.persistLocalMessages(outcome);
    this.clearRuntimeState();

    return {
      shouldSyncFromServer: outcome.shouldSyncFromServer,
      logAssistantFinalizationStage: (stage, payload = {}) => {
        this.options.routedStream.logAssistantFinalizationStage(stage, payload);
      },
    };
  }

  private buildOutcome(): LocalStreamOutcome {
    return buildLocalStreamOutcome({
      preparedSend: this.options.preparedSend,
      runtime: this.options.runtime,
      streamController: this.options.streamController,
      routedStream: this.options.routedStream,
      sessionRetryMessage: this.getSessionRetryMessage(),
    });
  }

  private getSessionRetryMessage(): string | null {
    const sessionId = this.options.preparedSend.conversation.openCodeSessionId;
    const runtime = this.options.runtime;
    if (sessionId && runtime.sessionStatusSessionId && runtime.sessionStatusSessionId !== sessionId) {
      return null;
    }

    const status = runtime.sessionStatus;
    if (status?.type !== 'retry') {
      return null;
    }

    const message = status.message.trim();
    return message.length > 0 ? message : null;
  }

  private logFinalizationEntry(outcome: LocalStreamOutcome): void {
    this.options.routedStream.logAssistantFinalizationStage('stream-finally-enter', {
      shouldPersistInterruptedState: outcome.shouldPersistInterruptedState,
      shouldSyncFromServer: outcome.shouldSyncFromServer,
      finalTimestampCandidate: outcome.finalizedTimestamp,
      finalModelIdCandidate: outcome.finalizedModelId,
      finalizedAssistantMessageId: outcome.finalizedAssistantMessageId ?? null,
      streamedTextLength: outcome.streamedTextContent.length,
      streamContentBlocks: this.options.host.summarizeContentBlocksForDebug(outcome.streamContentBlocks),
    });
  }

  private markSyncInFlight(outcome: LocalStreamOutcome): void {
    if (!outcome.shouldSyncFromServer) {
      return;
    }

    this.options.runtime.isConversationSyncInFlight = true;
    this.options.host.transitionTabSessionLifecycle(
      this.options.preparedSend.tabId,
      'syncing',
      'stream-finalization-sync',
    );
  }

  private async finalizeStreamingShell(outcome: LocalStreamOutcome): Promise<void> {
    const action = await finalizeStreamingShell({
      host: this.options.host,
      preparedSend: this.options.preparedSend,
      outcome,
    });
    this.options.routedStream.logAssistantFinalizationStage('streaming-shell-finalized', {
      action,
    });

    if (this.options.host.getActiveTabId() === this.options.preparedSend.tabId) {
      this.options.host.scheduleSettledScrollToBottomIfNeeded();
    }
  }

  private async runPostShellCleanup(): Promise<void> {
    await this.options.host.finalizeBackgroundTaskIndicatorAfterPrimaryStream(this.options.preparedSend.tabId);
    this.options.host.removeEmptyAssistantShells();
    this.options.host.syncTabStreamLikeState(this.options.preparedSend.tabId);
    await this.options.host.refreshServerStatusBadge();
  }

  private async persistLocalMessages(outcome: LocalStreamOutcome): Promise<void> {
    await persistLocalStreamOutcome({
      host: this.options.host,
      preparedSend: this.options.preparedSend,
      runtime: this.options.runtime,
      outcome,
      logAssistantFinalizationStage: (stage, payload = {}) => {
        this.options.routedStream.logAssistantFinalizationStage(stage, payload);
      },
    });
  }

  private clearRuntimeState(): void {
    this.options.runtime.streamingMessageEl = null;
    this.options.runtime.streamingContentEl = null;
    this.options.runtime.pendingQuestionResolution = null;
    this.options.routedStream.logAssistantFinalizationStage('stream-runtime-cleared');
  }
}
