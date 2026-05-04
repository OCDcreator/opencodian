import {
  AgentCatalogService,
  type RuntimeAgentShape,
  type SurfaceAgent,
  type SurfaceAgentFile,
} from '../../../core/agents';
import type { OpencodeAgentConfigRecord } from '../../../core/types';
import type { AgentMentionCandidate } from './AgentMentionComposerController';

export interface AgentSelectionCandidate {
  id: string;
  displayName: string;
  description: string;
  mode: 'primary' | 'all' | null;
}

export interface AgentMentionCandidateServiceHost {
  loadRuntimeAgents(): Promise<unknown>;
  loadProjectAgents(): Promise<OpencodeAgentConfigRecord>;
  loadFileAgents?(): Promise<readonly SurfaceAgentFile[]>;
}

function normalizeRuntimeAgents(value: unknown): RuntimeAgentShape[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is RuntimeAgentShape =>
    Boolean(
      item
      && typeof item === 'object'
      && typeof (item as { name?: unknown }).name === 'string'
      && typeof (item as { mode?: unknown }).mode === 'string',
    ));
}

function compareAgentCandidates(left: SurfaceAgent, right: SurfaceAgent): number {
  const leftRank = left.mode === 'all' ? 0 : 1;
  const rightRank = right.mode === 'all' ? 0 : 1;
  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }

  return left.id.localeCompare(right.id);
}

export class AgentMentionCandidateService {
  private readonly catalogService = new AgentCatalogService();

  constructor(private readonly host: AgentMentionCandidateServiceHost) {}

  async load(): Promise<AgentMentionCandidate[]> {
    const [runtimeAgentsResult, projectAgents, fileAgents] = await Promise.all([
      this.host.loadRuntimeAgents(),
      this.host.loadProjectAgents(),
      this.host.loadFileAgents?.() ?? Promise.resolve(undefined),
    ]);

    return this.projectCandidates({
      runtimeAgentsResult,
      projectAgents,
      fileAgents,
    });
  }

  async loadDefaultCandidates(): Promise<AgentSelectionCandidate[]> {
    const [runtimeAgentsResult, projectAgents, fileAgents] = await Promise.all([
      this.host.loadRuntimeAgents(),
      this.host.loadProjectAgents(),
      this.host.loadFileAgents?.() ?? Promise.resolve(undefined),
    ]);

    return this.defaultCandidates({
      runtimeAgentsResult,
      projectAgents,
      fileAgents,
    });
  }

  projectCandidates(input: {
    runtimeAgentsResult: unknown;
    projectAgents: OpencodeAgentConfigRecord;
    fileAgents?: readonly SurfaceAgentFile[];
  }): AgentMentionCandidate[] {
    const { runtimeAgentsResult, projectAgents, fileAgents } = input;

    return this.catalogService.aggregate({
      runtimeAgents: normalizeRuntimeAgents(runtimeAgentsResult),
      configAgents: projectAgents,
      ...(fileAgents ? { fileAgents } : {}),
    })
      .filter((agent) => agent.subagentVisible)
      .sort(compareAgentCandidates)
      .map((agent) => ({
        id: agent.id,
        displayName: agent.displayName,
        description: agent.description,
        mode: agent.mode,
        hidden: agent.hidden,
      }));
  }

  defaultCandidates(input: {
    runtimeAgentsResult: unknown;
    projectAgents: OpencodeAgentConfigRecord;
    fileAgents?: readonly SurfaceAgentFile[];
  }): AgentSelectionCandidate[] {
    const { runtimeAgentsResult, projectAgents, fileAgents } = input;

    return this.catalogService.aggregate({
      runtimeAgents: normalizeRuntimeAgents(runtimeAgentsResult),
      configAgents: projectAgents,
      ...(fileAgents ? { fileAgents } : {}),
    })
      .filter((agent) => agent.defaultEligible)
      .sort(compareAgentCandidates)
      .map((agent) => ({
        id: agent.id,
        displayName: agent.displayName,
        description: agent.description,
        mode: agent.mode === 'primary' || agent.mode === 'all' ? agent.mode : null,
      }));
  }
}
