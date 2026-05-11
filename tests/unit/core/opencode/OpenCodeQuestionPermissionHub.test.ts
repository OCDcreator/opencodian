import { OpenCodeMessageNormalizationMapper } from '../../../../src/core/opencode/OpenCodeMessageNormalizationMapper';
import {
  type OpenCodePermissionSdk,
  OpenCodeQuestionPermissionHub,
  type OpenCodeQuestionPermissionHubHost,
  type OpenCodeQuestionSdk,
} from '../../../../src/core/opencode/OpenCodeQuestionPermissionHub';
import type {
  PermissionReply,
  QuestionRequest as ChatQuestionRequest,
} from '../../../../src/core/types';

type MockHost = OpenCodeQuestionPermissionHubHost & {
  shouldUseSdkQuestions: jest.Mock<boolean, []>;
  shouldUseSdkCrud: jest.Mock<boolean, []>;
  getSdkQuestion: jest.Mock<OpenCodeQuestionSdk, []>;
  getSdkPermission: jest.Mock<OpenCodePermissionSdk, []>;
  getLegacy: jest.Mock<Promise<unknown>, [string]>;
  postLegacy: jest.Mock<Promise<unknown>, [string, unknown]>;
  normalizeQuestionRequest: jest.Mock<ChatQuestionRequest | null, [unknown]>;
  logServiceWarning: jest.Mock<void, [string, string, unknown]>;
  logServiceError: jest.Mock<void, [string, string, unknown]>;
};

function createQuestionSdk(
  overrides: Partial<jest.Mocked<OpenCodeQuestionSdk>> = {},
): jest.Mocked<OpenCodeQuestionSdk> {
  return {
    list: jest.fn(),
    reply: jest.fn(),
    reject: jest.fn(),
    ...overrides,
  };
}

function createPermissionSdk(
  overrides: Partial<jest.Mocked<OpenCodePermissionSdk>> = {},
): jest.Mocked<OpenCodePermissionSdk> {
  return {
    list: jest.fn(),
    reply: jest.fn(),
    respond: jest.fn(),
    ...overrides,
  };
}

function createHost(
  questionSdk: jest.Mocked<OpenCodeQuestionSdk>,
  permissionSdk: jest.Mocked<OpenCodePermissionSdk>,
  overrides: Partial<MockHost> = {},
): MockHost {
  const mapper = new OpenCodeMessageNormalizationMapper();

  return {
    shouldUseSdkQuestions: jest.fn(() => true),
    shouldUseSdkCrud: jest.fn(() => true),
    getSdkQuestion: jest.fn(() => questionSdk),
    getSdkPermission: jest.fn(() => permissionSdk),
    getLegacy: jest.fn(),
    postLegacy: jest.fn(),
    normalizeQuestionRequest: jest.fn((raw) => mapper.normalizeQuestionRequest(raw)),
    logServiceWarning: jest.fn(),
    logServiceError: jest.fn(),
    ...overrides,
  } as MockHost;
}

function createStatusError(message: string, status: number): Error & { status: number } {
  return Object.assign(new Error(message), { status });
}

