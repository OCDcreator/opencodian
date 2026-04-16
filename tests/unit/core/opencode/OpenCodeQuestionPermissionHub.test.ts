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

describe('OpenCodeQuestionPermissionHub', () => {
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
