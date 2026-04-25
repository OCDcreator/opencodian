import { isSystemAgentId, type SystemAgentGuardResult } from './types';

/**
 * Handles system-agent risk boundaries.
 *
 * System agents (`title`, `summary`, `compaction`) are always visible in the
 * catalog but are guarded from casual override. Expert mode must be enabled
 * before any write action targeting a system agent is allowed.
 */
export class SystemAgentGuardService {
  private expertModeEnabled = false;

  get expertMode(): boolean {
    return this.expertModeEnabled;
  }

  setExpertMode(enabled: boolean): void {
    this.expertModeEnabled = enabled;
  }

  /**
   * Check whether a write/override action is allowed for the given agent.
   *
   * Non-system agents are always allowed.
   * System agents require expert mode to be enabled.
   */
  checkWriteAllowed(agentId: string): SystemAgentGuardResult {
    if (!isSystemAgentId(agentId)) {
      return { agentId, isSystem: false, allowed: true };
    }

    if (this.expertModeEnabled) {
      return { agentId, isSystem: true, allowed: true };
    }

    return {
      agentId,
      isSystem: true,
      allowed: false,
      reason: `Agent "${agentId}" is a built-in system agent. Enable expert mode to allow project overrides.`,
    };
  }

  /**
   * Inject system-agent metadata into a catalog entry for display purposes.
   * Returns the risk label or `null` when the agent is not a system agent.
   */
  getRiskLabel(agentId: string): string | null {
    if (!isSystemAgentId(agentId)) {
      return null;
    }

    if (this.expertModeEnabled) {
      return 'Built-in System Agent (expert override allowed)';
    }

    return 'Built-in System Agent (read-only)';
  }
}
