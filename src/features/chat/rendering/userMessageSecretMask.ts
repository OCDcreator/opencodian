import { DIAGNOSTIC_REDACTION_PATTERNS } from '../../../shared/diagnosticSecretSanitizer';

// ---------------------------------------------------------------------------
// Display-only credential masking for sent user message text.
//
// Presentation layer only: masking never touches the persisted message, the
// model input, or the composer draft. Detection reuses the shared diagnostic
// redaction patterns verbatim (subset below) plus a small set of high
// precision provider token shapes, so bare credentials are masked too.
// Detection contract:
// - the shared list is never widened here; `sanitizeDiagnosticReport()`
//   behaviour stays untouched;
// - shared patterns that also fire on ordinary prose (standalone `bearer`,
//   bare `key=<20+ chars>`) are excluded from the display subset;
// - short values are only masked inside credential-shaped URLs (userinfo,
//   query params), where false positives are negligible.
// - detection runs on a bounded markup-decoded view (HTML entities, percent
//   escapes) so encoded credentials cannot slip through;
// - assignment scanning is a bounded, linear pointer walk with hard name and
//   value length caps, so long separator-free text cannot backtrack.
// ---------------------------------------------------------------------------

/** Fixed-length mask glyph run; the true secret length is never revealed. */
export const USER_MESSAGE_SECRET_MASK_TEXT = '••••••••';

const MIN_DISPLAY_SECRET_VALUE_LENGTH = 6;
const LONG_DISPLAY_SECRET_VALUE_LENGTH = 16;

/**
 * How a matched value is judged before masking:
 * - `pem-block`: whole PEM block, always masked;
 * - `url-shaped`: URL userinfo / query values, any length;
 * - `provider-token`: whole bare token with a provider-specific prefix;
 * - `generic-token`: whole bare token with a generic prefix, needs entropy;
 * - `typed`: value of a credential-named field, needs credential shape.
 */
type SecretValueShape = 'pem-block' | 'url-shaped' | 'provider-token' | 'generic-token' | 'typed';

interface SharedSecretPatternEntry {
  readonly index: number;
  readonly shape: SecretValueShape;
}

// Index into the shared DIAGNOSTIC_REDACTION_PATTERNS list. The layout is
// pinned by tests/unit/features/chat/userMessageSecretMask.test.ts so an
// upstream reorder fails loudly instead of silently changing the mask.
const SHARED_SECRET_DISPLAY_PATTERNS: readonly SharedSecretPatternEntry[] = [
  { index: 0, shape: 'pem-block' },
  ...[1, 2, 3, 5].map((index) => ({ index, shape: 'typed' as const })),
  ...[6, 7, 8].map((index) => ({ index, shape: 'url-shaped' as const })),
  ...[9, 10, 11].map((index) => ({ index, shape: 'typed' as const })),
];

interface DisplayOnlySecretPatternEntry {
  readonly pattern: RegExp;
  readonly shape: 'provider-token' | 'generic-token';
}

const DISPLAY_ONLY_SECRET_PATTERNS: readonly DisplayOnlySecretPatternEntry[] = [
  // `sk-` also prefixes ordinary kebab-case identifiers, so it needs entropy.
  { pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/g, shape: 'generic-token' },
  { pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, shape: 'provider-token' }, { pattern: /\bgithub_pat_[A-Za-z0-9_]{22,}\b/g, shape: 'provider-token' },
  { pattern: /\bglpat-[A-Za-z0-9_-]{20,}\b/g, shape: 'provider-token' }, { pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, shape: 'provider-token' },
  { pattern: /\bAKIA[0-9A-Z]{16}\b/g, shape: 'provider-token' }, { pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g, shape: 'provider-token' },
  { pattern: /\bhf_[A-Za-z0-9]{20,}\b/g, shape: 'provider-token' }, { pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]*\b/g, shape: 'provider-token' },
  { pattern: /\b[0-9a-fA-F]{32}\.[A-Za-z0-9]{16}\b/g, shape: 'provider-token' },
];

