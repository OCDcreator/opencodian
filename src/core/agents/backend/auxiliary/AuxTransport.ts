/**
 * AuxTransport — the HTTP surface auxiliary sessions use to talk to their
 * backend process.
 *
 * Kept as a separate seam because the transport differs by host: plain
 * `fetch` works in Node (audit scripts, unit tests), while the Obsidian
 * renderer blocks raw `fetch` to localhost via CSP and must route through
 * `requestUrl` (injected by OpenCodeAdapter, mirroring
 * src/core/opencode/sdkFetch.ts).
 */

export interface AuxHttpRequest {
  readonly method?: 'GET' | 'POST' | 'DELETE';
  readonly headers?: Record<string, string>;
  readonly body?: string;
  readonly signal?: AbortSignal;
}

export interface AuxHttpResponse {
  readonly ok: boolean;
  readonly status: number;
  text(): Promise<string>;
  json(): Promise<unknown>;
}

export type AuxTransport = (url: string, request?: AuxHttpRequest) => Promise<AuxHttpResponse>;

/** Node-style default transport; swapped for `requestUrl` inside Obsidian. */
export const auxFetchTransport: AuxTransport = async (url, request = {}) => {
  const response = await fetch(url, {
    method: request.method ?? 'GET',
    ...(request.headers ? { headers: request.headers } : {}),
    ...(request.body !== undefined ? { body: request.body } : {}),
    ...(request.signal ? { signal: request.signal } : {}),
  });
  return {
    ok: response.ok,
    status: response.status,
    text: () => response.text(),
    json: () => response.json(),
  };
};
