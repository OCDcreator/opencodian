/**
 * Live server discovery for the OpenCode SDK capability registry.
 *
 * For each registry entry the coordinator:
 *   1. Resolves SDK presence by walking the entry's `sdkPath` on the facade
 *      root and checking `typeof resolved === 'function'`.
 *   2. Probes live server support — but ONLY for `serverProbe === 'read'`
 *      entries (safe read methods). State-changing / experimental entries
 *      (`serverProbe === 'none'` / `'presence'`) are NEVER invoked as a probe;
 *      server support for them is inferred from SDK presence only.
 *   3. Runs each entry's resolved inputs through the pure
 *      {@link resolveCapabilityAvailability} resolver.
 *
 * Failure handling:
 *   - A probe that throws an "is unavailable" error → `server: false`
 *     (the server explicitly lacks the endpoint → `unsupported-by-server`).
 *   - Any other probe failure (transport, timeout, auth, ...) →
 *     `server: 'unknown'` (transient; never promoted to unsupported).
 *
 * Security:
 *   - No secrets, tokens, or raw error bodies are persisted or logged. Probe
 *     failures are reduced to a single redacted class label
 *     (`'endpoint-unavailable' | 'transport'`).
 */

import {
  getOpenCodeSdkCapabilityRegistry,
  type OpenCodeSdkCapabilityDefinition,
} from './OpenCodeSdkCapabilityRegistry';
import {
  type OpenCodeSdkCapabilityAvailability,
  resolveCapabilityAvailability,
} from './OpenCodeSdkCapabilityState';

export type { OpenCodeSdkCapabilityDefinition } from './OpenCodeSdkCapabilityRegistry';
export type { OpenCodeSdkCapabilityAvailability } from './OpenCodeSdkCapabilityState';
import { createLogger } from '../../shared';

const logger = createLogger('OpenCodeSdkCapabilityDiscovery');

export type OpenCodeSdkCapabilityEvidence =
  | { readonly kind: 'present' }
  | { readonly kind: 'advertised' }
  | {
      readonly kind: 'runtime-proven';
      readonly verifiedAt: number;
      readonly buildId: string;
      readonly artifactPath: string;
    }
  | { readonly kind: 'skipped'; readonly reason: 'state-changing-no-probe' }
  | { readonly kind: 'unsupported' }
  | { readonly kind: 'failed'; readonly reason: 'transport' };

/**
 * A single entry in the cached capability snapshot.
 */
export interface OpenCodeSdkCapabilitySnapshotEntry {
  readonly id: string;
  readonly availability: OpenCodeSdkCapabilityAvailability;
  readonly evidence: OpenCodeSdkCapabilityEvidence;
  readonly definition: OpenCodeSdkCapabilityDefinition;
  /** Epoch ms when this entry's server support was last probed. */
  readonly lastChecked?: number;
}

export interface OpenCodeSdkCapabilitySnapshot {
  readonly entries: ReadonlyArray<OpenCodeSdkCapabilitySnapshotEntry>;
  readonly generatedAt: number;
}

/**
 * Typed redacted unsupported result returned by `requireCapability` when a
 * capability is not available. Callers can display `reason` and
 * `minimumServerHint` safely — they never contain secrets, tokens, or raw
 * server error bodies.
 */
export interface OpenCodeUnsupportedCapabilityResult {
  readonly supported: false;
  readonly capabilityId: string;
  readonly kind: OpenCodeSdkCapabilityAvailability['kind'];
  readonly reason: string;
  readonly minimumServerHint?: string;
}

/**
 * Provider for the facade root object (e.g. the `OpenCodeSdkFacade` instance).
 * Returning `null` indicates the facade is not currently available.
 */
export type OpenCodeSdkCapabilityFacadeAccessor = () => unknown | null;

export interface OpenCodeSdkCapabilityDiscoveryHost {
  /** Returns the facade root to resolve `sdkPath` against. May return null. */
  readonly getFacade: OpenCodeSdkCapabilityFacadeAccessor;
  /**
   * Resolves the user opt-in gate for a capability id. Defaults to the
   * definition's `defaultGate` when omitted.
   */
  readonly resolveGate?: (id: string, definition: OpenCodeSdkCapabilityDefinition) => boolean;
  /** Clock injection for deterministic tests. */
  readonly now?: () => number;
}

