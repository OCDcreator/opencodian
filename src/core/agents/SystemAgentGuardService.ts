import { isSystemAgentId, type SystemAgentGuardResult } from './types';

export type SystemAgentRiskLabel = 'expert-override-allowed' | 'read-only' | null;

export class SystemAgentGuardService {
  private expertModeEnabled = false;

  get expertMode(): boolean {
    return this.expertModeEnabled;
  }

  setExpertMode(enabled: boolean): void {
    this.expertModeEnabled = enabled;
  }

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
      reason: 'system-agent-expert-required',
    };
  }

  getRiskLabelKind(agentId: string): SystemAgentRiskLabel {
    if (!isSystemAgentId(agentId)) {
      return null;
    }

    return this.expertModeEnabled ? 'expert-override-allowed' : 'read-only';
  }
}