// Assignment scanning bounds: hard caps keep the pointer walks linear.
const ASSIGNMENT_NAME_MAX_LENGTH = 64;
const ASSIGNMENT_VALUE_MAX_LENGTH = 1024;
const ASSIGNMENT_VALUE_LEADING_AFFIX = /^["'`]+/;
const ASSIGNMENT_VALUE_TRAILING_AFFIX = /[.,;:!?)\]}"'`]+$/;

const CREDENTIAL_FIELD_NAME_SEGMENTS: ReadonlySet<string> = new Set([
  'token', 'secret', 'password', 'passwd', 'pwd', 'credential', 'credentials', 'apikey', 'authorization',
]);
const CREDENTIAL_KEY_QUALIFIER_SEGMENTS: ReadonlySet<string> = new Set(['api', 'access', 'secret', 'private', 'auth']);
const CREDENTIAL_TOKEN_QUALIFIER_SEGMENTS: ReadonlySet<string> = new Set([
  'api', 'access', 'auth', 'private', 'client', 'refresh', 'session', 'identity',
]);
const DESCRIPTIVE_FIELD_NAME_SUFFIX_SEGMENTS: ReadonlySet<string> = new Set([
  'count', 'counts', 'limit', 'limits', 'max', 'min', 'maximum', 'minimum', 'total', 'used', 'usage',
  'remaining', 'policy', 'policies', 'type', 'size', 'rate', 'window', 'timeout', 'quota', 'stats',
  'stat', 'number', 'num', 'hint', 'ttl', 'expires', 'expiry', 'age', 'cache', 'id', 'ids', 'name', 'list',
]);

const PLACEHOLDER_TEMPLATE_REGEXES: readonly RegExp[] = [
  /^\$\{[^}]*\}$/, /^\$[A-Za-z_][A-Za-z0-9_]*$/, /^%[A-Za-z_][A-Za-z0-9_]*%$/,
  /^\{\{[^}]*\}\}$/, /^<[^<>]*>$/, /^\[[^[\]]*\]$/,
];
const PLACEHOLDER_LITERAL_REGEX =
  /^(?:redacted|changeme|change[-_]me|placeholder|example|sample|dummy|null|undefined|none|todo|tbd|true|false|yes|no|on|off|password|passwd|pass|secret|token|apikey|api[-_]key)$/i;
const PLACEHOLDER_PHRASE_REGEX =
  /^(?:your|my|insert|replace)[-_ ]?(?:[\w-]*[-_ ])?(?:api[-_ ]?key|key|token|secret|password|passwd|credential)s?(?:[-_ ]here)?$/i;

interface UserMessageSecretRange {
  start: number;
  end: number;
}

