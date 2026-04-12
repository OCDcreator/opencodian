import type { ChatMessage } from '../../../core/types';
import {
  buildErrorAssistantFooterPayload,
  buildPseudoStreamAssistantFooterPayload,
} from './AssistantFooterPayload';
import { AssistantNoticeFooterFinalizer } from './AssistantNoticeFooterFinalizer';
import type { AssistantShellTimestampOptions } from './AssistantShellRenderer';
import { PersistedAssistantFooterFinalizer } from './PersistedAssistantFooterFinalizer';

export interface AssistantFooterRendererHost {
  addTimestampWithCopyButton(options: AssistantShellTimestampOptions): void;
}

export interface AssistantErrorFooterOptions {
  messageEl: HTMLElement;
  timestamp: number;
  content: string;
  modelId?: string;
}

export class AssistantFooterRenderer {
  private readonly persistedFooterFinalizer: PersistedAssistantFooterFinalizer;
  private readonly noticeFooterFinalizer: AssistantNoticeFooterFinalizer;

  constructor(private readonly host: AssistantFooterRendererHost) {
    this.persistedFooterFinalizer = new PersistedAssistantFooterFinalizer(host);
    this.noticeFooterFinalizer = new AssistantNoticeFooterFinalizer(host);
  }

  finalizePersistedFooter(messageEl: HTMLElement, message: ChatMessage): void {
    this.persistedFooterFinalizer.finalizeFooter(messageEl, message);
  }

  finalizeNoticeFooter(messageEl: HTMLElement, message: Pick<ChatMessage, 'timestamp' | 'modelId'>): void {
    this.noticeFooterFinalizer.finalizeFooter(messageEl, message);
  }

  finalizePseudoStreamFooter(
    messageEl: HTMLElement,
    message: Pick<ChatMessage, 'content' | 'timestamp' | 'modelId'>,
  ): void {
    this.host.addTimestampWithCopyButton({
      messageEl,
      ...buildPseudoStreamAssistantFooterPayload({ message }),
    });
  }

  finalizeErrorFooter(options: AssistantErrorFooterOptions): void {
    const { messageEl, ...payload } = options;

    this.host.addTimestampWithCopyButton({
      messageEl,
      ...buildErrorAssistantFooterPayload(payload),
    });
  }
}