const UNAVAILABLE_ENDPOINT_PATTERN = /is unavailable/i;
const MINIMUM_SERVER_VERSION_117_PATTERN = /^OpenCode server 1\.17\+$/;
const VERSION_EVIDENCE_EXPERIMENTAL_ACTION_IDS = new Set([
  'v2.pty.create',
  'v2.projectCopy.create',
  'experimental.controlPlane.moveSession',
  'experimental.session.background',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function resolvePath(root: unknown, segments: readonly string[]): unknown {
  let current: unknown = root;
  for (const segment of segments) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[segment];
  }
  return current;
}

function isFunction(value: unknown): value is (...args: unknown[]) => unknown {
  return typeof value === 'function';
}

type RedactedFailureClass = 'endpoint-unavailable' | 'transport';

/**
 * Redact a thrown probe error down to a single class label. The raw message
 * may contain server paths, tokens echoed by misconfigured proxies, etc., so
 * it is never persisted — only the coarse class is kept.
 */
function classifyProbeFailure(error: unknown): RedactedFailureClass {
  const message = error instanceof Error ? error.message : String(error);
  return UNAVAILABLE_ENDPOINT_PATTERN.test(message) ? 'endpoint-unavailable' : 'transport';
}

function isVersionAtLeast117(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false;
  }

  const match = /^(\d+)\.(\d+)/.exec(value.trim());
  if (!match) {
    return false;
  }

  const major = Number(match[1]);
  const minor = Number(match[2]);
  return major > 1 || (major === 1 && minor >= 17);
}

function hasMinimumServer117Hint(definition: OpenCodeSdkCapabilityDefinition): boolean {
  return definition.minimumServerHint !== undefined
    && MINIMUM_SERVER_VERSION_117_PATTERN.test(definition.minimumServerHint);
}

type GlobalHealthEvidence =
  | { readonly kind: 'responded'; readonly supports117: boolean }
  | { readonly kind: 'unsupported' }
  | { readonly kind: 'unknown' };

export class OpenCodeSdkCapabilityDiscoveryCoordinator {
  private readonly registry: readonly OpenCodeSdkCapabilityDefinition[];
  private readonly getFacade: OpenCodeSdkCapabilityFacadeAccessor;
  private readonly resolveGate: (id: string, definition: OpenCodeSdkCapabilityDefinition) => boolean;
  private readonly now: () => number;
  private cachedSnapshot: OpenCodeSdkCapabilitySnapshot | null = null;

  constructor(
    registry: readonly OpenCodeSdkCapabilityDefinition[] = getOpenCodeSdkCapabilityRegistry(),
    host: OpenCodeSdkCapabilityDiscoveryHost,
  ) {
    this.registry = registry;
    this.getFacade = host.getFacade;
    this.resolveGate = host.resolveGate ?? ((_id, definition) => definition.defaultGate);
    this.now = host.now ?? Date.now;
  }

  /**
   * Return the last cached snapshot, building one synchronously if none exists.
   * The synchronous build only checks SDK presence (no server probing); entries
   * whose server support is unknown will show `server: 'unknown'` until
   * {@link refresh} completes.
   */
  getSnapshot(): OpenCodeSdkCapabilitySnapshot {
    if (this.cachedSnapshot) {
      return this.cachedSnapshot;
    }
    return this.buildPresenceOnlySnapshot();
  }

  /**
   * Return the availability of a single capability id from the current
   * snapshot, or a typed redacted unsupported result. Never throws for an
   * unknown id.
   */
  requireCapability(id: string): OpenCodeSdkCapabilityAvailability | OpenCodeUnsupportedCapabilityResult {
    const snapshot = this.getSnapshot();
    const entry = snapshot.entries.find((item) => item.id === id);
    if (!entry) {
      return {
        supported: false,
        capabilityId: id,
        kind: 'unsupported-by-sdk',
        reason: `Capability "${id}" is not registered.`,
      };
    }
    const availability = entry.availability;
    if (availability.kind === 'available') {
      return availability;
    }
    const result: OpenCodeUnsupportedCapabilityResult = {
      supported: false,
      capabilityId: id,
      kind: availability.kind,
      reason: availability.reason,
    };
    if (availability.kind === 'unsupported-by-server' && availability.minimumServerHint) {
      return { ...result, minimumServerHint: availability.minimumServerHint };
    }
    return result;
  }

