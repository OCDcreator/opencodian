import { OpenCodeMessageNormalizationMapper } from '../../../../src/core/opencode/OpenCodeMessageNormalizationMapper';

const mapper = new OpenCodeMessageNormalizationMapper();

describe('OpenCodeMessageNormalizationMapper compaction divider', () => {
  it('renders compaction parts as structured divider metadata and hides compaction-continue follow-ups', () => {
    const compactionMessage = mapper.openCodeMessageToChatMessage(
      {
        id: 'msg-user-compaction',
        sessionID: 'session-1',
        role: 'user',
        time: { created: 123 },
      } as never,
      [
        {
          type: 'compaction',
          id: 'part-user-compaction',
          sessionID: 'session-1',
          messageID: 'msg-user-compaction',
          auto: true,
          overflow: true,
          tail_start_id: 'msg-tail-start',
        },
      ] as never,
    );
    const continueMessage = mapper.openCodeMessageToChatMessage(
      {
        id: 'msg-user-compaction-continue',
        sessionID: 'session-1',
        role: 'user',
        time: { created: 124 },
      } as never,
      [
        {
          type: 'text',
          id: 'part-user-compaction-continue',
          sessionID: 'session-1',
          messageID: 'msg-user-compaction-continue',
          text: 'Continue if you have next steps...',
          metadata: {
            compaction_continue: true,
          },
        },
      ] as never,
    );

    expect(compactionMessage.content).toBe('');
    expect(compactionMessage.compactionDivider).toEqual({
      auto: true,
      overflow: true,
      tailStartId: 'msg-tail-start',
    });
    expect(compactionMessage.displayStyle).not.toBe('notice');
    expect(continueMessage.content).toBe('');
  });

  it('maps user compaction parts into structured compaction divider metadata', () => {
    const message = mapper.openCodeMessageToChatMessage(
      {
        id: 'msg-compaction-divider',
        sessionID: 'session-1',
        role: 'user',
        time: { created: 200 },
      } as never,
      [
        {
          type: 'compaction',
          id: 'part-compaction-divider',
          sessionID: 'session-1',
          messageID: 'msg-compaction-divider',
          auto: true,
          overflow: false,
          tail_start_id: 'msg-tail',
        },
      ] as never,
    );

    expect(message).toMatchObject({
      role: 'user',
      compactionDivider: {
        auto: true,
        overflow: false,
        tailStartId: 'msg-tail',
      },
    });
  });

  it('does not model compaction divider user messages as notice cards', () => {
    const message = mapper.openCodeMessageToChatMessage(
      {
        id: 'msg-compaction-not-notice',
        sessionID: 'session-1',
        role: 'user',
        time: { created: 201 },
      } as never,
      [
        {
          type: 'compaction',
          id: 'part-compaction-not-notice',
          sessionID: 'session-1',
          messageID: 'msg-compaction-not-notice',
          auto: false,
          overflow: true,
          tail_start_id: 'msg-tail-2',
        },
      ] as never,
    );

    expect(message.compactionDivider).toBeDefined();
    expect(message.displayStyle).not.toBe('notice');
    expect(message.noticeTone).toBeUndefined();
  });

  it('keeps compaction_continue user messages hidden with no compaction divider and no notice style', () => {
    const message = mapper.openCodeMessageToChatMessage(
      {
        id: 'msg-continue-hidden',
        sessionID: 'session-1',
        role: 'user',
        time: { created: 202 },
      } as never,
      [
        {
          type: 'text',
          id: 'part-continue-hidden',
          sessionID: 'session-1',
          messageID: 'msg-continue-hidden',
          text: 'Continue if you have next steps...',
          metadata: {
            compaction_continue: true,
          },
        },
      ] as never,
    );

    expect(message.content).toBe('');
    expect(message.compactionDivider).toBeUndefined();
    expect(message.displayStyle).not.toBe('notice');
  });
});
