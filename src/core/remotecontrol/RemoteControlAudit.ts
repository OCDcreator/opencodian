import { createHash } from 'crypto';

import {
  type TraceEventBase,
  TraceRedactor,
  type TraceSeverity,
  TraceStore,
  type TraceStoreStatus,
} from '../../shared/diagnostics';
import { REMOTE_CONTROL_FINGERPRINT_HEX_CHARS } from './RemoteControlAuth';

/**
 * R-C6 remote control audit trail (core.remotecontrol owner).
 *
 * Security-forensic record of every request reaching the loopback listener,
 * persisted on the repo's shared diagnostics foundation (`TraceStore`,
 * structural retention 7 days / 50 MB, rolling window — never a permanent
 * ledger, never inside the vault).
 *
 * Deliberate content contract (flowtext-c6-design.md §6.2):
 * - the instruction is stored as `charLength` + first 12 hex of its sha256 —
 *   never any body fragment, and v1 ships NO debug content-capture switch, so
 *   the requirement's exemption clause stays unused by construction;
 * - the access token is stored as a fingerprint only;
 * - every payload additionally passes the hardened redactor (known secrets
 *   include the live token) at append time, and exports pass the shared
 *   report sanitizer on top — dual redaction, per design §5.4.
 */

export const REMOTE_CONTROL_AUDIT_TRACE_ID = 'remote-control-audit';
export const REMOTE_CONTROL_AUDIT_SCHEMA_VERSION = 1;
export const REMOTE_CONTROL_AUDIT_CHANNEL = 'remote-control';

const INSTRUCTION_DIGEST_HEX_CHARS = 12;

export interface RemoteControlAuditEvent extends TraceEventBase {
  channel: typeof REMOTE_CONTROL_AUDIT_CHANNEL;
}

export interface RemoteControlInstructionDigest {
  charLength: number;
  sha256Prefix12: string;
}

export interface RemoteControlRequestSource {
  remoteAddress: string;
  remotePort: number;
  host: string | undefined;
}

/**
 * Instruction summary: length + sha256 prefix. Contains no substring of the
 * instruction itself, so the audit can never become a content channel.
 */
export function deriveInstructionSummary(instruction: string): RemoteControlInstructionDigest {
  const digest = createHash('sha256').update(instruction, 'utf8').digest('hex');
  return {
    charLength: instruction.length,
    sha256Prefix12: digest.slice(0, INSTRUCTION_DIGEST_HEX_CHARS),
  };
}

/** Token fingerprint for audit records (never the token itself). */
export function deriveAuditFingerprint(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
    .slice(0, REMOTE_CONTROL_FINGERPRINT_HEX_CHARS);
}

export interface RemoteControlAuditOptions {
  /** Injectable for tests; production uses the shared diagnostics default. */
  directory?: string;
  /**
   * Dynamically collected known secrets (live remote-control token plus the
   * settings' existing api keys). A getter so rotations apply immediately.
   */
  knownSecrets?: () => readonly string[];
  vaultPath?: string;
}

export class RemoteControlAudit {
  readonly store: TraceStore<RemoteControlAuditEvent>;
  private readonly redactor: TraceRedactor;
  private sequence = 0;

  constructor(options: RemoteControlAuditOptions = {}) {
    this.store = new TraceStore<RemoteControlAuditEvent>(
      options.directory || undefined,
      undefined,
      {
        bundlePrefix: 'remote-control',
        sanitizeExport: (content) => this.redactExportContent(content),
      },
    );
    this.redactor = new TraceRedactor({
      vaultPath: options.vaultPath,
      diagnosticsPath: this.store.rootDirectory,
      knownSecrets: options.knownSecrets,
      redactionMode: 'hardened',
    });
  }

  /**
   * Emit one audit event. Payloads are redacted through the hardened redactor
   * before they ever reach the store queue; audit failures are contained and
   * never propagate into the request path.
   */
  emit(
    name: string,
    severity: TraceSeverity,
    payload: Record<string, unknown>,
    sessionId?: string,
  ): void {
    try {
      this.sequence += 1;
      const redacted = this.redactor.redact(payload).value;
      const event: RemoteControlAuditEvent = {
        schemaVersion: REMOTE_CONTROL_AUDIT_SCHEMA_VERSION,
        timestamp: new Date().toISOString(),
        monotonicSequence: this.sequence,
        traceId: REMOTE_CONTROL_AUDIT_TRACE_ID,
        runtimeSegmentId: `${REMOTE_CONTROL_AUDIT_TRACE_ID}-${this.sequence}`,
        sessionId,
        channel: REMOTE_CONTROL_AUDIT_CHANNEL,
        source: REMOTE_CONTROL_AUDIT_CHANNEL,
        severity,
        name,
        payload: redacted,
        payloadRef: { kind: 'inline' },
      };
      this.store.append(event);
    } catch {
      // Audit is best-effort forensics: a redaction/append failure must never
      // break the request pipeline. Storage degradation is recorded by the
      // TraceStore itself (memory mode + droppedEvents).
    }
  }

  getStatus(): TraceStoreStatus {
    return this.store.getStatus();
  }

  async flush(): Promise<void> {
    await this.store.flush();
  }

  async dispose(): Promise<void> {
    await this.store.dispose();
  }

  /** Mirrors the Claude trace export contract: per-line hardened redaction. */
  private redactExportContent(content: string): string {
    return content.split('\n').map((line) => {
      if (!line) return line;
      try {
        return JSON.stringify(this.redactor.redact(JSON.parse(line)).value);
      } catch {
        const redacted = this.redactor.redact(line).value;
        return typeof redacted === 'string' ? redacted : JSON.stringify(redacted);
      }
    }).join('\n');
  }
}
