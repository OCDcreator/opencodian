import type {
  BackgroundConversationPostSyncHandoffCoordinator,
  BackgroundTabPostSyncOptions,
  SignalBackgroundTaskPostSyncOptions,
} from './BackgroundConversationPostSyncHandoffCoordinator';
import type {
  VisibleConversationPostSyncCoordinator,
  VisibleConversationPostSyncOutcome,
  VisibleConversationPostSyncOptions,
} from './VisibleConversationPostSyncCoordinator';

export type {
  ConversationRevertStateSnapshot,
} from './VisibleConversationPostSyncStateCoordinator';
export type {
  VisibleConversationPostSyncOptions,
  VisibleConversationPostSyncOutcome,
  VisibleConversationPostSyncResult,
} from './VisibleConversationPostSyncCoordinator';
export type {
  BackgroundTabPostSyncOptions,
  BackgroundTaskPostSyncResult,
  SignalBackgroundTaskPostSyncOptions,
} from './BackgroundConversationPostSyncHandoffCoordinator';

type VisibleConversationPostSyncPort = Pick<
  VisibleConversationPostSyncCoordinator,
  'handleVisibleConversationSyncComplete'
>;
type BackgroundConversationPostSyncHandoffPort = Pick<
  BackgroundConversationPostSyncHandoffCoordinator,
  | 'handleBackgroundTabSyncComplete'
  | 'handleSignalSyncComplete'
>;

export class BackgroundTaskPostSyncCoordinator {
  constructor(
    private readonly visibleConversationPostSyncCoordinator: VisibleConversationPostSyncPort,
    private readonly backgroundConversationPostSyncHandoff:
      BackgroundConversationPostSyncHandoffPort,
  ) {}

  async handleVisibleConversationSyncComplete(
    options: VisibleConversationPostSyncOptions,
  ): Promise<VisibleConversationPostSyncOutcome> {
    return this.visibleConversationPostSyncCoordinator.handleVisibleConversationSyncComplete(
      options,
    );
  }

  async handleSignalSyncComplete(options: SignalBackgroundTaskPostSyncOptions): Promise<void> {
    await this.backgroundConversationPostSyncHandoff.handleSignalSyncComplete(options);
  }

  async handleBackgroundTabSyncComplete(options: BackgroundTabPostSyncOptions): Promise<void> {
    await this.backgroundConversationPostSyncHandoff.handleBackgroundTabSyncComplete(options);
  }
}
