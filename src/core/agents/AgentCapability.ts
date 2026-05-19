/**
 * Backend capability identifiers.
 * Each represents a discrete feature that an agent backend may or may not support.
 * UI uses hasCapability() to conditionally render backend-specific areas.
 *
 * See docs/requirements/multi-agent-foundation/09-chat-surface-migration.md §9 for
 * the complete capability → UI mapping table.
 */
export const AgentCapability = {
  Tools: 'tools',
  Mcp: 'mcp',
  Permissions: 'permissions',
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
  Export: 'export',
} as const;

export type AgentCapability = (typeof AgentCapability)[keyof typeof AgentCapability];

/** Canonical representation of a backend's capability set. */
export type BackendCapabilities = ReadonlySet<AgentCapability>;

/**
 * OpenCode's full capability set. Phase 0 hardcodes this as the only backend.
 * Phase 1 will replace getActiveBackendCapabilities() with a registry lookup.
 */
export const OPENCODE_FULL_CAPABILITIES: BackendCapabilities = new Set<AgentCapability>(
  Object.values(AgentCapability),
);

/**
 * Get the capabilities of the currently active backend.
 * Phase 0: always returns OpenCode's full capabilities.
 * Phase 1+: will read from AgentServiceRegistry.
 */
export function getActiveBackendCapabilities(): BackendCapabilities {
  return OPENCODE_FULL_CAPABILITIES;
}

/** Check whether a capability set includes a specific capability. */
export function hasCapability(caps: BackendCapabilities, cap: AgentCapability): boolean {
  return caps.has(cap);
}
