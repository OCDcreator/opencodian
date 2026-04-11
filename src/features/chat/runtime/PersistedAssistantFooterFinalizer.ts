import type { ChatMessage } from '../../../core/types';
import { buildPersistedAssistantFooterPayload } from './AssistantFooterPayload';
import type { AssistantShellTimestampOptions } from './AssistantShellRenderer';

export interface PersistedAssistantFooterFinalizerHost {
  addTimestampWithCopyButton(options: AssistantShellTimestampOptions): void;
}

export class PersistedAssistantFooterFinalizer {
  constructor(private readonly host: PersistedAssistantFooterFinalizerHost) {}

  finalizeFooter(messageEl: HTMLElement, message: ChatMessage): void {
    this.host.addTimestampWithCopyButton({
      messageEl,
      ...buildPersistedAssistantFooterPayload({ message }),
    });
  }
}
