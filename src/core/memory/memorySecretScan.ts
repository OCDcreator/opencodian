/**
 * Heuristic credential scanner powering the recall-side secret guard
 * (2026-08-20 review: plain-text credentials were found in real memories).
 *
 * Deliberately conservative: every pattern is tuned to prefer MISSING a real
 * secret over flagging normal prose — a false positive silently drops a
 * legitimate memory from recall, and on the sync side leaves the file
 * uncommitted forever. 2026-10-23 tightening after real-world false
 * positives blocked legitimate memories: placeholder values
 * (`Cookie=st_...`, `token=<uuid>`), slash-joined lists/paths
 * (`Q1/Q4/...`, `Volumes/SDD2T/...`) and bare 40-hex git SHA-1 ids no
 * longer trip the gate; full-shape `st_` session tokens and bare `eyJ…`
 * JWT shapes were added so real credentials stay caught.
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
  { kind: "sk-prefix", source: "\\bsk-[A-Za-z0-9_-]{12,}" },
  // Underscore prefixes are unambiguous in prose; 8+ chars suffices.
  { kind: "ghp-prefix", source: "\\bghp_[A-Za-z0-9]{8,}" },
  { kind: "gho-prefix", source: "\\bgho_[A-Za-z0-9]{8,}" },
  { kind: "xoxb-prefix", source: "\\bxoxb-[A-Za-z0-9-]{8,}" },
  { kind: "aws-access-key-id", source: "\\bAKIA[0-9A-Z]{16}\\b" },
  // Full-shape session token `st_<uuid>` (opencode console / stripe style).
  // The complete dashed-uuid shape keeps prose placeholders safe:
  // `st_<uuid>`, `st_…` and truncated `st_1924f506-…` never match.
  {
    kind: "st-session-token",
    source:
      "\\bst_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\b",
  },
  // JWT header.payload. shape — `eyJ` is the base64 of `{"` and never prose.
  { kind: "jwt-shape", source: "\\beyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{5,}\\." },
  // `Bearer <token>` header style. 20+ chars because sentences like
  // "the bearer of responsibilities" must not match.
  { kind: "bearer-token", source: "\\bBearer\\s+[A-Za-z0-9._~+/=-]{20,}" },
];

/** key: value / key=value shapes with a plausibly credential-ish value. */
const CREDENTIAL_ASSIGNMENT_SOURCE =
  "\\b(password|passwd|token|api[_-]?key|secret|cookie|authorization)\\s*[:=]\\s*([^\\s]{8,})";

const HEX_BLOB_SOURCE = "\\b[A-Fa-f0-9]{32,}\\b";
const BASE64_BLOB_SOURCE = "\\b[A-Za-z0-9+/]{32,}={0,2}";

/**
 * Assignment values must look credential-ish, not like a plain word: at
 * least one digit or a typical credential symbol. Keeps prose such as
 * "the token: important" clean while `api_key = sk-…` still hits.
 */
function looksLikeCredentialValue(value: string): boolean {
  return /[0-9]/u.test(value) || /[-._~+/=]/u.test(value);
}

/**
 * Placeholder values are documentation, not credentials: `Cookie=st_...`,
 * `token=<uuid>`, `"oc_sk_…"`. Real tokens never contain `<`, `>`, the
 * ellipsis char or a literal `...` (2026-10-23 false positives).
 */
function looksLikePlaceholderValue(value: string): boolean {
  return /[<>…]|\.\.\./u.test(value);
}

/**
 * Real base64 mixes cases and digits; a 32+ char single-case letter run is
 * a (rare) word, not a secret.
 */
function looksLikeBase64Blob(run: string): boolean {
  return /[a-z]/u.test(run) && /[A-Z]/u.test(run) && /[0-9]/u.test(run);
}

/**
 * Slash-joined runs are paths or lists (`Volumes/SDD2T/...`,
 * `Q1/Q4/Q10/...`), not base64 payloads: two or more `/` inside one run
 * is prose shape, not token shape (2026-10-23 false positives). A rare
 * real base64 blob with 2+ internal slashes slips through — accepted per
 * the prefer-miss policy, and assignment shapes (`cert = ...`) still
 * catch pasted tokens.
 */
function looksLikeSlashJoinedList(run: string): boolean {
  let slashes = 0;
  for (const ch of run) {
    if (ch === "/") slashes++;
    if (slashes >= 2) return true;
  }
  return false;
}

/**
 * A bare all-lowercase 40-hex run is a git SHA-1 object id — ubiquitous in
 * development memories and not a credential shape on its own (git object
 * ids are always lowercase; mixed/uppercase hex runs still trip). An
 * assigned value (`token: <40hex>`) is still caught by
 * credential-assignment, so only bare prose SHAs are exempt.
 */
function looksLikeGitSha1(run: string): boolean {
  return run.length === 40 && /^[0-9a-f]{40}$/.test(run);
}

/**
 * Scan text for likely credentials. Heuristic by design — prefer misses
 * over false positives on normal text (see file comment).
 */
export function scanForSecrets(text: string): SecretScanResult {
  const kinds: string[] = [];
  const add = (kind: string) => {
    if (!kinds.includes(kind)) kinds.push(kind);
  };

  if (typeof text !== "string" || text.length === 0) {
    return { hit: false, kinds: [] };
  }

  for (const { kind, source } of PREFIX_PATTERNS) {
    if (new RegExp(source, "u").test(text)) add(kind);
  }

  const assign = new RegExp(CREDENTIAL_ASSIGNMENT_SOURCE, "giu");
  let m: RegExpExecArray | null;
  while ((m = assign.exec(text)) !== null) {
    if (
      m[2] &&
      looksLikeCredentialValue(m[2]) &&
      !looksLikePlaceholderValue(m[2])
    ) {
      add("credential-assignment");
      break;
    }
  }

  const hex = new RegExp(HEX_BLOB_SOURCE, "gu");
  let h: RegExpExecArray | null;
  while ((h = hex.exec(text)) !== null) {
    if (h[0] && !looksLikeGitSha1(h[0])) {
      add("hex-blob");
      break;
    }
  }

  const b64 = new RegExp(BASE64_BLOB_SOURCE, "gu");
  let b: RegExpExecArray | null;
  while ((b = b64.exec(text)) !== null) {
    if (b[0] && looksLikeBase64Blob(b[0]) && !looksLikeSlashJoinedList(b[0])) {
      add("base64-blob");
      break;
    }
  }

  return { hit: kinds.length > 0, kinds };
}