describe('OpenCodeQuestionPermissionHub question negotiation', () => {
  it('normalizes question requests and routes SDK question responders', async () => {
    const questionSdk = createQuestionSdk({
      list: jest.fn().mockResolvedValue({
        data: [
          {
            id: 'question-1',
            sessionID: 'session-1',
            questions: [
              {
                question: 'Pick a speed',
                header: 'Speed',
                options: [{ label: 'Fast', description: 'Move quickly' }],
                multiple: false,
                custom: true,
              },
            ],
          },
          {
            id: 'question-2',
            sessionID: 'session-2',
            questions: [],
          },
        ],
      }),
    });
    const hub = new OpenCodeQuestionPermissionHub(createHost(questionSdk, createPermissionSdk()));

    await expect(hub.getPendingQuestions()).resolves.toEqual([
      {
        id: 'question-1',
        sessionId: 'session-1',
        questions: [
          {
            question: 'Pick a speed',
            header: 'Speed',
            options: [{ label: 'Fast', description: 'Move quickly' }],
            multiple: false,
            custom: true,
          },
        ],
      },
    ]);

    await hub.replyToQuestion('question-1', [['Fast']]);
    await hub.rejectQuestion('question-2');

    expect(questionSdk.list).toHaveBeenCalledWith();
    expect(questionSdk.reply).toHaveBeenCalledWith({
      requestID: 'question-1',
      answers: [['Fast']],
    });
    expect(questionSdk.reject).toHaveBeenCalledWith({
      requestID: 'question-2',
    });
  });

  it('falls back to legacy question HTTP when SDK question APIs fail', async () => {
    const questionSdk = createQuestionSdk({
      list: jest.fn().mockRejectedValue(new Error('sdk list failed')),
      reply: jest.fn().mockRejectedValue(new Error('sdk reply failed')),
      reject: jest.fn().mockRejectedValue(new Error('sdk reject failed')),
    });
    const host = createHost(questionSdk, createPermissionSdk(), {
      getLegacy: jest.fn().mockResolvedValue([
        {
          id: 'question-1',
          sessionID: 'session-1',
          questions: [
            {
              question: 'Pick a speed',
              header: 'Speed',
              options: [{ label: 'Fast', description: 'Move quickly' }],
              multiple: false,
              custom: true,
            },
          ],
        },
      ]),
      postLegacy: jest.fn().mockResolvedValue(undefined),
    });
    const hub = new OpenCodeQuestionPermissionHub(host);

    await expect(hub.getPendingQuestions()).resolves.toEqual([
      {
        id: 'question-1',
        sessionId: 'session-1',
        questions: [
          {
            question: 'Pick a speed',
            header: 'Speed',
            options: [{ label: 'Fast', description: 'Move quickly' }],
            multiple: false,
            custom: true,
          },
        ],
      },
    ]);
    await hub.replyToQuestion('question-1', [['Fast']]);
    await hub.rejectQuestion('question-2');

    expect(host.getLegacy).toHaveBeenCalledWith('/question');
    expect(host.postLegacy).toHaveBeenNthCalledWith(1, '/question/question-1/reply', {
      answers: [['Fast']],
    });
    expect(host.postLegacy).toHaveBeenNthCalledWith(2, '/question/question-2/reject', {});
    expect(host.logServiceWarning).toHaveBeenCalledWith(
      'question.list',
      'SDK question.list failed, falling back to legacy HTTP',
      expect.any(Error),
    );
  });

  it('retries transient reply failures before reporting success', async () => {
    const host = createHost(createQuestionSdk(), createPermissionSdk(), {
      shouldUseSdkQuestions: jest.fn(() => false),
      postLegacy: jest.fn()
        .mockRejectedValueOnce(createStatusError('temporary gateway failure', 502))
        .mockResolvedValueOnce(undefined),
    });
    const hub = new OpenCodeQuestionPermissionHub(host);

    await expect(hub.replyToQuestion('question-1', [['Fast']])).resolves.toBeUndefined();

    expect(host.postLegacy).toHaveBeenCalledTimes(2);
    expect(host.postLegacy).toHaveBeenNthCalledWith(1, '/question/question-1/reply', {
      answers: [['Fast']],
    });
    expect(host.postLegacy).toHaveBeenNthCalledWith(2, '/question/question-1/reply', {
      answers: [['Fast']],
    });
  });

  it('retries transient reject failures before reporting success', async () => {
    const host = createHost(createQuestionSdk(), createPermissionSdk(), {
      shouldUseSdkQuestions: jest.fn(() => false),
      postLegacy: jest.fn()
        .mockRejectedValueOnce(createStatusError('service unavailable', 503))
        .mockResolvedValueOnce(undefined),
    });
    const hub = new OpenCodeQuestionPermissionHub(host);

    await expect(hub.rejectQuestion('question-1')).resolves.toBeUndefined();

    expect(host.postLegacy).toHaveBeenCalledTimes(2);
    expect(host.postLegacy).toHaveBeenNthCalledWith(1, '/question/question-1/reject', {});
    expect(host.postLegacy).toHaveBeenNthCalledWith(2, '/question/question-1/reject', {});
  });

  it('throws the final transient reply failure after retry attempts are exhausted', async () => {
    const finalError = createStatusError('still unavailable', 503);
    const host = createHost(createQuestionSdk(), createPermissionSdk(), {
      shouldUseSdkQuestions: jest.fn(() => false),
      postLegacy: jest.fn()
        .mockRejectedValueOnce(createStatusError('temporary failure 1', 503))
        .mockRejectedValueOnce(createStatusError('temporary failure 2', 503))
        .mockRejectedValueOnce(finalError),
    });
    const hub = new OpenCodeQuestionPermissionHub(host);

    await expect(hub.replyToQuestion('question-1', [['Fast']])).rejects.toBe(finalError);

    expect(host.postLegacy).toHaveBeenCalledTimes(3);
  });

});

