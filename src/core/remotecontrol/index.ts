/**
 * R-C6 remote control (core.remotecontrol owner).
 *
 * Token-gated loopback HTTP interface for external drivers: default-off,
 * zero-runtime-cost when off, closed operation whitelist, audited requests.
 * Composition (main.ts) constructs the service, injects the narrow session
 * driver bound to `OpenCodeService`, and forwards settings changes.
 */
export {
  deriveAuditFingerprint,
  deriveInstructionSummary,
  REMOTE_CONTROL_AUDIT_TRACE_ID,
  RemoteControlAudit,
  type RemoteControlAuditEvent,
  type RemoteControlAuditOptions,
  type RemoteControlInstructionDigest,
  type RemoteControlRequestSource,
} from './RemoteControlAudit';
export {
  deriveTokenFingerprint,
  extractBearerToken,
  generateRemoteControlToken,
  isLoopbackBindAddress,
  tokensMatch,
} from './RemoteControlAuth';
export {
  isAllowedRemoteControlHost,
  parseInstructionBody,
  REMOTE_CONTROL_ERROR_CODES,
  REMOTE_CONTROL_MAX_BODY_BYTES,
  REMOTE_CONTROL_MAX_CONNECTIONS,
  REMOTE_CONTROL_MAX_INSTRUCTION_CHARS,
  REMOTE_CONTROL_OPERATIONS,
  REMOTE_CONTROL_PORT,
  REMOTE_CONTROL_SESSION_TITLE,
  REMOTE_CONTROL_TURN_TIMEOUT_MS,
  type RemoteControlBlockedReason,
  type RemoteControlErrorCode,
  type RemoteControlFlightState,
  type RemoteControlLifecycleState,
  type RemoteControlOperation,
  type RemoteControlRuntimeState,
  RemoteControlService,
  type RemoteControlServiceOptions,
  type RemoteControlSessionDriver,
  type RemoteControlTerminalState,
  resolveRemoteControlOperation,
} from './RemoteControlService';