  /**
   * Re-probe live server support for every registry entry and cache the result.
   * Resolves with the refreshed snapshot. Never rejects: probe failures are
   * encoded per-entry as `server: 'unknown'`.
   */
  async refresh(): Promise<OpenCodeSdkCapabilitySnapshot> {
    const generatedAt = this.now();
    const facade = this.getFacade();
    const globalHealthEvidence = await this.probeGlobalHealth(facade);
    const entries = await Promise.all(
      this.registry.map((definition) => this.buildEntry(definition, facade, generatedAt, globalHealthEvidence)),
    );
    const snapshot: OpenCodeSdkCapabilitySnapshot = { entries, generatedAt };
    this.cachedSnapshot = snapshot;
    return snapshot;
  }

  /** Discard the cached snapshot (next `getSnapshot` rebuilds from presence). */
  invalidate(): void {
    this.cachedSnapshot = null;
  }

  private buildPresenceOnlySnapshot(): OpenCodeSdkCapabilitySnapshot {
    const generatedAt = this.now();
    const facade = this.getFacade();
    const entries = this.registry.map((definition) => {
      const sdkPresent = this.isSdkPresent(facade, definition);
      const server = this.initialServerSupport(definition, sdkPresent);
      const availability = this.enrichAvailability(
        resolveCapabilityAvailability({
          sdk: sdkPresent,
          server,
          gate: this.resolveGate(definition.id, definition),
          safety: definition.risk,
        }),
        definition,
      );
      return {
        id: definition.id,
        availability,
        evidence: this.resolveEvidence(definition, sdkPresent, server, false),
        definition,
      };
    });
    const snapshot: OpenCodeSdkCapabilitySnapshot = { entries, generatedAt };
    this.cachedSnapshot = snapshot;
    return snapshot;
  }

  private async buildEntry(
    definition: OpenCodeSdkCapabilityDefinition,
    facade: unknown | null,
    generatedAt: number,
    globalHealthEvidence: GlobalHealthEvidence,
  ): Promise<OpenCodeSdkCapabilitySnapshotEntry> {
    const sdkPresent = this.isSdkPresent(facade, definition);
    const server = await this.probeServerSupport(definition, facade, sdkPresent, globalHealthEvidence);
    const availability = this.enrichAvailability(
      resolveCapabilityAvailability({
        sdk: sdkPresent,
        server,
        gate: this.resolveGate(definition.id, definition),
        safety: definition.risk,
      }),
      definition,
    );
    return {
      id: definition.id,
      availability,
      evidence: this.resolveEvidence(definition, sdkPresent, server, true),
      definition,
      lastChecked: generatedAt,
    };
  }

  /**
   * Attach definition-level metadata (e.g. minimumServerHint) to a resolved
   * availability. The pure resolver does not see the definition, so the
   * coordinator enriches `unsupported-by-server` results here.
   */
  private enrichAvailability(
    availability: OpenCodeSdkCapabilityAvailability,
    definition: OpenCodeSdkCapabilityDefinition,
  ): OpenCodeSdkCapabilityAvailability {
    if (availability.kind === 'unsupported-by-server' && definition.minimumServerHint) {
      return { ...availability, minimumServerHint: definition.minimumServerHint };
    }
    return availability;
  }

  private resolveEvidence(
    definition: OpenCodeSdkCapabilityDefinition,
    sdkPresent: boolean,
    server: boolean | 'unknown',
    didProbe: boolean,
  ): OpenCodeSdkCapabilityEvidence {
    if (!sdkPresent || server === false) {
      return { kind: 'unsupported' };
    }
    if (definition.runtimeProof) {
      return {
        kind: 'runtime-proven',
        verifiedAt: definition.runtimeProof.verifiedAt,
        buildId: definition.runtimeProof.buildId,
        artifactPath: definition.runtimeProof.artifactPath,
      };
    }
    if (definition.serverProbe === 'none') {
      return { kind: 'skipped', reason: 'state-changing-no-probe' };
    }
    if (!didProbe || definition.serverProbe === 'presence') {
      return { kind: 'present' };
    }
    if (server === true) {
      return { kind: 'advertised' };
    }
    return { kind: 'failed', reason: 'transport' };
  }

