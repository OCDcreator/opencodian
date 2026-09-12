/**
 * Heuristic credential scanner powering the recall-side secret guard.
 * Ported verbatim from the reference implementation.
 *
 * Deliberately conservative: every pattern is tuned to prefer MISSING a real
 * secret over flagging normal prose — a false positive silently drops a
 * legitimate memory from recall.
 */

export type SecretScanResult = {
  hit: boolean;
  /** Names of every pattern that matched (deduped, pattern order). */
  kinds: string[];
};

/** Literal-prefix patterns: strong enough to match on prefix alone. */
const PREFIX_PATTERNS: Array<{ kind: string; source: string }> = [
  // `sk-` needs 12+ token chars so prose like "task-list" / "risk-free"
  // never matches; real OpenAI-style keys are far longer.
  { kind: 'sk-prefix', source: '\\bsk-[A-Za-z0-9_-]{12,}' },
  // Underscore prefixes are unambiguous in prose; 8+ chars suffices.
  { kind: 'ghp-prefix', source: '\\bghp_[A-Za-z0-9]{8,}' },
  { kind: 'gho-prefix', source: '\\bgho_[A-Za-z0-9]{8,}' },
  { kind: 'xoxb-prefix', source: '\\bxoxb-[A-Za-z0-9-]{8,}' },
  { kind: 'aws-access-key-id', source: '\\bAKIA[0-9A-Z]{16}\\b' },
  // `Bearer <token>` header style. 20+ chars because sentences like
  // "the bearer of responsibilities" must not match.
  { kind: 'bearer-token', source: '\\bBearer\\s+[A-Za-z0-9._~+/=-]{20,}' },
];

/** key: value / key=value shapes with a plausibly credential-ish value. */
const CREDENTIAL_ASSIGNMENT_SOURCE =
  '\\b(password|passwd|token|api[_-]?key|secret|cookie|authorization)\\s*[:=]\\s*([^\\s]{8,})';

const HEX_BLOB_SOURCE = '\\b[A-Fa-f0-9]{32,}\\b';
const BASE64_BLOB_SOURCE = '\\b[A-Za-z0-9+/]{32,}={0,2}';

/**
 * Assignment values must look credential-ish, not like a plain word: at
 * least one digit or a typical credential symbol. Keeps prose such as
 * "the token: important" clean while `api_key = sk-…` still hits.
 */
function looksLikeCredentialValue(value: string): boolean {
  return /[0-9]/u.test(value) || /[-._~+/=]/u.test(value);
}

/**
 * Real base64 mixes cases and digits; a 32+ char single-case letter run is
 * a (rare) word, not a secret.
 */
function looksLikeBase64Blob(run: string): boolean {
  return /[a-z]/u.test(run) && /[A-Z]/u.test(run) && /[0-9]/u.test(run);
}

/**
 * Scan text for likely credentials. Heuristic by design — prefer misses
 * over false positives on normal text.
 */
export function scanForSecrets(text: string): SecretScanResult {
  const kinds: string[] = [];
  const add = (kind: string) => {
    if (!kinds.includes(kind)) kinds.push(kind);
  };

  if (typeof text !== 'string' || text.length === 0) {
    return { hit: false, kinds: [] };
  }

  for (const { kind, source } of PREFIX_PATTERNS) {
    if (new RegExp(source, 'u').test(text)) add(kind);
  }

  const assign = new RegExp(CREDENTIAL_ASSIGNMENT_SOURCE, 'giu');
  let m: RegExpExecArray | null;
  while ((m = assign.exec(text)) !== null) {
    if (m[2] && looksLikeCredentialValue(m[2])) {
      add('credential-assignment');
      break;
    }
  }

  if (new RegExp(HEX_BLOB_SOURCE, 'u').test(text)) add('hex-blob');

  const b64 = new RegExp(BASE64_BLOB_SOURCE, 'gu');
  let b: RegExpExecArray | null;
  while ((b = b64.exec(text)) !== null) {
    if (b[0] && looksLikeBase64Blob(b[0])) {
      add('base64-blob');
      break;
    }
  }

  return { hit: kinds.length > 0, kinds };
}
