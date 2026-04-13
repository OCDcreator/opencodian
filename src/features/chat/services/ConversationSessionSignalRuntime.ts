import type { BackgroundTaskLiveSignalCoordinator } from './BackgroundTaskLiveSignalCoordinator';
import {
  ConversationSessionLiveSignalAdapter,
} from './ConversationSessionLiveSignalAdapter';
import {
  ConversationSyncEventAdapter,
} from './ConversationSyncEventAdapter';
import {
  createConversationSyncEventLiveSignalHosts,
  type ConversationSyncEventLiveSignalHostAdapterHost,
} from './ConversationSyncEventLiveSignalHostAdapter';
import {
  ConversationSessionTabResolver,
} from './ConversationSessionTabResolver';

type ConversationSessionSignalBackgroundTaskPort = Pick<
  BackgroundTaskLiveSignalCoordinator,
  'reconcileStateFromLiveSignals'
>;

interface ConversationSessionSignalLifecyclePort {
  start(): void;
  stop(): void;
}

export class ConversationSessionSignalRuntime {
  constructor(
    private readonly liveSignalAdapter: ConversationSessionSignalLifecyclePort,
    private readonly syncEventAdapter: ConversationSessionSignalLifecyclePort,
  ) {}

  start(): void {
    this.liveSignalAdapter.start();
    this.syncEventAdapter.start();
  }

  stop(): void {
    this.liveSignalAdapter.stop();
    this.syncEventAdapter.stop();
  }
}

export function createConversationSessionSignalRuntime(
  host: ConversationSyncEventLiveSignalHostAdapterHost,
  backgroundTaskLiveSignalCoordinator: ConversationSessionSignalBackgroundTaskPort,
): ConversationSessionSignalRuntime {
  const conversationSyncEventLiveSignalHosts = createConversationSyncEventLiveSignalHosts(host);
  const sessionTabResolver = new ConversationSessionTabResolver(host);
  const liveSignalAdapter = new ConversationSessionLiveSignalAdapter(
    conversationSyncEventLiveSignalHosts.conversationSessionLiveSignalAdapterHost,
    backgroundTaskLiveSignalCoordinator,
    sessionTabResolver,
  );
  const syncEventAdapter = new ConversationSyncEventAdapter(
    conversationSyncEventLiveSignalHosts.conversationSyncEventAdapterHost,
    sessionTabResolver,
  );

  return new ConversationSessionSignalRuntime(liveSignalAdapter, syncEventAdapter);
}
