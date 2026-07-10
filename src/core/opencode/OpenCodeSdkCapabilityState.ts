/**
 * Pure capability availability resolver.
 *
 * Given a capability's installed-SDK presence, live-server support, user opt-in
 * gate, and safety class, this resolver decides one of five availability kinds.
 *
 * Resolution priority (highest first):
 *   1. `sdk === false`             → `unsupported-by-sdk`
 *   2. `server === false`          → `unsupported-by-server`
 *   3. `gate === false`            → `disabled-by-user`
 *   4. `server === 'unknown'`      → `unknown` (transient transport failure; never promoted to unsupported)
 *   5. all clear                    → `available`
 *
 * Note on ordering between `gate(false)` and `server('unknown')`: a user opt-out
 * takes precedence over transport uncertainty. If the user disabled the gate, we
 * report `disabled-by-user` regardless of whether the server is reachable. The
 * `unknown` kind is only reported when the gate is open but we cannot confirm
 * server support due to a transient failure.
 */

export type OpenCodeSdkCapabilitySafety = 'read-only' | 'state-changing' | 'experimental-action' | 'stream';

export interface OpenCodeSdkCapabilityAvailabilityInput {
  /** The method is present on the installed SDK package client class. */
  readonly sdk: boolean;
  /**
   * Live server support for the endpoint.
   * - `true`  → server answered successfully.
   * - `false` → server explicitly lacks the endpoint (404 / "is unavailable").
   * - `'unknown'` → transient transport failure; do NOT treat as unsupported.
   */
  readonly server: boolean | 'unknown';
  /** User opt-in gate resolved from settings. */
  readonly gate: boolean;
  /** Risk classification of the capability. */
  readonly safety: OpenCodeSdkCapabilitySafety;
}

export type OpenCodeSdkCapabilityReasonCode =
  | 'unsupported-by-sdk'
  | 'unsupported-by-server'
  | 'disabled-by-user'
  | 'unknown';

export type OpenCodeSdkCapabilityAvailability =
  | { readonly kind: 'available' }
  | {
      readonly kind: 'unsupported-by-sdk';
      readonly reason: string;
      readonly reasonCode: 'unsupported-by-sdk';
    }
  | {
      readonly kind: 'unsupported-by-server';
      readonly reason: string;
      readonly reasonCode: 'unsupported-by-server';
      readonly minimumServerHint?: string;
    }
  | {
      readonly kind: 'disabled-by-user';
      readonly reason: string;
      readonly reasonCode: 'disabled-by-user';
    }
  | {
      readonly kind: 'unknown';
      readonly reason: string;
      readonly reasonCode: 'unknown';
    };

const REASONS = {
  unsupportedBySdk: 'Capability is not present in the installed OpenCode SDK client.',
  unsupportedByServer: 'The connected OpenCode server does not expose this endpoint.',
  disabledByUser: 'Capability is disabled by the user opt-in gate.',
  unknown: 'Capability support could not be confirmed (transient transport failure).',
} as const;

/**
 * Resolve a capability's availability from its SDK/server/gate/safety inputs.
 *
 * Pure: no I/O, no logging, no mutation. Safe to call from any context.
 */
export function resolveCapabilityAvailability(
  input: OpenCodeSdkCapabilityAvailabilityInput,
): OpenCodeSdkCapabilityAvailability {
  if (!input.sdk) {
    return {
      kind: 'unsupported-by-sdk',
      reason: REASONS.unsupportedBySdk,
      reasonCode: 'unsupported-by-sdk',
    };
  }

  if (input.server === false) {
    return {
      kind: 'unsupported-by-server',
      reason: REASONS.unsupportedByServer,
      reasonCode: 'unsupported-by-server',
    };
  }

  if (!input.gate) {
    return {
      kind: 'disabled-by-user',
      reason: REASONS.disabledByUser,
      reasonCode: 'disabled-by-user',
    };
  }

  if (input.server === 'unknown') {
    return {
      kind: 'unknown',
      reason: REASONS.unknown,
      reasonCode: 'unknown',
    };
  }

  return { kind: 'available' };
}
