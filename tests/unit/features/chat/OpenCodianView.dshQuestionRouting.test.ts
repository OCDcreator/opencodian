import { describe, expect, it, jest } from '@jest/globals';

import { AgentCapability } from '../../../../src/core/agents/AgentCapability';
import { type Conversation } from '../../../../src/core/types/chat';
import { OpenCodianView } from '../../../../src/features/chat/OpenCodianView';

type QuestionApiPort = {
  isPendingQuestionReadAuthoritative(): boolean;
  getPendingQuestions(): Promise<unknown[]>;
  replyToQuestion(requestId: string, answers: string[][]): Promise<void>;
  rejectQuestion(requestId: string): Promise<void>;
};

function viewFor(backend: Conversation['backend'], options: { questionsCapability?: boolean } = {}) {
  const legacyReply = jest.fn(async () => {});
  const adapterReply = jest.fn(async () => {});
  const adapter = {
    hasCapability: (capability: unknown) => capability === AgentCapability.Questions && options.questionsCapability !== false,
    getPendingQuestions: jest.fn(async () => []),
    replyToQuestion: adapterReply,
    rejectQuestion: jest.fn(async () => {}),
  };
  const view = Object.assign(Object.create(OpenCodianView.prototype), {
    getActiveTabId: () => 'tab-1',
    getSessionIdForTab: () => 'native-session',
    getConversationForTab: () => ({ id: 'conv', backend }) as Conversation,
    plugin: {
      openCodeService: { getPendingQuestions: jest.fn(async () => []), replyToQuestion: legacyReply, rejectQuestion: jest.fn(async () => {}) },
      agentServiceRegistry: { get: jest.fn(() => adapter) },
    },
  }) as unknown as {
    getQuestionApiForTab(tabId: string | null, request?: { sessionId: string }): QuestionApiPort;
  };
  return { view, adapter, adapterReply, legacyReply };
}

describe('DSH question card reply routing', () => {
  it('routes dsh question replies to the backend adapter, not the legacy OpenCode service', async () => {
    const { view, adapterReply, legacyReply } = viewFor('dsh');
    const api = view.getQuestionApiForTab('tab-1', { sessionId: 'native-session' });
    expect(api.isPendingQuestionReadAuthoritative()).toBe(true);
    await api.replyToQuestion('dsh-question-1', [['blue']]);
    expect(adapterReply).toHaveBeenCalledWith('dsh-question-1', [['blue']]);
    expect(legacyReply).not.toHaveBeenCalled();
  });

  it('keeps zcode/opencode2 adapter routing and legacy fallback for other backends', async () => {
    for (const backend of ['zcode', 'opencode2'] as const) {
      const adapterCase = viewFor(backend);
      const api = adapterCase.view.getQuestionApiForTab('tab-1');
      await api.replyToQuestion('q', [[]]);
      expect(adapterCase.adapterReply).toHaveBeenCalled();
      expect(adapterCase.legacyReply).not.toHaveBeenCalled();
    }
    const legacy = viewFor('pi');
    const legacyApi = legacy.view.getQuestionApiForTab('tab-1');
    await legacyApi.replyToQuestion('q', [[]]);
    expect(legacy.legacyReply).toHaveBeenCalledWith('q', [[]]);
    expect(legacy.adapterReply).not.toHaveBeenCalled();
  });

  it('rejects a question whose session no longer belongs to the tab', () => {
    const { view } = viewFor('dsh');
    expect(() => view.getQuestionApiForTab('tab-1', { sessionId: 'another-session' }))
      .toThrow('no longer belongs to the target tab session');
  });

  it('fails closed when the adapter does not carry the Questions capability (e.g. ACP transport)', () => {
    const { view, adapterReply, legacyReply } = viewFor('dsh', { questionsCapability: false });
    expect(() => view.getQuestionApiForTab('tab-1', { sessionId: 'native-session' }))
      .toThrow('dsh question responder unavailable');
    expect(adapterReply).not.toHaveBeenCalled();
    expect(legacyReply).not.toHaveBeenCalled();
  });
});
