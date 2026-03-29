/**
 * createSdkClient unit tests
 */

jest.mock('@opencode-ai/sdk/v2/client', () => ({
  createOpencodeClient: jest.fn(() => ({ client: 'mock-sdk-client' })),
}), { virtual: true });

import { createSdkClient } from '../../../../src/core/opencode/createSdkClient';

const { createOpencodeClient: mockCreateOpencodeClient } = jest.requireMock('@opencode-ai/sdk/v2/client') as {
  createOpencodeClient: jest.Mock;
};

describe('createSdkClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('passes baseUrl, auth headers, directory and stable response options to the SDK factory', () => {
    const fetchImpl = jest.fn() as unknown as typeof fetch;

    createSdkClient({
      baseUrl: 'http://127.0.0.1:4096',
      authHeaders: {
        Authorization: 'Bearer token',
      },
      directory: 'C:/vault',
      fetchImpl,
    });

    expect(mockCreateOpencodeClient).toHaveBeenCalledWith(expect.objectContaining({
      baseUrl: 'http://127.0.0.1:4096',
      directory: 'C:/vault',
      headers: {
        Authorization: 'Bearer token',
      },
      fetch: fetchImpl,
      responseStyle: 'data',
      throwOnError: true,
    }));
  });
});
