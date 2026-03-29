import { requestUrl } from 'obsidian';

const SSE_PATH_SUFFIXES = ['/event', '/global/event', '/global/sync-event'];

function isSseRequest(request: Request): boolean {
  const acceptHeader = request.headers.get('Accept') ?? '';
  if (acceptHeader.includes('text/event-stream')) {
    return true;
  }

  const { pathname } = new URL(request.url);
  return SSE_PATH_SUFFIXES.some((suffix) => pathname.endsWith(suffix));
}

function headersToRecord(headers: Headers): Record<string, string> {
  const record: Record<string, string> = {};
  headers.forEach((value, key) => {
    record[key] = value;
  });
  return record;
}

async function requestBodyToText(request: Request): Promise<string | undefined> {
  if (request.method === 'GET' || request.method === 'HEAD') {
    return undefined;
  }

  const text = await request.clone().text();
  return text.length > 0 ? text : undefined;
}

function responseHeadersToHeaders(headersValue: unknown, fallbackContentType?: string): Headers {
  const headers = new Headers();

  if (headersValue && typeof headersValue === 'object') {
    for (const [key, value] of Object.entries(headersValue as Record<string, unknown>)) {
      if (typeof value === 'string') {
        headers.set(key, value);
      }
    }
  }

  if (fallbackContentType && !headers.has('Content-Type')) {
    headers.set('Content-Type', fallbackContentType);
  }

  return headers;
}

function responseBodyToText(response: { text?: string; json?: unknown }): { body: string | undefined; contentType?: string } {
  if (typeof response.text === 'string') {
    return {
      body: response.text.length > 0 ? response.text : undefined,
      contentType: 'application/json',
    };
  }

  if (response.json !== undefined) {
    return {
      body: JSON.stringify(response.json),
      contentType: 'application/json',
    };
  }

  return {
    body: undefined,
  };
}

export function createSdkFetch(options: { nativeFetch?: typeof fetch } = {}): typeof fetch {
  const nativeFetch = options.nativeFetch ?? globalThis.fetch.bind(globalThis);

  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init);

    if (isSseRequest(request)) {
      return nativeFetch(request);
    }

    const body = await requestBodyToText(request);
    const response = await requestUrl({
      url: request.url,
      method: request.method,
      headers: headersToRecord(request.headers),
      body,
    });

    const { body: responseBody, contentType } = responseBodyToText(response as { text?: string; json?: unknown });
    const headers = responseHeadersToHeaders(
      (response as { headers?: Record<string, string> }).headers,
      contentType,
    );

    return new Response(responseBody, {
      status: response.status,
      headers,
    });
  };
}
