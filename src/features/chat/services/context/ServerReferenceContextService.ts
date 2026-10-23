/**
 * Read-only server-side reference/fs context surface.
 *
 * Surfaced when the OpenCode server advertises the v2 fs/reference capability
 * family. This service is intentionally minimal: it answers two questions —
 * "is the server-side reference capability available?" and "is the server-side
 * fs browse capability available?" — so the Chat context flow can show a
 * read-only hint or affordance without duplicating the vault file browser.
 *
 * This service NEVER throws on a capability lookup miss; it degrades to
 * `available: false` so the Chat main chain is unaffected.
 */

export interface ServerReferenceContextCapabilityHost {
  /**
   * Resolve a capability id to a support result. Implementations map the
   * OpenCode SDK capability availability to `{ supported, reason? }`.
   */
  requireCapability(id: string): { supported: boolean; reason?: string };
}

export interface ServerReferenceContextAvailability {
  /** `v2.reference.list` is available on the connected server. */
  readonly referencesAvailable: boolean;
  /** `v2.fs.list` is available on the connected server. */
  readonly fsBrowseAvailable: boolean;
}

export class ServerReferenceContextService {
  constructor(private readonly host: ServerReferenceContextCapabilityHost) {}

  /**
   * Resolve the current read-only server-side context availability. Never
   * throws; transient lookup failures are absorbed as `false`.
   */
  getAvailability(): ServerReferenceContextAvailability {
    return {
      referencesAvailable: this.isSupported('v2.reference.list'),
      fsBrowseAvailable: this.isSupported('v2.fs.list'),
    };
  }

  /** True when any server-side reference/fs affordance may be shown. */
  hasAnyServerContextCapability(): boolean {
    const { referencesAvailable, fsBrowseAvailable } = this.getAvailability();
    return referencesAvailable || fsBrowseAvailable;
  }

  private isSupported(capabilityId: string): boolean {
    try {
      const result = this.host.requireCapability(capabilityId);
      return Boolean(result && result.supported);
    } catch {
      return false;
    }
  }
}
