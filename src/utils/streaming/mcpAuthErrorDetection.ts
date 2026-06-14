const AUTH_ERROR_PATTERNS: RegExp[] = [
  /authentic/i,
  /unauthorized/i,
  /\b401\b/,
  /not.{0,15}logged/i,
  /\boauth\b/i,
  /(?:expired|invalid).{0,10}token/i,
  /token.{0,20}(?:expired|invalid|required)/i,
  /login.{0,15}required/i,
];

export function detectMcpAuthError(result: string | undefined | null): boolean {
  if (!result || typeof result !== 'string' || result.trim().length === 0) {
    return false;
  }
  return AUTH_ERROR_PATTERNS.some((pattern) => pattern.test(result));
}
