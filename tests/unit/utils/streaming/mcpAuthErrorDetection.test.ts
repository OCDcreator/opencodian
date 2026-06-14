import { detectMcpAuthError } from '../../../../src/utils/streaming/mcpAuthErrorDetection';

describe('detectMcpAuthError', () => {
  it.each([
    ['authentication required'],
    ['Authentication required for this server'],
    ['not authenticated'],
    ['User is not authenticated'],
    ['unauthorized'],
    ['Unauthorized: token missing'],
    ['HTTP 401 Unauthorized'],
    ['not logged in'],
    ['Server is not logged in'],
    ['OAuth flow required'],
    ['oauth authentication needed'],
    ['token expired'],
    ['The access token expired'],
    ['invalid token'],
    ['token required for this operation'],
    ['login required'],
    ['Login required to access this resource'],
  ])('detects auth error in: %s', (text) => {
    expect(detectMcpAuthError(text)).toBe(true);
  });

  it.each([
    ['File not found'],
    ['Permission denied'],
    ['Connection timeout'],
    ['Rate limit exceeded'],
    ['Internal server error'],
    [''],
    ['   '],
  ])('does not falsely detect auth error in: %s', (text) => {
    expect(detectMcpAuthError(text)).toBe(false);
  });

  it('returns false for undefined/null/empty', () => {
    expect(detectMcpAuthError(undefined)).toBe(false);
    expect(detectMcpAuthError(null)).toBe(false);
    expect(detectMcpAuthError('')).toBe(false);
  });

  it('detects auth error inside JSON-stringified MCP result', () => {
    const jsonResult = JSON.stringify([
      { type: 'text', text: 'Error: authentication required' },
    ]);
    expect(detectMcpAuthError(jsonResult)).toBe(true);
  });

  it('detects auth error with 401 status code', () => {
    expect(detectMcpAuthError('Request failed with status 401')).toBe(true);
  });
});
