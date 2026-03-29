/**
 * sdkFetch unit tests
 */

import { createSdkFetch } from '../../../../src/core/opencode/sdkFetch';

class MockHeaders {
  private readonly values = new Map<string, string>();

  constructor(init?: HeadersInit) {
    if (!init) {
      return;
    }

    if (Array.isArray(init)) {
      for (const [key, value] of init) {
        this.set(key, value);
      }
      return;
    }

    if (init instanceof MockHeaders) {
      init.forEach((value, key) => this.set(key, value));
      return;
    }

    for (const [key, value] of Object.entries(init)) {
      this.set(key, value);
    }
  }

  get(name: string): string | null {
    return this.values.get(name.toLowerCase()) ?? null;
  }

  set(name: string, value: string): void {
    this.values.set(name.toLowerCase(), value);
  }

  has(name: string): boolean {
    return this.values.has(name.toLowerCase());
  }

  forEach(callback: (value: string, key: string) => void): void {
    for (const [key, value] of this.values.entries()) {
      callback(value, key);
    }
  }
}

class MockRequest {
  readonly url: string;
  readonly method: string;
  readonly headers: MockHeaders;
  private readonly bodyText?: string;

  constructor(input: RequestInfo | URL, init?: RequestInit) {
    if (typeof input === 'string' || input instanceof URL) {
      this.url = String(input);
      this.method = init?.method ?? 'GET';
      this.headers = new MockHeaders(init?.headers);
      this.bodyText = typeof init?.body === 'string' ? init.body : undefined;
      return;
    }

    this.url = input.url;
    this.method = init?.method ?? input.method;
    this.headers = new MockHeaders(init?.headers ?? input.headers);
    this.bodyText = typeof init?.body === 'string'
      ? init.body
      : typeof input.clone === 'function'
        ? undefined
        : undefined;
  }

  clone(): { text: () => Promise<string> } {
    return {
      text: async () => this.bodyText ?? '',
    };
  }
}

class MockResponse {
  readonly status: number;
  readonly headers: MockHeaders;
  private readonly bodyText: string;

  constructor(body?: string, init?: { status?: number; headers?: HeadersInit }) {
    this.status = init?.status ?? 200;
    this.headers = new MockHeaders(init?.headers);
    this.bodyText = body ?? '';
  }

  async json(): Promise<unknown> {
    return JSON.parse(this.bodyText);
  }

  async text(): Promise<string> {
    return this.bodyText;
  }
}

global.Headers = MockHeaders as unknown as typeof global.Headers;
global.Request = MockRequest as unknown as typeof global.Request;
global.Response = MockResponse as unknown as typeof global.Response;

jest.mock('obsidian', () => ({
  requestUrl: jest.fn(),
}));

const { requestUrl: mockRequestUrl } = jest.requireMock('obsidian') as {
  requestUrl: jest.Mock;
};

describe('createSdkFetch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('wraps requestUrl JSON responses into a standard Response', async () => {
    mockRequestUrl.mockResolvedValue({
      status: 200,
      json: { healthy: true },
      text: '{"healthy":true}',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const fetchImpl = createSdkFetch({
      nativeFetch: jest.fn() as unknown as typeof fetch,
    });

    const response = await fetchImpl('http://127.0.0.1:4096/global/health');

    expect(mockRequestUrl).toHaveBeenCalledWith(expect.objectContaining({
      url: 'http://127.0.0.1:4096/global/health',
      method: 'GET',
    }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ healthy: true });
  });

  it('returns an empty Response body for 204 requestUrl responses', async () => {
    mockRequestUrl.mockResolvedValue({
      status: 204,
      json: undefined,
      text: '',
      headers: {},
    });

    const fetchImpl = createSdkFetch({
      nativeFetch: jest.fn() as unknown as typeof fetch,
    });

    const response = await fetchImpl('http://127.0.0.1:4096/session/test-session/abort', {
      method: 'POST',
      body: '{}',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    expect(response.status).toBe(204);
    await expect(response.text()).resolves.toBe('');
  });

  it('routes SSE requests to native fetch instead of requestUrl', async () => {
    const nativeFetch = jest.fn().mockResolvedValue(new Response('data: {}\n\n', { status: 200 }));
    const fetchImpl = createSdkFetch({
      nativeFetch: nativeFetch as unknown as typeof fetch,
    });

    await fetchImpl('http://127.0.0.1:4096/event', {
      headers: {
        Accept: 'text/event-stream',
      },
    });

    expect(nativeFetch).toHaveBeenCalled();
    expect(mockRequestUrl).not.toHaveBeenCalled();
  });
});
