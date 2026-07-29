import { requestUrl } from 'obsidian';

import type { OpenCodeTraceContext, OpenCodeTracePort } from './diagnostics';

const SSE_PATH_SUFFIXES = ['/event', '/global/event', '/global/sync-event'];
const SCOPED_HEADER_TO_QUERY: Array<{ header: string; query: string }> = [
  { header: 'x-opencode-directory', query: 'directory' },
  { header: 'x-opencode-workspace', query: 'workspace' },
];

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

function normalizeScopedHeaderValue(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizeDirectoryPath(value: string): string {
  return value.replace(/\\/g, '/');
}

function rewriteScopedRequest(request: Request): Request {
  const url = new URL(request.url);
  let changed = false;

  for (const { header, query } of SCOPED_HEADER_TO_QUERY) {
    const headerValue = request.headers.get(header);
    if (!headerValue) {
      continue;
    }

    const normalizedValue = query === 'directory'
      ? normalizeDirectoryPath(normalizeScopedHeaderValue(headerValue))
      : normalizeScopedHeaderValue(headerValue);

    if (!url.searchParams.has(query)) {
      url.searchParams.set(query, normalizedValue);
      changed = true;
    }
    changed = true;
  }

  if (!changed) {
    return request;
  }

  const next = new Request(url.toString(), request);
  for (const { header } of SCOPED_HEADER_TO_QUERY) {
    next.headers.delete(header);
  }
  return next;
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

export function createSdkFetch(options: {
  nativeFetch?: typeof fetch;
  tracePort?: OpenCodeTracePort;
  traceContext?: OpenCodeTraceContext;
} = {}): typeof fetch {
  const nativeFetch = options.nativeFetch ?? globalThis.fetch.bind(globalThis);

  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = rewriteScopedRequest(new Request(input, init));
    const startedAt = performance.now();

    if (isSseRequest(request)) {
      try {
        const response = await nativeFetch(request);
        options.tracePort?.recordTransport?.({
          context: options.traceContext,
          method: request.method,
          url: request.url,
          status: response.status,
          durationMs: performance.now() - startedAt,
          requestId: response.headers.get('x-request-id') ?? undefined,
        });
        return response;
      } catch (error) {
        options.tracePort?.recordTransport?.({
          context: options.traceContext,
          method: request.method,
          url: request.url,
          durationMs: performance.now() - startedAt,
          error,
        });
        throw error;
      }
    }

    try {
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
      const requestId = headers.get('x-request-id') ?? undefined;
      options.tracePort?.recordTransport?.({
        context: options.traceContext,
        method: request.method,
        url: request.url,
        status: response.status,
        durationMs: performance.now() - startedAt,
        requestId,
      });

      return new Response(responseBody, {
        status: response.status,
        headers,
      });
    } catch (error) {
      options.tracePort?.recordTransport?.({
        context: options.traceContext,
        method: request.method,
        url: request.url,
        durationMs: performance.now() - startedAt,
        error,
      });
      throw error;
    }
  };
}
