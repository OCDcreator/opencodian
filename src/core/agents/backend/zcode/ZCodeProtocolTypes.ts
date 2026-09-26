/**
 * ZCode Protocol message envelope types and boundary validation.
 *
 * The official ZCode `app-server --stdio` runtime speaks a JSON-RPC-like
 * NDJSON protocol that deliberately OMITS the `jsonrpc` field: the runtime
 * rejects outbound messages carrying it ("Invalid ZCode Protocol message"),
 * so serialization here must never add one. Inbound frames are validated at
 * this boundary only; unknown notification methods and unknown fields are
 * tolerated (additive protocol drift) and surfaced as data instead of
 * breaking the stream.
 *
 * Message shapes observed against the official runtime:
 * - request          `{ id, method, params? }`        (host → agent)
 * - notification     `{ method, params? }`            (agent → host)
 * - response         `{ id, result }`                 (agent → host)
 * - error response   `{ id, error: { code, message, data? } }`
 * - server request   `{ id, method, params? }`        (agent → host, e.g. permission asks)
 */

/** Numeric error codes emitted by the official runtime (switch on these, never on message text). */
export const ZCodeProtocolErrorCode = {
  /** The peer could not parse the message envelope. */
  InvalidMessage: -32600,
  /** The requested method is unknown to this runtime version. */
  MethodNotFound: -32601,
  /** Params failed schema validation. */
  InvalidParams: -32602,
  /** Internal failure, including "client connection closed" during teardown. */
  Internal: -32603,
} as const;

/** Structured error carried on an error response. */
export interface ZCodeProtocolError {
  readonly code: number;
  readonly message: string;
  readonly data?: unknown;
}

/** Outbound request envelope (host → agent). Never carries `jsonrpc`. */
export interface ZCodeProtocolRequest {
  readonly id: string;
  readonly method: string;
  readonly params?: Record<string, unknown>;
}

/** Outbound reply to a server-initiated request. Never carries `jsonrpc`. */
export type ZCodeProtocolServerRequestReply =
  | { readonly id: string; readonly result: unknown }
  | { readonly id: string; readonly error: ZCodeProtocolError };

/** A validated inbound frame. */
export type ZCodeInboundMessage =
  | { readonly kind: 'response'; readonly id: string; readonly result: unknown }
  | { readonly kind: 'error'; readonly id: string; readonly error: ZCodeProtocolError }
  | { readonly kind: 'notification'; readonly method: string; readonly params: Record<string, unknown> }
  | { readonly kind: 'server-request'; readonly id: string; readonly method: string; readonly params: Record<string, unknown> }
  | { readonly kind: 'invalid'; readonly reason: ZCodeInboundInvalidReason };

/** Why an inbound frame failed boundary validation. */
export type ZCodeInboundInvalidReason =
  | 'malformed-json'
  | 'not-an-object'
  | 'unrecognized-envelope'
  | 'missing-result-and-error'
  | 'invalid-error-shape'
  | 'invalid-id-type';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeId(value: unknown): string | null {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function parseParams(value: unknown): Record<string, unknown> {
  return isPlainObject(value) ? value : {};
}

/**
 * Validate one NDJSON line into a typed inbound message. Never throws: a
 * frame that cannot be trusted is returned as `{ kind: 'invalid' }` so the
 * caller can count violations and degrade honestly instead of crashing.
 */
export function parseZCodeInboundMessage(line: string): ZCodeInboundMessage {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return { kind: 'invalid', reason: 'malformed-json' };
  }
  if (!isPlainObject(raw)) {
    return { kind: 'invalid', reason: 'not-an-object' };
  }

  const method = raw['method'];
  const rawId = raw['id'];
  const hasMethod = typeof method === 'string';
  const hasId = rawId !== undefined && rawId !== null;

  if (hasMethod) {
    const params = parseParams(raw['params']);
    if (hasId) {
      const id = normalizeId(rawId);
      if (id === null) {
        return { kind: 'invalid', reason: 'invalid-id-type' };
      }
      return { kind: 'server-request', id, method: method as string, params };
    }
    return { kind: 'notification', method: method as string, params };
  }

  if (hasId) {
    const id = normalizeId(rawId);
    if (id === null) {
      return { kind: 'invalid', reason: 'invalid-id-type' };
    }
    if ('error' in raw) {
      const error = raw['error'];
      if (!isPlainObject(error) || typeof error['code'] !== 'number' || typeof error['message'] !== 'string') {
        return { kind: 'invalid', reason: 'invalid-error-shape' };
      }
      const parsed: ZCodeProtocolError = {
        code: error['code'] as number,
        message: error['message'] as string,
        ...(error['data'] !== undefined ? { data: error['data'] } : {}),
      };
      return { kind: 'error', id, error: parsed };
    }
    if ('result' in raw) {
      return { kind: 'response', id, result: raw['result'] };
    }
    return { kind: 'invalid', reason: 'missing-result-and-error' };
  }

  return { kind: 'invalid', reason: 'unrecognized-envelope' };
}

/**
 * Serialize an outbound request frame. The result must stay free of the
 * `jsonrpc` field — the official runtime rejects messages carrying one.
 */
export function serializeZCodeRequest(request: ZCodeProtocolRequest): string {
  const frame: Record<string, unknown> = { id: request.id, method: request.method };
  if (request.params !== undefined) {
    frame['params'] = request.params;
  }
  return JSON.stringify(frame);
}

/** Serialize an outbound reply to a server-initiated request. */
export function serializeZCodeServerRequestReply(reply: ZCodeProtocolServerRequestReply): string {
  return JSON.stringify(reply);
}

/**
 * Result of the `runtime/capabilities` capability negotiation. Known flags
 * are surfaced explicitly; anything the runtime reported beyond them is kept
 * in `raw` so version drift stays visible instead of being discarded.
 */
export interface ZCodeRuntimeCapabilities {
  readonly independentPlanState: boolean | null;
  readonly raw: Record<string, unknown>;
}

/**
 * Parse a `runtime/capabilities` result. Unknown fields are tolerated and
 * preserved; absent known flags stay `null` (unavailable), never fabricated.
 */
export function parseZCodeRuntimeCapabilities(result: unknown): ZCodeRuntimeCapabilities {
  const raw = isPlainObject(result) ? result : {};
  const independentPlanState = typeof raw['independentPlanState'] === 'boolean'
    ? raw['independentPlanState']
    : null;
  return { independentPlanState, raw };
}

/** Startup/storage notification payload (agent → host), validated loosely. */
export interface ZCodeStartupStorageState {
  readonly method: 'startup/storageState' | 'startup/storagePath' | 'startup/storagePrepared' | string;
  readonly params: Record<string, unknown>;
}

/** Test-only escape hatch shape used by the transport reply path. */
export function zCodeMethodNotFoundReply(id: string, method: string): ZCodeProtocolServerRequestReply {
  return {
    id,
    error: {
      code: ZCodeProtocolErrorCode.MethodNotFound,
      message: `Method not found: ${method}`,
    },
  };
}

/**
 * Remote error messages are untrusted and can contain arbitrary short secrets,
 * prompts, paths, or attachment bytes. No pattern-based scrubber can prove
 * their absence, so the user-facing diagnostic reports only a fixed category.
 */
export function redactZCodeDiagnosticText(_text: string): string {
  return 'ZCode runtime error; details withheld to protect session data.';
}

export function asRecordValue(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