function stripWrappingQuotes(value: string): string {
  const match = /^(["'`])([\s\S]*)\1$/.exec(value);
  return match ? match[2] : value;
}

/**
 * Placeholders are not credentials: template variables, bracketed hints,
 * well-known filler words, and low-entropy fillers such as `xxxxxxxx`.
 */
function isPlaceholderSecretValue(value: string): boolean {
  const bare = stripWrappingQuotes(value.trim());
  if (!bare) {
    return true;
  }
  // Unterminated template/bracket fragments (`${VAR`, `<your-token`) are
  // placeholders too; the value capture of shared patterns may stop early.
  if (/^[<$[{]/.test(bare)) {
    return true;
  }
  if (PLACEHOLDER_TEMPLATE_REGEXES.some((regex) => regex.test(bare))) {
    return true;
  }
  if (PLACEHOLDER_LITERAL_REGEX.test(bare) || PLACEHOLDER_PHRASE_REGEX.test(bare)) {
    return true;
  }
  const longestSegment = bare
    .split(/[-_.]/)
    .reduce((longest, segment) => (segment.length > longest.length ? segment : longest), '');
  return new Set(longestSegment.toLowerCase()).size <= 2;
}

/** A plain dictionary-looking word (`always`, `Required`, `TODO`). */
function isWordLikeValue(value: string): boolean {
  const bare = stripWrappingQuotes(value);
  return bare.length < LONG_DISPLAY_SECRET_VALUE_LENGTH
    && (/^[A-Z]?[a-z]+$/.test(bare) || /^[A-Z]+$/.test(bare));
}

/** How the value was found — drives the typed acceptance guards. */
interface SecretValueContext {
  /** `=` assignment or quoted field name — config syntax. */
  assigned: boolean;
  /** Strong credential context (`Authorization: Bearer …`, `api_key: …`). */
  strong: boolean;
  /** Value survived quote parsing — valid spaces inside are deliberate. */
  quoted: boolean;
}

function isAcceptableSecretValue(
  value: string,
  shape: SecretValueShape,
  context: SecretValueContext,
): boolean {
  if (shape === 'pem-block') {
    return value.length > 0;
  }
  if (isPlaceholderSecretValue(value)) {
    return false;
  }
  switch (shape) {
    case 'url-shaped':
    case 'provider-token':
      return true;
    case 'generic-token':
      return /\d/.test(value) || (/[a-z]/.test(value) && /[A-Z]/.test(value));
    case 'typed':
      // Credentials are printable ASCII; a value that survived quote parsing
      // is a deliberate literal, so valid spaces are allowed inside it. In
      // weak contexts (bare `password:` / `token:` names), plain
      // dictionary-looking words are treated as prose, not credentials;
      // strong credential contexts (`Authorization: Bearer …`, `api_key: …`,
      // `access_token: …`) are masked without guessing whether the value
      // looks like a word.
      return value.length >= MIN_DISPLAY_SECRET_VALUE_LENGTH
        && (context.quoted ? /^[\x20-\x7E]+$/.test(value) : /^[\x21-\x7E]+$/.test(value))
        && /[A-Za-z0-9]/.test(value)
        && (context.assigned || context.strong || context.quoted || !isWordLikeValue(value));
  }
  const exhaustiveShape: never = shape;
  return exhaustiveShape;
}

function splitCredentialFieldNameSegments(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .split(/[_-]+/)
    .filter((segment) => segment.length > 0);
}

/** Field names that denote a credential (`DB_PASSWORD`, `apiKey`, `x-api-key`). */
function isCredentialFieldName(name: string): boolean {
  const segments = splitCredentialFieldNameSegments(name);
  // Descriptive modifiers (`token_count`, `token_limit`, `tokenPolicy`,
  // `token-count`) describe metrics, not credentials.
  if (segments.length >= 2 && DESCRIPTIVE_FIELD_NAME_SUFFIX_SEGMENTS.has(segments[segments.length - 1])) {
    return false;
  }
  if (segments.some((segment) => CREDENTIAL_FIELD_NAME_SEGMENTS.has(segment))) {
    return true;
  }
  for (let index = 1; index < segments.length; index++) {
    if (segments[index] === 'key' && CREDENTIAL_KEY_QUALIFIER_SEGMENTS.has(segments[index - 1])) {
      return true;
    }
  }
  // SCREAMING_SNAKE env names ending in `_KEY` (`ANTHROPIC_KEY`).
  return /^[A-Z][A-Z0-9_]*_KEY$/.test(name);
}

/**
 * Credential contexts whose values are masked without the prose word guard:
 * header forms (`Authorization`, `Bearer`), specific key/token compounds
 * (`api_key`, `access_token`, `x-api-key`), and SCREAMING_SNAKE `_KEY` names.
 */
function isStrongCredentialFieldName(name: string): boolean {
  const segments = splitCredentialFieldNameSegments(name);
  if (segments.includes('authorization') || segments.includes('apikey') || /^bearer$/i.test(name)) {
    return true;
  }
  for (let index = 1; index < segments.length; index++) {
    const noun = segments[index];
    const qualifier = segments[index - 1];
    if (noun === 'key' && CREDENTIAL_KEY_QUALIFIER_SEGMENTS.has(qualifier)) {
      return true;
    }
    if (noun === 'token' && CREDENTIAL_TOKEN_QUALIFIER_SEGMENTS.has(qualifier)) {
      return true;
    }
  }
  return /^[A-Z][A-Z0-9_]*_KEY$/.test(name);
}

/** Field name of a shared-pattern match, taken from its capture prefix. */
function assignmentFieldNameFromPrefix(prefix: string): string {
  const match = /([A-Za-z_][A-Za-z0-9_-]*)[ \t]*[:=][ \t]*$/.exec(prefix);
  return match ? match[1] : '';
}

function collectUserMessageSecretRanges(text: string): UserMessageSecretRange[] {
  const ranges: UserMessageSecretRange[] = [];

  const collectFrom = (pattern: RegExp, shape: SecretValueShape): void => {
    // Clone so shared module-level regexes never carry `lastIndex` state here.
    const scoped = new RegExp(pattern.source, pattern.flags);
    const wholeMatch = shape === 'pem-block' || shape === 'provider-token' || shape === 'generic-token';
    for (const match of text.matchAll(scoped)) {
      const matchIndex = match.index ?? 0;
      if (wholeMatch) {
        if (isAcceptableSecretValue(match[0], shape, { assigned: false, strong: false, quoted: false })) {
          ranges.push({ start: matchIndex, end: matchIndex + match[0].length });
        }
        continue;
      }
      // Shared capture convention: group 1 = prefix, group 2 = value.
      const prefix = match[1];
      const value = match[2];
      if (prefix === undefined || value === undefined) {
        continue;
      }
      const assignedWithEquals = /=\s*$/.test(prefix);
      const strongContext = assignedWithEquals
        || /authorization|bearer/i.test(prefix)
        || isStrongCredentialFieldName(assignmentFieldNameFromPrefix(prefix));
      // CLI quoted values (`--password "synth phrase 123"`) arrive complete
      // with their quotes; treat them as deliberate literals so valid spaces
      // inside are masked (quotes stay outside the mask via affix trimming).
      const valueWasQuoted = /^(["'`])[\s\S]*\1$/.test(value);
      if (!isAcceptableSecretValue(value, shape, { assigned: assignedWithEquals, strong: strongContext, quoted: valueWasQuoted })) {
        continue;
      }
      const valueStart = matchIndex + prefix.length;
      ranges.push({ start: valueStart, end: valueStart + value.length });
    }
  };

  for (const entry of SHARED_SECRET_DISPLAY_PATTERNS) {
    collectFrom(DIAGNOSTIC_REDACTION_PATTERNS[entry.index], entry.shape);
  }
  for (const entry of DISPLAY_ONLY_SECRET_PATTERNS) {
    collectFrom(entry.pattern, entry.shape);
  }

  // A successfully quote-parsed value is authoritative: shared patterns whose
  // value capture stops at whitespace (`"<your`, `"synth`) must not mask
  // inside the quoted extent. Placeholder inners suppress masking entirely.
  const protectedExtents: UserMessageSecretRange[] = [];
  const assignmentRanges: UserMessageSecretRange[] = [];
  collectUserMessageAssignmentRanges(text, assignmentRanges, protectedExtents);
  const nonOverlapping = ranges.filter((range) =>
    !protectedExtents.some((extent) => range.end > extent.start && range.start < extent.end));

  return [...nonOverlapping, ...assignmentRanges];
}

/**
 * Bounded linear scan over every `:` / `=` separator. Replaces the previous
 * unanchored name-value regexes, whose unbounded name run made long
 * separator-free text backtrack quadratically. Names and values carry hard
 * length caps, and the value walk stops at whitespace, non-ASCII, and
 * markup/quote boundaries so Markdown and JSON punctuation survives masking.
 */
function collectUserMessageAssignmentRanges(
  text: string,
  ranges: UserMessageSecretRange[],
  protectedExtents: UserMessageSecretRange[],
): void {
  for (let index = 0; index < text.length; index++) {
    const separatorCode = text.charCodeAt(index);
    if (separatorCode !== 58 /* : */ && separatorCode !== 61 /* = */) {
      continue;
    }
    const name = readAssignmentFieldName(text, index);
    if (!name || !isCredentialFieldName(name.token)) {
      continue;
    }
    const value = readAssignmentValueRange(text, index);
    if (!value) {
      continue;
    }
    if (value.quotedExtent) {
      protectedExtents.push(value.quotedExtent);
    }
    // Quoted names mean config syntax (`"password": "…"`) — word-like values
    // are masked there, same as `=` assignments.
    const assigned = separatorCode === 61 || name.quoted;
    // Unquoted colon-form values followed by more words on the same line are
    // prose (`api_key: always use …`), not first-word credentials; only a
    // line-final single value (`api_key: abcxyz`) is masked. `=` assignments
    // keep their config grammar (value = first token).
    if (!value.quoted
      && separatorCode !== 61
      && plainValueLineHasTrailingWords(text, value.end)) {
      protectedExtents.push({ start: name.start, end: value.end });
      continue;
    }
    if (!isAcceptableSecretValue(value.token, 'typed', {
      assigned,
      strong: isStrongCredentialFieldName(name.token),
      quoted: value.quoted,
    })) {
      continue;
    }
    ranges.push({ start: value.start, end: value.end });
  }
}

interface AssignmentFieldName {
  token: string;
  quoted: boolean;
  start: number;
  end: number;
}

/** Backward bounded walk from a separator to the assignment field name. */
function readAssignmentFieldName(text: string, separatorIndex: number): AssignmentFieldName | null {
  let nameEnd = separatorIndex;
  while (nameEnd > 0 && isAssignmentSpaceCharCode(text.charCodeAt(nameEnd - 1))) {
    nameEnd--;
  }
  // JSON/YAML-style quoted field names (`"apiKey": …`) count as config
  // syntax; keep the closing quote inside the name token.
  let quoted = false;
  const charBeforeName = nameEnd > 0 ? text.charAt(nameEnd - 1) : '';
  if (charBeforeName === '"' || charBeforeName === "'" || charBeforeName === '`') {
    nameEnd--;
    quoted = true;
  }
  let nameStart = nameEnd;
  while (nameStart > 0
    && nameEnd - nameStart < ASSIGNMENT_NAME_MAX_LENGTH
    && isAssignmentNameCharCode(text.charCodeAt(nameStart - 1))) {
    nameStart--;
  }
  if (nameEnd === nameStart) {
    return null;
  }
  // The name must not start mid-word (`mytoken=...`, `keywords:`).
  if (nameStart > 0 && isAssignmentNameCharCode(text.charCodeAt(nameStart - 1))) {
    return null;
  }
  const token = text.slice(nameStart, nameEnd).replace(/^["'`]+|["'`]+$/g, '');
  if (!/^[A-Za-z_]/.test(token)) {
    return null;
  }
  return { token, quoted, start: nameStart, end: nameEnd };
}

/** Forward bounded value parse: quoted (escape-aware) or plain printable ASCII. */
function readAssignmentValueRange(
  text: string,
  separatorIndex: number,
): { start: number; end: number; token: string; quoted: boolean; quotedExtent: UserMessageSecretRange | null } | null {
  let valueStart = separatorIndex + 1;
  while (valueStart < text.length && isAssignmentSpaceCharCode(text.charCodeAt(valueStart))) {
    valueStart++;
  }

  let start = -1;
  let end = -1;
  let quoted = false;
  let quotedExtent: UserMessageSecretRange | null = null;
  const quote = text.charAt(valueStart);
  if (quote === '"' || quote === "'" || quote === '`') {
    const quotedRange = parseQuotedAssignmentValue(text, valueStart, quote);
    if (quotedRange) {
      start = quotedRange.start;
      end = quotedRange.end;
      quoted = true;
      quotedExtent = { start: valueStart, end: quotedRange.end + 1 };
    }
  }

  if (start < 0) {
    const plain = parsePlainAssignmentValue(text, valueStart);
    if (!plain) {
      return null;
    }
    start = plain.start;
    end = plain.end;
    // `Authorization: Bearer <token>`: the scheme word names the token.
    if (/^(?:bearer|basic)$/i.test(text.slice(start, end))) {
      const token = readNextPrintableToken(text, end);
      if (!token) {
        return null;
      }
      start = token.start;
      end = token.end;
    }
  }

  // Trailing punctuation/quotes belong to the sentence, not the credential.
  while (start < end && ASSIGNMENT_VALUE_TRAILING_AFFIX.test(text.charAt(end - 1))) {
    end--;
  }
  while (start < end && ASSIGNMENT_VALUE_LEADING_AFFIX.test(text.charAt(start))) {
    start++;
  }
  const token = text.slice(start, end);
  return token ? { start, end, token, quoted, quotedExtent } : null;
}

/** `"…"`, `'…'` (escape-aware) or Markdown `` `…` ``; null when unterminated. */
function parseQuotedAssignmentValue(
  text: string,
  valueStart: number,
  quote: string,
): { start: number; end: number } | null {
  let cursor = valueStart + 1;
  while (cursor < text.length && cursor - valueStart <= ASSIGNMENT_VALUE_MAX_LENGTH) {
    const charCode = text.charCodeAt(cursor);
    if ((quote === '"' || quote === "'") && charCode === 92 /* \ */ && cursor + 1 < text.length) {
      cursor += 2;
      continue;
    }
    if (charCode === 10 /* \n */) {
      return null;
    }
    if (text.charAt(cursor) === quote) {
      return { start: valueStart + 1, end: cursor };
    }
    cursor++;
  }
  return null;
}

/** Printable ASCII until whitespace, non-ASCII, or markup punctuation. */
function parsePlainAssignmentValue(
  text: string,
  valueStart: number,
): { start: number; end: number } | null {
  let cursor = valueStart;
  while (cursor < text.length && cursor - valueStart < ASSIGNMENT_VALUE_MAX_LENGTH) {
    const charCode = text.charCodeAt(cursor);
    if (charCode < 33 || charCode > 126) {
      break;
    }
    if (charCode === 59 /* ; */ || charCode === 34 || charCode === 39 || charCode === 96 || charCode === 60 /* < */) {
      break;
    }
    if ((charCode === 58 /* : */ || charCode === 61 /* = */) && cursor + 1 < text.length && isAssignmentNameCharCode(text.charCodeAt(cursor + 1))) {
      break;
    }
    cursor++;
  }
  return cursor === valueStart ? null : { start: valueStart, end: cursor };
}

function readNextPrintableToken(text: string, from: number): { start: number; end: number } | null {
  let next = from;
  while (next < text.length && isAssignmentSpaceCharCode(text.charCodeAt(next))) {
    next++;
  }
  let tokenEnd = next;
  while (tokenEnd < text.length && text.charCodeAt(tokenEnd) >= 33 && text.charCodeAt(tokenEnd) <= 126) {
    tokenEnd++;
  }
  return tokenEnd > next ? { start: next, end: tokenEnd } : null;
}

/**
 * True when the same line continues with another word after the value token
 * (`api_key: always use …` is prose, `api_key: abcxyz` is a value). Bounded
 * look-ahead; line end and sentence-final punctuation stop the scan.
 */
function plainValueLineHasTrailingWords(text: string, tokenEnd: number): boolean {
  const lookAheadLimit = Math.min(text.length, tokenEnd + 200);
  for (let index = tokenEnd; index < lookAheadLimit; index++) {
    const char = text.charAt(index);
    if (char === '\n' || char === '.' || char === '!' || char === '?') {
      return false;
    }
    if (char === ' ' || char === '\t') {
      continue;
    }
    if (/[A-Za-z0-9]/.test(char)) {
      let wordEnd = index;
      while (wordEnd < lookAheadLimit && /[A-Za-z0-9]/.test(text.charAt(wordEnd))) {
        wordEnd++;
      }
      return wordEnd - index >= 2;
    }
  }
  return false;
}

function isAssignmentNameCharCode(code: number): boolean {
  return (code >= 97 && code <= 122) || (code >= 65 && code <= 90) || (code >= 48 && code <= 57) || code === 95 || code === 45;
}

function isAssignmentSpaceCharCode(code: number): boolean {
  return code === 32 || code === 9;
}

function mergeOverlappingSecretRanges(ranges: UserMessageSecretRange[]): UserMessageSecretRange[] {
  const sorted = [...ranges].sort((left, right) => left.start - right.start || left.end - right.end);
  const merged: UserMessageSecretRange[] = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end) {
      last.end = Math.max(last.end, range.end);
      continue;
    }
    merged.push({ ...range });
  }
  return merged;
}

/**
 * Bounded markup decoding used only for detection: numeric/named HTML entities
 * and `%XX` percent escapes resolve to the characters a Markdown renderer or
 * URL parser would actually display (`gh&#112;_…` renders as `ghp_…`), so
 * credentials cannot hide behind encodings. Single pass, fixed-length decodes
 * only — no recursive, nested, or base64 decoding — with a raw-index map so
 * detected ranges mask the raw text.
 */
const NUMERIC_ENTITY_REGEX = /&#(?:x([0-9a-fA-F]{1,6})|(\d{1,7}));/y;
const PERCENT_ESCAPE_REGEX = /%([0-9a-fA-F]{2})/y;
// Single-level named entities only (CommonMark core + nbsp); no nested decode.
const MARKUP_NAMED_ENTITIES: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00A0' };

/** `rawIndexAt[decodedIndex]` = raw index where that decoded character starts (+1 sentinel). */
interface UserMessageDecodedText {
  decoded: string;
  rawIndexAt: number[];
}

function decodeUserMessageMarkupBounded(text: string): UserMessageDecodedText {
  let decoded = '';
  const rawIndexAt: number[] = [];
  const pushDecoded = (chars: string, rawStart: number): void => {
    for (let offset = 0; offset < chars.length; offset++) {
      rawIndexAt.push(rawStart);
    }
    decoded += chars;
  };

  let index = 0;
  while (index < text.length) {
    const char = text.charAt(index);
    if (char === '&') {
      const namedMatch = /^([A-Za-z]{2,10});/.exec(text.slice(index + 1, index + 12));
      const namedName = namedMatch?.[1] ?? '';
      const named = MARKUP_NAMED_ENTITIES[namedName] ?? MARKUP_NAMED_ENTITIES[namedName.toLowerCase()];
      if (named !== undefined && namedMatch) {
        pushDecoded(named, index);
        index += 1 + namedMatch[0].length;
        continue;
      }
      NUMERIC_ENTITY_REGEX.lastIndex = index;
      const numeric = NUMERIC_ENTITY_REGEX.exec(text);
      if (numeric) {
        const value = numeric[1] ? parseInt(numeric[1], 16) : parseInt(numeric[2], 10);
        if (value > 0 && value <= 0x10FFFF) {
          try {
            const converted = String.fromCodePoint(value);
            pushDecoded(converted, index);
            index += numeric[0].length;
            continue;
          } catch {
            // Invalid code point: fall through to literal copy.
          }
        }
      }
    }
    if (char === '%') {
      PERCENT_ESCAPE_REGEX.lastIndex = index;
      const percent = PERCENT_ESCAPE_REGEX.exec(text);
      if (percent) {
        pushDecoded(String.fromCharCode(parseInt(percent[1], 16)), index);
        index += percent[0].length;
        continue;
      }
    }
    pushDecoded(char, index);
    index++;
  }
  rawIndexAt.push(text.length);
  return { decoded, rawIndexAt };
}

/**
 * Mask credential-shaped substrings in sent user message text for display and
 * default copy. Pure function; the caller keeps using the original message
 * content for persistence, model input, rewind, and fork. Detection runs on a
 * bounded markup-decoded view (HTML entities, percent escapes) and masks the
 * raw text; edge punctuation/quotes stay outside the mask.
 */
export function maskUserMessageSecretsForDisplay(text: string): string {
  if (!text) {
    return text;
  }

  const decoded = decodeUserMessageMarkupBounded(text);
  const decodedRanges = mergeOverlappingSecretRanges(collectUserMessageSecretRanges(decoded.decoded));
  const rawRanges = mergeOverlappingSecretRanges(decodedRanges.map((range) => ({
    start: decoded.rawIndexAt[range.start] ?? 0,
    end: decoded.rawIndexAt[range.end] ?? text.length,
  })));
  if (rawRanges.length === 0) {
    return text;
  }

  let result = text;
  for (let index = rawRanges.length - 1; index >= 0; index--) {
    let start = rawRanges[index].start;
    let end = rawRanges[index].end;
    // Edge punctuation/quotes belong to the sentence, not the credential.
    while (end > start && ASSIGNMENT_VALUE_TRAILING_AFFIX.test(result.charAt(end - 1))) {
      end--;
    }
    while (start < end && ASSIGNMENT_VALUE_LEADING_AFFIX.test(result.charAt(start))) {
      start++;
    }
    if (end <= start) {
      continue;
    }
    result = result.slice(0, start) + USER_MESSAGE_SECRET_MASK_TEXT + result.slice(end);
  }
  return result;
}
