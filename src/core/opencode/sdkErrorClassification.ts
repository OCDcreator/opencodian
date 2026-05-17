export type SdkErrorClass =
  | 'not_found'
  | 'forbidden'
  | 'bad_request'
  | 'provider_auth'
  | 'rate_limit'
  | 'server_error'
  | 'unknown';

interface SdkErrorCause {
  status?: number;
  body?: {
    name?: string;
    data?: { message?: string; kind?: string };
  };
}

export function extractSdkErrorCause(error: Error): SdkErrorCause | null {
  const cause = (error as unknown as { cause?: unknown }).cause;
  if (!cause || typeof cause !== 'object') {
    return null;
  }

  return cause as SdkErrorCause;
}

function classifyByHttpStatus(status: number): SdkErrorClass | null {
  if (status === 404) return 'not_found';
  if (status === 403) return 'forbidden';
  if (status === 401) return 'provider_auth';
  if (status === 400) return 'bad_request';
  if (status === 429) return 'rate_limit';
  if (status >= 500) return 'server_error';
  return null;
}

export function classifySdkError(error: unknown): SdkErrorClass {
  if (!(error instanceof Error)) {
    if (error && typeof error === 'object') {
      const record = error as { status?: unknown; data?: { statusCode?: unknown }; name?: unknown };
      if (typeof record.status === 'number') {
        const classified = classifyByHttpStatus(record.status);
        if (classified) return classified;
      }
      if (typeof record.data?.statusCode === 'number') {
        const classified = classifyByHttpStatus(record.data.statusCode);
        if (classified) return classified;
      }
      const errorName = typeof record.name === 'string' ? record.name : null;
      if (errorName === 'NotFoundError') return 'not_found';
      if (errorName === 'ProviderAuthError') return 'provider_auth';
      if (errorName === 'BadRequest') return 'bad_request';
    }
    return 'unknown';
  }

  const cause = extractSdkErrorCause(error);
  if (!cause) {
    return 'unknown';
  }

  const bodyName = cause.body?.name;
  if (bodyName === 'NotFoundError') return 'not_found';
  if (bodyName === 'ProviderAuthError') return 'provider_auth';
  if (bodyName === 'BadRequest') return 'bad_request';
  if (bodyName === 'SessionNextRetryError') return 'server_error';

  if (typeof cause.status === 'number') {
    const classified = classifyByHttpStatus(cause.status);
    if (classified) return classified;
  }

  return 'unknown';
}
