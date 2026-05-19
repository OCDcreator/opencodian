/**
 * AgentServiceRegistry — manages agent adapters and provides the active one.
 *
 * The registry is the central point for:
 * - Registering adapters (OpenCode, Claude Code, Codex, etc.)
 * - Tracking enabled/disabled backends
 * - Providing the active adapter for capability queries
 *
 * See docs/requirements/multi-agent-foundation/02-architecture.md §5.
 */

import type { AgentBackendKind } from '../../types/chat';
import { createLogger } from '../../../shared';
import type {
  AgentConnectionStatus,
  AgentService,
  AgentServiceInfo,
  Disposable,
  StatusChangeHandler,
} from './AgentService';

const logger = createLogger('AgentServiceRegistry');

type ActiveChangeHandler = (kind: AgentBackendKind | null) => void;

export class AgentServiceRegistry {
  private adapters = new Map<AgentBackendKind, AgentService>();
  private enabledKinds = new Set<AgentBackendKind>();
  private activeKind: AgentBackendKind | null = null;

  private activeChangeHandlers = new Set<ActiveChangeHandler>();

  // -------------------------------------------------------------------------
  // Registration
  // -------------------------------------------------------------------------

  /**
   * Register an agent adapter. Does NOT enable it automatically.
   * Call `setEnabled()` to activate it.
   */
  register(adapter: AgentService): void {
    const existing = this.adapters.get(adapter.kind);
    if (existing) {
      logger.warn(`Adapter for "${adapter.kind}" already registered — replacing`);
      try {
        existing.dispose();
      } catch {
        // Swallow cleanup errors on replace
      }
    }
    this.adapters.set(adapter.kind, adapter);
    logger.debug(`Registered adapter: ${adapter.kind}`);
  }

  /**
   * Unregister an adapter. Disposes and disables it if currently active.
   */
  unregister(kind: AgentBackendKind): void {
    const existing = this.adapters.get(kind);
    if (existing) {
      try {
        existing.dispose();
      } catch {
        // Swallow cleanup errors
      }
    }
    this.adapters.delete(kind);
    this.enabledKinds.delete(kind);
    if (this.activeKind === kind) {
      this.activeKind = this.pickDefaultActive();
      this.notifyActiveChange();
    }
  }

  // -------------------------------------------------------------------------
  // Enable / Disable
  // -------------------------------------------------------------------------

  /**
   * Enable a backend. If no active backend is set, this becomes active.
   */
  setEnabled(kind: AgentBackendKind): void {
    if (!this.adapters.has(kind)) {
      logger.warn(`Cannot enable "${kind}" — no adapter registered`);
      return;
    }
    this.enabledKinds.add(kind);
    if (this.activeKind === null) {
      this.activeKind = kind;
      this.notifyActiveChange();
    }
  }

  /**
   * Disable a backend. If it was active, switches to another enabled one.
   * Returns the new active kind (or null if none remain).
   */
  setDisabled(kind: AgentBackendKind): AgentBackendKind | null {
    this.enabledKinds.delete(kind);
    if (this.activeKind === kind) {
      this.activeKind = this.pickDefaultActive();
      this.notifyActiveChange();
    }
    return this.activeKind;
  }

  /**
   * Bulk-set the enabled backends. Respects registration order.
   * Returns the resolved active kind.
   */
  setEnabledBackends(kinds: readonly AgentBackendKind[]): AgentBackendKind | null {
    this.enabledKinds.clear();
    for (const kind of kinds) {
      if (this.adapters.has(kind)) {
        this.enabledKinds.add(kind);
      }
    }

    if (this.activeKind && !this.enabledKinds.has(this.activeKind)) {
      this.activeKind = this.pickDefaultActive();
      this.notifyActiveChange();
    } else if (!this.activeKind) {
      this.activeKind = this.pickDefaultActive();
      if (this.activeKind) {
        this.notifyActiveChange();
      }
    }

    return this.activeKind;
  }

  // -------------------------------------------------------------------------
  // Query
  // -------------------------------------------------------------------------

  /** Get the currently active adapter, or null if none enabled. */
  getActive(): AgentService | null {
    if (this.activeKind) {
      return this.adapters.get(this.activeKind) ?? null;
    }
    return null;
  }

  /** Get the active backend kind. */
  getActiveKind(): AgentBackendKind | null {
    return this.activeKind;
  }

  /** Get a specific adapter by kind. */
  get(kind: AgentBackendKind): AgentService | undefined {
    return this.adapters.get(kind);
  }

  /** List info for all enabled adapters. */
  listEnabled(): AgentServiceInfo[] {
    const result: AgentServiceInfo[] = [];
    for (const kind of this.enabledKinds) {
      const adapter = this.adapters.get(kind);
      if (adapter) {
        result.push({
          kind: adapter.kind,
          displayName: adapter.displayName,
          description: adapter.description,
          status: adapter.status,
          capabilities: adapter.capabilities,
        });
      }
    }
    return result;
  }

  /** List info for all registered adapters (enabled or not). */
  listAll(): AgentServiceInfo[] {
    return Array.from(this.adapters.values()).map((a) => ({
      kind: a.kind,
      displayName: a.displayName,
      description: a.description,
      status: a.status,
      capabilities: a.capabilities,
    }));
  }

  /** Check if a backend kind is enabled. */
  isEnabled(kind: AgentBackendKind): boolean {
    return this.enabledKinds.has(kind);
  }

  /** Get the set of enabled backend kinds. */
  getEnabledKinds(): ReadonlySet<AgentBackendKind> {
    return this.enabledKinds;
  }

  /**
   * Explicitly set the active backend. The kind must be registered and enabled.
   * Returns true if the active backend was changed.
   */
  setActive(kind: AgentBackendKind): boolean {
    if (!this.adapters.has(kind) || !this.enabledKinds.has(kind)) {
      return false;
    }
    if (this.activeKind === kind) {
      return false;
    }
    this.activeKind = kind;
    this.notifyActiveChange();
    return true;
  }

  /** Check if any backend is registered and enabled. */
  hasActive(): boolean {
    return this.activeKind !== null && this.adapters.has(this.activeKind);
  }

  // -------------------------------------------------------------------------
  // Events
  // -------------------------------------------------------------------------

  onActiveChange(handler: ActiveChangeHandler): Disposable {
    this.activeChangeHandlers.add(handler);
    return { dispose: () => this.activeChangeHandlers.delete(handler) };
  }

  // -------------------------------------------------------------------------
  // Dispose
  // -------------------------------------------------------------------------

  dispose(): void {
    for (const adapter of this.adapters.values()) {
      try {
        adapter.dispose();
      } catch {
        // Swallow cleanup errors
      }
    }
    this.adapters.clear();
    this.enabledKinds.clear();
    this.activeKind = null;
    this.activeChangeHandlers.clear();
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private pickDefaultActive(): AgentBackendKind | null {
    // Prefer 'opencode' if enabled, otherwise first enabled
    if (this.enabledKinds.has('opencode')) {
      return 'opencode';
    }
    for (const kind of this.enabledKinds) {
      return kind;
    }
    return null;
  }

  private notifyActiveChange(): void {
    for (const handler of this.activeChangeHandlers) {
      try {
        handler(this.activeKind);
      } catch {
        // Swallow handler errors
      }
    }
  }
}
