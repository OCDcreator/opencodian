import type { PreparedMessageSend } from '../services/MessageSendPreparationService';
import type {
  SendPipelineExecutionHost,
  SendPipelineFinalizationPort,
  SendPipelinePreparationPort,
  SendPipelineRuntimeHost,
  SendPipelineStreamController,
  SendPipelineTabRuntime,
} from './SendPipelineTypes';
import { StreamChunkRouter } from './StreamChunkRouter';
import { StreamLocalFinalizer } from './StreamLocalFinalizer';

export type {
  LocalStreamOutcome,
  SendPipelineDebugContentBlock,
  SendPipelineDebugPort,
  SendPipelineExecutionHost,
  SendPipelineFinalizationPort,
  SendPipelineHost,
  SendPipelinePersistencePort,
  SendPipelinePreparationPort,
  SendPipelineRuntimeHost,
  SendPipelineShellPort,
  SendPipelineStreamController,
  SendPipelineStreamElements,
  SendPipelineTabRuntime,
  SendPipelineTraceState,
  SendPipelineTransportPort,
  SendPipelineViewPort,
  StreamChunkRouterOptions,
  StreamChunkRouterResult,
  StreamLocalFinalizerOptions,
  StreamLocalFinalizerResult,
} from './SendPipelineTypes';

export interface SendPipelineSlashCommandPort {
  tryRunSlashCommand(content: string): Promise<boolean>;
}

export class SendPipelineRuntime {
  constructor(
    private readonly host: SendPipelineRuntimeHost,
    private readonly messageSendPreparationService: SendPipelinePreparationPort,
    private readonly messageFinalizationService: SendPipelineFinalizationPort,
    private readonly slashCommandExecutionService?: SendPipelineSlashCommandPort,
  ) {}

  async sendMessage(content: string): Promise<void> {
    if (await this.slashCommandExecutionService?.tryRunSlashCommand(content)) {
      return;
    }

    const preparedSend = await this.messageSendPreparationService.prepareMessageSend({ content });
    if (!preparedSend) {
      return;
    }

    const execution = this.createStreamingExecution(preparedSend, content);
    if (!execution) {
      return;
    }

    const routedStream = await new StreamChunkRouter({
      host: this.host,
      preparedSend,
      runtime: execution.runtime,
      stream: execution.stream,
      streamController: execution.streamController,
      contentEl: execution.contentEl,
    }).consume();
    const localFinalization = await new StreamLocalFinalizer({
      host: this.host,
      preparedSend,
      runtime: execution.runtime,
      streamController: execution.streamController,
      routedStream,
    }).finalize();

    await this.messageFinalizationService.finalizeAfterStream({
      conversation: preparedSend.conversation,
      tabId: preparedSend.tabId,
      shouldSyncFromServer: localFinalization.shouldSyncFromServer,
      editedFiles: [...execution.runtime.pendingEditedFiles],
      logStage: localFinalization.logAssistantFinalizationStage,
    });
  }

  private createStreamingExecution(
    preparedSend: PreparedMessageSend,
    content: string,
  ): {
    runtime: SendPipelineTabRuntime;
    stream: ReturnType<SendPipelineExecutionHost['sendStreamMessage']>;
    streamController: SendPipelineStreamController | null;
    contentEl: HTMLElement;
  } | null {
    const runtime = this.host.getTabRuntimeState(preparedSend.tabId);
    if (!runtime) {
      return null;
    }

    this.messageSendPreparationService.enterStreamingState(preparedSend.tabId);
    const stream = this.host.sendStreamMessage(content, {
      sessionId: preparedSend.conversation.openCodeSessionId,
      ...preparedSend.modelOptions,
      contextItems: preparedSend.contextItems,
    });
    this.messageSendPreparationService.completePreparedStreamStart(preparedSend.tabId);
    const streamElements = this.host.createAssistantMessageElement(preparedSend.tabId, true);
    const streamController = this.host.getOrCreateTabStreamController(preparedSend.tabId);

    return {
      runtime,
      stream,
      streamController,
      contentEl: streamElements.contentEl,
    };
  }
}
