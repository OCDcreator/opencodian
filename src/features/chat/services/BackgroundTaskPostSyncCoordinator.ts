import type {
  BackgroundConversationPostSyncHandoffCoordinator,
  BackgroundTabPostSyncOptions,
  SignalBackgroundTaskPostSyncOptions,
} from './BackgroundConversationPostSyncHandoffCoordinator';

export type {
  ConversationRevertStateSnapshot,
} from './VisibleConversationPostSyncStateCoordinator';
export type {
  BackgroundTabPostSyncOptions,
  BackgroundTaskPostSyncResult,
  SignalBackgroundTaskPostSyncOptions,
} from './BackgroundConversationPostSyncHandoffCoordinator';

type BackgroundConversationPostSyncHandoffPort = Pick<
  BackgroundConversationPostSyncHandoffCoordinator,
  | 'handleBackgroundTabSyncComplete'
  | 'handleSignalSyncComplete'
>;

export class BackgroundTaskPostSyncCoordinator {
  constructor(
    private readonly backgroundConversationPostSyncHandoff:
      BackgroundConversationPostSyncHandoffPort,
  ) {}

  async handleSignalSyncComplete(options: SignalBackgroundTaskPostSyncOptions): Promise<void> {
    await this.backgroundConversationPostSyncHandoff.handleSignalSyncComplete(options);
  }

  async handleBackgroundTabSyncComplete(options: BackgroundTabPostSyncOptions): Promise<void> {
    await this.backgroundConversationPostSyncHandoff.handleBackgroundTabSyncComplete(options);
  }
}
