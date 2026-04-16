import {
  AssistantNoticeFooterFinalizer,
  type AssistantNoticeFooterFinalizerHost,
} from '../../../../src/features/chat/runtime/AssistantNoticeFooterFinalizer';

describe('AssistantNoticeFooterFinalizer', () => {
  it('finalizes notice assistant footers with the assembled payload', () => {
    const host: AssistantNoticeFooterFinalizerHost = {
      addTimestampWithCopyButton: jest.fn(),
    };
    const finalizer = new AssistantNoticeFooterFinalizer(host);
    const messageEl = document.createElement('div');

    finalizer.finalizeFooter(messageEl, {
      timestamp: 12345,
      modelId: 'openai/gpt-5.4',
    });

    expect(host.addTimestampWithCopyButton).toHaveBeenCalledWith({
      messageEl,
      timestamp: 12345,
      modelId: 'openai/gpt-5.4',
    });
  });
});
