import type { ChatMessage } from '../../../core/types';
import { buildNoticeAssistantFooterPayload } from './AssistantFooterPayload';
import type { AssistantShellTimestampOptions } from './AssistantShellRenderer';

export interface AssistantNoticeFooterFinalizerHost {
  addTimestampWithCopyButton(options: AssistantShellTimestampOptions): void;
}

export class AssistantNoticeFooterFinalizer {
  constructor(private readonly host: AssistantNoticeFooterFinalizerHost) {}

  finalizeFooter(
    messageEl: HTMLElement,
    message: Pick<ChatMessage, 'timestamp' | 'modelId'>,
  ): void {
    this.host.addTimestampWithCopyButton({
      messageEl,
      ...buildNoticeAssistantFooterPayload({ message }),
    });
  }
}
