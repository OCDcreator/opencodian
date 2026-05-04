import { OpenCodeMessageNormalizationMapper } from '../../../../src/core/opencode/OpenCodeMessageNormalizationMapper';

const mapper = new OpenCodeMessageNormalizationMapper();

describe('OpenCodeMessageNormalizationMapper agent mention hydration', () => {
  it('restores user agent part source text into hydrated visible content', () => {
    const message = mapper.openCodeMessageToChatMessage(
      {
        id: 'msg-user-agent-mention',
        sessionID: 'session-1',
        role: 'user',
        time: { created: 123 },
      } as never,
      [
        {
          type: 'text',
          id: 'part-user-text',
          sessionID: 'session-1',
          messageID: 'msg-user-agent-mention',
          text: 'please ask to check this',
        },
        {
          type: 'agent',
          id: 'part-user-agent',
          sessionID: 'session-1',
          messageID: 'msg-user-agent-mention',
          name: 'reviewer',
          source: {
            value: '@reviewer',
            start: 11,
            end: 20,
          },
        },
      ] as never,
    );

    expect(message.content).toBe('please ask @reviewer to check this');
  });

  it('restores multiple user agent part sources using original source spans', () => {
    const message = mapper.openCodeMessageToChatMessage(
      {
        id: 'msg-user-agent-mentions',
        sessionID: 'session-1',
        role: 'user',
        time: { created: 123 },
      } as never,
      [
        {
          type: 'text',
          id: 'part-user-text',
          sessionID: 'session-1',
          messageID: 'msg-user-agent-mentions',
          text: 'ask now',
        },
        {
          type: 'agent',
          id: 'part-user-agent-a',
          sessionID: 'session-1',
          messageID: 'msg-user-agent-mentions',
          name: 'reviewer',
          source: {
            value: '@reviewer',
            start: 0,
            end: 9,
          },
        },
        {
          type: 'agent',
          id: 'part-user-agent-b',
          sessionID: 'session-1',
          messageID: 'msg-user-agent-mentions',
          name: 'explorer',
          source: {
            value: '@explorer',
            start: 14,
            end: 23,
          },
        },
      ] as never,
    );

    expect(message.content).toBe('@reviewer ask @explorer now');
  });
});
