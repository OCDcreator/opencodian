import { SDK_FEATURE_FLAG_ROLLOUT_DEFAULTS } from '../../../../src/core/opencode/sdkFeatureFlags';
import { DEFAULT_SETTINGS } from '../../../../src/core/types';
import {
  createOpenCodeServiceTestContext,
  type MockOpenCodeServiceSdkClient,
  mockRequestUrl,
  OpenCodeService,
} from './OpenCodeService.testSupport';

let service: OpenCodeService;
let mockSdkClient: MockOpenCodeServiceSdkClient;

const createServiceWithSdkFlags = () => new OpenCodeService(
  DEFAULT_SETTINGS,
  {},
  { sdkFeatureFlags: SDK_FEATURE_FLAG_ROLLOUT_DEFAULTS },
);

beforeEach(() => {
  ({ service, mockSdkClient } = createOpenCodeServiceTestContext());
});

describe('OpenCodeService SDK question runtime', () => {
  it('uses SDK question APIs when rollout flags are enabled', async () => {
    service = createServiceWithSdkFlags();
    mockSdkClient.question.list.mockResolvedValue([
      {
        id: 'question-1',
        sessionID: 'sdk-session',
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

    await expect(service.getPendingQuestions()).resolves.toEqual([
      {
        id: 'question-1',
        sessionId: 'sdk-session',
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

    await service.replyToQuestion('question-1', [['Fast']]);
    await service.rejectQuestion('question-2');

    expect(mockSdkClient.question.list).toHaveBeenCalledWith();
    expect(mockSdkClient.question.reply).toHaveBeenCalledWith({
      requestID: 'question-1',
      answers: [['Fast']],
    });
    expect(mockSdkClient.question.reject).toHaveBeenCalledWith({
      requestID: 'question-2',
    });
    expect(mockRequestUrl).not.toHaveBeenCalled();
  });

  it('falls back to legacy HTTP when SDK question APIs fail', async () => {
    service = createServiceWithSdkFlags();
    mockSdkClient.question.list.mockRejectedValue(new Error('sdk list failed'));
    mockSdkClient.question.reply.mockRejectedValue(new Error('sdk reply failed'));
    mockSdkClient.question.reject.mockRejectedValue(new Error('sdk reject failed'));
    mockRequestUrl
      .mockResolvedValueOnce({
        status: 200,
        json: [
          {
            id: 'question-1',
            sessionID: 'sdk-session',
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
        ],
        text: '[]',
      })
      .mockResolvedValueOnce({ status: 200, json: true, text: 'true' })
      .mockResolvedValueOnce({ status: 200, json: true, text: 'true' });

    await expect(service.getPendingQuestions()).resolves.toEqual([
      {
        id: 'question-1',
        sessionId: 'sdk-session',
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
    await service.replyToQuestion('question-1', [['Fast']]);
    await service.rejectQuestion('question-2');

    expect(mockRequestUrl).toHaveBeenNthCalledWith(1, expect.objectContaining({
      url: 'http://127.0.0.1:4196/question',
      method: 'GET',
    }));
    expect(mockRequestUrl).toHaveBeenNthCalledWith(2, expect.objectContaining({
      url: 'http://127.0.0.1:4196/question/question-1/reply',
      method: 'POST',
      body: JSON.stringify({ answers: [['Fast']] }),
    }));
    expect(mockRequestUrl).toHaveBeenNthCalledWith(3, expect.objectContaining({
      url: 'http://127.0.0.1:4196/question/question-2/reject',
      method: 'POST',
      body: JSON.stringify({}),
    }));
  });

  it('suppresses repeated offline fallback logs while the local server is unreachable', async () => {
    service = createServiceWithSdkFlags();
    const offlineError = new Error('net::ERR_CONNECTION_REFUSED');
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    try {
      mockSdkClient.question.list.mockRejectedValue(offlineError);
      mockRequestUrl.mockRejectedValue(offlineError);

      await expect(service.getPendingQuestions()).resolves.toEqual([]);
      await expect(service.getPendingQuestions()).resolves.toEqual([]);

      const offlineWarnLogs = consoleWarnSpy.mock.calls.filter(([first]) =>
        typeof first === 'string' && first.includes('SDK question.list failed'),
      );
      const offlineErrorLogs = consoleErrorSpy.mock.calls.filter(([first]) =>
        typeof first === 'string' && first.includes('Failed to get pending questions:'),
      );

      expect(offlineWarnLogs).toHaveLength(1);
      expect(offlineErrorLogs).toHaveLength(0);
    } finally {
      consoleWarnSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    }
  });
});
