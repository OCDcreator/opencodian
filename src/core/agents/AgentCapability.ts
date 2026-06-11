/**
 * Backend capability identifiers.
 * Each represents a discrete feature that an agent backend may or may not support.
 * UI uses hasCapability() to conditionally render backend-specific areas.
 *
 * See docs/requirements/multi-agent-foundation/09-chat-surface-migration.md §9 for
 * the complete capability → UI mapping table.
 */

import type { AgentServiceRegistry } from './backend/AgentServiceRegistry';

export const AgentCapability = {
  Chat: 'chat',
  Sessions: 'sessions',
  Tools: 'tools',
  Mcp: 'mcp',
  Permissions: 'permissions',
  Fork: 'fork',
  Branching: 'branching',
  Todos: 'todos',
  Questions: 'questions',
  Models: 'models',
  Subagents: 'subagents',
  Context: 'context',
  Providers: 'providers',
  Compaction: 'compaction',
  CostTracking: 'cost-tracking',
  Thinking: 'thinking',
  Hooks: 'hooks',
  Config: 'config',
  FileOps: 'file-ops',
  Shell: 'shell',
  Sharing: 'sharing',
  Export: 'export',
  Images: 'images',
} as const;

export type AgentCapability = (typeof AgentCapability)[keyof typeof AgentCapability];

/** Canonical representation of a backend's capability set. */
export type BackendCapabilities = ReadonlySet<AgentCapability>;

/**
 * OpenCode's full capability set. Used as fallback when no registry is set.
 * Frozen to prevent accidental mutation.
 */
export const OPENCODE_FULL_CAPABILITIES: BackendCapabilities = Object.freeze(
  new Set<AgentCapability>(Object.values(AgentCapability)),
);

/** Empty capability set for when no backend is active. */
export const EMPTY_CAPABILITIES: BackendCapabilities = Object.freeze(
  new Set<AgentCapability>(),
);

// ---------------------------------------------------------------------------
// Module-level registry reference for getActiveBackendCapabilities()
// ---------------------------------------------------------------------------

let _registry: AgentServiceRegistry | null = null;

/**
 * Set the global registry reference. Called once during plugin initialization.
 */
export function setAgentServiceRegistry(registry: AgentServiceRegistry | null): void {
  _registry = registry;
}

/**
 * Get the module-level agent service registry.
 * Returns null before plugin initialization completes or after disposal.
 */
export function getAgentServiceRegistry(): AgentServiceRegistry | null {
  return _registry;
}

/**
 * Get the capabilities of the currently active backend.
 *
 * - If a registry is set and has an active adapter, returns its capabilities.
 * - If no registry or no active adapter, returns EMPTY_CAPABILITIES.
 * - Falls back to OPENCODE_FULL_CAPABILITIES only during initialisation
 *   before the registry is wired.
 */
export function getActiveBackendCapabilities(): BackendCapabilities {
  if (_registry) {
    const active = _registry.getActive();
    if (active) {
      return active.capabilities;
    }
    return EMPTY_CAPABILITIES;
  }
  // Pre-registry fallback — happens during early startup
  return OPENCODE_FULL_CAPABILITIES;
}

/** Check whether a capability set includes a specific capability. */
export function hasCapability(caps: BackendCapabilities, cap: AgentCapability): boolean {
  return caps.has(cap);
}