describe('OpenCodeQuestionPermissionHub permission negotiation', () => {
  it('normalizes permission requests and routes SDK permission responders', async () => {
    const permissionSdk = createPermissionSdk({
      list: jest.fn().mockResolvedValue([
        {
          id: 'permission-1',
          sessionID: 'session-1',
          permission: 'bash',
          patterns: ['npm test'],
          metadata: { cwd: '/vault' },
          always: ['npm test'],
          tool: { messageID: 'message-1', callID: 'call-1' },
        },
        {
          id: 42,
          sessionID: 'session-2',
          permission: 'bash',
        },
      ]),
      reply: jest.fn().mockResolvedValue(undefined),
      respond: jest.fn().mockResolvedValue(undefined),
    });
    const hub = new OpenCodeQuestionPermissionHub(createHost(createQuestionSdk(), permissionSdk));

    await expect(hub.getPendingPermissions()).resolves.toEqual([
      {
        id: 'permission-1',
        sessionID: 'session-1',
        permission: 'bash',
        patterns: ['npm test'],
        metadata: { cwd: '/vault' },
        always: ['npm test'],
        tool: { messageID: 'message-1', callID: 'call-1' },
      },
    ]);

    await hub.respondToPermission('permission-1', 'once', 'Allow once');
    await hub.respondToSessionPermission('session-1', 'permission-1', 'always');

    expect(permissionSdk.list).toHaveBeenCalledWith();
    expect(permissionSdk.reply).toHaveBeenCalledWith({
      requestID: 'permission-1',
      reply: 'once',
      message: 'Allow once',
    });
    expect(permissionSdk.respond).toHaveBeenCalledWith({
      sessionID: 'session-1',
      permissionID: 'permission-1',
      response: 'always',
    });
  });

  it('accepts wrapped permission list payloads from SDK or legacy transports', async () => {
    const permissionSdk = createPermissionSdk({
      list: jest.fn().mockResolvedValue({
        data: [
          {
            id: 'permission-1',
            sessionID: 'session-1',
            permission: 'external_directory',
            patterns: ['/shared/libs/*'],
            metadata: { filepath: '/shared/libs/tool.ts' },
            always: ['/shared/libs/*'],
            tool: { messageID: 'message-1', callID: 'call-1' },
          },
        ],
      }),
    });
    const hub = new OpenCodeQuestionPermissionHub(createHost(createQuestionSdk(), permissionSdk));

    await expect(hub.getPendingPermissions()).resolves.toEqual([
      {
        id: 'permission-1',
        sessionID: 'session-1',
        permission: 'external_directory',
        patterns: ['/shared/libs/*'],
        metadata: { filepath: '/shared/libs/tool.ts' },
        always: ['/shared/libs/*'],
        tool: { messageID: 'message-1', callID: 'call-1' },
      },
    ]);
  });

  it('falls back to legacy permission APIs when needed', async () => {
    const permissionSdk = createPermissionSdk({
      list: jest.fn().mockRejectedValue(new Error('sdk list failed')),
    });
    const host = createHost(createQuestionSdk(), permissionSdk, {
      getLegacy: jest.fn().mockResolvedValue([
        {
          id: 'permission-1',
          sessionID: 'session-1',
          permission: 'bash',
          patterns: ['npm test'],
          metadata: {},
          always: [],
        },
      ]),
      postLegacy: jest.fn().mockResolvedValue(undefined),
      shouldUseSdkCrud: jest.fn(() => false),
    });
    const hub = new OpenCodeQuestionPermissionHub(host);

    host.shouldUseSdkCrud.mockReturnValueOnce(true);
    await expect(hub.getPendingPermissions()).resolves.toEqual([
      {
        id: 'permission-1',
        sessionID: 'session-1',
        permission: 'bash',
        patterns: ['npm test'],
        metadata: {},
        always: [],
      },
    ]);

    const reply: PermissionReply = 'reject';
    await hub.respondToPermission('permission-1', reply, 'Not now');

    expect(host.getLegacy).toHaveBeenCalledWith('/permission');
    expect(host.postLegacy).toHaveBeenCalledWith('/permission/permission-1/reply', {
      reply,
      message: 'Not now',
    });
    expect(host.logServiceWarning).toHaveBeenCalledWith(
      'permission.list',
      'SDK permission.list failed, falling back to legacy HTTP',
      expect.any(Error),
    );
  });
});