  /**
   * SDK presence: walk the path on the facade; the final segment must resolve
   * to a function. Intermediate segments must be records. Per the plan, this
   * `typeof === 'function'` check is sufficient for SDK presence.
   */
  private isSdkPresent(facade: unknown | null, definition: OpenCodeSdkCapabilityDefinition): boolean {
    if (facade === null) {
      return false;
    }
    const resolved = resolvePath(facade, definition.sdkPath);
    return isFunction(resolved);
  }

  /**
   * Initial server support for the synchronous presence-only snapshot.
   * Read-probe entries are unknown until probed; others are inferred from
   * SDK presence (we will not invoke them).
   */
  private initialServerSupport(
    definition: OpenCodeSdkCapabilityDefinition,
    sdkPresent: boolean,
  ): boolean | 'unknown' {
    if (definition.serverProbe === 'read') {
      return 'unknown';
    }
    if (definition.serverProbe === 'none') {
      return 'unknown';
    }
    return sdkPresent ? true : false;
  }

  /**
   * Probe live server support for a single entry. NEVER invokes state-changing
   * or experimental entries (`serverProbe === 'none'`). For `'read'` entries
   * it invokes the resolved function with no arguments. For `'presence'`
   * entries it confirms SDK presence without invoking.
   */
  private async probeServerSupport(
    definition: OpenCodeSdkCapabilityDefinition,
    facade: unknown | null,
    sdkPresent: boolean,
    globalHealthEvidence: GlobalHealthEvidence,
  ): Promise<boolean | 'unknown'> {
    if (!sdkPresent) {
      return false;
    }

    if (definition.serverProbe === 'none') {
      // State-changing / experimental: cannot safely probe. Report unknown so
      // the resolver yields 'unknown' (gate permitting) rather than silently
      // advertising availability.
      if (!this.canUseGlobalHealthEvidence(definition)) {
        return 'unknown';
      }
      if (globalHealthEvidence.kind === 'responded') {
        return globalHealthEvidence.supports117;
      }
      return globalHealthEvidence.kind === 'unsupported' ? false : 'unknown';
    }

    if (definition.serverProbe === 'presence') {
      // Streams / diagnostic presence: SDK presence is the strongest signal
      // we can gather without side effects.
      return true;
    }

    if (definition.id === 'global.health') {
      if (globalHealthEvidence.kind === 'responded') {
        return true;
      }
      return globalHealthEvidence.kind === 'unsupported' ? false : 'unknown';
    }

    // serverProbe === 'read': invoke the safe read method.
    return this.invokeReadProbe(facade, definition);
  }

  private canUseGlobalHealthEvidence(definition: OpenCodeSdkCapabilityDefinition): boolean {
    return VERSION_EVIDENCE_EXPERIMENTAL_ACTION_IDS.has(definition.id)
      && hasMinimumServer117Hint(definition);
  }

  private async probeGlobalHealth(facade: unknown | null): Promise<GlobalHealthEvidence> {
    if (!facade) {
      return { kind: 'unsupported' };
    }

    const health = resolvePath(facade, ['global', 'health']);
    if (!isFunction(health)) {
      return { kind: 'unsupported' };
    }

    try {
      const result = await health.call(facade);
      if (!isRecord(result)) {
        return { kind: 'unknown' };
      }
      return { kind: 'responded', supports117: isVersionAtLeast117(result.version) };
    } catch (error) {
      return classifyProbeFailure(error) === 'endpoint-unavailable'
        ? { kind: 'unsupported' }
        : { kind: 'unknown' };
    }
  }

  private async invokeReadProbe(
    facade: unknown,
    definition: OpenCodeSdkCapabilityDefinition,
  ): Promise<boolean | 'unknown'> {
    const resolved = resolvePath(facade, definition.sdkPath);
    if (!isFunction(resolved)) {
      return false;
    }

    try {
      await resolved.call(facade);
      return true;
    } catch (error) {
      const failureClass = classifyProbeFailure(error);
      if (failureClass === 'endpoint-unavailable') {
        return false;
      }
      // transport / transient: never promote to unsupported.
      logger.debug(
        `Capability ${definition.id} server probe returned transient failure (${failureClass}); treating as unknown.`,
      );
      return 'unknown';
    }
  }
}
