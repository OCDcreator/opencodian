export type BackendSessionCatalogResult<T> =
  | { status: 'complete'; data: T[]; nextCursor: null }
  | { status: 'partial' | 'failed' | 'unavailable'; data: T[]; nextCursor: string | null; errorReason: string };

/** A native paging failure retains admitted pages without pretending they are complete. */
export class BackendSessionCatalogReadError extends Error {
  constructor(readonly result: Exclude<BackendSessionCatalogResult<unknown>, { status: 'complete' }>) {
    super(result.errorReason);
    this.name = 'BackendSessionCatalogReadError';
  }
}

/** Inspect known error fields but expose only fixed, credential-free classifications. */
export function backendSessionCatalogFailure(error: unknown): { status: 'failed' | 'unavailable'; errorReason: string } {
  const value = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  const response = value.response && typeof value.response === 'object' ? value.response as Record<string, unknown> : {};
  const cause = value.cause && typeof value.cause === 'object' ? value.cause as Record<string, unknown> : {};
  const causeResponse = cause.response && typeof cause.response === 'object' ? cause.response as Record<string, unknown> : {};
  const codes = [value.code, value.status, value.statusCode, response.status, cause.code, cause.status, causeResponse.status];
  const message = error instanceof Error ? error.message : typeof value.message === 'string' ? value.message : '';
  const type = typeof value.type === 'string' ? value.type : typeof value._tag === 'string' ? value._tag : '';
  if (codes.some((code) => [401, 403].includes(Number(code)) || /^(?:EACCES|EPERM)$/i.test(String(code ?? '')))
    || /(?:permission|access) denied|forbidden|unauthori[sz]ed/i.test(`${type} ${message}`)) {
    return { status: 'failed', errorReason: 'Permission denied' };
  }
  if (codes.some((code) => [404, 405, 501, -32601].includes(Number(code)))
    || /method (?:not found|absent|unsupported)|route[._ -]not[._ -]found/i.test(`${type} ${message}`)) {
    return { status: 'unavailable', errorReason: 'Session catalog is unavailable' };
  }
  return { status: 'failed', errorReason: 'Session catalog read failed' };
}
