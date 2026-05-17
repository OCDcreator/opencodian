import {
  classifySdkError,
  extractSdkErrorCause,
} from '../../../../src/core/opencode/sdkErrorClassification';

describe('extractSdkErrorCause', () => {
  it('returns null for Error without cause', () => {
    expect(extractSdkErrorCause(new Error('plain'))).toBeNull();
  });

  it('returns null for Error with non-object cause', () => {
    const err = new Error('test');
    (err as unknown as { cause: unknown }).cause = 'string-cause';
    expect(extractSdkErrorCause(err)).toBeNull();
  });

  it('extracts cause from Error with object cause', () => {
    const err = new Error('test');
    (err as unknown as { cause: unknown }).cause = {
      status: 404,
      body: { name: 'NotFoundError', data: { message: 'not here' } },
    };
    const cause = extractSdkErrorCause(err);
    expect(cause).not.toBeNull();
    expect(cause!.status).toBe(404);
    expect(cause!.body?.name).toBe('NotFoundError');
  });
});

describe('classifySdkError', () => {
  describe('non-Error objects', () => {
    it('classifies by status code 404', () => {
      expect(classifySdkError({ status: 404 })).toBe('not_found');
    });

    it('classifies by status code 403', () => {
      expect(classifySdkError({ status: 403 })).toBe('forbidden');
    });

    it('classifies by status code 400', () => {
      expect(classifySdkError({ status: 400 })).toBe('bad_request');
    });

    it('classifies by status code 429', () => {
      expect(classifySdkError({ status: 429 })).toBe('rate_limit');
    });

    it('classifies by status code 500', () => {
      expect(classifySdkError({ status: 500 })).toBe('server_error');
    });

    it('classifies by status code 502', () => {
      expect(classifySdkError({ status: 502 })).toBe('server_error');
    });

    it('returns unknown for unrecognized status', () => {
      expect(classifySdkError({ status: 418 })).toBe('unknown');
    });

    it('returns unknown for null', () => {
      expect(classifySdkError(null)).toBe('unknown');
    });

    it('returns unknown for string', () => {
      expect(classifySdkError('some error')).toBe('unknown');
    });

    it('returns unknown for object without status', () => {
      expect(classifySdkError({ message: 'oops' })).toBe('unknown');
    });
  });

  describe('Error instances with SDK cause', () => {
    function makeSdkError(cause: unknown): Error {
      const err = new Error('SDK error');
      (err as unknown as { cause: unknown }).cause = cause;
      return err;
    }

    it('classifies NotFoundError by body.name', () => {
      expect(classifySdkError(makeSdkError({
        status: 404,
        body: { name: 'NotFoundError', data: { message: 'gone' } },
      }))).toBe('not_found');
    });

    it('classifies ProviderAuthError by body.name', () => {
      expect(classifySdkError(makeSdkError({
        status: 401,
        body: { name: 'ProviderAuthError', data: { message: 'bad key' } },
      }))).toBe('provider_auth');
    });

    it('classifies BadRequest by body.name', () => {
      expect(classifySdkError(makeSdkError({
        status: 400,
        body: { name: 'BadRequest', data: { message: 'bad input', kind: 'Body' } },
      }))).toBe('bad_request');
    });

    it('body.name takes priority over status code', () => {
      expect(classifySdkError(makeSdkError({
        status: 500,
        body: { name: 'NotFoundError', data: { message: 'still not found' } },
      }))).toBe('not_found');
    });

    it('falls back to status code when body.name is unrecognized', () => {
      expect(classifySdkError(makeSdkError({
        status: 403,
        body: { name: 'SomeUnknownError', data: { message: '?' } },
      }))).toBe('forbidden');
    });

    it('falls back to status code when cause has no body', () => {
      expect(classifySdkError(makeSdkError({ status: 404 }))).toBe('not_found');
    });

    it('returns unknown for Error without cause', () => {
      expect(classifySdkError(new Error('plain'))).toBe('unknown');
    });

    it('returns unknown for Error with non-object cause', () => {
      const err = new Error('test');
      (err as unknown as { cause: unknown }).cause = 'not-an-object';
      expect(classifySdkError(err)).toBe('unknown');
    });

    it('classifies SessionNextRetryError as server_error', () => {
      expect(classifySdkError(makeSdkError({
        status: 500,
        body: { name: 'SessionNextRetryError', data: { message: 'retry' } },
      }))).toBe('server_error');
    });

    it('classifies 401 status as provider_auth', () => {
      expect(classifySdkError(makeSdkError({ status: 401 }))).toBe('provider_auth');
    });
  });

  describe('plain object with data.statusCode', () => {
    it('classifies by nested data.statusCode for 404', () => {
      expect(classifySdkError({
        name: 'SomeError',
        data: { message: 'not found', statusCode: 404 },
      })).toBe('not_found');
    });

    it('classifies by nested data.statusCode for 403', () => {
      expect(classifySdkError({
        name: 'SomeError',
        data: { message: 'forbidden', statusCode: 403 },
      })).toBe('forbidden');
    });
  });
});
