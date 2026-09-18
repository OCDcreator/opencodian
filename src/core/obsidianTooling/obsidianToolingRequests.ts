/**
 * Request/decision file schema for the R-B4 confirmation handshake (pure).
 *
 * The gate script writes `<id>.request.json` (atomically via tmp+rename) and
 * polls for `<id>.decision.json`. The coordinator validates requests, shows
 * the confirmation dialog, and writes decisions. Everything here is pure so
 * the fail-closed validation rules are unit-testable without the app.
 */

import { classifyObsidianSubcommand } from './obsidianToolingCatalog';

/** Decisions the plugin can write. `invalid` answers malformed requests so a polling wrapper stops early instead of timing out blind. */
export type ObsidianToolingDecision = 'allow' | 'deny' | 'expired' | 'invalid';

export interface ObsidianToolingRequest {
  readonly id: string;
  readonly subcommand: string;
  readonly argv: readonly string[];
  readonly requestedAt: number;
  readonly waitSeconds: number;
  readonly gateDir?: string;
}

export type ParsedToolingRequest =
  | { ok: true; request: ObsidianToolingRequest }
  | { ok: false; reason: string };

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,80}$/;
const MAX_ARGV_ENTRIES = 32;
const MAX_ARG_LENGTH = 2000;
const MAX_SUBCOMMAND_LENGTH = 64;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isMissingString(value: unknown, max: number): boolean {
  return typeof value !== 'string' || value.length === 0 || value.length > max;
}

/** The first non-flag, non key=value argument (the subcommand slot). */
function firstPositional(argv: readonly string[]): string | undefined {
  return argv.find((arg) => !arg.startsWith('-') && !arg.includes('='));
}

/** Validate argv shape + consistency with the declared subcommand. */
function validateArgv(record: Record<string, unknown>, subcommand: string): string | null {
  const argv = record.argv;
  if (!Array.isArray(argv) || argv.length === 0 || argv.length > MAX_ARGV_ENTRIES) {
    return 'bad-argv';
  }
  if (argv.some((arg) => typeof arg !== 'string' || arg.length > MAX_ARG_LENGTH)) {
    return 'bad-argv-entry';
  }
  // The argv must actually start with the declared subcommand after global
  // options; otherwise the dialog would show something different from what
  // would run.
  if (firstPositional(argv) !== subcommand) {
    return 'argv-subcommand-mismatch';
  }
  return null;
}

/** Validate the request envelope fields (id, timing, optional gateDir). */
function validateEnvelope(record: Record<string, unknown>): { reason: string; subcommand: string } | { reason: string } | null {
  const id = record.id;
  if (typeof id !== 'string' || !REQUEST_ID_PATTERN.test(id)) {
    return { reason: 'bad-id' };
  }
  const subcommand = record.subcommand;
  if (isMissingString(subcommand, MAX_SUBCOMMAND_LENGTH)) {
    return { reason: 'bad-subcommand' };
  }
  const requestedAt = record.requestedAt;
  if (!isFiniteNumber(requestedAt) || requestedAt < 0) {
    return { reason: 'bad-requestedAt' };
  }
  const waitSeconds = record.waitSeconds;
  if (!isFiniteNumber(waitSeconds) || waitSeconds <= 0 || waitSeconds > 3600) {
    return { reason: 'bad-waitSeconds' };
  }
  const gateDir = record.gateDir;
  if (gateDir !== undefined && typeof gateDir !== 'string') {
    return { reason: 'bad-gateDir' };
  }
  return null;
}

/**
 * Validate a raw request file body. Deliberately strict: anything outside the
 * expected shape is rejected (the wrapper then gets `invalid` / an unreadable
 * decision and refuses to execute — fail closed).
 */
export function parseToolingRequest(raw: string): ParsedToolingRequest {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'not-json' };
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, reason: 'not-object' };
  }
  const record = data as Record<string, unknown>;
  const envelopeFailure = validateEnvelope(record);
  if (envelopeFailure || typeof record.subcommand !== 'string') {
    return { ok: false, reason: envelopeFailure?.reason ?? 'bad-subcommand' };
  }
  const argvFailure = validateArgv(record, record.subcommand);
  if (argvFailure) {
    return { ok: false, reason: argvFailure };
  }
  const argv = record.argv as string[];
  const requestedAt = record.requestedAt as number;
  const waitSeconds = record.waitSeconds as number;
  const gateDir = record.gateDir;
  return {
    ok: true,
    request: {
      id: record.id as string,
      subcommand: record.subcommand,
      argv: Object.freeze([...argv]),
      requestedAt,
      waitSeconds,
      ...(typeof gateDir === 'string' ? { gateDir } : {}),
    },
  };
}

/**
 * Derive the request id from a watched filename (`<id>.request.json`).
 * Returns null for anything else (tmp files, decision files, noise).
 */
export function toolingRequestIdFromFilename(filename: string): string | null {
  if (!filename.endsWith('.request.json')) {
    return null;
  }
  const id = filename.slice(0, -'.request.json'.length);
  return REQUEST_ID_PATTERN.test(id) && !id.endsWith('.tmp') ? id : null;
}

/** Single-line decision document written by the coordinator. */
export function buildDecisionDocument(decision: ObsidianToolingDecision, decidedAt: number): string {
  return `${JSON.stringify({ decision, decidedAt })}\n`;
}

/**
 * Whether a request classified high-impact is the only kind the coordinator
 * should ever see (the wrapper gates locally), kept as an explicit check so
 * a mis-generated wrapper cannot silently downgrade the dialog.
 */
export function requestRequiresConfirmation(request: ObsidianToolingRequest): boolean {
  return classifyObsidianSubcommand(request.subcommand) === 'high-impact';
}
