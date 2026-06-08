/**
 * Best-effort sanitizer for diagnostic report exports.
 *
 * This utility redacts common secret shapes from plain diagnostic text before
 * clipboard copy or file write. It is regex-based and cannot guarantee removal
 * of every possible sensitive value — users should still review exported
 * diagnostics before sharing.
 */

const REDACTED = '[REDACTED]';

const PRIVATE_KEY_BLOCK_PATTERN = /(-----BEGIN PRIVATE KEY-----)[\s\S]*?(-----END PRIVATE KEY-----)/g;

/**
 * Ordered list of redaction patterns applied to diagnostic report text.
 *
 * Each pattern captures a prefix (and optional suffix) so the replacement can
 * preserve surrounding structure while redacting only the sensitive value.
 *
 * Exported for direct test access; consumers should prefer `sanitizeDiagnosticReport()`.
 */
export const DIAGNOSTIC_REDACTION_PATTERNS = [
  // PEM private-key blocks — replace entire block
  PRIVATE_KEY_BLOCK_PATTERN,

  // Authorization: Bearer <token>
  /(authorization\s*[:=]\s*bearer\s+)([^\s,;]+)/gi,
  // Authorization: <value>  (non-bearer, e.g. basic or raw token)
  /(authorization\s*[:=]\s*(?!bearer\s+))([^\s,;]+(?:\s+[^\s,;]+)?)/gi,
  // bearer <token>  (standalone)
  /(bearer\s+)([^\s,;]+)/gi,

  // key=value / key: value assignments for common secret names (not query-string params)
  /((?:^|[ \t,;])(?:api[_-]?key|token|secret|password)\s*[:=]\s*)([^\s,;]+)/gim,
  // CLI flags --token <value> / --api-key <value>
  /((?:--(?:token|api[_-]?key|secret|password)|\/(?:token|api[_-]?key|secret|password))\s+)([^\s,;]+)/gi,

  // URL-embedded passwords: https://user:password@host
  /(https?:\/\/[^/\s:@]+:)([^@\s/]+)(@)/gi,
  // Generic scheme://user:pass@ (covers non-http)
  /(:\/\/[^\s:@/]+:)([^@\s/]+)(@)/gi,

  // Query-string secret params (catch-all: matches any param name containing a secret keyword)
  /([?&][^=&\s]*(?:token|access[_-]?token|api[_-]?key|secret|password)[^=&\s]*=)([^&\s]+)/gi,

  // Environment-variable style: API_KEY=sk-ant-... at start of line
  /^([ \t]*(?:[A-Z][A-Z0-9_]*_)?API_KEY\s*[:=]\s*)([^\s,;]+)/gim,
  // KEY/TOKEN/SECRET= followed by an Anthropic-style key prefix
  /^([ \t]*(?:[A-Z][A-Z0-9_]*_)?(?:KEY|TOKEN|SECRET)\s*=\s*)(sk-ant-[^\s,;]+)/gim,

  // Anthropic API key prefix anywhere in text
  /(sk-ant-api03-)([A-Za-z0-9_-]+)/g,

  // Generic long token: key=<20+ alphanumeric chars>
  /((?:key|token|secret)\s*=\s*)([A-Za-z0-9+/=_-]{20,})/gi,
] as const satisfies readonly RegExp[];

/**
 * Sanitize a diagnostic report string by redacting common secret patterns.
 *
 * @param text - The raw diagnostic report text.
 * @returns The sanitized text with sensitive values replaced by `[REDACTED]`.
 */
export function sanitizeDiagnosticReport(text: string): string {
  if (typeof text !== 'string') {
    return text;
  }

  return DIAGNOSTIC_REDACTION_PATTERNS.reduce((sanitized, pattern) => {
    pattern.lastIndex = 0;
    return sanitized.replace(pattern, (...args: unknown[]) => {
      const match = args[0] as string;
      const captures = args.slice(1, -2) as Array<string | undefined>;
      if (pattern === PRIVATE_KEY_BLOCK_PATTERN) {
        return REDACTED;
      }

      const [prefix, value, suffix] = captures;
      if (!prefix || !value || value === REDACTED) {
        return match;
      }

      return `${prefix}${REDACTED}${suffix ?? ''}`;
    });
  }, text);
}
