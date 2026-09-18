/**
 * Cross-boundary status contract for the R-B4 Obsidian native tooling
 * (`core.obsidian-tooling` owner).
 *
 * Lives in core (not app) because both the app coordinator that produces the
 * snapshot and the settings surface that renders it need the exact same
 * shape, and the settings owner may only import core/shared.
 */

import type { ObsidianToolingMode } from '../types';
import type { ObsidianCliProbeResult } from './ObsidianCliProbe';

export interface ObsidianToolingStatusSnapshot {
  readonly mode: ObsidianToolingMode;
  /** false on mobile (no desktop CLI to drive). */
  readonly desktopSupported: boolean;
  /** false on Windows this milestone (POSIX sh wrapper only) — surfaced, not silent. */
  readonly platformSupported: boolean;
  /** Gate provisioned and request watcher active (cli mode only). */
  readonly gateReady: boolean;
  /** Last CLI probe result; null when never probed. */
  readonly cli: ObsidianCliProbeResult | null;
  readonly pendingRequests: number;
}
